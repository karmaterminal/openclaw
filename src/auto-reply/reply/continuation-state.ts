import type { SessionEntry } from "../../config/sessions/types.js";
import {
  delayedContinuationReservationCount,
  pendingDelegateCount,
  stagedPostCompactionDelegateCount,
} from "../continuation-delegate-store.js";
import type { ChainState } from "../continuation/types.js";

type ContinuationTimerHandle = ReturnType<typeof setTimeout>;

const continuationTimerRefs = new Map<string, number>();
const continuationTimerHandles = new Map<string, Set<ContinuationTimerHandle>>();

export function setDelegatePending(sessionKey: string): void {
  // Compatibility no-op: pending state is derived from TaskFlow and timer reservations.
  void sessionKey;
}

export function hasDelegatePending(sessionKey: string): boolean {
  return (
    pendingDelegateCount(sessionKey) > 0 ||
    stagedPostCompactionDelegateCount(sessionKey) > 0 ||
    delayedContinuationReservationCount(sessionKey) > 0
  );
}

export function clearDelegatePending(_sessionKey: string): void {
  // No-op: pending state is derived from TaskFlow.
}

export function clearDelegatePendingIfNoDelayedReservations(sessionKey: string): void {
  if (delayedContinuationReservationCount(sessionKey) === 0) {
    clearDelegatePending(sessionKey);
  }
}

// Generation guard removed per RFC §5.1 (2026-04-15): unrelated channel
// noise must not cancel dispatched continuation work. Stubs kept for callers.
export function currentContinuationGeneration(_sessionKey: string): number {
  return 0;
}

export function bumpContinuationGeneration(_sessionKey: string): number {
  return 0;
}

export function hasLiveContinuationTimerRefs(sessionKey: string): boolean {
  return (continuationTimerRefs.get(sessionKey) ?? 0) > 0;
}

export function maybeDropContinuationGeneration(_sessionKey: string): void {}

export function retainContinuationTimerRef(sessionKey: string): void {
  continuationTimerRefs.set(sessionKey, (continuationTimerRefs.get(sessionKey) ?? 0) + 1);
}

export function releaseContinuationTimerRef(sessionKey: string): void {
  const current = continuationTimerRefs.get(sessionKey) ?? 0;
  if (current <= 1) {
    continuationTimerRefs.delete(sessionKey);
  } else {
    continuationTimerRefs.set(sessionKey, current - 1);
  }
}

export function registerContinuationTimerHandle(
  sessionKey: string,
  handle: ContinuationTimerHandle,
): void {
  const existing = continuationTimerHandles.get(sessionKey);
  if (existing) {
    existing.add(handle);
    return;
  }
  continuationTimerHandles.set(sessionKey, new Set([handle]));
}

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
  releaseContinuationTimerRef(sessionKey);
  return true;
}

export function clearTrackedContinuationTimers(sessionKey: string): void {
  const existing = continuationTimerHandles.get(sessionKey);
  if (!existing || existing.size === 0) {
    return;
  }
  continuationTimerHandles.delete(sessionKey);
  for (const handle of existing) {
    clearTimeout(handle);
    const releaseHandle = setTimeout(() => {
      releaseContinuationTimerRef(sessionKey);
    }, 0);
    releaseHandle.unref();
  }
}

// ---------------------------------------------------------------------------
// Chain state persistence (consumed from continuation/state.ts)
// ---------------------------------------------------------------------------

export type ContinuationChainSource = {
  continuationChainCount?: number;
  continuationChainStartedAt?: number;
  continuationChainTokens?: number;
};

export function loadContinuationChainState(
  source: ContinuationChainSource | undefined,
  turnTokens = 0,
): ChainState {
  return {
    currentChainCount: source?.continuationChainCount ?? 0,
    chainStartedAt: source?.continuationChainStartedAt ?? Date.now(),
    accumulatedChainTokens: (source?.continuationChainTokens ?? 0) + turnTokens,
  };
}

export function persistContinuationChainState(params: {
  sessionEntry?: SessionEntry;
  count: number;
  startedAt: number;
  tokens: number;
}): void {
  if (!params.sessionEntry) {
    return;
  }
  params.sessionEntry.continuationChainCount = params.count;
  params.sessionEntry.continuationChainStartedAt = params.startedAt;
  params.sessionEntry.continuationChainTokens = params.tokens;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function resetContinuationStateForTests(): void {
  continuationTimerHandles.clear();
  continuationTimerRefs.clear();
}
