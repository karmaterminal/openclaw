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

/** A continuation-deferral decision: defer-with-recheck-delay or proceed. */
export type ContinuationCleanupDeferralResolver = (
  entry: SubagentRunRecord,
  now: number,
) => { kind: "defer-continuation"; delayMs: number } | undefined;

/**
 * Compose a continuation-deferral resolver for subagent cleanup.
 *
 * Cleanup must defer while a same-session `continue_work` continuation is still
 * pending for the child, otherwise tearing the run down deletes the session the
 * wake re-enters (the #952 hop-2 drop). The durable `continuation_work` store is
 * the source of truth for "pending" — a queued election (possibly far-future)
 * or a just-dispatched election within its handoff grace — so unlike the
 * volatile-signal approach this needs no separate leak-guard expiry: retention
 * is bounded by the task's own lifecycle (queued ≤ the clamped delay, running ≤
 * the handoff grace). `isReplyRunActive` is the backstop for a hop whose turn
 * outruns the grace. Kept as a builder (deps injected) so the live runtime
 * queries stay out of this pure module and tests can stub them. Fix #952.
 */
export function buildContinuationCleanupDeferralResolver(deps: {
  hasPendingContinuationWork: (sessionKey: string) => boolean;
  isReplyRunActive: (sessionKey: string) => boolean;
  recheckDelayMs: number;
}): ContinuationCleanupDeferralResolver {
  return (entry) => {
    const pending =
      deps.hasPendingContinuationWork(entry.childSessionKey) ||
      deps.isReplyRunActive(entry.childSessionKey);
    if (!pending) {
      return undefined;
    }
    return { kind: "defer-continuation", delayMs: deps.recheckDelayMs };
  };
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
