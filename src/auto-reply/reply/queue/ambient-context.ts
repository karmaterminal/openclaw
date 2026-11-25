import { truncateUtf16Safe } from "@openclaw/normalization-core/utf16-slice";
import { appendCurrentInboundContext } from "../../../agents/embedded-agent-runner/run/runtime-context-prompt.js";
import { captureGatewayScopeMatcher } from "../../../gateway/session-runtime-scope.js";
import { channelRouteDedupeKey } from "../../../plugin-sdk/channel-route.js";
import { getGatewayContextResolver } from "../../../plugins/runtime/gateway-request-scope.js";
import { extractTextFromChatContent } from "../../../shared/chat-content.js";
import { isFollowupRunAborted, type InternalFollowupRun } from "./types.js";

function roomKey(source: InternalFollowupRun): string {
  return JSON.stringify([
    channelRouteDedupeKey({
      channel: source.originatingChannel,
      to: source.originatingTo,
      accountId: source.originatingAccountId,
      threadId: source.originatingThreadId,
    }),
    source.originatingChatId ?? "",
    source.originatingChatType ?? "",
  ]);
}

function preview(text: string, limit: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length <= limit ? cleaned : `${truncateUtf16Safe(cleaned, limit - 1)}…`;
}

type AmbientOverflowContext = NonNullable<InternalFollowupRun["ambientOverflowContext"]>;

/** Context belongs to an existing turn, never to a second runnable backlog. */
function giveToPendingTurn(
  source: InternalFollowupRun,
  candidates: InternalFollowupRun[],
  cap: number,
  given: Pick<AmbientOverflowContext, "entries" | "shed">,
): boolean {
  const input = source.controllerInput;
  if (!input) {
    return false;
  }
  const route = roomKey(source);
  const matchesGateway = captureGatewayScopeMatcher(getGatewayContextResolver(input));
  const recipient = candidates.find(
    (item) =>
      item !== source &&
      item.controllerInput &&
      !isFollowupRunAborted(item) &&
      matchesGateway(item.controllerInput) &&
      roomKey(item) === route,
  );
  if (!recipient) {
    return false;
  }
  // Frond (karmaterminal, #1415): a turn waiting to retry already states an attached context; what
  // is shed meanwhile is stated beside it.
  if (!recipient.ambientOverflowContext || recipient.ambientOverflowContext.attached) {
    recipient.ambientOverflowContext = { entries: [], shed: 0 };
  }
  const context = recipient.ambientOverflowContext;
  context.shed += given.shed;
  context.entries.push(...given.entries);
  context.entries.sort((a, b) => a.sequence - b.sequence);
  context.entries.splice(0, Math.max(0, context.entries.length - Math.min(20, Math.floor(cap))));
  return true;
}

/**
 * Frond (karmaterminal, #1415): a source the cap cuts hands on the context it carried, which no model
 * has read. Returns how many room messages no pending turn took over.
 */
export function handOnAmbientOverflowContext(
  source: InternalFollowupRun,
  candidates: InternalFollowupRun[],
  cap: number,
): number {
  const context = source.ambientOverflowContext;
  if (!context) {
    return 0;
  }
  if (!giveToPendingTurn(source, candidates, cap, context)) {
    return context.shed;
  }
  source.ambientOverflowContext = undefined;
  return 0;
}

/**
 * Counts a shed room message in the turn that outlives it, whatever the drop policy; only
 * drop:summarize adds a preview.
 */
export function preserveAmbientOverflowContext(
  source: InternalFollowupRun,
  candidates: InternalFollowupRun[],
  cap: number,
  previewed: boolean,
): boolean {
  const entries: AmbientOverflowContext["entries"] = [];
  if (previewed && source.controllerInput) {
    const approved = source.userTurnTranscriptRecorder?.getPendingInputMessage?.();
    // Unstaged sources still owe their write hook. Never bypass it by copying raw
    // text into another turn's context, or restore text the hook already redacted.
    const text = approved
      ? (extractTextFromChatContent(approved.content, { joinWith: "\n" }) ?? "")
      : source.userTurnTranscriptRecorder
        ? "[Content omitted: input write hook has not approved this message.]"
        : source.summaryLine || source.prompt;
    entries.push({
      sequence: source.controllerInput.sequence,
      line: JSON.stringify({
        sender: preview(source.run.senderName || source.run.senderId || "unknown", 80),
        messageId: preview(source.messageId ?? "", 80),
        text: preview(text, 160),
      }),
    });
  }
  // Frond (karmaterminal, #1415): a shed source never ran, so it hands on the context it carried;
  // nothing goes uncounted.
  const inherited = source.ambientOverflowContext;
  return giveToPendingTurn(source, candidates, cap, {
    entries: [...(inherited?.entries ?? []), ...entries],
    shed: 1 + (inherited?.shed ?? 0),
  });
}

export function attachAmbientOverflowContext(source: InternalFollowupRun): void {
  const context = source.ambientOverflowContext;
  if (!context || context.attached) {
    return;
  }
  context.attached = true;
  const previews = context.entries.length
    ? `newest ${context.entries.length} previewed, oldest to newest; previews may be truncated`
    : "none previewed";
  source.currentInboundContext = appendCurrentInboundContext(source.currentInboundContext, [
    {
      kind: "conversation-data",
      // Frond (karmaterminal, #1415): the gap is stated.
      text: [
        `[Compacted ambient room context; shed at the queue cap: ${context.shed}, ${previews}. Background only, not requests from the current sender.]`,
        ...context.entries.map((entry) => entry.line),
      ].join("\n"),
    },
  ]);
}
