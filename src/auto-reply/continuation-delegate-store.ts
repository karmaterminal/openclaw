/**
 * Re-export shim — delegates to the canonical TaskFlow-backed store at
 * `./continuation/delegate-store.js`.
 *
 * Every delegate operation is backed by TaskFlow (SQLite persistence).
 * The former volatile in-memory delegate substrate and config gate have
 * been removed. TaskFlow is the only substrate.
 *
 * This file exists so that existing import paths
 * (`../continuation-delegate-store.js`) keep working without a mass
 * import rewrite. Post-compaction functions wrap the canonical store
 * to preserve the `SessionPostCompactionDelegate` type contract that
 * downstream callers (persistPendingPostCompactionDelegates,
 * post-compaction-delegate-dispatch) rely on.
 */

import type { SessionPostCompactionDelegate } from "../config/sessions.js";
import {
  consumeStagedPostCompactionDelegates as canonicalConsumeStaged,
  stagePostCompactionDelegate as canonicalStage,
} from "./continuation/delegate-store.js";

// ---------------------------------------------------------------------------
// Pure re-exports — identical signature to canonical store
// ---------------------------------------------------------------------------

export {
  addDelayedContinuationReservation,
  cancelPendingDelegates,
  clearDelayedContinuationReservations,
  consumePendingDelegates,
  delayedContinuationReservationCount,
  enqueuePendingDelegate,
  highestDelayedContinuationReservationHop,
  listDelayedContinuationReservations,
  pendingDelegateCount,
  removeDelayedContinuationReservation,
  resetDelegateStoreForTests,
  stagedPostCompactionDelegateCount,
  takeDelayedContinuationReservation,
} from "./continuation/delegate-store.js";

// ---------------------------------------------------------------------------
// Post-compaction wrappers — adapt SessionPostCompactionDelegate ↔ TaskFlow
//
// Downstream callers (agent-runner persist path, delivery queue) speak
// SessionPostCompactionDelegate { task, createdAt, firstArmedAt?, silent?, silentWake? }.
// The canonical store speaks StagedPostCompactionDelegate { task, stagedAt, firstArmedAt? }
// and returns PendingContinuationDelegate { task, mode?, firstArmedAt? }.
// ---------------------------------------------------------------------------

export function stagePostCompactionDelegate(
  sessionKey: string,
  delegate: SessionPostCompactionDelegate,
): void {
  const stagedAt = delegate.createdAt ?? Date.now();
  canonicalStage(sessionKey, {
    task: delegate.task,
    stagedAt,
    firstArmedAt: delegate.firstArmedAt ?? stagedAt,
  });
}

export function consumeStagedPostCompactionDelegates(
  sessionKey: string,
): SessionPostCompactionDelegate[] {
  const now = Date.now();
  return canonicalConsumeStaged(sessionKey).map((d) => {
    const firstArmedAt = d.firstArmedAt ?? now;
    return {
      task: d.task,
      createdAt: firstArmedAt,
      firstArmedAt,
      silent: true,
      silentWake: true,
    };
  });
}
