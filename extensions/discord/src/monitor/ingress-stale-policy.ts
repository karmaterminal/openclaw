// Discord plugin module owns pre-claim disposition of stale ambient ingress rows.
import { ChannelType, MessageReferenceType, MessageType } from "discord-api-types/v10";
import { listAgentIds } from "openclaw/plugin-sdk/agent-runtime";
import {
  buildMentionRegexes,
  implicitMentionKindWhen,
  matchesMentionWithExplicit,
  resolveGroupThreadMentionFacts,
  resolveInboundMentionDecision,
} from "openclaw/plugin-sdk/channel-inbound";
import type { ChannelIngressQueueRecord } from "openclaw/plugin-sdk/channel-outbound";
import { hasControlCommand } from "openclaw/plugin-sdk/command-detection";
import {
  isRecord,
  normalizeNullableString as nonEmptyString,
} from "openclaw/plugin-sdk/string-coerce-runtime";
import type { DiscordGatewayChannelInfo } from "../internal/gateway-channel-inventory.js";
import {
  normalizeDiscordSlug,
  resolveDiscordChannelConfigWithFallback,
  resolveDiscordGuildEntry,
  resolveDiscordMentionPolicy,
} from "./allow-list.js";
import type { DiscordLivePolicy, DiscordLivePolicyReader } from "./live-policy.js";
import { resolveDiscordRawMessageMentionDocuments } from "./message-text.js";

/** Ambient guild chatter older than this can no longer be the user's live turn. */
const DISCORD_STALE_AMBIENT_BACKLOG_MS = 15 * 60 * 1_000;
const DISCORD_STALE_AMBIENT_BACKLOG_REASON = "stale-ambient-backlog";

const DISCORD_AUDIO_ATTACHMENT_EXTENSIONS =
  /\.(?:aac|caf|flac|m4a|mp3|oga|ogg|opus|wav)(?:[?#]|$)/i;

/** The facts this policy reads from a stored gateway frame. */
type DiscordStalePolicyMessage = {
  channelId: string;
  guildId?: string;
  /** Preflight's mention/command documents: content, else embeds, else text displays. */
  documents: string[];
  text: string;
  sentAtMs: number | null;
  payloadReceivedAt: number | null;
  mentionEveryone: boolean;
  mentionedUserIds: string[];
  hasRoleMention: boolean;
  referencedAuthorId?: string;
  isOrdinaryReply: boolean;
  hasAudioAttachment: boolean;
};

function readMentionedUserIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const ids = value.flatMap((entry) =>
    isRecord(entry) && typeof entry.id === "string" ? [entry.id] : [],
  );
  return ids.length === value.length ? ids : null;
}

function readOrdinaryReply(rawMessage: Record<string, unknown>): boolean {
  const reference = rawMessage.message_reference;
  if (!isRecord(reference) || !nonEmptyString(reference.message_id)) {
    return false;
  }
  if (reference.type != null && reference.type !== MessageReferenceType.Default) {
    return false;
  }
  return rawMessage.type == null || rawMessage.type === MessageType.Reply;
}

function readAudioAttachment(attachments: unknown[]): boolean {
  return attachments.some((attachment) => {
    if (!isRecord(attachment)) {
      return false;
    }
    if (
      nonEmptyString(attachment.content_type)?.startsWith("audio/") ||
      typeof attachment.duration_secs === "number" ||
      nonEmptyString(attachment.waveform)
    ) {
      return true;
    }
    const filename = nonEmptyString(attachment.filename);
    const url = nonEmptyString(attachment.url);
    return Boolean(
      (filename && DISCORD_AUDIO_ATTACHMENT_EXTENSIONS.test(filename)) ||
      (url && DISCORD_AUDIO_ATTACHMENT_EXTENSIONS.test(url)),
    );
  });
}

/** Null for anything not fully readable, so such rows stay with the claim-time codec. */
function readDiscordStalePolicyRow(payload: unknown): DiscordStalePolicyMessage | null {
  // Only the payload version the canonical codec reads is policy-readable.
  if (!isRecord(payload) || payload.version !== 1 || !isRecord(payload.rawMessage)) {
    return null;
  }
  const rawMessage = payload.rawMessage;
  const channelId = nonEmptyString(rawMessage.channel_id);
  const mentionedUserIds = readMentionedUserIds(rawMessage.mentions);
  const referencedMessage = rawMessage.referenced_message;
  if (
    !channelId ||
    !nonEmptyString(rawMessage.id) ||
    !mentionedUserIds ||
    typeof rawMessage.content !== "string" ||
    typeof rawMessage.timestamp !== "string" ||
    typeof rawMessage.mention_everyone !== "boolean" ||
    !Array.isArray(rawMessage.attachments) ||
    (rawMessage.embeds != null && !Array.isArray(rawMessage.embeds)) ||
    (rawMessage.mention_roles != null && !Array.isArray(rawMessage.mention_roles)) ||
    (referencedMessage != null && !isRecord(referencedMessage)) ||
    (rawMessage.message_reference != null && !isRecord(rawMessage.message_reference))
  ) {
    return null;
  }
  const guildId = nonEmptyString(rawMessage.guild_id);
  const referencedAuthor = isRecord(referencedMessage) ? referencedMessage.author : undefined;
  const sentAtMs = Date.parse(rawMessage.timestamp);
  const payloadReceivedAt = payload.receivedAt;
  // Preflight's own text projection, so preclaim never reads less than it does.
  const documents = resolveDiscordRawMessageMentionDocuments(rawMessage);
  return {
    channelId,
    ...(guildId ? { guildId } : {}),
    documents,
    text: documents.join("\n"),
    sentAtMs: Number.isFinite(sentAtMs) ? sentAtMs : null,
    payloadReceivedAt:
      typeof payloadReceivedAt === "number" && Number.isFinite(payloadReceivedAt)
        ? payloadReceivedAt
        : null,
    mentionEveryone: rawMessage.mention_everyone,
    mentionedUserIds,
    hasRoleMention: Array.isArray(rawMessage.mention_roles) && rawMessage.mention_roles.length > 0,
    ...(isRecord(referencedAuthor) && typeof referencedAuthor.id === "string"
      ? { referencedAuthorId: referencedAuthor.id }
      : {}),
    isOrdinaryReply: readOrdinaryReply(rawMessage),
    hasAudioAttachment: readAudioAttachment(rawMessage.attachments),
  };
}

/** Only non-thread guild surfaces may ever be expired. */
function isNonThreadGuildChannel(channelInfo: DiscordGatewayChannelInfo): boolean {
  return (
    channelInfo.type === ChannelType.GuildText ||
    channelInfo.type === ChannelType.GuildAnnouncement ||
    channelInfo.type === ChannelType.GuildVoice ||
    channelInfo.type === ChannelType.GuildStageVoice
  );
}

function resolveSentAtMs(
  record: { receivedAt: number },
  message: DiscordStalePolicyMessage,
): number {
  const payloadReceivedAt = message.payloadReceivedAt ?? record.receivedAt;
  if (record.receivedAt > payloadReceivedAt) {
    return record.receivedAt;
  }
  return message.sentAtMs ?? record.receivedAt;
}

/**
 * Preflight's mention facts replayed on the stored frame: the explicit native
 * mention, @everyone, provider-filtered mention patterns for every roster
 * agent, broadcast participants matched with unfiltered patterns, reply to the
 * bot as an implicit mention, and the canonical decision under a mention-gated
 * channel (non-thread channels never restrict implicit kinds). True when
 * preflight would treat the message as mentioned.
 */
function isMentionedForPreflight(
  message: DiscordStalePolicyMessage,
  botId: string,
  policy: DiscordLivePolicy,
): boolean {
  const text = message.text.trim();
  const audioOnly = !text && message.hasAudioAttachment;
  const hasAnyMention =
    message.mentionedUserIds.length > 0 || message.hasRoleMention || message.mentionEveryone;
  const explicit = {
    hasAnyMention,
    isExplicitlyMentioned: message.mentionedUserIds.includes(botId),
    canResolveExplicit: true,
  };
  const groupThread = resolveGroupThreadMentionFacts({
    cfg: policy.cfg,
    channel: "discord",
    peerId: message.channelId,
    text,
  });
  const implicitMentionKinds = implicitMentionKindWhen(
    "reply_to_bot",
    message.referencedAuthorId === botId,
  );
  return listAgentIds(policy.cfg).some((agentId) => {
    const mentionRegexes = buildMentionRegexes(policy.cfg, agentId, {
      provider: "discord",
      conversationId: message.channelId,
      providerPolicy: policy.discordConfig?.mentionPatterns,
    });
    if (audioOnly && mentionRegexes.length > 0) {
      // Preflight would transcribe the note first; pre-claim cannot.
      return true;
    }
    return !resolveInboundMentionDecision({
      facts: {
        canDetectMention: true,
        wasMentioned:
          message.mentionEveryone ||
          matchesMentionWithExplicit({ text, mentionRegexes, explicit }) ||
          Boolean(groupThread?.mentionedAgentIds.length),
        hasAnyMention,
        implicitMentionKinds,
      },
      policy: {
        isGroup: true,
        requireMention: true,
        allowTextCommands: false,
        hasControlCommand: false,
        commandAuthorized: false,
      },
    }).shouldSkip;
  });
}

/**
 * True only when the channel is provably mention-gated under the published
 * policy, resolved as preflight resolves it: channel entry (id, name, slug or
 * parent category) over guild entry, default gated. Direct-open channels
 * (`requireMention: false`) keep their ambient work, however old.
 */
function isMentionGatedChannel(
  message: DiscordStalePolicyMessage & { guildId: string },
  channelInfo: DiscordGatewayChannelInfo,
  policy: DiscordLivePolicy,
  botId: string,
): boolean {
  const guildEntries = policy.guildEntries;
  const guildInfo = resolveDiscordGuildEntry({ guildId: message.guildId, guildEntries });
  if (!guildInfo && guildEntries && Object.keys(guildEntries).length > 0) {
    // Slug and wildcard guild entries need a guild object this policy lacks;
    // an unresolved entry set is unreadable config, not a default.
    return false;
  }
  const channelConfig = resolveDiscordChannelConfigWithFallback({
    guildInfo,
    channelId: message.channelId,
    channelName: channelInfo.name,
    channelSlug: channelInfo.name ? normalizeDiscordSlug(channelInfo.name) : "",
    ...(channelInfo.parentId ? { parentId: channelInfo.parentId } : {}),
    scope: "channel",
  });
  return resolveDiscordMentionPolicy({
    isGuildMessage: true,
    isThread: false,
    botId,
    channelConfig,
    guildInfo,
    isAutoThreadOwnedByBot: false,
  }).requireMention;
}

/**
 * The drain's pre-claim policy for Discord. Every unknown keeps the row
 * claimable, a hydrating guild defers it, and only backlog that preflight
 * itself would skip as unmentioned in a mention-gated channel under the live
 * policy is failed before it costs a claim and a turn.
 */
export function createDiscordStaleAmbientPendingDisposition(params: {
  botUserId?: string;
  readPolicy: DiscordLivePolicyReader;
  resolveChannelInfo: (channelId: string) => DiscordGatewayChannelInfo | undefined;
  isChannelInventoryHydrating: (guildId: string) => boolean;
}) {
  return async (
    record: ChannelIngressQueueRecord<unknown>,
    context: { laneKey: string; now: number },
  ) => {
    const row = readDiscordStalePolicyRow(record.payload);
    const guildId = row?.guildId;
    const botId = nonEmptyString(params.botUserId);
    // Without the bot identity this policy cannot prove the message is ambient.
    if (!row || !guildId || !botId) {
      return null;
    }
    const message = { ...row, guildId };
    const ageMs = context.now - resolveSentAtMs(record, message);
    if (
      ageMs <= DISCORD_STALE_AMBIENT_BACKLOG_MS ||
      // A reply whose target author is unknown cannot be proven ambient.
      (message.isOrdinaryReply && message.referencedAuthorId === undefined)
    ) {
      return null;
    }

    let policy: DiscordLivePolicy;
    try {
      policy = await params.readPolicy();
    } catch {
      // Unreadable policy: the row is not provably ambient.
      return null;
    }
    if (
      hasControlCommand(message.text, policy.cfg) ||
      isMentionedForPreflight(message, botId, policy)
    ) {
      return null;
    }
    // Never classify against a session that has not delivered this guild yet.
    if (params.isChannelInventoryHydrating(guildId)) {
      return { kind: "defer" as const };
    }
    const channelInfo = params.resolveChannelInfo(message.channelId);
    if (
      !channelInfo ||
      !isNonThreadGuildChannel(channelInfo) ||
      !isMentionGatedChannel(message, channelInfo, policy, botId) ||
      // A newer published policy may already accept this row as work.
      !policy.isCurrent()
    ) {
      return null;
    }
    return {
      kind: "fail" as const,
      reason: DISCORD_STALE_AMBIENT_BACKLOG_REASON,
      message:
        `Discord ambient message ${record.id} on ${context.laneKey} is ${ageMs}ms old ` +
        `(limit ${DISCORD_STALE_AMBIENT_BACKLOG_MS}ms); suppressing stale backlog before dispatch.`,
    };
  };
}
