/**
 * Module-level store for `continue_delegate` tool calls.
 *
 * The tool writes pending delegates here during execution. After the agent's
 * response finalizes, `agent-runner.ts` reads and consumes them, feeding them
 * into the same continuation scheduler that bracket-parsed signals use.
 *
 * This is the "tool writes → runner reads" pattern. Precedent:
 * `sessions_spawn` writes to the sub-agent registry during its tool call,
 * and the runner reads completion events later. Same topology.
 *
 * The store is keyed by session key. Multiple delegates per turn are supported
 * (the tool can be called N times in one turn). The runner consumes all pending
 * delegates after the run completes.
 */

export interface PendingContinuationDelegate {
  task: string;
  delayMs?: number;
  silent?: boolean;
  silentWake?: boolean;
}

const pendingDelegates = new Map<string, PendingContinuationDelegate[]>();

/**
 * Called by the `continue_delegate` tool during execution.
 * Appends a delegate to the pending list for the session.
 */
export function enqueuePendingDelegate(
  sessionKey: string,
  delegate: PendingContinuationDelegate,
): void {
  const existing = pendingDelegates.get(sessionKey) ?? [];
  existing.push(delegate);
  pendingDelegates.set(sessionKey, existing);
}

/**
 * Called by `agent-runner.ts` after the run completes.
 * Returns and removes all pending delegates for the session.
 * Returns an empty array if none are pending.
 */
export function consumePendingDelegates(sessionKey: string): PendingContinuationDelegate[] {
  const delegates = pendingDelegates.get(sessionKey) ?? [];
  pendingDelegates.delete(sessionKey);
  return delegates;
}

/**
 * Returns the count of pending delegates for a session without consuming them.
 * Used by the tool to report chain position in its return value.
 */
export function pendingDelegateCount(sessionKey: string): number {
  return pendingDelegates.get(sessionKey)?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Post-compaction delegate queue
//
// Delegates registered with mode "post-compaction" are stored here instead of
// the immediate pending queue. They fire when the `autoCompactionCompleted`
// block runs in agent-runner.ts — right alongside readPostCompactionContext().
// This is the lifecycle-triggered dispatch: no timer, no guessing. The shard
// starts when compaction happens, not 30 seconds after dispatch.
// ---------------------------------------------------------------------------

const compactionDelegates = new Map<string, PendingContinuationDelegate[]>();

/**
 * Called by the `continue_delegate` tool when mode is "post-compaction".
 * The delegate is held until compaction fires.
 */
export function enqueueCompactionDelegate(
  sessionKey: string,
  delegate: PendingContinuationDelegate,
): void {
  const existing = compactionDelegates.get(sessionKey) ?? [];
  existing.push(delegate);
  compactionDelegates.set(sessionKey, existing);
}

/**
 * Called by `agent-runner.ts` when `autoCompactionCompleted` is true.
 * Returns and removes all compaction-triggered delegates for the session.
 */
export function consumeCompactionDelegates(sessionKey: string): PendingContinuationDelegate[] {
  const delegates = compactionDelegates.get(sessionKey) ?? [];
  compactionDelegates.delete(sessionKey);
  return delegates;
}

/**
 * Returns the count of compaction-triggered delegates for a session.
 */
export function compactionDelegateCount(sessionKey: string): number {
  return compactionDelegates.get(sessionKey)?.length ?? 0;
}
