// Queue state types for the session event wake runtime (pending wakes, slot groups, attempts).
import type { HeartbeatRunResult, HeartbeatWakeRequest } from "./heartbeat-wake-contracts.js";

export type SessionEventWakeResult = HeartbeatRunResult;
export type SessionEventWakeRequest = HeartbeatWakeRequest;
export type WakeHandler = (
  request: SessionEventWakeRequest,
  signal: AbortSignal,
) => Promise<SessionEventWakeResult>;
export type SessionEventWakeWaitOptions = {
  abortSignal?: AbortSignal;
  /** Called when the queue starts an attempt for this waiter. */
  onAttemptStarted?: () => void;
  /** Called whenever this waiter enters the queue, including retained retries. */
  onQueued?: () => void;
  /** Detach this waiter while the queue retains the wake at its retry deadline. */
  stopWaitingOnRetry?: (
    result: Extract<SessionEventWakeResult, { status: "skipped" }>,
    retryAtMs: number,
  ) => boolean;
};
export type Settlement = {
  active: boolean;
  settle: (result: SessionEventWakeResult) => void;
  onAttemptStarted?: SessionEventWakeWaitOptions["onAttemptStarted"];
  onQueued?: SessionEventWakeWaitOptions["onQueued"];
  stopWaitingOnRetry?: SessionEventWakeWaitOptions["stopWaitingOnRetry"];
};
export type PendingWake = SessionEventWakeRequest & {
  trustedContinuationRouting: boolean;
  sequence: number;
  barrierSequence?: number;
  requestedAt: number;
  readyAt: number;
  notBefore: number;
  settlements: Settlement[];
  retired?: true;
  /** Admission/preparation may have effects even before model dispatch. Never reset on retry. */
  workStarted: boolean;
  /** Every request represented by this wake must be an authoritative, task-free monitor poll. */
  pureNativePoll: boolean;
};
export type WakeGroup = {
  task?: PendingWake;
  scheduled?: PendingWake;
  event?: PendingWake;
  trustedTask?: PendingWake;
  trustedScheduled?: PendingWake;
  trustedEvent?: PendingWake;
  blockedUntil: number;
};
export type ActiveWake = { generation: number; controller: AbortController; wakes: PendingWake[] };
export type WakeAttempt = {
  signal: AbortSignal;
  wake: PendingWake;
  terminalPollDisposition: boolean;
};
export type RequestOptions = Omit<SessionEventWakeRequest, "retainedWork"> & {
  coalesceMs?: number;
};
