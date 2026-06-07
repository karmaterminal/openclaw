// Subagent registry cleanup tests cover deferred cleanup decisions while
// completion delivery, descendants, and retry windows are still unresolved.
import { describe, expect, it } from "vitest";
import {
  buildContinuationCleanupDeferralResolver,
  type ContinuationPendingState,
  isContinuationPending,
  resolveContinuationCleanupDeferral,
  resolveDeferredCleanupDecision,
} from "./subagent-registry-cleanup.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

function makeEntry(overrides: Partial<SubagentRunRecord> = {}): SubagentRunRecord {
  return {
    runId: "run-1",
    childSessionKey: "agent:main:subagent:child",
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "test",
    cleanup: "keep",
    createdAt: 0,
    endedAt: 1_000,
    ...overrides,
  };
}

describe("resolveDeferredCleanupDecision", () => {
  const now = 2_000;

  function resolveDecision(
    overrides: Pick<
      Parameters<typeof resolveDeferredCleanupDecision>[0],
      "activeDescendantRuns" | "entry"
    > &
      Partial<
        Pick<Parameters<typeof resolveDeferredCleanupDecision>[0], "resolveAnnounceRetryDelayMs">
      >,
  ) {
    // Fixed timing keeps expiry and backoff decisions independent from wall
    // clock drift while still exercising production thresholds.
    return resolveDeferredCleanupDecision({
      now,
      announceExpiryMs: 5 * 60_000,
      announceCompletionHardExpiryMs: 30 * 60_000,
      maxAnnounceRetryCount: 3,
      deferDescendantDelayMs: 1_000,
      resolveAnnounceRetryDelayMs: () => 2_000,
      ...overrides,
    });
  }

  it("defers completion-message cleanup while descendants are still pending", () => {
    const decision = resolveDecision({
      entry: makeEntry({ expectsCompletionMessage: true }),
      activeDescendantRuns: 2,
    });

    expect(decision).toEqual({ kind: "defer-descendants", delayMs: 1_000 });
  });

  it("hard-expires completion-message cleanup when descendants never settle", () => {
    const decision = resolveDecision({
      entry: makeEntry({ expectsCompletionMessage: true, endedAt: now - (30 * 60_000 + 1) }),
      activeDescendantRuns: 1,
    });

    expect(decision).toEqual({ kind: "give-up", reason: "expiry" });
  });

  it("keeps regular expiry behavior for non-completion flows", () => {
    const decision = resolveDecision({
      entry: makeEntry({ expectsCompletionMessage: false, endedAt: now - (5 * 60_000 + 1) }),
      activeDescendantRuns: 0,
    });

    expect(decision).toEqual({ kind: "give-up", reason: "expiry", retryCount: 1 });
  });

  it("uses retry backoff for completion-message flows once descendants are settled", () => {
    const decision = resolveDecision({
      entry: makeEntry({
        expectsCompletionMessage: true,
        delivery: { status: "pending", attemptCount: 1 },
      }),
      activeDescendantRuns: 0,
      resolveAnnounceRetryDelayMs: (retryCount) => retryCount * 1_000,
    });

    expect(decision).toEqual({ kind: "retry", retryCount: 2, resumeDelayMs: 2_000 });
  });

  it("uses retry backoff for non-completion flows so cleanup can settle after announce failures", () => {
    const decision = resolveDecision({
      entry: makeEntry({
        expectsCompletionMessage: false,
        delivery: { status: "not_required", attemptCount: 1 },
      }),
      activeDescendantRuns: 0,
      resolveAnnounceRetryDelayMs: (retryCount) => retryCount * 1_000,
    });

    expect(decision).toEqual({ kind: "retry", retryCount: 2, resumeDelayMs: 2_000 });
  });
});

describe("resolveContinuationCleanupDeferral", () => {
  const now = 1_000_000;
  const retentionHardExpiryMs = 360_000; // maxDelayMs (300s) + 60s buffer
  const recheckDelayMs = 5_000;

  function resolve(
    pending: ContinuationPendingState,
    entryOverrides: Partial<SubagentRunRecord> = {},
  ) {
    return resolveContinuationCleanupDeferral({
      entry: makeEntry({ expectsCompletionMessage: true, endedAt: now, ...entryOverrides }),
      now,
      pending,
      retentionHardExpiryMs,
      recheckDelayMs,
    });
  }

  const noneState: ContinuationPendingState = {
    workWakeTimerArmed: false,
    heartbeatWakePending: false,
    replyRunActive: false,
    continuationWakeDispatching: false,
  };

  it("proceeds (no defer) when nothing is pending", () => {
    expect(isContinuationPending(noneState)).toBe(false);
    expect(resolve(noneState)).toBeUndefined();
  });

  it("defers while a continue_work wake timer is still armed", () => {
    const decision = resolve({ ...noneState, workWakeTimerArmed: true });
    expect(decision).toEqual({ kind: "defer-continuation", delayMs: recheckDelayMs });
  });

  it("still defers after the timer fired but before the wake heartbeat runs (the race)", () => {
    // The work-wake timer ref releases the instant requestHeartbeatNow fires, so
    // (a) is false here; the queued wake (b) must keep the session alive until
    // hop 2 actually starts.
    const decision = resolve({ ...noneState, heartbeatWakePending: true });
    expect(decision).toEqual({ kind: "defer-continuation", delayMs: recheckDelayMs });
  });

  it("still defers while a continuation hop reply run is active", () => {
    const decision = resolve({ ...noneState, replyRunActive: true });
    expect(decision).toEqual({ kind: "defer-continuation", delayMs: recheckDelayMs });
  });

  it("still defers when the wake dispatching marker is the ONLY live signal (the tick gap)", () => {
    // The real dispatcher window: the continue_work timer already fired (a false),
    // `pendingWakes.clear()` ran (b false), and the reply run has not registered
    // yet (c false). Only the synchronously-set dispatching marker (d) keeps the
    // child alive — without it, a recheck poll here would tear the subagent down
    // mid-chain (the residual #952 race).
    expect(isContinuationPending({ ...noneState, continuationWakeDispatching: true })).toBe(true);
    const decision = resolve({ ...noneState, continuationWakeDispatching: true });
    expect(decision).toEqual({ kind: "defer-continuation", delayMs: recheckDelayMs });
  });

  it("gives up the defer once the leak-guard expiry is exceeded with no active hop", () => {
    // A stuck/leaked timer ref with no progress past the retention window must
    // not pin the session forever.
    const decision = resolve(
      { ...noneState, workWakeTimerArmed: true },
      { endedAt: now - (retentionHardExpiryMs + 1) },
    );
    expect(decision).toBeUndefined();
  });

  it("bounds a leaked dispatching marker by the hard-expiry leak guard", () => {
    // The dispatching marker is NOT exempt from the leak guard (only an active
    // reply run is): a handler that somehow failed to release its marker must
    // still be reclaimed past the retention window rather than pinning forever.
    const decision = resolve(
      { ...noneState, continuationWakeDispatching: true },
      { endedAt: now - (retentionHardExpiryMs + 1) },
    );
    expect(decision).toBeUndefined();
  });

  it("never trips the leak guard while a hop reply run is still active", () => {
    // A single hop legitimately running longer than the retention window must
    // keep deferring; only idle retention counts toward the leak guard.
    const decision = resolve(
      { ...noneState, replyRunActive: true },
      { endedAt: now - (retentionHardExpiryMs + 60_000) },
    );
    expect(decision).toEqual({ kind: "defer-continuation", delayMs: recheckDelayMs });
  });

  it("resets the leak-guard window on observed continuation progress", () => {
    // refreshFrozenResultFromSession advances completion.capturedAt each hop;
    // recent progress keeps the defer alive even though endedAt is old.
    const decision = resolve(
      { ...noneState, workWakeTimerArmed: true },
      {
        endedAt: now - (retentionHardExpiryMs + 60_000),
        completion: { required: true, capturedAt: now - 1_000 },
      },
    );
    expect(decision).toEqual({ kind: "defer-continuation", delayMs: recheckDelayMs });
  });
});

describe("buildContinuationCleanupDeferralResolver", () => {
  const now = 50_000;

  it("composes per-session signals into a deferral decision", () => {
    const armed = new Set(["agent:main:subagent:child"]);
    const resolver = buildContinuationCleanupDeferralResolver({
      hasLiveWorkWakeTimer: (sessionKey) => armed.has(sessionKey),
      hasPendingHeartbeatWake: () => false,
      isReplyRunActive: () => false,
      hasContinuationWakeDispatching: () => false,
      resolveRetentionHardExpiryMs: () => 360_000,
      recheckDelayMs: 5_000,
    });

    const entry = makeEntry({ endedAt: now });
    expect(resolver(entry, now)).toEqual({ kind: "defer-continuation", delayMs: 5_000 });

    armed.clear();
    expect(resolver(entry, now)).toBeUndefined();
  });

  it("defers when only the dispatching marker query is true", () => {
    const dispatching = new Set(["agent:main:subagent:child"]);
    const resolver = buildContinuationCleanupDeferralResolver({
      hasLiveWorkWakeTimer: () => false,
      hasPendingHeartbeatWake: () => false,
      isReplyRunActive: () => false,
      hasContinuationWakeDispatching: (sessionKey) => dispatching.has(sessionKey),
      resolveRetentionHardExpiryMs: () => 360_000,
      recheckDelayMs: 5_000,
    });

    const entry = makeEntry({ endedAt: now });
    expect(resolver(entry, now)).toEqual({ kind: "defer-continuation", delayMs: 5_000 });

    dispatching.clear();
    expect(resolver(entry, now)).toBeUndefined();
  });
});
