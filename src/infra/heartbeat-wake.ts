import type {
  HeartbeatWakeHandler,
  HeartbeatWakeIntent,
  HeartbeatWakeSource,
} from "./heartbeat-wake-contracts.js";
import {
  isRetryableSessionEventWakeReason,
  requestSessionEventWake,
  requestSessionEventWakeAndWait,
  resetSessionEventWakeStateForTests,
} from "./session-event-wake.js";
import { setSessionEventWakeHandler } from "./session-event-wake.js";

const TRUSTED_CONTINUATION_ROUTING_MARKER = Symbol("trustedContinuationRouting");
type TrustedContinuationRoutingCarrier = {
  [TRUSTED_CONTINUATION_ROUTING_MARKER]?: true;
};

export function markTrustedContinuationHeartbeatWake<T extends object>(request: T): T {
  Object.defineProperty(request, TRUSTED_CONTINUATION_ROUTING_MARKER, {
    value: true,
    enumerable: false,
    configurable: true,
  });
  return request;
}

export function hasTrustedContinuationHeartbeatWake(
  request: unknown,
): request is TrustedContinuationRoutingCarrier {
  return Boolean(
    request &&
    typeof request === "object" &&
    (request as TrustedContinuationRoutingCarrier)[TRUSTED_CONTINUATION_ROUTING_MARKER] === true,
  );
}

export type {
  HeartbeatRunResult,
  HeartbeatScheduledTask,
  HeartbeatWakeHandler,
  HeartbeatWakeIntent,
  HeartbeatWakeRequest,
  HeartbeatWakeSource,
} from "./heartbeat-wake-contracts.js";
export {
  areSessionEventWakesEnabled as areHeartbeatsEnabled,
  setSessionEventWakesEnabled as setHeartbeatsEnabled,
  getSessionEventWakeAbortSignal as getHeartbeatWakeAbortSignal,
  isRetryableSessionEventWakeReason as isRetryableHeartbeatSkipReason,
  SESSION_EVENT_IDLE_RETRY_MS as HEARTBEAT_IDLE_RETRY_GRACE_MS,
} from "./session-event-wake.js";

export const requestHeartbeat = requestSessionEventWake;
export const requestHeartbeatRaw = requestSessionEventWake;
export const requestHeartbeatAndWait = requestSessionEventWakeAndWait;
export const resetHeartbeatWakeStateForTests = resetSessionEventWakeStateForTests;

export function requestHeartbeatNow(opts?: {
  source?: HeartbeatWakeSource;
  intent?: HeartbeatWakeIntent;
  reason?: string;
  coalesceMs?: number;
  agentId?: string;
  sessionKey?: string;
  parentRunId?: string;
  heartbeat?: { target?: string; to?: string; accountId?: string };
}): void {
  requestSessionEventWake({
    source: opts?.source ?? "other",
    intent: opts?.intent ?? "immediate",
    reason: opts?.reason,
    coalesceMs: opts?.coalesceMs,
    agentId: opts?.agentId,
    sessionKey: opts?.sessionKey,
    parentRunId: opts?.parentRunId,
    heartbeat: opts?.heartbeat,
    trustedContinuationRouting: hasTrustedContinuationHeartbeatWake(opts),
  });
}

export const HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT = "requests-in-flight";
export const HEARTBEAT_SKIP_CRON_IN_PROGRESS = "cron-in-progress";
export const HEARTBEAT_SKIP_NO_PENDING_EVENT = "no-pending-event";
export const HEARTBEAT_SKIP_PREEMPTED = "preempted";
export const HEARTBEAT_SKIP_CHANNEL_NOT_READY = "channel-not-ready";
export const isRetryableHeartbeatBusySkipReason = isRetryableSessionEventWakeReason;

// Shipped SDK callers retain their one-argument handler.
export function setHeartbeatWakeHandler(next: HeartbeatWakeHandler | null): () => void {
  return setSessionEventWakeHandler(next ? (wake) => next(wake) : null);
}
