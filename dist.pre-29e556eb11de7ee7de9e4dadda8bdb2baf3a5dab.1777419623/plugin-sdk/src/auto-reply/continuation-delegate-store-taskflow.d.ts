/**
 * Task Flow-backed implementation of the pending continuation delegate store.
 *
 * Each pending delegate is modeled as a managed TaskFlow record with
 * `controllerId = "core/continuation-delegate"` and status `"queued"`.
 * Delegate fields are stored in `stateJson`; `goal` mirrors the task string.
 *
 * This gives delegates SQLite-backed persistence (survive gateway restarts),
 * cancel/retry semantics, and lifecycle tracking through the Task Flow registry.
 *
 * Gated behind `agents.defaults.continuation.taskFlowDelegates` (opt-in).
 * The volatile Map store remains the default fallback.
 */
import type { PendingContinuationDelegate } from "./continuation-delegate.types.js";
/**
 * Enqueue a pending delegate as a TaskFlow record.
 */
export declare function taskFlowEnqueuePendingDelegate(sessionKey: string, delegate: PendingContinuationDelegate): void;
/**
 * Consume (drain) all pending delegates for a session.
 * Returns delegates in FIFO order and transitions backing flow records
 * from "queued" → "succeeded" (proper lifecycle, not delete).
 *
 * Collect-then-cleanup: delegates are converted first so callers always
 * receive them even if finishFlow() fails for some records.
 */
export declare function taskFlowConsumePendingDelegates(sessionKey: string): PendingContinuationDelegate[];
/**
 * Count of pending delegates for a session without consuming them.
 */
export declare function taskFlowPendingDelegateCount(sessionKey: string): number;
/**
 * Cancel all pending TaskFlow delegates for a session.
 * Called when an external message arrives or a session is reset.
 * Records persist with cancelled status for audit trail.
 */
export declare function taskFlowCancelPendingDelegates(sessionKey: string): void;
