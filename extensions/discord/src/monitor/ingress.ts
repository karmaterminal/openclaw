// Discord plugin module owns raw gateway-message durable ingress and replay draining.
import {
  ChannelType,
  GatewayDispatchEvents,
  type GatewayMessageCreateDispatchData,
} from "discord-api-types/v10";
import {
  createChannelIngressError,
  createChannelIngressMonitor,
  type ChannelIngressQueue,
  type ChannelIngressQueueRecord,
  type ChannelIngressMonitorDeliveryResult,
  type ChannelIngressMonitorLifecycle,
} from "openclaw/plugin-sdk/channel-outbound";
import { hasControlCommand } from "openclaw/plugin-sdk/command-detection";
import { shouldHandleTextCommands } from "openclaw/plugin-sdk/command-surface";
import type { DiscordAccountConfig, OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import { createLazyRuntimeModule } from "openclaw/plugin-sdk/lazy-runtime";
import { danger, type RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import {
  isRecord,
  normalizeNullableString as nonEmptyString,
} from "openclaw/plugin-sdk/string-coerce-runtime";
import type { Client } from "../internal/discord.js";
import { mapGatewayDispatchData } from "../internal/gateway-dispatch.js";
import { getDiscordRuntime } from "../runtime.js";
import {
  resolveDiscordChannelConfigWithFallback,
  resolveDiscordGuildEntry,
  resolveDiscordShouldRequireMention,
  type DiscordGuildEntryResolved,
} from "./allow-list.js";
import type { DiscordMessageEvent } from "./listeners.js";
import { hasRawDiscordUserMention } from "./message-handler.raw-mention.js";
import { resolveDiscordReplyReferenceState } from "./message-handler.reply-reference.js";

const DISCORD_INGRESS_PAYLOAD_VERSION = 1;
const DISCORD_INGRESS_DRAIN_INTERVAL_MS = 1_000;
const DISCORD_STALE_AMBIENT_BACKLOG_MS = 15 * 60 * 1_000;
const DISCORD_AUDIO_ATTACHMENT_EXTENSIONS =
  /\.(?:aac|caf|flac|m4a|mp3|oga|ogg|opus|wav)(?:[?#]|$)/i;
const loadMentionRuntime = createLazyRuntimeModule(
  () => import("openclaw/plugin-sdk/channel-inbound"),
);

type DiscordIngressChannelKind = "non-thread" | "thread";

type DiscordIngressEvent = {
  rawMessage: GatewayMessageCreateDispatchData;
  channelKind?: DiscordIngressChannelKind;
};

type DiscordIngressPayload = {
  version: 1;
  receivedAt: number;
  rawMessage: GatewayMessageCreateDispatchData;
  channelKind?: DiscordIngressChannelKind;
};

type DiscordIngressBody = Omit<DiscordIngressPayload, "version">;

export type DiscordIngressLifecycle = Omit<ChannelIngressMonitorLifecycle, "admission">;

export type DiscordIngressDispatchResult = ChannelIngressMonitorDeliveryResult;

type DiscordIngressDispatch = (
  event: DiscordMessageEvent,
  lifecycle: DiscordIngressLifecycle,
) => Promise<DiscordIngressDispatchResult | void> | DiscordIngressDispatchResult | void;

type DiscordThreadBindingLookup = {
  getByThreadId?: (threadId: string) => unknown;
  listBySessionKey?: (targetSessionKey: string) => unknown[];
  touchThread?: (params: { threadId: string; at?: number; persist?: boolean }) => unknown;
};

type DiscordIngressMonitor = {
  accept: (rawMessage: GatewayMessageCreateDispatchData) => Promise<void>;
  start: () => void;
  stop: () => Promise<void>;
};

const DiscordIngressPayloadError = createChannelIngressError("DiscordIngressPayloadError");
const DiscordStaleAmbientBacklogError = createChannelIngressError(
  "DiscordStaleAmbientBacklogError",
);

function inspectDiscordMessage(rawMessage: unknown): { eventId: string; laneKey: string } {
  if (!rawMessage || typeof rawMessage !== "object" || Array.isArray(rawMessage)) {
    throw new DiscordIngressPayloadError("Discord MESSAGE_CREATE payload must be an object");
  }
  const candidate = rawMessage as { id?: unknown; channel_id?: unknown };
  const eventId = nonEmptyString(candidate.id);
  if (!eventId) {
    throw new DiscordIngressPayloadError("Discord MESSAGE_CREATE payload is missing its snowflake");
  }
  const channelId = nonEmptyString(candidate.channel_id);
  if (!channelId) {
    throw new DiscordIngressPayloadError("Discord MESSAGE_CREATE payload is missing channel_id");
  }
  return { eventId, laneKey: `channel:${channelId}` };
}

function inspectDiscordIngressEvent(event: unknown): { eventId: string; laneKey: string } {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new DiscordIngressPayloadError("Discord ingress event must be an object");
  }
  return inspectDiscordMessage((event as { rawMessage?: unknown }).rawMessage);
}

function resolveDiscordIngressChannelKind(type: unknown): DiscordIngressChannelKind | undefined {
  if (isDiscordThreadChannelType(type)) {
    return "thread";
  }
  if (
    type !== ChannelType.GuildText &&
    type !== ChannelType.GuildAnnouncement &&
    type !== ChannelType.GuildVoice &&
    type !== ChannelType.GuildStageVoice
  ) {
    return undefined;
  }
  return "non-thread";
}

function decodeDiscordIngressChannelKind(value: unknown): DiscordIngressChannelKind | undefined {
  return value === "non-thread" || value === "thread" ? value : undefined;
}

function decodeDiscordIngressPayload(
  payload: DiscordIngressPayload,
  claimedId: string,
): { version: unknown; body: DiscordIngressBody } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new DiscordIngressPayloadError("Discord ingress payload must be an object");
  }
  const candidate = payload as Partial<DiscordIngressPayload>;
  try {
    inspectDiscordMessage(candidate.rawMessage);
  } catch (error) {
    throw new DiscordIngressPayloadError(`Discord ingress payload ${claimedId} is invalid`, {
      cause: error,
    });
  }
  const channelKind = decodeDiscordIngressChannelKind(candidate.channelKind);
  return {
    version: candidate.version,
    body: {
      receivedAt: candidate.receivedAt as number,
      rawMessage: candidate.rawMessage as GatewayMessageCreateDispatchData,
      ...(channelKind ? { channelKind } : {}),
    },
  };
}

function isDiscordAuthenticationFailure(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { status?: unknown; statusCode?: unknown; cause?: unknown };
    if (candidate.status === 401 || candidate.statusCode === 401) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

function discordMessageSentAtMs(rawMessage: GatewayMessageCreateDispatchData): number | null {
  const sentAt = Date.parse(rawMessage.timestamp);
  return Number.isFinite(sentAt) ? sentAt : null;
}

function isDiscordGuildMessage(rawMessage: GatewayMessageCreateDispatchData): boolean {
  return typeof (rawMessage as { guild_id?: unknown }).guild_id === "string";
}

function hasPotentialDiscordAudioAttachment(rawMessage: GatewayMessageCreateDispatchData): boolean {
  for (const attachment of rawMessage.attachments ?? []) {
    const contentType = nonEmptyString(
      (attachment as { content_type?: unknown; contentType?: unknown }).content_type ??
        (attachment as { contentType?: unknown }).contentType,
    );
    if (contentType?.startsWith("audio/")) {
      return true;
    }
    if (typeof (attachment as { duration_secs?: unknown }).duration_secs === "number") {
      return true;
    }
    if (nonEmptyString((attachment as { waveform?: unknown }).waveform)) {
      return true;
    }
    const filename = nonEmptyString((attachment as { filename?: unknown }).filename);
    const url = nonEmptyString((attachment as { url?: unknown }).url);
    if (
      (filename && DISCORD_AUDIO_ATTACHMENT_EXTENSIONS.test(filename)) ||
      (url && DISCORD_AUDIO_ATTACHMENT_EXTENSIONS.test(url))
    ) {
      return true;
    }
  }
  return false;
}

function listConfiguredAgentIds(cfg?: OpenClawConfig): string[] {
  const ids = new Set<string>();
  const agents = cfg?.agents;
  if (isRecord(agents?.entries)) {
    for (const id of Object.keys(agents.entries)) {
      const normalized = nonEmptyString(id);
      if (normalized) {
        ids.add(normalized);
      }
    }
  }
  for (const entry of agents?.list ?? []) {
    const normalized = nonEmptyString(entry?.id);
    if (normalized) {
      ids.add(normalized);
    }
  }
  return [...ids];
}

function isDiscordThreadChannelType(type: unknown): boolean {
  return (
    type === ChannelType.PublicThread ||
    type === ChannelType.PrivateThread ||
    type === ChannelType.AnnouncementThread
  );
}

function hasConfiguredDiscordChannels(guildInfo: DiscordGuildEntryResolved | null): boolean {
  return Boolean(guildInfo?.channels && Object.keys(guildInfo.channels).length > 0);
}

function hasBoundThread(
  rawMessage: GatewayMessageCreateDispatchData,
  threadBindings?: DiscordThreadBindingLookup,
) {
  const channelId = nonEmptyString(rawMessage.channel_id);
  if (!channelId || typeof threadBindings?.getByThreadId !== "function") {
    return false;
  }
  try {
    return Boolean(threadBindings.getByThreadId(channelId));
  } catch {
    return true;
  }
}

function isDiscordAddressedMessage(
  rawMessage: GatewayMessageCreateDispatchData,
  botUserId?: string,
): boolean {
  if (!isDiscordGuildMessage(rawMessage)) {
    return true;
  }
  if (rawMessage.mention_everyone) {
    return true;
  }
  const botId = nonEmptyString(botUserId);
  if (!botId) {
    return true;
  }
  return (
    rawMessage.mentions?.some((user) => user.id === botId) ||
    rawMessage.referenced_message?.author?.id === botId ||
    hasRawDiscordUserMention(rawMessage.content ?? "", botId)
  );
}

function hasHydrateableDiscordReplyReference(
  rawMessage: GatewayMessageCreateDispatchData,
): boolean {
  // `missing` and `invalid` both refetch in canonical hydration, so pre-claim
  // must keep both: only hydration can prove the referenced author is the bot.
  return resolveDiscordReplyReferenceState(rawMessage) !== "complete";
}

/** Discord snowflakes are numeric, so any other key can only match a name or slug. */
const DISCORD_SNOWFLAKE_CHANNEL_KEY = /^\d+$/u;

/**
 * Whether a channel override exists that only a name or slug could match.
 *
 * A raw gateway payload carries no channel name, so pre-hydration lookup can
 * only use the channel id. When such an entry exists and did not match by id,
 * this channel's real mention policy is unproven.
 */
function hasUnresolvedDiscordChannelNameOverride(
  guildInfo: DiscordGuildEntryResolved | null | undefined,
  channelId: string | null,
): boolean {
  const channels = guildInfo?.channels;
  if (!channels) {
    return false;
  }
  return Object.keys(channels).some((key) => {
    const trimmed = key.trim();
    return trimmed !== "*" && trimmed !== channelId && !DISCORD_SNOWFLAKE_CHANNEL_KEY.test(trimmed);
  });
}

function canExpireDiscordStaleAmbientBacklog(
  rawMessage: GatewayMessageCreateDispatchData,
  params: {
    channelKind?: DiscordIngressChannelKind;
    guildEntries?: Record<string, DiscordGuildEntryResolved>;
  },
): boolean {
  if (!isDiscordGuildMessage(rawMessage)) {
    return false;
  }
  const guildInfo = resolveDiscordGuildEntry({
    guildId: nonEmptyString((rawMessage as { guild_id?: unknown }).guild_id),
    guildEntries: params.guildEntries,
  });
  if (params.guildEntries && Object.keys(params.guildEntries).length > 0 && !guildInfo) {
    return false;
  }
  const channelId = nonEmptyString(rawMessage.channel_id);
  const channelConfig = channelId
    ? resolveDiscordChannelConfigWithFallback({
        guildInfo,
        channelId,
        channelSlug: "",
        scope: params.channelKind === "thread" ? "thread" : "channel",
      })
    : null;

  if (hasConfiguredDiscordChannels(guildInfo) && channelConfig?.allowed === false) {
    return false;
  }
  // Fail open when a name/slug override could be this channel: an id-only
  // lookup cannot see it, and it may carry `requireMention: false`, which would
  // make a direct-open channel look ambient and get falsely suppressed.
  if (
    channelConfig?.matchKey !== channelId &&
    hasUnresolvedDiscordChannelNameOverride(guildInfo, channelId)
  ) {
    return false;
  }
  const requireMention = resolveDiscordShouldRequireMention({
    isGuildMessage: true,
    isThread: false,
    channelConfig,
    guildInfo,
  });
  // Stale expiry is a freshness fence, not mention admission. Only a durable
  // non-thread fact plus a mention-required route proves content is ambient.
  return params.channelKind === "non-thread" && requireMention;
}

async function matchesConfiguredDiscordMentionText(
  rawMessage: GatewayMessageCreateDispatchData,
  params: {
    cfg?: OpenClawConfig;
    discordConfig?: DiscordAccountConfig | null;
  },
): Promise<boolean> {
  const text = typeof rawMessage.content === "string" ? rawMessage.content : "";
  const conversationId = nonEmptyString(rawMessage.channel_id);
  const agentIds = listConfiguredAgentIds(params.cfg);
  // Audio-only messages can satisfy preflight after transcription; pre-claim
  // cannot transcribe, so a configured mention regex is enough to preserve them.
  const hasAudioOnlyMentionCandidate =
    !text.trim() && hasPotentialDiscordAudioAttachment(rawMessage);
  if (!text.trim() && !hasAudioOnlyMentionCandidate) {
    return false;
  }
  if (!params.cfg) {
    return false;
  }
  try {
    const { buildMentionRegexes, matchesMentionPatterns } = await loadMentionRuntime();
    for (const agentId of [undefined, ...agentIds]) {
      const mentionRegexes = buildMentionRegexes(params.cfg, agentId, {
        provider: "discord",
        conversationId,
        providerPolicy: params.discordConfig?.mentionPatterns,
      });
      if (hasAudioOnlyMentionCandidate && mentionRegexes.length > 0) {
        return true;
      }
      if (matchesMentionPatterns(text, mentionRegexes)) {
        return true;
      }
    }
  } catch {
    // Missing or rejected regex state makes addressability unproven, not ambient.
    return true;
  }
  return false;
}

function hasPotentialActiveDiscordTextControlCommand(
  rawMessage: GatewayMessageCreateDispatchData,
  cfg?: OpenClawConfig,
): boolean {
  const text = typeof rawMessage.content === "string" ? rawMessage.content : "";
  if (!hasControlCommand(text, cfg)) {
    return false;
  }
  try {
    return shouldHandleTextCommands({
      cfg: cfg ?? {},
      surface: "discord",
      commandSource: "text",
    });
  } catch {
    // Pre-claim cannot prove registry/surface state; preserve possible control
    // commands for the canonical preflight authorization gate.
    return true;
  }
}

async function hasUnresolvedDiscordAddressForm(
  rawMessage: GatewayMessageCreateDispatchData,
  channelKind: DiscordIngressChannelKind | undefined,
  params: {
    cfg?: OpenClawConfig;
    discordConfig?: DiscordAccountConfig | null;
    threadBindings?: DiscordThreadBindingLookup;
  },
): Promise<boolean> {
  // Pre-claim rows do not have route/preflight facts. Preserve rows when a
  // later preflight path may prove them addressed instead of dead-lettering.
  return (
    hasHydrateableDiscordReplyReference(rawMessage) ||
    hasBoundThread(rawMessage, params.threadBindings) ||
    channelKind === "thread" ||
    (await matchesConfiguredDiscordMentionText(rawMessage, params))
  );
}

async function resolveDiscordStaleAmbientSuppression(
  rawMessage: GatewayMessageCreateDispatchData,
  channelKind: DiscordIngressChannelKind | undefined,
  // Record, not claim: the same conservative classification runs during the
  // pre-claim retry-delay scan and again on the claimed row in `deliver`, which
  // stays the sole owner of the terminal decision.
  claim: ChannelIngressQueueRecord<DiscordIngressPayload>,
  params: {
    botUserId?: string;
    cfg?: OpenClawConfig;
    discordConfig?: DiscordAccountConfig | null;
    guildEntries?: Record<string, DiscordGuildEntryResolved>;
    threadBindings?: DiscordThreadBindingLookup;
  },
  now: number,
): Promise<{ laneKey: string; sentAt: number } | null> {
  if (isDiscordAddressedMessage(rawMessage, params.botUserId)) {
    return null;
  }
  const payloadReceivedAt = Number.isFinite(claim.payload.receivedAt)
    ? claim.payload.receivedAt
    : claim.receivedAt;
  // A replayed row keeps its original send time; a re-enqueued row does not.
  const sentAt =
    claim.receivedAt > payloadReceivedAt
      ? claim.receivedAt
      : (discordMessageSentAtMs(rawMessage) ?? claim.receivedAt);
  if (now - sentAt <= DISCORD_STALE_AMBIENT_BACKLOG_MS) {
    return null;
  }
  if (hasPotentialActiveDiscordTextControlCommand(rawMessage, params.cfg)) {
    return null;
  }
  if (await hasUnresolvedDiscordAddressForm(rawMessage, channelKind, params)) {
    return null;
  }
  if (
    !canExpireDiscordStaleAmbientBacklog(rawMessage, {
      channelKind,
      guildEntries: params.guildEntries,
    })
  ) {
    return null;
  }
  return { laneKey: claim.laneKey ?? `channel:${rawMessage.channel_id}`, sentAt };
}

export function createDiscordIngressMonitor(params: {
  accountId: string;
  client: Client;
  runtime: Pick<RuntimeEnv, "error" | "log">;
  dispatch: DiscordIngressDispatch;
  botUserId?: string;
  cfg?: OpenClawConfig;
  discordConfig?: DiscordAccountConfig | null;
  guildEntries?: Record<string, DiscordGuildEntryResolved>;
  threadBindings?: DiscordThreadBindingLookup;
  queue?: ChannelIngressQueue<DiscordIngressPayload>;
  now?: () => number;
}): DiscordIngressMonitor {
  const nowMs = params.now ?? Date.now;
  const baseQueue =
    params.queue ??
    getDiscordRuntime().state.openChannelIngressQueue<DiscordIngressPayload>({
      accountId: params.accountId,
    });
  // Suppression receipts are recorded where the durable fact commits: a lost
  // claim race or a failed write must never claim a message was suppressed.
  // Suppressed events settle as completions, so ordinary completions simply
  // find no pending receipt and emit nothing.
  const pendingReceipts = new Map<string, () => void>();
  const queue: ChannelIngressQueue<DiscordIngressPayload> = {
    ...baseQueue,
    complete: async (idOrClaim, completeOptions) => {
      const eventId = typeof idOrClaim === "string" ? idOrClaim : idOrClaim.id;
      const emitReceipt = pendingReceipts.get(eventId);
      const committed = await baseQueue.complete(idOrClaim, completeOptions);
      if (!emitReceipt) {
        return committed;
      }
      // Delete only once the write resolves so a retried commit still reports.
      pendingReceipts.delete(eventId);
      if (committed) {
        try {
          emitReceipt();
        } catch {
          // The durable completion already committed. A throwing log sink must
          // not reject this write: the drain would retry, observe the row is no
          // longer claimed, and strand the lane owner until restart.
        }
      }
      return committed;
    },
  };
  const monitor = createChannelIngressMonitor<
    DiscordIngressEvent,
    DiscordIngressBody,
    DiscordIngressPayload
  >({
    queue,
    now: params.now,
    inspect: inspectDiscordIngressEvent,
    payload: {
      version: DISCORD_INGRESS_PAYLOAD_VERSION,
      serialize: (event, { receivedAt }) => ({ receivedAt, ...event }),
      deserialize: (body) => ({
        rawMessage: body.rawMessage,
        ...(body.channelKind ? { channelKind: body.channelKind } : {}),
      }),
      encode: ({ body }) => ({ version: DISCORD_INGRESS_PAYLOAD_VERSION, ...body }),
      decode: (payload, { claim }) => decodeDiscordIngressPayload(payload, claim.id),
      createClaimError: (kind) =>
        new DiscordIngressPayloadError(
          kind === "invalid-version"
            ? "Discord ingress payload version is unsupported"
            : "Discord message identity changed after durable admission",
        ),
    },
    // Gateway mapping is intentionally delayed until after the durable claim.
    deliver: async ({ rawMessage, channelKind }, lifecycle, claim) => {
      // Stale ambient suppression runs on the claimed row so the terminal
      // decision stays on the canonical delivery lifecycle instead of a
      // Discord-only pre-claim seam on public channel SDK options.
      const suppressed = await resolveDiscordStaleAmbientSuppression(
        rawMessage,
        channelKind,
        claim,
        params,
        nowMs(),
      );
      if (suppressed) {
        pendingReceipts.set(claim.id, () =>
          params.runtime.log?.(
            {
              level: "debug",
              source: "discord",
              accountId: params.accountId,
              eventId: claim.id,
              sourceEventId: rawMessage.id,
              laneKey: suppressed.laneKey,
              channelId: rawMessage.channel_id,
              receivedAt: new Date(claim.receivedAt).toISOString(),
              ageMs: Math.max(0, nowMs() - suppressed.sentAt),
              thresholdMs: DISCORD_STALE_AMBIENT_BACKLOG_MS,
              disposition: "suppressed",
              reason: "stale-ambient-backlog",
            },
            "discord ingress stale ambient backlog suppressed",
          ),
        );
        throw new DiscordStaleAmbientBacklogError(
          `Discord ambient message ${claim.id} on ${suppressed.laneKey} is older than ` +
            `${DISCORD_STALE_AMBIENT_BACKLOG_MS}ms; suppressing stale backlog before dispatch.`,
        );
      }
      const event = mapGatewayDispatchData(
        params.client,
        GatewayDispatchEvents.MessageCreate,
        rawMessage,
      ) as DiscordMessageEvent;
      return await params.dispatch(event, lifecycle);
    },
    pollIntervalMs: DISCORD_INGRESS_DRAIN_INTERVAL_MS,
    retention: {
      // Discord previously pruned before every enqueue rather than on a timed cadence.
      pruneIntervalMs: 0,
      // Stale-ambient suppression settles as a completed tombstone rather than a
      // dead letter, so its rows now share this bucket with real deliveries. Hold
      // the combined capacity both classes had before that move so a reconnect
      // backlog burst cannot evict the replay guards for delivered messages.
      completedMaxEntries: 10_000,
      failedMaxEntries: 5_000,
    },
    appendRetryDelaysMs: [0],
    drain: {
      resolveNonRetryableFailure: (error) => {
        if (error instanceof DiscordIngressPayloadError) {
          return { reason: "invalid-event", message: error.message };
        }
        if (error instanceof DiscordStaleAmbientBacklogError) {
          // Handled policy outcome, not breakage: core tombstones it via
          // complete() and the structured receipt below is the recorded fact.
          return {
            reason: "stale-ambient-backlog",
            message: error.message,
            settlement: "handled",
          };
        }
        if (isDiscordAuthenticationFailure(error)) {
          return { reason: "authentication-failed", message: formatErrorMessage(error) };
        }
        return null;
      },
      // A stale ambient row released by a transient failure is already known to
      // be non-actionable, so its backoff must not fence fresh addressed work
      // behind it on the same channel lane. This only restores claim
      // eligibility; `deliver` re-runs the identical classification on the
      // claimed row and owns the terminal outcome. Side-effect free and safe to
      // repeat: core may offer the same lane head on every drain pass.
      shouldBypassRetryDelay: async (record) => {
        const { body } = decodeDiscordIngressPayload(record.payload, record.id);
        return (
          (await resolveDiscordStaleAmbientSuppression(
            body.rawMessage,
            body.channelKind,
            record,
            params,
            nowMs(),
          )) !== null
        );
      },
      onLog: (message) => params.runtime.error?.(danger(`discord ingress: ${message}`)),
    },
    onError: (error) =>
      params.runtime.error?.(danger(`discord ingress drain failed: ${formatErrorMessage(error)}`)),
  });

  return {
    accept: async (rawMessage) => {
      const channelKind = resolveDiscordIngressChannelKind(rawMessage.channel_type);
      await monitor.admit({ rawMessage, ...(channelKind ? { channelKind } : {}) });
    },
    start: monitor.start,
    stop: async () => {
      await monitor.stop();
      pendingReceipts.clear();
    },
  };
}
