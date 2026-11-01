import { toInboundMediaFactsWithMetadata } from "openclaw/plugin-sdk/channel-inbound";
import { mimeTypeFromFilePath } from "openclaw/plugin-sdk/media-mime";
import { parseDateStringTimestampMs } from "openclaw/plugin-sdk/number-runtime";
import { resolveDiscordMessageStickers } from "./message-forwarded.js";
import {
  createDiscordHistorySenderProvenance,
  resolveDiscordHistoryMediaIds,
  type DiscordHistoryEntry,
} from "./message-handler.history.js";
import type {
  DiscordMessagePreflightContext,
  DiscordMessagePreflightParams,
} from "./message-handler.preflight.types.js";
import { resolveMediaList } from "./message-media.js";
import { resolveDiscordMessageHistoryText } from "./message-text.js";
import type { DiscordSenderIdentity } from "./sender-identity.js";

export const DISCORD_HISTORY_MEDIA_MAX_ATTACHMENTS = 4;
const DISCORD_HISTORY_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const DISCORD_HISTORY_MEDIA_IDLE_TIMEOUT_MS = 1_000;
const DISCORD_HISTORY_MEDIA_TOTAL_TIMEOUT_MS = 3_000;

function isDiscordImageAttachmentCandidate(attachment: {
  content_type?: string | null;
  filename?: string | null;
  url?: string | null;
}) {
  const contentType = attachment.content_type?.split(";")[0]?.trim().toLowerCase();
  if (contentType?.startsWith("image/")) {
    return true;
  }
  return Boolean(
    mimeTypeFromFilePath(attachment.filename)?.startsWith("image/") ||
    mimeTypeFromFilePath(attachment.url)?.startsWith("image/"),
  );
}

export async function resolveDiscordHistoryMediaForPendingRecord(params: {
  preflight: DiscordMessagePreflightParams;
  message: DiscordMessagePreflightContext["message"];
}) {
  const imageAttachments = (params.message.attachments ?? [])
    .filter(isDiscordImageAttachmentCandidate)
    .slice(0, DISCORD_HISTORY_MEDIA_MAX_ATTACHMENTS);
  const stickers = resolveDiscordMessageStickers(params.message).slice(
    0,
    Math.max(0, DISCORD_HISTORY_MEDIA_MAX_ATTACHMENTS - imageAttachments.length),
  );
  if (imageAttachments.length === 0 && stickers.length === 0) {
    return [];
  }
  const mediaList = await resolveMediaList(
    { attachments: imageAttachments, stickers },
    Math.min(params.preflight.mediaMaxBytes, DISCORD_HISTORY_MEDIA_MAX_BYTES),
    {
      fetchImpl: params.preflight.discordRestFetch,
      ssrfPolicy: params.preflight.cfg.browser?.ssrfPolicy,
      readIdleTimeoutMs: DISCORD_HISTORY_MEDIA_IDLE_TIMEOUT_MS,
      totalTimeoutMs: DISCORD_HISTORY_MEDIA_TOTAL_TIMEOUT_MS,
      abortSignal: params.preflight.abortSignal,
    },
  );
  return (await toInboundMediaFactsWithMetadata(mediaList, { messageId: params.message.id })).map(
    (media) => Object.assign({}, media, { kind: media.kind ?? "image" }),
  );
}

export function buildDiscordPreflightHistoryEntry(params: {
  isGuildMessage: boolean;
  historyLimit: number;
  message: DiscordMessagePreflightContext["message"];
  senderLabel: string;
  sender: Pick<DiscordSenderIdentity, "id" | "name" | "tag">;
  memberRoleIds: readonly string[];
}): DiscordHistoryEntry | undefined {
  const textForHistory = resolveDiscordMessageHistoryText(params.message, {
    includeForwarded: true,
  });
  return params.isGuildMessage && params.historyLimit > 0 && textForHistory
    ? {
        sender: params.senderLabel,
        body: textForHistory,
        timestamp: parseDateStringTimestampMs(params.message.timestamp),
        messageId: params.message.id,
        mediaIds: resolveDiscordHistoryMediaIds(params.message),
        senderProvenance: createDiscordHistorySenderProvenance(params),
      }
    : undefined;
}
