import type { SessionPostCompactionDelegate } from "../config/sessions.js";
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
export interface DelayedContinuationReservation {
    id: string;
    source: "bracket" | "tool";
    task: string;
    createdAt: number;
    fireAt: number;
    generation: number;
    plannedHop: number;
    silent?: boolean;
    silentWake?: boolean;
}
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
