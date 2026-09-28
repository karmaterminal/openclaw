// Discord plugin module owns pre-claim disposition of stale ambient ingress rows.
import { ChannelType, MessageReferenceType, MessageType } from "discord-api-types/v10";
import { buildMentionRegexes, matchesMentionPatterns } from "openclaw/plugin-sdk/channel-inbound";
import type { ChannelIngressQueueRecord } from "openclaw/plugin-sdk/channel-outbound";
import { hasControlCommand } from "openclaw/plugin-sdk/command-detection";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import {
  isRecord,
  normalizeNullableString as nonEmptyString,
} from "openclaw/plugin-sdk/string-coerce-runtime";
import { isDiscordThreadChannelType } from "../channel-type.js";
import type { DiscordGatewayChannelInfo } from "../internal/gateway-channel-inventory.js";
import {
  normalizeDiscordSlug,
  resolveDiscordChannelConfigWithFallback,
  resolveDiscordGuildEntry,
  resolveDiscordShouldRequireMention,
} from "./allow-list.js";
import type { DiscordLivePolicy, DiscordLivePolicyReader } from "./live-policy.js";
import { hasRawDiscordUserMention } from "./message-handler.preflight-helpers.js";
import { resolveDiscordRawMessageMentionDocuments } from "./message-text.js";

/** Ambient guild chatter older than this can no longer be the user's live turn. */
export const DISCORD_STALE_AMBIENT_BACKLOG_MS = 15 * 60 * 1_000;
export const DISCORD_STALE_AMBIENT_BACKLOG_REASON = "stale-ambient-backlog";

const DISCORD_AUDIO_ATTACHMENT_EXTENSIONS =
  /\.(?:aac|caf|flac|m4a|mp3|oga|ogg|opus|wav)(?:[?#]|$)/i;

/** Projection of the stored gateway frame that the stale policy is allowed to read. */
type DiscordStalePolicyMessage = {
  channelId: string;
  guildId?: string;
  /** Canonical mention/command documents: content, else embeds, else text displays. */
  documents: string[];
  text: string;
  sentAtMs: number | null;
  mentionEveryone: boolean;
  mentionedUserIds: string[];
  referencedAuthorId?: string;
  isOrdinaryReply: boolean;
  hasAudioAttachment: boolean;
};

type DiscordStalePolicyRow = {
  message: DiscordStalePolicyMessage;
  payloadReceivedAt: number | null;
};

function readMentionedUserIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const ids: string[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== "string") {
      return null;
    }
    ids.push(entry.id);
  }
  return ids;
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

/**
 * Projects a stored ingress payload into the facts this policy needs.
 * Returns null for anything it cannot fully read, so malformed and
 * unrecognized rows stay eligible for the canonical claim-time codec.
 */
function readDiscordStalePolicyRow(payload: unknown): DiscordStalePolicyRow | null {
  if (!isRecord(payload) || !isRecord(payload.rawMessage)) {
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
    (referencedMessage != null && !isRecord(referencedMessage)) ||
    (rawMessage.message_reference != null && !isRecord(rawMessage.message_reference))
  ) {
    return null;
  }
  const guildId = nonEmptyString(rawMessage.guild_id);
  const referencedAuthor = isRecord(referencedMessage) ? referencedMessage.author : undefined;
  const sentAtMs = Date.parse(rawMessage.timestamp);
  const payloadReceivedAt = payload.receivedAt;
  // Same projection preflight uses, so preclaim never reads less text than the
  // canonical mention and command gates it stands in for.
  const documents = resolveDiscordRawMessageMentionDocuments(rawMessage);
  return {
    message: {
      channelId,
      ...(guildId ? { guildId } : {}),
      documents,
      text: documents.join("\n"),
      sentAtMs: Number.isFinite(sentAtMs) ? sentAtMs : null,
      mentionEveryone: rawMessage.mention_everyone,
      mentionedUserIds,
      ...(isRecord(referencedAuthor) && typeof referencedAuthor.id === "string"
        ? { referencedAuthorId: referencedAuthor.id }
        : {}),
      isOrdinaryReply: readOrdinaryReply(rawMessage),
      hasAudioAttachment: readAudioAttachment(rawMessage.attachments),
    },
    payloadReceivedAt:
      typeof payloadReceivedAt === "number" && Number.isFinite(payloadReceivedAt)
        ? payloadReceivedAt
        : null,
  };
}

/** Non-thread guild surfaces are the only ones this policy may ever expire. */
function isNonThreadGuildChannel(channelInfo: DiscordGatewayChannelInfo): boolean {
  if (isDiscordThreadChannelType(channelInfo.type)) {
    return false;
  }
  return (
    channelInfo.type === ChannelType.GuildText ||
    channelInfo.type === ChannelType.GuildAnnouncement ||
    channelInfo.type === ChannelType.GuildVoice ||
    channelInfo.type === ChannelType.GuildStageVoice
  );
}

function resolveSentAtMs(record: { receivedAt: number }, row: DiscordStalePolicyRow): number {
  const payloadReceivedAt = row.payloadReceivedAt ?? record.receivedAt;
  if (record.receivedAt > payloadReceivedAt) {
    return record.receivedAt;
  }
  return row.message.sentAtMs ?? record.receivedAt;
}

function isAddressedToBot(message: DiscordStalePolicyMessage, botUserId?: string): boolean {
  if (message.mentionEveryone) {
    return true;
  }
  const botId = nonEmptyString(botUserId);
  if (!botId) {
    // Without the bot identity this policy cannot prove the message is ambient.
    return true;
  }
  return (
    message.mentionedUserIds.includes(botId) ||
    message.referencedAuthorId === botId ||
    message.documents.some((document) => hasRawDiscordUserMention(document, botId))
  );
}

function configuredAgentIds(cfg?: OpenClawConfig): Array<string | undefined> {
  const ids = new Set<string>();
  for (const entry of cfg?.agents?.list ?? []) {
    const id = nonEmptyString(entry?.id);
    if (id) {
      ids.add(id);
    }
  }
  return [undefined, ...ids];
}

/** Configured name mentions ("hey claw") and voice notes that resolve to one. */
function matchesConfiguredMentionText(
  message: DiscordStalePolicyMessage,
  policy: DiscordLivePolicy,
): boolean {
  const text = message.text.trim();
  const audioOnly = !text && message.hasAudioAttachment;
  if (!text && !audioOnly) {
    return false;
  }
  try {
    for (const agentId of configuredAgentIds(policy.cfg)) {
      const mentionRegexes = buildMentionRegexes(policy.cfg, agentId, {
        provider: "discord",
        conversationId: message.channelId,
        providerPolicy: policy.discordConfig?.mentionPatterns,
      });
      if (audioOnly ? mentionRegexes.length > 0 : matchesMentionPatterns(text, mentionRegexes)) {
        return true;
      }
    }
  } catch {
    // Unreadable mention policy is ambiguous; keep the row claimable.
    return true;
  }
  return false;
}

/**
 * True only when the guild channel is provably mention-gated under the current
 * published policy. Direct-open channels (`requireMention: false`, inherited or
 * per channel) and guilds this policy cannot resolve keep their ambient work.
 */
function isMentionGatedChannel(
  message: DiscordStalePolicyMessage & { guildId: string },
  channelInfo: DiscordGatewayChannelInfo,
  policy: DiscordLivePolicy,
): boolean {
  const guildEntries = policy.guildEntries;
  const guildInfo = resolveDiscordGuildEntry({ guildId: message.guildId, guildEntries });
  if (!guildInfo && guildEntries && Object.keys(guildEntries).length > 0) {
    // Slug and wildcard guild entries need a guild object this policy does not
    // have. An unresolved entry set is config we cannot read, not a default.
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
  return resolveDiscordShouldRequireMention({
    isGuildMessage: true,
    isThread: false,
    channelConfig,
    guildInfo,
    isAutoThreadOwnedByBot: false,
  });
}

/**
 * Builds the drain's pre-claim policy for Discord. Every unknown keeps the row
 * claimable; a guild whose channel inventory is still hydrating defers instead,
 * so backlog is never classified against a half-built session. Only backlog that
 * the currently published policy proves ambient and mention-gated is failed
 * before it can consume a claim and an agent turn.
 */
export function createDiscordStaleAmbientPendingDisposition(params: {
  botUserId?: string;
  readPolicy: DiscordLivePolicyReader;
  resolveChannelInfo: (channelId: string) => DiscordGatewayChannelInfo | undefined;
  isChannelInventoryHydrating: (guildId: string) => boolean;
  staleAfterMs?: number;
}) {
  const staleAfterMs = params.staleAfterMs ?? DISCORD_STALE_AMBIENT_BACKLOG_MS;
  // Structurally matches the drain's `resolvePendingDisposition` seam; the
  // contract lives in docs/plugins/sdk-channel-outbound.md.
  return async (
    record: ChannelIngressQueueRecord<unknown>,
    context: { laneKey: string; now: number },
  ) => {
    const row = readDiscordStalePolicyRow(record.payload);
    const guildId = row?.message.guildId;
    if (!row || !guildId) {
      return null;
    }
    const message = { ...row.message, guildId };
    const ageMs = context.now - resolveSentAtMs(record, row);
    if (
      ageMs <= staleAfterMs ||
      message.isOrdinaryReply ||
      isAddressedToBot(message, params.botUserId)
    ) {
      return null;
    }

    let policy: DiscordLivePolicy;
    try {
      policy = await params.readPolicy();
    } catch {
      // Policy is unreadable right now, so the row is not provably ambient.
      return null;
    }
    if (
      hasControlCommand(message.text, policy.cfg) ||
      matchesConfiguredMentionText(message, policy)
    ) {
      return null;
    }

    // Hold the row rather than classify it against a session that has not
    // delivered this guild's channels yet.
    if (params.isChannelInventoryHydrating(guildId)) {
      return { kind: "defer" as const };
    }
    const channelInfo = params.resolveChannelInfo(message.channelId);
    if (
      !channelInfo ||
      !isNonThreadGuildChannel(channelInfo) ||
      !isMentionGatedChannel(message, channelInfo, policy) ||
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
        `(limit ${staleAfterMs}ms); suppressing stale backlog before dispatch.`,
    };
  };
}
