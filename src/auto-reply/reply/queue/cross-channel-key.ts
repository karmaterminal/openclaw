// Followup-queue route identity: which queued runs may collect into one turn.
import { normalizeChatType } from "../../../channels/chat-type.js";
import { channelRouteCompactKey } from "../../../plugin-sdk/channel-route.js";
import { isRoutableChannel } from "../route-reply.js";
import { resolveFollowupReplyAnchor } from "./delivery-context.js";
import type { FollowupRun } from "./types.js";

/**
 * Resolves the collect key for a queued run. Runs that share a key may be
 * collected into one turn; `cross: true` marks a routable run whose
 * destination cannot be compacted, so the queue must not mix it.
 */
export function resolveCrossChannelKey(item: FollowupRun): { cross?: true; key?: string } {
  const { originatingChannel: channel, originatingTo: to, originatingAccountId: accountId } = item;
  const threadId = item.originatingThreadId;
  const replyToId = resolveFollowupReplyAnchor(item);
  const chatType = normalizeChatType(item.originatingChatType);
  if (
    !channel &&
    !to &&
    !accountId &&
    (threadId == null || threadId === "") &&
    !item.originatingChatId &&
    !replyToId
  ) {
    return chatType ? { key: JSON.stringify(["unresolved", chatType]) } : {};
  }
  if (!isRoutableChannel(channel) || !to) {
    // Internal/local transports (notably webchat) have no external destination.
    // Keep their full route identity so matching turns can collect safely.
    return {
      key: JSON.stringify([
        "local",
        channel ?? "",
        to ?? "",
        accountId ?? "",
        threadId ?? "",
        item.originatingChatId ?? "",
        replyToId ?? "",
        item.originatingReplyToMode ?? "",
        chatType ?? "",
      ]),
    };
  }
  const key = channelRouteCompactKey({ channel, to, accountId, threadId });
  return key
    ? {
        key: JSON.stringify([
          key,
          replyToId ?? "",
          item.originatingReplyToMode ?? "",
          chatType ?? "",
        ]),
      }
    : { cross: true };
}
