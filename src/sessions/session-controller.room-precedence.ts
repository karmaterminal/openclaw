// Frond (karmaterminal, #1415): which queued room input runs next in one session's mailbox. Room
// chatter under a configured collect yields to direct input, so a backlog of chatter becomes one turn
// and never holds up a request or the principal.
import { type RoomPrecedence, resolveRoomPrecedence } from "../auto-reply/reply/queue/envelope.js";
import type { SessionControllerInput } from "./session-controller.contracts.js";

// A dispatch reserves its place before preparation binds the source that answers for itself.
const reservedPrecedence = new WeakMap<SessionControllerInput, RoomPrecedence>();

/** Records what an unbound reservation is, from the channel facts known at dispatch. */
export function reserveRoomPrecedence(
  input: SessionControllerInput,
  precedence: RoomPrecedence | undefined,
): void {
  if (precedence) {
    reservedPrecedence.set(input, precedence);
  }
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
  const precedenceOf = (input: SessionControllerInput) =>
    input.claim || input.injection || input.withdrawalHolds || input.retirementRequested
      ? undefined
      : input.source
        ? resolveRoomPrecedence(input.source)
        : reservedPrecedence.get(input);
  const next = inputs.find((input) => precedenceOf(input) !== "chatter");
  return next?.phase === "waiting" &&
    (next.ready || next.task || next.payload !== "unbound") &&
    precedenceOf(next) === "direct"
    ? next
    : inputs[0];
}
