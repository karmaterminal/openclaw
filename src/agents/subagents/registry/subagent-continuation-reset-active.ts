// Continuation (karmaterminal): the reset kill's retention predicate. Kept free of registry
// persistence so upstream's kill selection can import it without a cycle.
import { AsyncLocalStorage } from "node:async_hooks";

export type ContinuationResetRetentionOutcome = "adopted" | "aborted" | "superseded" | "orphaned";

export type ContinuationResetRetention = {
  resetId: string;
  sessionKey: string;
  agentId: string;
  /** The head the reset replaces; absent when the session had no revision yet. */
  fromRevision?: string;
  /** The successor head the reset commits; minted before the kill. */
  toRevision: string;
  /**
   * adopted: the successor committed. aborted: the reset did not commit. superseded: a later
   * lifecycle owns the row under the same authority. orphaned: the recipient authority is gone.
   */
  state: "pending" | ContinuationResetRetentionOutcome;
  markedAt: number;
  resolvedAt?: number;
};

export type ActiveContinuationReset = { resetId: string; sessionKey: string; agentId: string };

const activeReset = new AsyncLocalStorage<ActiveContinuationReset>();

/** Runs a reset kill so the kill selection honors only this reset's own marks. */
export function runWithActiveContinuationReset<T>(
  reset: ActiveContinuationReset,
  run: () => Promise<T>,
): Promise<T> {
  return activeReset.run(reset, run);
}

/**
 * The reset-kill predicate: true only for a run the reset in flight marked as retained (same
 * reset, session key and agent, mark still pending). A delete, an explicit kill or another
 * process has no active reset, so it never honors a mark.
 */
export function isContinuationRunRetainedByActiveReset(entry: {
  continuationResetRetention?: ContinuationResetRetention;
}): boolean {
  const reset = activeReset.getStore();
  const mark = entry.continuationResetRetention;
  return (
    reset !== undefined &&
    mark !== undefined &&
    mark.state === "pending" &&
    mark.resetId === reset.resetId &&
    mark.sessionKey === reset.sessionKey &&
    mark.agentId === reset.agentId
  );
}
