/**
 * Subagent registry cleanup decisions.
 *
 * Decides whether completed runs can be cleaned up, deferred for descendants, retried, or abandoned.
 */
import { getDeliveryAttemptCount } from "./subagent-delivery-state.js";
import {
  SUBAGENT_ENDED_REASON_COMPLETE,
  type SubagentLifecycleEndedReason,
} from "./subagent-lifecycle-events.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

type DeferredCleanupDecision =
  | {
      kind: "defer-descendants";
      delayMs: number;
    }
  | {
      // Same-session continue_work continuation is still pending; keep the run
      // record AND its session store entry alive so the wake can re-enter as a
      // heartbeat turn. Distinct from `defer-descendants`, which drives
      // descendant-wake machinery via `wakeOnDescendantSettle`. Fix #952.
      kind: "defer-continuation";
      delayMs: number;
    }
  | {
      kind: "give-up";
      reason: "retry-limit" | "expiry";
      retryCount?: number;
    }
  | {
      kind: "retry";
      retryCount: number;
      resumeDelayMs?: number;
    };

/**
 * Live signals indicating a same-session `continue_work` continuation is still
 * in flight for a child session. Any one being true must keep the subagent
 * session alive; together they close the race where the timer ref releases the
 * instant the wake fires but the heartbeat turn has not run yet. Fix #952.
 */
export type ContinuationPendingState = {
  /** A `continue_work` wake timer is still armed for the child session (a). */
  workWakeTimerArmed: boolean;
  /** A heartbeat wake targeting the child session is queued/coalescing (b). */
  heartbeatWakePending: boolean;
  /** A reply/heartbeat turn is actively running on the child session (c). */
  replyRunActive: boolean;
  /**
   * The heartbeat wake handler is mid-dispatch for this child's continuation
   * turn — set synchronously before any await, cleared in finally (d). Covers
   * the same-tick gap between the timer firing (a → false) plus the dispatcher
   * clearing its queue (b → false) and the reply run registering active
   * (c → true): for that window (d) is the only true signal. Fix #952.
   */
  continuationWakeDispatching: boolean;
};

export function isContinuationPending(state: ContinuationPendingState): boolean {
  return (
    state.workWakeTimerArmed ||
    state.heartbeatWakePending ||
    state.replyRunActive ||
    state.continuationWakeDispatching
  );
}

/** A continuation-deferral decision: defer-with-recheck-delay or proceed. */
export type ContinuationCleanupDeferralResolver = (
  entry: SubagentRunRecord,
  now: number,
) => { kind: "defer-continuation"; delayMs: number } | undefined;

/**
 * Decide whether subagent cleanup must defer because a same-session
 * `continue_work` continuation is still pending.
 *
 * Returns `undefined` to proceed with normal cleanup when nothing is pending,
 * or when the leak guard trips: if no reply run is active and no continuation
 * progress has been observed for longer than `retentionHardExpiryMs`, a leaked
 * timer ref OR a leaked dispatching marker must not pin the child session
 * forever, so we give up the defer and clean up. Only an actively running hop
 * (`replyRunActive`) is exempt from the guard — the dispatching marker is not,
 * so it stays bounded by the hard-expiry. Fix #952.
 */
export function resolveContinuationCleanupDeferral(params: {
  entry: SubagentRunRecord;
  now: number;
  pending: ContinuationPendingState;
  retentionHardExpiryMs: number;
  recheckDelayMs: number;
}): { kind: "defer-continuation"; delayMs: number } | undefined {
  if (!isContinuationPending(params.pending)) {
    return undefined;
  }
  if (!params.pending.replyRunActive) {
    const lastProgressAt = Math.max(
      params.entry.endedAt ?? 0,
      params.entry.completion?.capturedAt ?? 0,
    );
    const retainedSinceProgressMs = params.now - lastProgressAt;
    if (retainedSinceProgressMs > params.retentionHardExpiryMs) {
      return undefined;
    }
  }
  return { kind: "defer-continuation", delayMs: params.recheckDelayMs };
}

/**
 * Compose a continuation-deferral resolver from live runtime queries. Kept as a
 * builder (deps injected) so the predicate sources stay out of this pure module
 * and so callers/tests can supply real or stubbed signals. Fix #952.
 */
export function buildContinuationCleanupDeferralResolver(deps: {
  hasLiveWorkWakeTimer: (sessionKey: string) => boolean;
  hasPendingHeartbeatWake: (sessionKey: string) => boolean;
  isReplyRunActive: (sessionKey: string) => boolean;
  hasContinuationWakeDispatching: (sessionKey: string) => boolean;
  resolveRetentionHardExpiryMs: () => number;
  recheckDelayMs: number;
}): ContinuationCleanupDeferralResolver {
  return (entry, now) =>
    resolveContinuationCleanupDeferral({
      entry,
      now,
      pending: {
        workWakeTimerArmed: deps.hasLiveWorkWakeTimer(entry.childSessionKey),
        heartbeatWakePending: deps.hasPendingHeartbeatWake(entry.childSessionKey),
        replyRunActive: deps.isReplyRunActive(entry.childSessionKey),
        continuationWakeDispatching: deps.hasContinuationWakeDispatching(entry.childSessionKey),
      },
      retentionHardExpiryMs: deps.resolveRetentionHardExpiryMs(),
      recheckDelayMs: deps.recheckDelayMs,
    });
}

/** Resolve the lifecycle ended reason used when cleaning up a subagent run. */
export function resolveCleanupCompletionReason(
  entry: SubagentRunRecord,
): SubagentLifecycleEndedReason {
  return entry.endedReason ?? SUBAGENT_ENDED_REASON_COMPLETE;
}

function resolveEndedAgoMs(entry: SubagentRunRecord, now: number): number {
  return typeof entry.endedAt === "number" ? now - entry.endedAt : 0;
}

/** Decide whether deferred subagent cleanup should retry, defer, or give up. */
export function resolveDeferredCleanupDecision(params: {
  entry: SubagentRunRecord;
  now: number;
  activeDescendantRuns: number;
  announceExpiryMs: number;
  announceCompletionHardExpiryMs: number;
  maxAnnounceRetryCount: number;
  deferDescendantDelayMs: number;
  resolveAnnounceRetryDelayMs: (retryCount: number) => number;
}): DeferredCleanupDecision {
  const endedAgo = resolveEndedAgoMs(params.entry, params.now);
  const isCompletionMessageFlow = params.entry.expectsCompletionMessage === true;
  const completionHardExpiryExceeded =
    isCompletionMessageFlow && endedAgo > params.announceCompletionHardExpiryMs;
  if (isCompletionMessageFlow && params.activeDescendantRuns > 0) {
    if (completionHardExpiryExceeded) {
      return { kind: "give-up", reason: "expiry" };
    }
    return { kind: "defer-descendants", delayMs: params.deferDescendantDelayMs };
  }

  const retryCount = getDeliveryAttemptCount(params.entry) + 1;
  const expiryExceeded = isCompletionMessageFlow
    ? completionHardExpiryExceeded
    : endedAgo > params.announceExpiryMs;
  if (retryCount >= params.maxAnnounceRetryCount || expiryExceeded) {
    return {
      kind: "give-up",
      reason: retryCount >= params.maxAnnounceRetryCount ? "retry-limit" : "expiry",
      retryCount,
    };
  }

  return {
    kind: "retry",
    retryCount,
    resumeDelayMs: params.resolveAnnounceRetryDelayMs(retryCount),
  };
}
