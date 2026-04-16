/**
 * Pending continuation delegate store.
 *
 * Tools (continue_delegate) and token-fallback parsing enqueue delegates here.
 * The agent-runner consumes them after the main-session response completes.
 * Spawned sub-agents consume at the announce boundary.
 *
 * The store is module-level and process-scoped by default. When
 * `taskFlowDelegates` is enabled, a durable backing store is used (not
 * implemented in this initial scaffolding — volatile Map only).
 */

import { logVerbose } from "../globals.js";
import { resolveGlobalMap } from "../shared/global-singleton.js";

export type DelegateReturnMode = "normal" | "silent" | "silent-wake" | "post-compaction";

export type PendingContinuationDelegate = {
  /** Task description for the delegate sub-agent. */
  task: string;
  /** Delay before dispatch (ms). 0 = immediate. */
  delayMs: number;
  /** Return mode controlling channel echo and parent wake behavior. */
  mode: DelegateReturnMode;
  /** Chain hop index at time of enqueue. */
  chainHop: number;
  /** Timestamp of enqueue. */
  enqueuedAt: number;
};

const DELEGATE_STORE_KEY = Symbol.for("openclaw.continuation.delegateStore");

const store = resolveGlobalMap<string, PendingContinuationDelegate[]>(DELEGATE_STORE_KEY);

/**
 * Enqueue a delegate for post-response consumption.
 * Returns the total number of pending delegates for the session.
 */
export function enqueuePendingDelegate(
  sessionKey: string,
  delegate: PendingContinuationDelegate,
): number {
  const existing = store.get(sessionKey) ?? [];
  existing.push(delegate);
  store.set(sessionKey, existing);

  logVerbose(
    `[continue_delegate:enqueue] session=${sessionKey} ` +
      `mode=${delegate.mode} delayMs=${delegate.delayMs} ` +
      `task=${delegate.task.slice(0, 80)}`,
  );

  return existing.length;
}

/**
 * Consume (drain) all pending delegates for a session.
 * Returns the array and removes them from the store.
 */
export function consumePendingDelegates(sessionKey: string): PendingContinuationDelegate[] {
  const pending = store.get(sessionKey);
  if (!pending || pending.length === 0) {
    return [];
  }
  store.delete(sessionKey);
  logVerbose(
    `[continuation:delegate-pending] ${pending.length} delegate(s) consumed for ${sessionKey}`,
  );
  return pending;
}

/**
 * Peek at pending delegates without consuming them.
 */
export function peekPendingDelegates(sessionKey: string): readonly PendingContinuationDelegate[] {
  return store.get(sessionKey) ?? [];
}

/**
 * Get count of pending delegates for a session.
 */
export function getPendingDelegateCount(sessionKey: string): number {
  return store.get(sessionKey)?.length ?? 0;
}

/**
 * Get total pending delegate count across all sessions.
 */
export function getTotalPendingDelegateCount(): number {
  let total = 0;
  for (const delegates of store.values()) {
    total += delegates.length;
  }
  return total;
}

/**
 * Clear all pending delegates for a session.
 * Used on session reset / /new.
 */
export function clearPendingDelegates(sessionKey: string): void {
  store.delete(sessionKey);
}

/** Clear all pending delegates — used for testing and shutdown. */
export function clearAllPendingDelegates(): void {
  store.clear();
}

// ---------------------------------------------------------------------------
// Post-compaction delegate staging (RFC §4.4)
//
// Delegates with mode="post-compaction" are staged here until compaction
// completes. The after_compaction hook consumes them and dispatches with
// silentAnnounce=true, wakeOnReturn=true into the successor session.
// ---------------------------------------------------------------------------

const COMPACTION_STAGE_KEY = Symbol.for("openclaw.continuation.compactionStage");

const compactionStage = resolveGlobalMap<string, PendingContinuationDelegate[]>(
  COMPACTION_STAGE_KEY,
);

/**
 * Stage a delegate for post-compaction release.
 * Returns the count of staged delegates for the session.
 */
export function stagePostCompactionDelegate(
  sessionKey: string,
  delegate: PendingContinuationDelegate,
): number {
  const existing = compactionStage.get(sessionKey) ?? [];
  existing.push(delegate);
  compactionStage.set(sessionKey, existing);

  logVerbose(
    `[continuation:compaction-staged] session=${sessionKey} ` +
      `task=${delegate.task.slice(0, 80)} ` +
      `staged=${existing.length}`,
  );

  return existing.length;
}

/**
 * Consume (drain) all staged post-compaction delegates for a session.
 * Called by the after_compaction hook.
 */
export function consumePostCompactionDelegates(sessionKey: string): PendingContinuationDelegate[] {
  const staged = compactionStage.get(sessionKey);
  if (!staged || staged.length === 0) {
    return [];
  }
  compactionStage.delete(sessionKey);
  logVerbose(
    `[continuation:compaction-delegate] Consuming ${staged.length} compaction delegate(s) ` +
      `— dispatching alongside boot files`,
  );
  return staged;
}

/**
 * Get count of staged post-compaction delegates for a session.
 */
export function getStagedPostCompactionCount(sessionKey: string): number {
  return compactionStage.get(sessionKey)?.length ?? 0;
}

/** Clear all post-compaction staged delegates — used for testing and shutdown. */
export function clearAllPostCompactionDelegates(): void {
  compactionStage.clear();
}
