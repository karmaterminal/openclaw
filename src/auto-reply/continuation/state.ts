/**
 * Continuation chain state tracking.
 *
 * Tracks per-session chain metadata (depth, start time, accumulated tokens)
 * and timer handle registration. NO generation guard — delayed delegates
 * survive channel noise by design.
 *
 * RFC: docs/design/continue-work-signal-v2.md §3.3
 */

type ContinuationTimerHandle = ReturnType<typeof setTimeout>;

/**
 * Discriminates the two timer families tracked here. `work-wake` is a
 * same-session `continue_work` heartbeat-wake (turn N -> turn N+1); `delegate`
 * covers delegate hedge / chain-hop spawn timers. They share the generic
 * ref/handle bookkeeping, but subagent cleanup must defer ONLY for a live
 * same-session `continue_work` wake — a delegate hedge must never pin the child
 * session alive. Fix #952.
 */
export type ContinuationTimerKind = "work-wake" | "delegate";

// Per-session timer handles for delayed continuation work.
const continuationTimerHandles = new Map<string, Set<ContinuationTimerHandle>>();
// Per-session ref count for outstanding timers (used to determine if
// continuation state should be kept alive).
const continuationTimerRefs = new Map<string, number>();
// Per-session subset of `continuationTimerHandles` holding ONLY `continue_work`
// wake handles. Tracked apart from delegate timers so subagent cleanup can keep
// a child session alive while its own continuation wake is still pending,
// without a delegate hedge (different concern) blocking teardown. Fix #952.
const continuationWorkWakeTimerHandles = new Map<string, Set<ContinuationTimerHandle>>();
// Per-session ref count for a continuation wake the heartbeat dispatcher is
// actively handing off. Set SYNCHRONOUSLY by the batch-dispatch hook the instant
// the wake dispatcher dequeues a coalesced batch (right after
// `pendingWakes.clear()`, before any handler runs) and released in each wake's
// handler finally. Marking the WHOLE batch at dequeue — not each handler's first
// statement — closes the gap for a continuation wake at batch position >= 2,
// whose own handler only runs after earlier wakes' multi-second turns await:
// once the continue_work timer fires it unregisters its work-wake handle AND the
// dispatcher's `pendingWakes.clear()` empties the queued-wake signal for the
// whole batch at once. For that window the dispatching marker is the only live
// continuation signal, so a 5s cleanup recheck poll landing in it still defers
// instead of deleting the child session mid-chain (reintroducing #952).
// Ref-counted so overlapping dispatch can't clear it early; bounded by the
// cleanup leak-guard hard-expiry if a handler somehow fails to release. Fix #952.
const continuationWakeDispatching = new Map<string, number>();
// ---------------------------------------------------------------------------
// Delegate-pending queries — derived from TaskFlow, not a separate Map
//
// The old branch had a volatile delegatePendingFlags Map that duplicated
// information already in TaskFlow via pendingDelegateCount. Removed:
// the source of truth is the TaskFlow registry.
// ---------------------------------------------------------------------------

import { pendingDelegateCount, stagedPostCompactionDelegateCount } from "./delegate-store.js";

export function hasDelegatePending(sessionKey: string): boolean {
  return pendingDelegateCount(sessionKey) > 0 || stagedPostCompactionDelegateCount(sessionKey) > 0;
}

// ---------------------------------------------------------------------------
// Timer handle registration
// ---------------------------------------------------------------------------

/**
 * Increment the timer ref count for a session. Call when scheduling a
 * delayed continuation timer.
 */
export function retainContinuationTimerRef(sessionKey: string): void {
  continuationTimerRefs.set(sessionKey, (continuationTimerRefs.get(sessionKey) ?? 0) + 1);
}

/**
 * Decrement the timer ref count. Call when a timer fires or is cancelled.
 */
export function releaseContinuationTimerRef(sessionKey: string): void {
  const current = continuationTimerRefs.get(sessionKey) ?? 0;
  if (current <= 1) {
    continuationTimerRefs.delete(sessionKey);
  } else {
    continuationTimerRefs.set(sessionKey, current - 1);
  }
}

export function hasLiveContinuationTimerRefs(sessionKey: string): boolean {
  return (continuationTimerRefs.get(sessionKey) ?? 0) > 0;
}

/**
 * True while a same-session `continue_work` wake timer is still armed for this
 * session. Distinct from `hasLiveContinuationTimerRefs`, which also counts
 * delegate hedge / chain-hop timers. Subagent cleanup uses this to defer
 * teardown so the continuation wake can re-enter the (kept-alive) session as a
 * heartbeat turn. Fix #952.
 */
export function hasLiveContinuationWorkWakeTimerRefs(sessionKey: string): boolean {
  return (continuationWorkWakeTimerHandles.get(sessionKey)?.size ?? 0) > 0;
}

/**
 * Mark that the heartbeat dispatcher is synchronously handing off this session's
 * `continue_work` continuation turn. Called by the heartbeat batch-dispatch hook
 * for EVERY continuation wake in a coalesced batch the instant the batch is
 * dequeued (after `pendingWakes.clear()`, before any handler runs) — not per
 * handler — so a wake at batch position >= 2 is already pending while earlier
 * wakes' turns await, closing the window where the timer ref released, the
 * pending wake was cleared, and the reply run has not yet registered active.
 * Ref-counted so overlapping dispatch never clears the marker early. Pair with
 * `clearContinuationWakeDispatching` in the handler finally (or the hook's
 * per-batch release for a wake whose handler never ran). Fix #952.
 */
export function markContinuationWakeDispatching(sessionKey: string): void {
  continuationWakeDispatching.set(
    sessionKey,
    (continuationWakeDispatching.get(sessionKey) ?? 0) + 1,
  );
}

/** Release one `markContinuationWakeDispatching` ref once the handler returns. */
export function clearContinuationWakeDispatching(sessionKey: string): void {
  const current = continuationWakeDispatching.get(sessionKey) ?? 0;
  if (current <= 1) {
    continuationWakeDispatching.delete(sessionKey);
  } else {
    continuationWakeDispatching.set(sessionKey, current - 1);
  }
}

/**
 * True while a `continue_work` continuation wake is mid-dispatch for this
 * session. Read by subagent cleanup as the fourth continuation-pending signal,
 * covering the tick between the timer firing and the reply run going active.
 * Fix #952.
 */
export function hasContinuationWakeDispatching(sessionKey: string): boolean {
  return (continuationWakeDispatching.get(sessionKey) ?? 0) > 0;
}

/**
 * Register a timer handle so it can be cleared on session reset. Pass
 * `kind: "work-wake"` for `continue_work` wakes so cleanup-deferral tracking
 * can distinguish them from delegate timers.
 */
export function registerContinuationTimerHandle(
  sessionKey: string,
  handle: ContinuationTimerHandle,
  kind: ContinuationTimerKind = "delegate",
): void {
  const existing = continuationTimerHandles.get(sessionKey);
  if (existing) {
    existing.add(handle);
  } else {
    continuationTimerHandles.set(sessionKey, new Set([handle]));
  }
  if (kind === "work-wake") {
    const workWake = continuationWorkWakeTimerHandles.get(sessionKey);
    if (workWake) {
      workWake.add(handle);
    } else {
      continuationWorkWakeTimerHandles.set(sessionKey, new Set([handle]));
    }
  }
}

/**
 * Unregister a timer handle after it fires or is cancelled.
 * Also releases the timer ref and drops any work-wake tracking for the handle.
 */
export function unregisterContinuationTimerHandle(
  sessionKey: string,
  handle: ContinuationTimerHandle,
): boolean {
  const existing = continuationTimerHandles.get(sessionKey);
  if (!existing?.delete(handle)) {
    return false;
  }
  if (existing.size === 0) {
    continuationTimerHandles.delete(sessionKey);
  }
  const workWake = continuationWorkWakeTimerHandles.get(sessionKey);
  if (workWake?.delete(handle) && workWake.size === 0) {
    continuationWorkWakeTimerHandles.delete(sessionKey);
  }
  releaseContinuationTimerRef(sessionKey);
  return true;
}

/**
 * Clear all tracked continuation timers for a session. Used on explicit
 * session reset (/new, /reset) — NOT on inbound noise.
 */
export function clearTrackedContinuationTimers(sessionKey: string): void {
  continuationWorkWakeTimerHandles.delete(sessionKey);
  // Drop any in-flight dispatching marker too: an explicit reset (/new, /reset)
  // abandons the chain, so a leftover marker must not pin the new session. The
  // handler's finally is a no-op decrement against the cleared entry. Fix #952.
  continuationWakeDispatching.delete(sessionKey);
  const existing = continuationTimerHandles.get(sessionKey);
  if (!existing || existing.size === 0) {
    return;
  }
  continuationTimerHandles.delete(sessionKey);
  for (const handle of existing) {
    clearTimeout(handle);
    // Release refs asynchronously to avoid re-entrancy during cleanup.
    const releaseHandle = setTimeout(() => {
      releaseContinuationTimerRef(sessionKey);
    }, 0);
    releaseHandle.unref();
  }
}

// ---------------------------------------------------------------------------
// Chain state persistence
// ---------------------------------------------------------------------------

import type { SessionEntry } from "../../config/sessions/types.js";
import type { ChainState } from "./types.js";

/**
 * Structural subset of `SessionEntry` covering only the fields the
 * continuation-chain read path needs. Declared independently so callers
 * that want to avoid a static edge into `src/config/sessions/types.js`
 * (notably `subagent-announce.ts` — cycle-avoidance) can satisfy the
 * helper signature without an extra type import.
 */
export type ContinuationChainSource = {
  continuationChainCount?: number;
  continuationChainStartedAt?: number;
  continuationChainTokens?: number;
  continuationChainId?: string;
};

/**
 * Read continuation chain state from a SessionEntry with safe defaults.
 *
 * Collapses the scattered `?? 0` / `?? Date.now()` sentinel pattern from
 * 6+ call sites (agent-runner, followup-runner, subagent-announce) into
 * one canonical adapter. The returned ChainState has `turnTokens` folded
 * into `accumulatedChainTokens` so callers don't repeat the addition.
 *
 * - `undefined` source → zeroed chain, `chainStartedAt = Date.now()`
 * - missing `continuationChainStartedAt` → `Date.now()` (the chain appears
 *   to start fresh this turn; matches historical sentinel behavior).
 *
 * Accepts any shape compatible with `ContinuationChainSource`, including
 * `SessionEntry` (structural compatibility).
 */
export function loadContinuationChainState(
  source: ContinuationChainSource | undefined,
  turnTokens = 0,
): ChainState {
  return {
    currentChainCount: source?.continuationChainCount ?? 0,
    chainStartedAt: source?.continuationChainStartedAt ?? Date.now(),
    accumulatedChainTokens: (source?.continuationChainTokens ?? 0) + turnTokens,
    ...(source?.continuationChainId ? { chainId: source.continuationChainId } : {}),
  };
}

/**
 * Persist continuation chain metadata to the session entry.
 * Called after scheduling to keep chain depth, start time, token cost, and the
 * stable chain id in sync with the session store.
 */
export function persistContinuationChainState(params: {
  sessionEntry?: SessionEntry;
  count: number;
  startedAt: number;
  tokens: number;
  chainId?: string;
}): void {
  if (!params.sessionEntry) {
    return;
  }
  params.sessionEntry.continuationChainCount = params.count;
  params.sessionEntry.continuationChainStartedAt = params.startedAt;
  params.sessionEntry.continuationChainTokens = params.tokens;
  // Persist the chain id alongside depth/start/tokens so the stable chain
  // correlation survives across drains. `loadContinuationChainState` reads
  // `continuationChainId` back on later hops; without writing it here, callers
  // that persist an advanced `chainState` (the delegate-drain on the followup
  // and subagent-announce paths) dropped the minted id and the next drain
  // re-minted a fresh one, breaking multi-hop trace correlation. Written only
  // when provided so callers that don't carry a chain id (e.g. continue_work)
  // keep whatever id is already on the entry.
  if (params.chainId !== undefined) {
    params.sessionEntry.continuationChainId = params.chainId;
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function resetContinuationStateForTests(): void {
  continuationTimerHandles.clear();
  continuationTimerRefs.clear();
  continuationWorkWakeTimerHandles.clear();
  continuationWakeDispatching.clear();
  // delegatePendingFlags removed — derived from TaskFlow.
}
