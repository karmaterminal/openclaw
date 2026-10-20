// Queue state types for the session event wake runtime (pending wakes, slot groups, attempts).
import type { HeartbeatRunResult, HeartbeatWakeRequest } from "./heartbeat-wake-contracts.js";

export type WakeHandler = (
  request: HeartbeatWakeRequest,
  signal: AbortSignal,
) => Promise<HeartbeatRunResult>;
export type SessionEventWakeWaitOptions = {
  abortSignal?: AbortSignal;
  /** Called when the queue starts an attempt for this waiter. */
  onAttemptStarted?: () => void;
  /** Called whenever this waiter enters the queue, including retained retries. */
  onQueued?: () => void;
  /** Detach this waiter while the queue retains the wake at its retry deadline. */
  stopWaitingOnRetry?: (
    result: Extract<HeartbeatRunResult, { status: "skipped" }>,
    retryAtMs: number,
  ) => boolean;
};
export type Settlement = {
  active: boolean;
  settle: (result: HeartbeatRunResult) => void;
  onAttemptStarted?: SessionEventWakeWaitOptions["onAttemptStarted"];
  onQueued?: SessionEventWakeWaitOptions["onQueued"];
  stopWaitingOnRetry?: SessionEventWakeWaitOptions["stopWaitingOnRetry"];
};
export type PendingWake = HeartbeatWakeRequest & {
  trustedContinuationRouting: boolean;
  sequence: number;
  barrierSequence?: number;
  requestedAt: number;
  readyAt: number;
  notBefore: number;
  channelRetryDelayMs?: number;
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
export type ActiveWake = { controller: AbortController; wakes: PendingWake[] };
export type WakeAttempt = {
  signal: AbortSignal;
  wake: PendingWake;
  terminalPollDisposition: boolean;
  retryIntervalMs?: number | null;
  /** An earlier attempt of this wake already started work, so a refusal now must retry. */
  startedBefore: boolean;
};
export type RequestOptions = Omit<HeartbeatWakeRequest, "retainedWork"> & {
  coalesceMs?: number;
};
