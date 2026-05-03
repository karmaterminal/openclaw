import type { SessionPostCompactionDelegate } from "../config/sessions.js";
import type { DelayedContinuationReservation, PendingContinuationDelegate } from "./continuation-delegate.types.js";
/**
 * Enable or disable the Task Flow-backed delegate store.
 * Called by agent-runner at startup based on
 * `agents.defaults.continuation.taskFlowDelegates`.
 */
export declare function setTaskFlowDelegatesEnabled(enabled: boolean): void;
export declare function isTaskFlowDelegatesEnabled(): boolean;
/**
 * Called by the `continue_delegate` tool during execution.
 * Appends a delegate to the pending list for the session.
 */
export declare function enqueuePendingDelegate(sessionKey: string, delegate: PendingContinuationDelegate): void;
/**
 * Called by `agent-runner.ts` after the run completes.
 * Returns and removes all pending delegates for the session.
 * Returns an empty array if none are pending.
 */
export declare function consumePendingDelegates(sessionKey: string): PendingContinuationDelegate[];
/**
 * Returns the count of pending delegates for a session without consuming them.
 * Used by the tool to report chain position in its return value.
 */
export declare function pendingDelegateCount(sessionKey: string): number;
/**
 * Cancel and remove all pending delegates for a session.
 * For the volatile store this is a no-op (delegates are turn-local).
 * For the Task Flow store this cancels and deletes the flow records.
 */
export declare function cancelPendingDelegates(sessionKey: string): void;
export declare function addDelayedContinuationReservation(sessionKey: string, reservation: DelayedContinuationReservation): void;
export declare function listDelayedContinuationReservations(sessionKey: string): DelayedContinuationReservation[];
export declare function delayedContinuationReservationCount(sessionKey: string): number;
export declare function highestDelayedContinuationReservationHop(sessionKey: string): number;
export declare function takeDelayedContinuationReservation(sessionKey: string, reservationId: string): DelayedContinuationReservation | undefined;
export declare function removeDelayedContinuationReservation(sessionKey: string, reservationId: string): boolean;
export declare function clearDelayedContinuationReservations(sessionKey: string): void;
export declare function stagePostCompactionDelegate(sessionKey: string, delegate: SessionPostCompactionDelegate): void;
export declare function consumeStagedPostCompactionDelegates(sessionKey: string): SessionPostCompactionDelegate[];
export declare function stagedPostCompactionDelegateCount(sessionKey: string): number;
