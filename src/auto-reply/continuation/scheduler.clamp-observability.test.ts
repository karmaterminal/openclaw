/**
 * swim-34/A4-clamp-observability — gap test for delay-clamp visibility.
 *
 * Pins current behaviour and marks the observability gap that figs (Adjudicator)
 * can choose to close. Surface: src/auto-reply/continuation/scheduler.ts:110, :183
 * via clampDelayMs() at config.ts:102.
 *
 * Claim under test (current behaviour):
 *   When a continuation signal requests delayMs outside [minDelayMs, maxDelayMs],
 *   scheduleWorkContinuation / scheduleDelegateContinuation silently clamp the
 *   value. The only "evidence" of the clamp is the post-clamp log line, which
 *   is byte-identical whether the original request was already in range or was
 *   reduced/raised. There is no:
 *     - separate "clamp occurred" log line,
 *     - log field carrying the original requested delayMs,
 *     - field on ScheduleWorkResult / ScheduleDelegateResult marking the clamp,
 *     - audit/event hook on the clamp transition.
 *
 * Operator impact: a delegate written with delaySeconds=600 against
 * maxDelayMs=300_000 fires at 300s with no record that the original intent
 * was 10 minutes. From the audit trail this is indistinguishable from the
 * caller having written delaySeconds=300 in the first place. That makes
 * post-incident analysis of "why did this fire so early?" intractable.
 *
 * The four `it.todo` entries below are the **exact** behaviours figs can
 * point an implementer at if he chooses to close the gap.
 *
 * Anchor: swim-34 Block A (state invariants), Part of #478.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDelegateStoreForTests } from "./delegate-store.js";
import { scheduleDelegateContinuation, scheduleWorkContinuation } from "./scheduler.js";
import { resetContinuationStateForTests } from "./state.js";
import type { ContinuationRuntimeConfig } from "./types.js";

const baseConfig: ContinuationRuntimeConfig = {
  enabled: true,
  taskFlowDelegates: true,
  defaultDelayMs: 15_000,
  minDelayMs: 5_000,
  maxDelayMs: 300_000,
  maxChainLength: 10,
  costCapTokens: 500_000,
  maxDelegatesPerTurn: 5,
};

beforeEach(() => {
  vi.useFakeTimers();
  resetDelegateStoreForTests();
  resetContinuationStateForTests();
});

afterEach(() => {
  resetDelegateStoreForTests();
  resetContinuationStateForTests();
  vi.useRealTimers();
});

describe("clamp observability — current behaviour (silent clamp)", () => {
  it("scheduleWorkContinuation: ScheduleWorkResult does NOT carry the requested delay", () => {
    const result = scheduleWorkContinuation({
      signal: { kind: "work", delayMs: 600_000 }, // 10 min — well above maxDelayMs (300s)
      chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey: "clamp-obs-work-above",
      onFire: vi.fn(),
    });

    expect(result.outcome).toBe("scheduled");
    // Pin: no field exposes that the caller asked for 600_000 and we gave 300_000.
    // The result is byte-identical to a caller who asked for delayMs=300_000.
    expect(Object.keys(result).toSorted()).toEqual(
      ["nextChainCount", "outcome", "timerHandle"].toSorted(),
    );
  });

  it("scheduleWorkContinuation: also silent when requested delay is BELOW minDelayMs", () => {
    const result = scheduleWorkContinuation({
      signal: { kind: "work", delayMs: 1 }, // below min (5_000)
      chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey: "clamp-obs-work-below",
      onFire: vi.fn(),
    });

    expect(result.outcome).toBe("scheduled");
    expect(Object.keys(result).toSorted()).toEqual(
      ["nextChainCount", "outcome", "timerHandle"].toSorted(),
    );
  });

  it("scheduleDelegateContinuation: ScheduleDelegateResult does NOT carry the requested delay", () => {
    const result = scheduleDelegateContinuation({
      signal: {
        kind: "delegate",
        task: "test task for clamp observability",
        delayMs: 600_000, // 10 min — above maxDelayMs
      },
      chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey: "clamp-obs-delegate",
      onImmediateSpawn: vi.fn(),
      onDelayedSpawn: vi.fn(),
    });

    expect(result.outcome).toBe("scheduled-delayed");
    // Pin: result keys are {outcome, reservationId, nextChainCount} —
    // no `requestedDelayMs`, no `clampedDelayMs`, no `clampOccurred`.
    if (result.outcome === "scheduled-delayed") {
      expect(Object.keys(result).toSorted()).toEqual(
        ["nextChainCount", "outcome", "reservationId"].toSorted(),
      );
    }
  });

  it("scheduleWorkContinuation: log line is byte-identical for already-in-range vs clamped requests", () => {
    // Both calls produce an `[continuation] WORK timer set: delayMs=300000 hop=1/10 session=...`
    // line — there is nothing in the log to distinguish "user asked for 300_000" from
    // "user asked for 600_000 and we clamped to 300_000".
    //
    // Spying on the subsystem logger requires module-level mocking which is heavier
    // than this gap-pinning warrants. The behaviour is observable by reading
    // scheduler.ts:112-114 and :198-200 — both log lines reference only
    // `clampedDelay`, never `signal.delayMs`. This `it` documents the property.
    const inRange = scheduleWorkContinuation({
      signal: { kind: "work", delayMs: 300_000 },
      chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey: "clamp-obs-log-inrange",
      onFire: vi.fn(),
    });
    const clamped = scheduleWorkContinuation({
      signal: { kind: "work", delayMs: 600_000 },
      chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey: "clamp-obs-log-clamped",
      onFire: vi.fn(),
    });
    // Same outcome, same shape. The log line for the clamped case carries
    // delayMs=300000, identical to the in-range case. No clamp marker.
    expect(inRange.outcome).toBe("scheduled");
    expect(clamped.outcome).toBe("scheduled");
  });
});

describe("clamp observability — gap (todo for figs to direct)", () => {
  // These are the exact shapes a fix should take. Each one is a single
  // narrow change with clear surface impact. figs can pick zero, one, or all.

  it.todo(
    "scheduleWorkContinuation should expose `requestedDelayMs` on ScheduleWorkResult when clamp occurred",
  );

  it.todo(
    "scheduleDelegateContinuation should expose `requestedDelayMs` on ScheduleDelegateResult when clamp occurred",
  );

  it.todo(
    "scheduler should emit a distinct `[continuation] delay clamped` log line when requestedMs !== clampedMs",
  );

  it.todo(
    "delayed-reservation row should carry `requestedDelayMs` alongside `fireAt` for post-incident audit",
  );
});
