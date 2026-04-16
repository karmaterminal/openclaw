/**
 * TaskFlow-backed implementation of the pending continuation delegate store.
 *
 * Each pending delegate is modeled as a managed TaskFlow record with
 * `controllerId = "core/continuation-delegate"` and status `"queued"`.
 * Delegate fields are stored in `stateJson`; `goal` mirrors the task string.
 *
 * This gives delegates SQLite-backed persistence (survive gateway restarts),
 * cancel/retry semantics, and lifecycle tracking through the Task Flow registry.
 *
 * TaskFlow is the required production backend — NOT optional. The volatile Map
 * in delegate-store.ts is a test-only fallback.
 *
 * RFC: docs/design/continue-work-signal-v2.md §5.4
 */

import type { JsonValue, TaskFlowRecord } from "../../tasks/task-flow-registry.types.js";
import {
  createManagedTaskFlow,
  finishFlow,
  listTaskFlowsForOwnerKey,
  requestFlowCancel,
  updateFlowRecordByIdExpectedRevision,
} from "../../tasks/task-flow-runtime-internal.js";
import type { PendingContinuationDelegate } from "./types.js";

const CONTROLLER_ID = "core/continuation-delegate";

function delegateToStateJson(delegate: PendingContinuationDelegate): JsonValue {
  const state: Record<string, JsonValue> = { task: delegate.task };
  if (delegate.delayMs != null) {
    state.delayMs = delegate.delayMs;
  }
  if (delegate.mode != null) {
    state.mode = delegate.mode;
  }
  return state;
}

function flowToDelegate(flow: TaskFlowRecord): PendingContinuationDelegate {
  const state = (flow.stateJson ?? {}) as Record<string, unknown>;
  const delegate: PendingContinuationDelegate = {
    task: typeof state.task === "string" ? state.task : flow.goal,
  };
  if (typeof state.delayMs === "number") {
    delegate.delayMs = state.delayMs;
  }
  if (typeof state.mode === "string") {
    delegate.mode = state.mode as PendingContinuationDelegate["mode"];
  }
  return delegate;
}

function listPendingFlows(sessionKey: string): TaskFlowRecord[] {
  return listTaskFlowsForOwnerKey(sessionKey)
    .filter((f) => f.controllerId === CONTROLLER_ID && f.status === "queued")
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

/**
 * Enqueue a pending delegate as a TaskFlow record.
 */
export function taskFlowEnqueuePendingDelegate(
  sessionKey: string,
  delegate: PendingContinuationDelegate,
): void {
  createManagedTaskFlow({
    ownerKey: sessionKey,
    controllerId: CONTROLLER_ID,
    goal: delegate.task,
    stateJson: delegateToStateJson(delegate),
    status: "queued",
  });
}

/**
 * Consume (drain) all pending delegates for a session.
 * Returns delegates in FIFO order and transitions backing flow records
 * from "queued" → "succeeded" (proper lifecycle, not delete).
 *
 * Collect-then-cleanup: delegates are converted first so callers always
 * receive them even if finishFlow() fails for some records.
 */
export function taskFlowConsumePendingDelegates(sessionKey: string): PendingContinuationDelegate[] {
  const flows = listPendingFlows(sessionKey);

  // Collect phase — convert all flows to delegates before any mutation.
  const delegates = flows.map((flow) => flowToDelegate(flow));

  // Cleanup phase — mark each flow as finished individually so one failure
  // does not prevent the rest from being finalized.
  for (const flow of flows) {
    try {
      finishFlow({
        flowId: flow.flowId,
        expectedRevision: flow.revision,
      });
    } catch (err) {
      console.warn(
        `[continuation-delegate] finishFlow failed for flowId=${flow.flowId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return delegates;
}

/**
 * Count of pending delegates for a session without consuming them.
 */
export function taskFlowPendingDelegateCount(sessionKey: string): number {
  return listPendingFlows(sessionKey).length;
}

/**
 * Cancel all pending TaskFlow delegates for a session.
 * Records persist with cancelled status for audit trail.
 */
export function taskFlowCancelPendingDelegates(sessionKey: string): void {
  const flows = listPendingFlows(sessionKey);
  for (const flow of flows) {
    const cancelResult = requestFlowCancel({
      flowId: flow.flowId,
      expectedRevision: flow.revision,
    });
    if (cancelResult.applied) {
      updateFlowRecordByIdExpectedRevision({
        flowId: flow.flowId,
        expectedRevision: cancelResult.flow.revision,
        patch: {
          status: "cancelled",
          endedAt: Date.now(),
        },
      });
    }
  }
}
