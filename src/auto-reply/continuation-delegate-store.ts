/**
 * Re-export shim — delegates to the canonical TaskFlow-backed store at
 * `./continuation/delegate-store.js`.
 *
 * Every delegate operation is backed by TaskFlow (SQLite persistence).
 * The volatile in-memory Map and the `taskFlowDelegatesEnabled` gate
 * have been removed. TaskFlow is the only substrate.
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
  enqueuePendingDelegate as canonicalEnqueue,
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
  consumePendingWorkRequest,
  delayedContinuationReservationCount,
  enqueuePendingDelegate,
  highestDelayedContinuationReservationHop,
  listDelayedContinuationReservations,
  pendingDelegateCount,
  removeDelayedContinuationReservation,
  resetDelegateStoreForTests,
  setPendingWorkRequest,
  stagedPostCompactionDelegateCount,
  takeDelayedContinuationReservation,
} from "./continuation/delegate-store.js";

// ---------------------------------------------------------------------------
// Post-compaction wrappers — adapt SessionPostCompactionDelegate ↔ TaskFlow
//
// Downstream callers (agent-runner persist path, delivery queue) speak
// SessionPostCompactionDelegate { task, createdAt, silent?, silentWake? }.
// The canonical store speaks StagedPostCompactionDelegate { task, stagedAt }
// and returns PendingContinuationDelegate { task, mode? }.
// ---------------------------------------------------------------------------

export function stagePostCompactionDelegate(
  sessionKey: string,
  delegate: SessionPostCompactionDelegate,
): void {
  canonicalStage(sessionKey, {
    task: delegate.task,
    stagedAt: delegate.createdAt ?? Date.now(),
  });
}

export function consumeStagedPostCompactionDelegates(
  sessionKey: string,
): SessionPostCompactionDelegate[] {
  return canonicalConsumeStaged(sessionKey).map((d) => ({
    task: d.task,
    createdAt: Date.now(),
    silent: true,
    silentWake: true,
  }));
}
