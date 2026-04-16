/**
 * Pending continuation delegate store.
 *
 * The `continue_delegate` tool writes pending delegates here during execution.
 * After the agent's response finalizes, the delegate dispatch module reads and
 * consumes them, feeding them into the scheduler.
 *
 * Production backend: TaskFlow (SQLite-backed, survives gateway restarts).
 * Volatile Map fallback exists for test environments where TaskFlow is not
 * initialized. This is NOT an opt-out — TaskFlow is required for production.
 *
 * RFC: docs/design/continue-work-signal-v2.md §5.4
 */

import {
  taskFlowCancelPendingDelegates,
  taskFlowConsumePendingDelegates,
  taskFlowEnqueuePendingDelegate,
  taskFlowPendingDelegateCount,
} from "./delegate-store-taskflow.js";
import type {
  DelayedContinuationReservation,
  PendingContinuationDelegate,
  StagedPostCompactionDelegate,
} from "./types.js";

// ---------------------------------------------------------------------------
// TaskFlow readiness gate
//
// TaskFlow is the required production backend for delegate persistence.
// Delegates must survive gateway restarts. The volatile Map fallback is
// for test environments only where the TaskFlow registry is not initialized.
// ---------------------------------------------------------------------------

let taskFlowReady = false;

/**
 * Signal that the TaskFlow registry is available. Called once at gateway
 * startup after the registry is initialized.
 */
export function setTaskFlowDelegatesEnabled(enabled: boolean): void {
  taskFlowReady = enabled;
}

export function isTaskFlowDelegatesEnabled(): boolean {
  return taskFlowReady;
}

// ---------------------------------------------------------------------------
// Volatile pending delegates (test-only fallback)
// ---------------------------------------------------------------------------

const pendingDelegates = new Map<string, PendingContinuationDelegate[]>();

/**
 * Enqueue a delegate from the `continue_delegate` tool.
 */
export function enqueuePendingDelegate(
  sessionKey: string,
  delegate: PendingContinuationDelegate,
): void {
  if (taskFlowReady) {
    taskFlowEnqueuePendingDelegate(sessionKey, delegate);
    return;
  }
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
  if (taskFlowReady) {
    return taskFlowConsumePendingDelegates(sessionKey);
  }
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
  if (taskFlowReady) {
    return taskFlowPendingDelegateCount(sessionKey);
  }
  return pendingDelegates.get(sessionKey)?.length ?? 0;
}

/**
 * Cancel all pending delegates for a session.
 */
export function cancelPendingDelegates(sessionKey: string): void {
  if (taskFlowReady) {
    taskFlowCancelPendingDelegates(sessionKey);
    return;
  }
  pendingDelegates.delete(sessionKey);
}

// ---------------------------------------------------------------------------
// Delayed continuation reservations (volatile, in-memory only)
// Timers are process-scoped — these do not need TaskFlow backing because
// a gateway restart clears the timers anyway.
// ---------------------------------------------------------------------------

const delayedReservations = new Map<string, DelayedContinuationReservation[]>();

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

export function delayedContinuationReservationCount(sessionKey: string): number {
  return delayedReservations.get(sessionKey)?.length ?? 0;
}

export function highestDelayedContinuationReservationHop(sessionKey: string): number {
  const list = delayedReservations.get(sessionKey);
  if (!list || list.length === 0) {
    return 0;
  }
  return Math.max(...list.map((r) => r.plannedHop));
}

export function clearDelayedContinuationReservations(sessionKey: string): void {
  delayedReservations.delete(sessionKey);
}

// ---------------------------------------------------------------------------
// Post-compaction delegate staging — TaskFlow-backed
//
// These delegates MUST survive the compaction lifecycle. They are staged
// before compaction and released after it completes. A volatile Map would
// be lost on restart — TaskFlow ensures they persist.
// ---------------------------------------------------------------------------

import type { JsonValue, TaskFlowRecord } from "../../tasks/task-flow-registry.types.js";
import {
  createManagedTaskFlow as createPostCompactionFlow,
  finishFlow as finishPostCompactionFlow,
  listTaskFlowsForOwnerKey as listPostCompactionFlows,
} from "../../tasks/task-flow-runtime-internal.js";

const POST_COMPACTION_CONTROLLER_ID = "core/continuation-post-compaction";

// Volatile fallback for tests.
const stagedPostCompactionDelegatesVolatile = new Map<string, StagedPostCompactionDelegate[]>();

export function stagePostCompactionDelegate(
  sessionKey: string,
  delegate: StagedPostCompactionDelegate,
): void {
  if (taskFlowReady) {
    createPostCompactionFlow({
      ownerKey: sessionKey,
      controllerId: POST_COMPACTION_CONTROLLER_ID,
      goal: delegate.task,
      stateJson: { task: delegate.task, stagedAt: delegate.stagedAt } as JsonValue,
      status: "queued",
    });
    return;
  }
  const existing = stagedPostCompactionDelegatesVolatile.get(sessionKey);
  if (existing) {
    existing.push(delegate);
  } else {
    stagedPostCompactionDelegatesVolatile.set(sessionKey, [delegate]);
  }
}

export function consumeStagedPostCompactionDelegates(
  sessionKey: string,
): StagedPostCompactionDelegate[] {
  if (taskFlowReady) {
    const flows = listPostCompactionFlows(sessionKey)
      .filter(
        (f: TaskFlowRecord) =>
          f.controllerId === POST_COMPACTION_CONTROLLER_ID && f.status === "queued",
      )
      .toSorted((a: TaskFlowRecord, b: TaskFlowRecord) => a.createdAt - b.createdAt);
    const delegates = flows.map((flow: TaskFlowRecord): StagedPostCompactionDelegate => {
      const state = (flow.stateJson ?? {}) as Record<string, unknown>;
      return {
        task: typeof state.task === "string" ? state.task : flow.goal,
        stagedAt: typeof state.stagedAt === "number" ? state.stagedAt : flow.createdAt,
      };
    });
    for (const flow of flows) {
      try {
        finishPostCompactionFlow({ flowId: flow.flowId, expectedRevision: flow.revision });
      } catch {
        // Best-effort cleanup.
      }
    }
    return delegates;
  }
  const delegates = stagedPostCompactionDelegatesVolatile.get(sessionKey);
  if (!delegates || delegates.length === 0) {
    return [];
  }
  stagedPostCompactionDelegatesVolatile.delete(sessionKey);
  return delegates;
}

export function stagedPostCompactionDelegateCount(sessionKey: string): number {
  if (taskFlowReady) {
    return listPostCompactionFlows(sessionKey).filter(
      (f: TaskFlowRecord) =>
        f.controllerId === POST_COMPACTION_CONTROLLER_ID && f.status === "queued",
    ).length;
  }
  return stagedPostCompactionDelegatesVolatile.get(sessionKey)?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Continue-work request store (same "tool writes, runner reads" pattern)
// ---------------------------------------------------------------------------

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
  stagedPostCompactionDelegatesVolatile.clear();
  pendingWorkRequests.clear();
  taskFlowReady = false;
}
