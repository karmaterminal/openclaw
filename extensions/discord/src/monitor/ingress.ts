// Discord plugin module owns raw gateway-message durable ingress and replay draining.
import { ChannelType, GatewayDispatchEvents, type APIMessage } from "discord-api-types/v10";
import {
  createChannelIngressError,
  createChannelIngressMonitor,
  type ChannelIngressQueue,
  type ChannelIngressMonitorDeliveryResult,
  type ChannelIngressMonitorLifecycle,
} from "openclaw/plugin-sdk/channel-outbound";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import { danger, type RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { normalizeNullableString as nonEmptyString } from "openclaw/plugin-sdk/string-coerce-runtime";
import type { Client } from "../internal/discord.js";
import { mapGatewayDispatchData } from "../internal/gateway-dispatch.js";
import { getDiscordRuntime } from "../runtime.js";
import type { DiscordMessageEvent } from "./listeners.js";
import { hasRawDiscordUserMention } from "./message-handler.preflight-helpers.js";

const DISCORD_INGRESS_PAYLOAD_VERSION = 1;
const DISCORD_INGRESS_DRAIN_INTERVAL_MS = 1_000;
const DISCORD_STALE_AMBIENT_BACKLOG_MS = 15 * 60 * 1_000;

type DiscordIngressPayload = {
  version: 1;
  receivedAt: number;
  rawMessage: APIMessage;
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
  accept: (rawMessage: APIMessage) => Promise<void>;
  start: () => void;
  stop: () => Promise<void>;
};

const DiscordIngressPayloadError = createChannelIngressError("DiscordIngressPayloadError");

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
  return {
    version: candidate.version,
    body: {
      receivedAt: candidate.receivedAt as number,
      rawMessage: candidate.rawMessage as APIMessage,
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

function discordMessageSentAtMs(rawMessage: APIMessage): number | null {
  const sentAt = Date.parse(rawMessage.timestamp);
  return Number.isFinite(sentAt) ? sentAt : null;
}

function isDiscordGuildMessage(rawMessage: APIMessage): boolean {
  return typeof (rawMessage as { guild_id?: unknown }).guild_id === "string";
}

function hasMentionPatternValues(groupChat?: { mentionPatterns?: readonly string[] }): boolean {
  return (groupChat?.mentionPatterns ?? []).some((pattern) => Boolean(nonEmptyString(pattern)));
}

function hasConfiguredTextMentionPatterns(cfg?: OpenClawConfig): boolean {
  if (hasMentionPatternValues(cfg?.messages?.groupChat)) {
    return true;
  }
  const agentEntries = Object.values(cfg?.agents?.entries ?? {});
  if (agentEntries.some((entry) => hasMentionPatternValues(entry.groupChat))) {
    return true;
  }
  return (cfg?.agents?.list ?? []).some((entry) => hasMentionPatternValues(entry.groupChat));
}

function isDiscordThreadChannelType(type: unknown): boolean {
  return (
    type === ChannelType.PublicThread ||
    type === ChannelType.PrivateThread ||
    type === ChannelType.AnnouncementThread
  );
}

function hasCachedThreadChannel(rawMessage: APIMessage): boolean {
  const channel = (rawMessage as { channel?: unknown }).channel;
  if (!channel || typeof channel !== "object") {
    return false;
  }
  const isThread = (channel as { isThread?: unknown }).isThread;
  if (typeof isThread === "function") {
    try {
      return isThread() === true;
    } catch {
      return true;
    }
  }
  return isDiscordThreadChannelType((channel as { type?: unknown }).type);
}

function hasBoundThread(rawMessage: APIMessage, threadBindings?: DiscordThreadBindingLookup) {
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

function isDiscordAddressedMessage(rawMessage: APIMessage, botUserId?: string): boolean {
  if (!isDiscordGuildMessage(rawMessage)) {
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

function hasUnresolvedDiscordAddressForm(
  rawMessage: APIMessage,
  params: {
    cfg?: OpenClawConfig;
    threadBindings?: DiscordThreadBindingLookup;
  },
): boolean {
  // Pre-claim rows do not have route/preflight facts. Preserve rows when a
  // later preflight path may prove them addressed instead of dead-lettering.
  return (
    hasBoundThread(rawMessage, params.threadBindings) ||
    hasCachedThreadChannel(rawMessage) ||
    hasConfiguredTextMentionPatterns(params.cfg)
  );
}

export function createDiscordIngressMonitor(params: {
  accountId: string;
  client: Client;
  runtime: Pick<RuntimeEnv, "error" | "log">;
  dispatch: DiscordIngressDispatch;
  botUserId?: string;
  cfg?: OpenClawConfig;
  threadBindings?: DiscordThreadBindingLookup;
  queue?: ChannelIngressQueue<DiscordIngressPayload>;
}): DiscordIngressMonitor {
  const queue =
    params.queue ??
    getDiscordRuntime().state.openChannelIngressQueue<DiscordIngressPayload>({
      accountId: params.accountId,
    });
  const monitor = createChannelIngressMonitor<
    APIMessage,
    DiscordIngressBody,
    DiscordIngressPayload
  >({
    queue,
    inspect: inspectDiscordMessage,
    payload: {
      version: DISCORD_INGRESS_PAYLOAD_VERSION,
      serialize: (rawMessage, { receivedAt }) => ({ receivedAt, rawMessage }),
      deserialize: (body) => body.rawMessage,
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
    deliver: async (rawMessage, lifecycle) => {
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
      completedMaxEntries: 5_000,
      failedMaxEntries: 5_000,
    },
    appendRetryDelaysMs: [0],
    drain: {
      resolvePendingDisposition: (record, context) => {
        const rawMessage = record.payload.rawMessage;
        if (isDiscordAddressedMessage(rawMessage, params.botUserId)) {
          return null;
        }
        if (
          hasUnresolvedDiscordAddressForm(rawMessage, {
            cfg: params.cfg,
            threadBindings: params.threadBindings,
          })
        ) {
          return null;
        }
        const sentAt = discordMessageSentAtMs(rawMessage) ?? record.receivedAt;
        if (context.now - sentAt <= DISCORD_STALE_AMBIENT_BACKLOG_MS) {
          return null;
        }
        return {
          kind: "fail",
          reason: "stale-ambient-backlog",
          message:
            `Discord ambient message ${record.id} on ${context.laneKey} is older than ` +
            `${DISCORD_STALE_AMBIENT_BACKLOG_MS}ms; suppressing stale backlog before dispatch.`,
        };
      },
      resolveNonRetryableFailure: (error) => {
        if (error instanceof DiscordIngressPayloadError) {
          return { reason: "invalid-event", message: error.message };
        }
        if (isDiscordAuthenticationFailure(error)) {
          return { reason: "authentication-failed", message: formatErrorMessage(error) };
        }
        return null;
      },
      onLog: (message) => params.runtime.error?.(danger(`discord ingress: ${message}`)),
    },
    onError: (error) =>
      params.runtime.error?.(danger(`discord ingress drain failed: ${formatErrorMessage(error)}`)),
  });

  return {
    accept: async (rawMessage) => {
      await monitor.admit(rawMessage);
    },
    start: monitor.start,
    stop: monitor.stop,
  };
}
