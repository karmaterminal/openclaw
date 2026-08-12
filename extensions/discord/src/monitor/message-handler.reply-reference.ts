// Reply-reference classification shared by pre-claim ingress retention and the
// canonical hydration owner. Both must agree on which nested payloads still
// need a REST refetch, otherwise a stale row can be failed before hydration can
// prove the referenced author. Kept free of `../internal/discord.js` so the
// pre-claim ingress path stays off that module graph.
import { MessageReferenceType, MessageType, type APIMessage } from "discord-api-types/v10";

/** Nested `referenced_message` state relative to the declared reply reference. */
export type DiscordReplyReferenceState = "complete" | "missing" | "invalid";

/**
 * Classifies a raw Discord message payload. `missing` and `invalid` both mean
 * the referenced author is still unproven and only a REST refetch can settle it.
 */
export function resolveDiscordReplyReferenceState(
  rawMessage: Partial<APIMessage>,
): DiscordReplyReferenceState {
  const reference = rawMessage.message_reference;
  if (!reference?.message_id) {
    return "complete";
  }
  if (reference.type != null && reference.type !== MessageReferenceType.Default) {
    return "complete";
  }
  if (rawMessage.type != null && rawMessage.type !== MessageType.Reply) {
    return "complete";
  }
  if (!Object.hasOwn(rawMessage, "referenced_message")) {
    return "missing";
  }
  const referenced = rawMessage.referenced_message;
  if (referenced == null) {
    return "complete";
  }
  return typeof referenced === "object" &&
    typeof referenced.id === "string" &&
    referenced.id === reference.message_id
    ? "complete"
    : "invalid";
}
