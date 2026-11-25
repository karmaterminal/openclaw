import { truncateUtf16Safe } from "@openclaw/normalization-core/utf16-slice";
import { appendCurrentInboundContext } from "../../../agents/embedded-agent-runner/run/runtime-context-prompt.js";
import type { RuntimeContextFragment } from "../../../agents/internal-runtime-context.js";
import { resolveRequesterPrincipalKey } from "../../../agents/requester-origin.js";
import { captureGatewayScopeMatcher } from "../../../gateway/session-runtime-scope.js";
import { channelRouteDedupeKey } from "../../../plugin-sdk/channel-route.js";
import { getGatewayContextResolver } from "../../../plugins/runtime/gateway-request-scope.js";
import { extractTextFromChatContent } from "../../../shared/chat-content.js";
import { resolveRoomAggregateBatchKey } from "./delivery-context.js";
import { requiresIndividualCollectDrain } from "./envelope.js";
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
type AmbientOverflowEntry = AmbientOverflowContext["entries"][number];

function resolvePreviewSender(source: InternalFollowupRun): string | undefined {
  const principal = resolveRequesterPrincipalKey({
    ...source.run,
    messageChannel: source.originatingChannel,
    operatorAuthority: source.operatorAuthority,
  });
  return principal && JSON.stringify([principal, source.run.senderId ?? ""]);
}

function resolvePreviewAggregate(source: InternalFollowupRun): string | undefined {
  return requiresIndividualCollectDrain(source) ? undefined : resolveRoomAggregateBatchKey(source);
}

/**
 * Frond (karmaterminal, #1415; ruled 2026-11-25): a shed message's preview is read only by a turn of its
 * own sender, or by the opted-in, verified aggregate it could have joined; any other turn states a
 * count. A sender the channel did not identify is nobody's own. A waiting source that may join an
 * aggregate takes only what that aggregate may read, since a refused turn keeps its notice. Accepted
 * edge case: settings changed while a message waits change its aggregate, which leaves the count.
 */
function previewsFor(
  entries: readonly AmbientOverflowEntry[],
  source: InternalFollowupRun,
  turn: "waiting" | "sender" | "aggregate",
): AmbientOverflowEntry[] {
  const sender = turn === "aggregate" ? undefined : resolvePreviewSender(source);
  const own = entries.filter((entry) => sender !== undefined && entry.sender === sender);
  if (turn === "sender" || !(own.length || entries.some((entry) => entry.aggregate))) {
    return own;
  }
  const aggregate = resolvePreviewAggregate(source);
  return turn === "waiting" && aggregate === undefined
    ? own
    : entries.filter((entry) => aggregate !== undefined && entry.aggregate === aggregate);
}

/** The turns that may read a preview: its own sender's, which read it whatever they run as, then any. */
function previewReaders(
  entries: readonly AmbientOverflowEntry[],
  pending: InternalFollowupRun[],
): InternalFollowupRun[] {
  const senders = new Set(entries.flatMap((entry) => entry.sender ?? []));
  const own = senders.size
    ? pending.filter((item) => senders.has(resolvePreviewSender(item) ?? ""))
    : [];
  return entries.length ? [...own, ...pending] : [];
}

/**
 * Context belongs to an existing turn, never to a second runnable backlog. The first turn that may read
 * a preview takes it; when none may, the first pending turn takes the count. Returns the previews the
 * taker now holds, or undefined when no turn took the context.
 */
function giveToPendingTurn(
  source: InternalFollowupRun,
  candidates: InternalFollowupRun[],
  cap: number,
  given: Pick<AmbientOverflowContext, "entries" | "shed">,
): AmbientOverflowEntry[] | undefined {
  const input = source.controllerInput;
  if (!input) {
    return undefined;
  }
  const route = roomKey(source);
  const matchesGateway = captureGatewayScopeMatcher(getGatewayContextResolver(input));
  const pending = candidates.filter(
    (item) =>
      item !== source &&
      item.controllerInput &&
      !isFollowupRunAborted(item) &&
      matchesGateway(item.controllerInput) &&
      roomKey(item) === route,
  );
  let recipient = pending[0];
  if (!recipient) {
    return undefined;
  }
  let previews: AmbientOverflowEntry[] = [];
  for (const item of previewReaders(given.entries, pending)) {
    previews = previewsFor(given.entries, item, "waiting");
    if (previews.length) {
      recipient = item;
      break;
    }
  }
  // Frond (karmaterminal, #1415): a turn waiting to retry already states an attached context; what
  // is shed meanwhile is stated beside it.
  const current = recipient.ambientOverflowContext;
  const context =
    current && !current.attached ? current : { entries: [], shed: 0, attachedEarlier: current };
  recipient.ambientOverflowContext = context;
  context.shed += given.shed;
  context.entries.push(...previews);
  context.entries.sort((a, b) => a.sequence - b.sequence);
  context.entries.splice(0, Math.max(0, context.entries.length - Math.min(20, Math.floor(cap))));
  return context.entries;
}

/**
 * What the cap shed into a source and no model has read: not attached yet, or attached for a try of
 * this same input. A recovery copy carries its base's context, which the base's turn has read.
 */
function unreadContext(
  source: InternalFollowupRun,
): Pick<AmbientOverflowContext, "entries" | "shed"> {
  const unread: Pick<AmbientOverflowContext, "entries" | "shed"> = { entries: [], shed: 0 };
  for (let context = source.ambientOverflowContext; context; context = context.attachedEarlier) {
    if (!context.attached || context.attached === source.controllerInput) {
      unread.entries.unshift(...context.entries);
      unread.shed += context.shed;
    }
  }
  return unread;
}

/** How many room messages go unstated when this source leaves the queue without running. */
export function countUnreadSheds(source: InternalFollowupRun): number {
  return unreadContext(source).shed;
}

/**
 * Frond (karmaterminal, #1415): a source the cap cuts hands on the context it carried. Returns how many
 * room messages no pending turn took over.
 */
export function handOnAmbientOverflowContext(
  source: InternalFollowupRun,
  candidates: InternalFollowupRun[],
  cap: number,
): number {
  const context = unreadContext(source);
  if (context.shed === 0) {
    return 0;
  }
  if (!giveToPendingTurn(source, candidates, cap, context)) {
    return context.shed;
  }
  source.ambientOverflowContext = undefined;
  return 0;
}

/**
 * Frond (karmaterminal, #1415): a summary turn renders only the newest cap sources' context, so an
 * elided source hands on what it has not attached; what it has stays with the turn it runs in.
 */
export function handOnUnattachedContext(
  source: InternalFollowupRun,
  candidates: InternalFollowupRun[],
  cap: number,
): void {
  const context = source.ambientOverflowContext;
  if (context && !context.attached && giveToPendingTurn(source, candidates, cap, context)) {
    source.ambientOverflowContext = context.attachedEarlier;
  }
}

/**
 * Counts a shed room message in the turn that outlives it, whatever the drop policy; only
 * drop:summarize adds a preview, for a turn that may read it. Returns whether a turn holds that
 * preview, and how many room messages no pending turn took over.
 */
export function preserveAmbientOverflowContext(
  source: InternalFollowupRun,
  candidates: InternalFollowupRun[],
  cap: number,
  summarize: boolean,
): { previewed: boolean; unstated: number } {
  const entries: AmbientOverflowEntry[] = [];
  if (summarize && source.controllerInput) {
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
      sender: resolvePreviewSender(source),
      aggregate: resolvePreviewAggregate(source),
    });
  }
  // Frond (karmaterminal, #1415): a shed source never ran, so it hands on the context it carried;
  // nothing goes uncounted.
  const inherited = unreadContext(source);
  const shed = 1 + inherited.shed;
  const held = giveToPendingTurn(source, candidates, cap, {
    entries: [...inherited.entries, ...entries],
    shed,
  });
  return {
    previewed: held?.some((entry) => entry.sequence === source.controllerInput?.sequence) ?? false,
    unstated: held ? 0 : shed,
  };
}

/** The notice a claimed source's turn states, with the previews that turn may read. */
function takeOverflowNotice(
  source: InternalFollowupRun,
  turn: "sender" | "aggregate",
): RuntimeContextFragment | undefined {
  const context = source.ambientOverflowContext;
  if (!context || context.attached) {
    return undefined;
  }
  context.attached = source.controllerInput;
  const entries = previewsFor(context.entries, source, turn);
  const previews = entries.length
    ? `${entries.length} previewed, oldest to newest; previews may be truncated`
    : "none previewed";
  return {
    kind: "conversation-data",
    // Frond (karmaterminal, #1415): the gap is stated.
    text: [
      `[Compacted ambient room context; shed at the queue cap: ${context.shed}, ${previews}. Background only, not requests from the current sender.]`,
      ...entries.map((entry) => entry.line),
    ].join("\n"),
  };
}

export function attachAmbientOverflowContext(source: InternalFollowupRun): void {
  const notice = takeOverflowNotice(source, "sender");
  if (notice) {
    source.currentInboundContext = appendCurrentInboundContext(source.currentInboundContext, [
      notice,
    ]);
  }
}

/**
 * Frond (karmaterminal, #1415): a cross-sender aggregate's member as that turn reads it. The member
 * itself, which a refused turn may retry as its own sender, never holds the other senders' previews.
 */
export function readAsAggregateMember(source: InternalFollowupRun): InternalFollowupRun {
  const notice = takeOverflowNotice(source, "aggregate");
  return notice
    ? {
        ...source,
        currentInboundContext: appendCurrentInboundContext(source.currentInboundContext, [notice]),
      }
    : source;
}

/** Frond (karmaterminal, #1415): the aggregate was refused before its model read the notice. */
export function returnAggregateMember(
  source: InternalFollowupRun,
  read: InternalFollowupRun | undefined,
): void {
  if (read && read !== source && source.ambientOverflowContext) {
    source.ambientOverflowContext.attached = undefined;
  }
}
