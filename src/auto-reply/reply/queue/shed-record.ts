// Frond (karmaterminal, #1415): one record per message the queue cap sheds or refuses, whatever the
// drop policy, so nothing leaves the queue without a counted, observable outcome. It names the
// outcome only; message content is never logged.
import { diagnosticLogger } from "../../../logging/diagnostic-runtime.js";
import type { FollowupQueueDisposition } from "../queue-policy.js";
import type { FollowupRun } from "./types.js";

/** Where the message went on from the queue. */
type ShedContinuity =
  /** A pending turn states it in its count, with a preview under drop:summarize. */
  | "previewed"
  | "counted"
  /** Terminal: durable ingress keeps the policy drop, any other surface tells its requester. */
  | "dropped"
  /** Released unrun: durable ingress retries it, any other surface tells its requester. */
  | "refused"
  /** No pending turn can state it; its settled receipt and this record remain. */
  | "none";

/** `unstated` counts the room messages no turn will state once this one has left the queue. */
export function recordQueueShed(
  run: FollowupRun,
  disposition: FollowupQueueDisposition,
  continuity: ShedContinuity,
  unstated = 0,
): void {
  run.onQueueDisposition?.(disposition);
  const mailbox = run.controllerInput?.mailbox;
  diagnosticLogger[unstated > 0 ? "warn" : "info"]("followup queue shed message at capacity", {
    sessionId: run.run.sessionId,
    sessionKey: mailbox?.key,
    roomEvent: run.currentInboundEventKind === "room_event",
    dropPolicy: mailbox?.dropPolicy,
    disposition,
    continuity,
    ...(unstated > 0 ? { unstated } : {}),
  });
}
