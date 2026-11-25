// Frond (karmaterminal, #1415): which queued room input runs next in one session's mailbox. Room
// chatter under a configured collect yields to direct input and joins chatter already queued, so a
// backlog of chatter waits behind every request and listed account's line.
import { type RoomPrecedence, resolveRoomPrecedence } from "../auto-reply/reply/queue/envelope.js";
import { resolveGlobalSingleton } from "../shared/global-singleton.js";
import type { SessionControllerInput } from "./session-controller.contracts.js";

// A dispatch reserves its place before preparation binds the source that answers for itself.
const reservedPrecedence = resolveGlobalSingleton(
  Symbol.for("openclaw.reservedRoomPrecedence"),
  () => new WeakMap<SessionControllerInput, RoomPrecedence>(),
);

/** Records what an unbound reservation is, from the channel facts known at dispatch. */
export function reserveRoomPrecedence(
  input: SessionControllerInput,
  precedence: RoomPrecedence | undefined,
): void {
  if (precedence) {
    reservedPrecedence.set(input, precedence);
  }
}

function resolveInputPrecedence(input: SessionControllerInput): RoomPrecedence | undefined {
  if (input.claim || input.injection || input.withdrawalHolds || input.retirementRequested) {
    return undefined;
  }
  if (input.source) {
    return resolveRoomPrecedence(input.source);
  }
  const reserved = reservedPrecedence.get(input);
  // The reservation read the configured mode; the mailbox holds the session's own.
  return reserved === "chatter" && input.mailbox.mode !== "collect" ? undefined : reserved;
}

/**
 * The queued input that runs next. Unclaimed chatter yields to the first runnable direct input behind
 * it; direct inputs keep arrival order among themselves. Anything else behind the chatter, such as an
 * internal turn or a request still preparing, keeps FIFO. Accepted edge case: requests arriving faster
 * than turns end hold the chatter until the queue cap sheds it into their context.
 */
export function findSessionControllerMailboxHead(
  inputs: readonly SessionControllerInput[],
): SessionControllerInput | undefined {
  const next = inputs.find((input) => resolveInputPrecedence(input) !== "chatter");
  return next?.phase === "waiting" &&
    (next.ready || next.task || next.payload !== "unbound") &&
    resolveInputPrecedence(next) === "direct"
    ? next
    : inputs[0];
}

/**
 * Whether an arriving chatter line may queue now, with no turn active: every earlier input is room
 * input and one is already queued, so the line joins that queue. Waiting for the queued turn instead
 * would keep the line's ingress lane, and every request behind it in the room, until the debounce ends.
 */
export function joinsQueuedRoomInput(input: SessionControllerInput): boolean {
  const earlier = input.mailbox.entries.filter(
    (entry) =>
      entry.sequence < input.sequence && entry.phase !== "consumed" && !entry.retirementRequested,
  );
  return (
    resolveInputPrecedence(input) === "chatter" &&
    earlier.every((entry) => resolveInputPrecedence(entry) !== undefined) &&
    earlier.some((entry) => entry.custody.enqueued && entry.phase === "waiting")
  );
}
