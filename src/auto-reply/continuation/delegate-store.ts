/**
 * Continuation delegate store — pure TaskFlow-backed.
 *
 * Every delegate operation goes through TaskFlow (SQLite persistence).
 * Zero volatile Maps. Delegates survive gateway restarts by design.
 *
 * Adapted from Goldeneye's implementation with Zod validation on state
 * payloads, `releasedAt` audit trail, and `failFlow` for corrupt records.
 *
 * RFC: docs/design/continue-work-signal-v2.md §5.4
 */

import { z } from "zod";
import type { TaskFlowRecord } from "../../tasks/task-flow-registry.types.js";
import {
  createManagedTaskFlow,
  deleteTaskFlowRecordById,
  failFlow,
  finishFlow,
  listTaskFlowsForOwnerKey,
} from "../../tasks/task-flow-runtime-internal.js";
import type {
  DelayedContinuationReservation,
  PendingContinuationDelegate,
  StagedPostCompactionDelegate,
} from "./types.js";

// ---------------------------------------------------------------------------
// Controller IDs (exported for test assertions)
// ---------------------------------------------------------------------------

export const CONTINUATION_DELEGATE_CONTROLLER_ID = "core/continuation-delegate";
export const CONTINUATION_POST_COMPACTION_CONTROLLER_ID = "core/continuation-post-compaction";

// ---------------------------------------------------------------------------
// Zod validation for TaskFlow state payloads
// ---------------------------------------------------------------------------

const PendingDelegateStateSchema = z.object({
  kind: z.literal("continuation_delegate"),
  task: z.string().min(1),
  delayMs: z.number().int().nonnegative().optional(),
  silent: z.boolean().optional(),
  silentWake: z.boolean().optional(),
  postCompaction: z.boolean().optional(),
});

type PendingDelegateState = z.infer<typeof PendingDelegateStateSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDelegateGoal(delegate: PendingContinuationDelegate): string {
  const task = delegate.task.trim();
  if (!task) {
    return delegate.postCompaction
      ? "Post-compaction continuation delegate"
      : "Continuation delegate";
  }
  const excerpt = task.length > 80 ? `${task.slice(0, 77)}...` : task;
  return delegate.postCompaction
    ? `Post-compaction delegate: ${excerpt}`
    : `Continuation delegate: ${excerpt}`;
}

function buildDelegateState(delegate: PendingContinuationDelegate): PendingDelegateState {
  return {
    kind: "continuation_delegate",
    task: delegate.task,
    ...(delegate.delayMs !== undefined ? { delayMs: delegate.delayMs } : {}),
    ...(delegate.silent === true || delegate.mode === "silent" ? { silent: true } : {}),
    ...(delegate.silentWake === true || delegate.mode === "silent-wake"
      ? { silentWake: true }
      : {}),
    ...(delegate.postCompaction === true || delegate.mode === "post-compaction"
      ? { postCompaction: true }
      : {}),
  };
}

function isPendingDelegateFlow(flow: TaskFlowRecord): boolean {
  return flow.syncMode === "managed" && flow.controllerId === CONTINUATION_DELEGATE_CONTROLLER_ID;
}

function isPostCompactionDelegateFlow(flow: TaskFlowRecord): boolean {
  return (
    flow.syncMode === "managed" && flow.controllerId === CONTINUATION_POST_COMPACTION_CONTROLLER_ID
  );
}

function listQueuedPendingFlows(sessionKey: string): TaskFlowRecord[] {
  return listTaskFlowsForOwnerKey(sessionKey)
    .filter((flow) => isPendingDelegateFlow(flow) && flow.status === "queued")
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

function listQueuedPostCompactionFlows(sessionKey: string): TaskFlowRecord[] {
  return listTaskFlowsForOwnerKey(sessionKey)
    .filter((flow) => isPostCompactionDelegateFlow(flow) && flow.status === "queued")
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

function decodeDelegateState(flow: TaskFlowRecord): PendingDelegateState | undefined {
  const parsed = PendingDelegateStateSchema.safeParse(flow.stateJson);
  return parsed.success ? parsed.data : undefined;
}

function flowToDelegate(
  flow: TaskFlowRecord,
  state: PendingDelegateState,
): PendingContinuationDelegate {
  return {
    task: state.task,
    ...(state.delayMs !== undefined ? { delayMs: state.delayMs } : {}),
    ...(state.silent === true ? { silent: true, mode: "silent" as const } : {}),
    ...(state.silentWake === true ? { silentWake: true, mode: "silent-wake" as const } : {}),
    ...(state.postCompaction === true
      ? { postCompaction: true, mode: "post-compaction" as const }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Pending delegates — enqueue/consume/count/cancel
// ---------------------------------------------------------------------------

/**
 * Enqueue a delegate from the `continue_delegate` tool.
 */
export function enqueuePendingDelegate(
  sessionKey: string,
  delegate: PendingContinuationDelegate,
): void {
  const isPostCompaction = delegate.postCompaction === true || delegate.mode === "post-compaction";
  createManagedTaskFlow({
    ownerKey: sessionKey,
    controllerId: isPostCompaction
      ? CONTINUATION_POST_COMPACTION_CONTROLLER_ID
      : CONTINUATION_DELEGATE_CONTROLLER_ID,
    notifyPolicy: "silent",
    goal: buildDelegateGoal(delegate),
    currentStep: isPostCompaction
      ? "Staged for release after compaction"
      : "Queued for continuation dispatch",
    stateJson: buildDelegateState(delegate),
  });
}

/**
 * Consume pending delegates for a session whose `delayMs` horizon has matured.
 *
 * Filters by `Date.now() >= flow.createdAt + (state.delayMs ?? 0)`. Matured
 * entries are finished with the `releasedAt` audit trail and returned in FIFO
 * order. Unmatured entries are left in `queued` state to be re-checked on the
 * next consume cycle (filter-at-consume; preserves `mode=silent` no-wake
 * semantics — see swim-35/A2 verdict).
 *
 * Skips corrupt payloads via `failFlow`. Only pushes delegates where
 * `finishFlow` was applied (concurrency-safe).
 *
 * Callers that need to know when to retry the consume cycle in a quiet channel
 * should call `peekSoonestUnmaturedDelegateDueAt(sessionKey)` immediately after
 * this returns. Pairing avoids a separate query path.
 */
export function consumePendingDelegates(sessionKey: string): PendingContinuationDelegate[] {
  const delegates: PendingContinuationDelegate[] = [];
  const now = Date.now();

  for (const flow of listQueuedPendingFlows(sessionKey)) {
    const state = decodeDelegateState(flow);
    if (!state) {
      failFlow({
        flowId: flow.flowId,
        expectedRevision: flow.revision,
        currentStep: "Rejected invalid continuation payload",
        blockedSummary: "Pending continuation delegate payload could not be decoded.",
      });
      continue;
    }

    // Filter-at-consume: leave unmatured entries in `queued` so the next
    // response-finalize (or the hedge timer armed by the dispatch caller)
    // re-checks them. Honors `delayMs` on the tool path without threading a
    // wake-pathway timer (which would change `mode=silent` semantics).
    const dueAt = flow.createdAt + (state.delayMs ?? 0);
    if (now < dueAt) {
      continue;
    }

    const finished = finishFlow({
      flowId: flow.flowId,
      expectedRevision: flow.revision,
      currentStep: "Released to continuation scheduler",
      stateJson: { ...state, releasedAt: Date.now() },
    });
    if (!finished.applied) {
      continue;
    }

    delegates.push(flowToDelegate(flow, state));
  }

  return delegates;
}

/**
 * Peek the soonest `dueAt` (createdAt + delayMs) across queued, unmatured
 * pending delegates for a session.
 *
 * Returns `undefined` if there are no unmatured entries. Used by
 * `dispatchToolDelegates` to arm a hedge `setTimeout` so unmatured entries
 * still fire in fully-quiet channels where no further response-finalize
 * arrives. See swim-35/A2 verdict.
 */
export function peekSoonestUnmaturedDelegateDueAt(sessionKey: string): number | undefined {
  const now = Date.now();
  let soonest: number | undefined;
  for (const flow of listQueuedPendingFlows(sessionKey)) {
    const state = decodeDelegateState(flow);
    if (!state) {
      continue;
    }
    const dueAt = flow.createdAt + (state.delayMs ?? 0);
    if (dueAt <= now) {
      continue;
    }
    if (soonest === undefined || dueAt < soonest) {
      soonest = dueAt;
    }
  }
  return soonest;
}

/**
 * Count pending delegates without consuming them.
 */
export function pendingDelegateCount(sessionKey: string): number {
  return listQueuedPendingFlows(sessionKey).length;
}

/**
 * Cancel all pending delegates for a session (both regular and post-compaction).
 */
export function cancelPendingDelegates(sessionKey: string): void {
  for (const flow of listTaskFlowsForOwnerKey(sessionKey).filter(
    (f) => isPendingDelegateFlow(f) || isPostCompactionDelegateFlow(f),
  )) {
    deleteTaskFlowRecordById(flow.flowId);
  }
}

// ---------------------------------------------------------------------------
// Post-compaction delegate staging
// ---------------------------------------------------------------------------

/**
 * Stage a delegate for release after compaction.
 */
export function stagePostCompactionDelegate(
  sessionKey: string,
  delegate: StagedPostCompactionDelegate,
): void {
  enqueuePendingDelegate(sessionKey, {
    task: delegate.task,
    silent: true,
    silentWake: true,
    postCompaction: true,
    mode: "post-compaction",
  });
}

/**
 * Consume staged post-compaction delegates. Same lifecycle as consumePendingDelegates.
 */
export function consumeStagedPostCompactionDelegates(
  sessionKey: string,
): PendingContinuationDelegate[] {
  const delegates: PendingContinuationDelegate[] = [];

  for (const flow of listQueuedPostCompactionFlows(sessionKey)) {
    const state = decodeDelegateState(flow);
    if (!state) {
      failFlow({
        flowId: flow.flowId,
        expectedRevision: flow.revision,
        currentStep: "Rejected invalid post-compaction payload",
        blockedSummary: "Staged post-compaction delegate payload could not be decoded.",
      });
      continue;
    }

    const finished = finishFlow({
      flowId: flow.flowId,
      expectedRevision: flow.revision,
      currentStep: "Released after compaction",
      stateJson: { ...state, releasedAt: Date.now() },
    });
    if (!finished.applied) {
      continue;
    }

    delegates.push(flowToDelegate(flow, state));
  }

  return delegates;
}

export function stagedPostCompactionDelegateCount(sessionKey: string): number {
  return listQueuedPostCompactionFlows(sessionKey).length;
}

// ---------------------------------------------------------------------------
// Delayed continuation reservations (volatile, justified)
// Timer handles are process-scoped — timers themselves don't survive restart,
// so the reservation tracking doesn't need to either.
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
// Continue-work request store (DELIBERATELY VOLATILE)
//
// Same-turn ephemeral: continue_work tool writes during execution, runner
// consumes in same turn's post-response. Never live across turn boundaries
// or gateway restarts. TaskFlow is not needed here.
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
// TaskFlow readiness gate (kept for runner startup signal only)
// ---------------------------------------------------------------------------

let taskFlowReady = false;

export function setTaskFlowDelegatesEnabled(enabled: boolean): void {
  taskFlowReady = enabled;
}

export function isTaskFlowDelegatesEnabled(): boolean {
  return taskFlowReady;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function resetDelegateStoreForTests(): void {
  // Clean up TaskFlow records for all test sessions.
  // In test environments, TaskFlow may or may not be initialized.
  delayedReservations.clear();
  pendingWorkRequests.clear();
  taskFlowReady = false;
}
