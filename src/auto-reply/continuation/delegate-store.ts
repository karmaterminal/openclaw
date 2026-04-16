/**
 * Pending continuation delegate store.
 *
 * The `continue_delegate` tool writes pending delegates here during execution.
 * After the agent's response finalizes, the delegate dispatch module reads and
 * consumes them, feeding them into the scheduler.
 *
 * This is the "tool writes → runner reads" pattern. Same topology as
 * `sessions_spawn` writing to the sub-agent registry during its tool call.
 *
 * Two backends:
 * - Volatile Map (default): delegates live in memory, lost on restart.
 * - TaskFlow (opt-in via `taskFlowDelegates: true`): SQLite-backed, survives restart.
 *
 * RFC: docs/design/continue-work-signal-v2.md §5.4
 */

import type {
  DelayedContinuationReservation,
  PendingContinuationDelegate,
  StagedPostCompactionDelegate,
} from "./types.js";

// ---------------------------------------------------------------------------
// TaskFlow gate — routes enqueue/consume through the TaskFlow backend when on
// ---------------------------------------------------------------------------

let taskFlowDelegatesEnabled = false;

export function setTaskFlowDelegatesEnabled(enabled: boolean): void {
  taskFlowDelegatesEnabled = enabled;
}

export function isTaskFlowDelegatesEnabled(): boolean {
  return taskFlowDelegatesEnabled;
}

// ---------------------------------------------------------------------------
// Volatile pending delegates (default backend)
// ---------------------------------------------------------------------------

const pendingDelegates = new Map<string, PendingContinuationDelegate[]>();

/**
 * Enqueue a delegate from the `continue_delegate` tool.
 */
export function enqueuePendingDelegate(
  sessionKey: string,
  delegate: PendingContinuationDelegate,
): void {
  // TODO: when taskFlowDelegatesEnabled, route through TaskFlow backend
  const existing = pendingDelegates.get(sessionKey);
  if (existing) {
    existing.push(delegate);
  } else {
    pendingDelegates.set(sessionKey, [delegate]);
  }
}

/**
 * Consume all pending delegates for a session. Returns and removes them.
 */
export function consumePendingDelegates(sessionKey: string): PendingContinuationDelegate[] {
  // TODO: when taskFlowDelegatesEnabled, route through TaskFlow backend
  const delegates = pendingDelegates.get(sessionKey);
  if (!delegates || delegates.length === 0) {
    return [];
  }
  pendingDelegates.delete(sessionKey);
  return delegates;
}

/**
 * Count pending delegates without consuming them.
 */
export function pendingDelegateCount(sessionKey: string): number {
  // TODO: when taskFlowDelegatesEnabled, route through TaskFlow backend
  return pendingDelegates.get(sessionKey)?.length ?? 0;
}

/**
 * Cancel all pending delegates for a session.
 */
export function cancelPendingDelegates(sessionKey: string): void {
  pendingDelegates.delete(sessionKey);
}

// ---------------------------------------------------------------------------
// Delayed continuation reservations (volatile, in-memory only)
// ---------------------------------------------------------------------------

const delayedReservations = new Map<string, DelayedContinuationReservation[]>();

/**
 * Add a delayed continuation reservation. The timer callback will take it
 * by ID when it fires.
 */
export function addDelayedContinuationReservation(
  sessionKey: string,
  reservation: DelayedContinuationReservation,
): void {
  const existing = delayedReservations.get(sessionKey);
  if (existing) {
    existing.push(reservation);
  } else {
    delayedReservations.set(sessionKey, [reservation]);
  }
}

/**
 * Take a specific reservation by ID (removes it from the store).
 * Returns null if already taken or cleared.
 */
export function takeDelayedContinuationReservation(
  sessionKey: string,
  reservationId: string,
): DelayedContinuationReservation | null {
  const list = delayedReservations.get(sessionKey);
  if (!list) {
    return null;
  }
  const idx = list.findIndex((r) => r.id === reservationId);
  if (idx === -1) {
    return null;
  }
  const [reservation] = list.splice(idx, 1);
  if (list.length === 0) {
    delayedReservations.delete(sessionKey);
  }
  return reservation;
}

/**
 * Count delayed reservations for a session.
 */
export function delayedContinuationReservationCount(sessionKey: string): number {
  return delayedReservations.get(sessionKey)?.length ?? 0;
}

/**
 * Get the highest planned hop across all delayed reservations for a session.
 * Used for chain-depth enforcement when multiple delays are in flight.
 */
export function highestDelayedContinuationReservationHop(sessionKey: string): number {
  const list = delayedReservations.get(sessionKey);
  if (!list || list.length === 0) {
    return 0;
  }
  return Math.max(...list.map((r) => r.plannedHop));
}

/**
 * Clear all delayed reservations for a session.
 */
export function clearDelayedContinuationReservations(sessionKey: string): void {
  delayedReservations.delete(sessionKey);
}

// ---------------------------------------------------------------------------
// Post-compaction delegate staging
// ---------------------------------------------------------------------------

const stagedPostCompactionDelegates = new Map<string, StagedPostCompactionDelegate[]>();

export function stagePostCompactionDelegate(
  sessionKey: string,
  delegate: StagedPostCompactionDelegate,
): void {
  const existing = stagedPostCompactionDelegates.get(sessionKey);
  if (existing) {
    existing.push(delegate);
  } else {
    stagedPostCompactionDelegates.set(sessionKey, [delegate]);
  }
}

export function consumeStagedPostCompactionDelegates(
  sessionKey: string,
): StagedPostCompactionDelegate[] {
  const delegates = stagedPostCompactionDelegates.get(sessionKey);
  if (!delegates || delegates.length === 0) {
    return [];
  }
  stagedPostCompactionDelegates.delete(sessionKey);
  return delegates;
}

export function stagedPostCompactionDelegateCount(sessionKey: string): number {
  return stagedPostCompactionDelegates.get(sessionKey)?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Continue-work request store (same "tool writes, runner reads" pattern)
// ---------------------------------------------------------------------------

/**
 * Per-session continue_work request. Set by the tool during execution,
 * consumed by the runner post-response to arm the WORK timer.
 *
 * Using a store instead of a callback avoids threading the callback through
 * 5 layers of function params (runner → execution → embedded Pi → attempt → tools).
 */
const pendingWorkRequests = new Map<string, { reason: string; delaySeconds: number }>();

export function setPendingWorkRequest(
  sessionKey: string,
  request: { reason: string; delaySeconds: number },
): void {
  pendingWorkRequests.set(sessionKey, request);
}

export function consumePendingWorkRequest(
  sessionKey: string,
): { reason: string; delaySeconds: number } | undefined {
  const request = pendingWorkRequests.get(sessionKey);
  if (request) {
    pendingWorkRequests.delete(sessionKey);
  }
  return request;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function resetDelegateStoreForTests(): void {
  pendingDelegates.clear();
  delayedReservations.clear();
  stagedPostCompactionDelegates.clear();
  pendingWorkRequests.clear();
  taskFlowDelegatesEnabled = false;
}
