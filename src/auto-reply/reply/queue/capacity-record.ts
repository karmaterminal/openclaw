// Frond (karmaterminal, #1415): one record per decision the queue cap makes about a message, whatever
// the drop policy, so nothing leaves the queue without a counted, observable outcome. It names the
// outcome only; message content is never logged.
import { diagnosticLogger } from "../../../logging/diagnostic-runtime.js";
import type { FollowupQueueDisposition } from "../queue-policy.js";
import type { FollowupRun } from "./types.js";

type QueueCapacityOutcome = {
  kind: /** A pending turn states it in its count, with a preview under drop:summarize. */
    | "previewed"
    | "counted"
    /** No pending turn can state it; its settled receipt and this record remain. */
    | "unstated"
    /** Terminal: durable ingress keeps the policy drop, any other surface tells its requester. */
    | "dropped"
    /** Released unrun: durable ingress retries it by its policy, any other surface is told. */
    | "refused";
  disposition: FollowupQueueDisposition;
  /** Room messages counted in this one that no turn will state now that it has left the queue. */
  unstated?: number;
};

export function recordQueueCapacity(run: FollowupRun, outcome: QueueCapacityOutcome): void {
  run.onQueueDisposition?.(outcome.disposition);
  const { kind, ...facts } = outcome;
  const mailbox = run.controllerInput?.mailbox;
  diagnosticLogger[outcome.unstated ? "warn" : "info"]("followup queue capacity", {
    outcome: kind,
    sessionId: run.run.sessionId,
    sessionKey: mailbox?.key,
    roomEvent: run.currentInboundEventKind === "room_event",
    dropPolicy: mailbox?.dropPolicy,
    ...facts,
  });
}
