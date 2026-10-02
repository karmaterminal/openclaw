import {
  isSilentReplyText,
  SILENT_REPLY_TOKEN,
  startsWithSilentToken,
  stripLeadingSilentToken,
  stripSilentToken,
} from "../auto-reply/tokens.js";

export function normalizeSubagentAnnounceReply(text: string): string | null {
  let result = text;
  let didStrip = false;
  const hasLeadingSilentToken = startsWithSilentToken(result, SILENT_REPLY_TOKEN);
  if (hasLeadingSilentToken) {
    result = stripLeadingSilentToken(result, SILENT_REPLY_TOKEN);
    didStrip = true;
  }
  if (hasLeadingSilentToken || result.toLowerCase().includes(SILENT_REPLY_TOKEN.toLowerCase())) {
    result = stripSilentToken(result, SILENT_REPLY_TOKEN);
    didStrip = true;
  }
  if (didStrip && (!result.trim() || isSilentReplyText(result, SILENT_REPLY_TOKEN))) {
    return null;
  }
  return result;
}
