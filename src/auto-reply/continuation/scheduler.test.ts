import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDelayedContinuationReservation,
  resetDelegateStoreForTests,
} from "./delegate-store.js";
import { checkContinuationBudget, scheduleWorkContinuation } from "./scheduler.js";
import { resetContinuationStateForTests } from "./state.js";
import type {
  ContinuationRuntimeConfig,
  ContinuationSignal,
  DelayedContinuationReservation,
} from "./types.js";

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

describe("checkContinuationBudget", () => {
  it("returns null when under budget", () => {
    expect(
      checkContinuationBudget({
        chainState: { currentChainCount: 3, chainStartedAt: 0, accumulatedChainTokens: 100_000 },
        config: baseConfig,
        sessionKey: "test",
      }),
    ).toBeNull();
  });

  it("returns chain-capped at max depth", () => {
    expect(
      checkContinuationBudget({
        chainState: { currentChainCount: 10, chainStartedAt: 0, accumulatedChainTokens: 0 },
        config: baseConfig,
        sessionKey: "test",
      }),
    ).toBe("chain-capped");
  });

  it("returns cost-capped over budget", () => {
    expect(
      checkContinuationBudget({
        chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 600_000 },
        config: baseConfig,
        sessionKey: "test",
      }),
    ).toBe("cost-capped");
  });

  it("does not cost-cap when costCapTokens is 0 (unlimited)", () => {
    expect(
      checkContinuationBudget({
        chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 999_999 },
        config: { ...baseConfig, costCapTokens: 0 },
        sessionKey: "test",
      }),
    ).toBeNull();
  });
});

describe("scheduleWorkContinuation", () => {
  it("arms and fires a timer", async () => {
    const onFire = vi.fn();
    const signal: ContinuationSignal & { kind: "work" } = { kind: "work", delayMs: 5_000 };

    const result = scheduleWorkContinuation({
      signal,
      chainState: { currentChainCount: 0, chainStartedAt: 1000, accumulatedChainTokens: 50_000 },
      config: baseConfig,
      sessionKey: "test-work",
      onFire,
    });

    expect(result.outcome).toBe("scheduled");
    expect(onFire).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenCalledWith(1, 1000, 50_000, undefined);
  });

  it("returns chain-capped when at max depth", () => {
    const result = scheduleWorkContinuation({
      signal: { kind: "work" },
      chainState: { currentChainCount: 10, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey: "test-capped",
      onFire: vi.fn(),
    });

    expect(result.outcome).toBe("chain-capped");
  });

  it("clamps delay to min/max", async () => {
    const onFire = vi.fn();
    // Request 1ms delay — should be clamped to minDelayMs (5000)
    const result = scheduleWorkContinuation({
      signal: { kind: "work", delayMs: 1 },
      chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey: "test-clamp",
      onFire,
    });

    expect(result.outcome).toBe("scheduled");

    // Should NOT fire after 1ms
    await vi.advanceTimersByTimeAsync(1);
    expect(onFire).not.toHaveBeenCalled();

    // Should fire after 5000ms (clamped minimum)
    await vi.advanceTimersByTimeAsync(5_000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("does NOT cancel on channel noise (no generation guard)", async () => {
    const onFire = vi.fn();
    scheduleWorkContinuation({
      signal: { kind: "work", delayMs: 10_000 },
      chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey: "test-noise",
      onFire,
    });

    // Simulate "channel noise" — in the old branch, this would bump generation
    // and cancel the timer. In the new implementation, there IS no generation
    // guard. The timer fires regardless.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// A4b: max(chain, reservation) hop calculation — swim-34 honest-gap-list row
//
// scheduler.ts computes the next hop as:
//   Math.max(chainState.currentChainCount, highestDelayedContinuationReservationHop(sessionKey)) + 1
//
// The behavioural rule under test: if a delayed-continuation reservation is
// parked at a hop higher than the current in-flight chain count, the next
// scheduled WORK continuation MUST hop above that parked reservation —
// otherwise when the reservation later fires, it would land on a hop number
// already consumed by an intervening WORK fire, causing hop-collision in the
// chain ledger.
// ---------------------------------------------------------------------------

function makeReservation(
  plannedHop: number,
  overrides: Partial<DelayedContinuationReservation> = {},
): DelayedContinuationReservation {
  return {
    id: `res-${plannedHop}-${Math.random().toString(36).slice(2, 8)}`,
    source: "tool",
    task: `parked at hop ${plannedHop}`,
    createdAt: 0,
    fireAt: 0,
    plannedHop,
    ...overrides,
  };
}

describe("scheduleWorkContinuation — A4b: max(chain, reservation) hop", () => {
  it("hops above a parked reservation when reservation > currentChainCount", async () => {
    const sessionKey = "a4b-reservation-higher";
    // Parked reservation at hop=5, but in-flight chain only at currentChainCount=2.
    // Next WORK fire must hop to max(2, 5) + 1 = 6, NOT 2 + 1 = 3.
    addDelayedContinuationReservation(sessionKey, makeReservation(5));

    const onFire = vi.fn();
    const result = scheduleWorkContinuation({
      signal: { kind: "work", delayMs: 5_000 },
      chainState: { currentChainCount: 2, chainStartedAt: 1000, accumulatedChainTokens: 50_000 },
      config: baseConfig,
      sessionKey,
      onFire,
    });

    expect(result.outcome).toBe("scheduled");
    if (result.outcome === "scheduled") {
      expect(result.nextChainCount).toBe(6);
    }

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenCalledWith(6, 1000, 50_000, undefined);
  });

  it("falls back to currentChainCount + 1 when reservation < currentChainCount", async () => {
    const sessionKey = "a4b-chain-higher";
    // Stale reservation parked at hop=2, but chain has advanced to 7.
    // Next WORK fire must hop to max(7, 2) + 1 = 8.
    addDelayedContinuationReservation(sessionKey, makeReservation(2));

    const onFire = vi.fn();
    const result = scheduleWorkContinuation({
      signal: { kind: "work", delayMs: 5_000 },
      chainState: { currentChainCount: 7, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey,
      onFire,
    });

    expect(result.outcome).toBe("scheduled");
    if (result.outcome === "scheduled") {
      expect(result.nextChainCount).toBe(8);
    }

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onFire).toHaveBeenCalledWith(8, 0, 0, undefined);
  });

  it("with multiple reservations, hops above the HIGHEST plannedHop", async () => {
    const sessionKey = "a4b-multi-reservation";
    // Three parked reservations: hops 3, 7, 5. Highest is 7.
    // currentChainCount=4. Next hop must be max(4, 7) + 1 = 8.
    addDelayedContinuationReservation(sessionKey, makeReservation(3));
    addDelayedContinuationReservation(sessionKey, makeReservation(7));
    addDelayedContinuationReservation(sessionKey, makeReservation(5));

    const onFire = vi.fn();
    const result = scheduleWorkContinuation({
      signal: { kind: "work", delayMs: 5_000 },
      chainState: { currentChainCount: 4, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey,
      onFire,
    });

    expect(result.outcome).toBe("scheduled");
    if (result.outcome === "scheduled") {
      expect(result.nextChainCount).toBe(8);
    }

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onFire).toHaveBeenCalledWith(8, 0, 0, undefined);
  });

  it("with chain==reservation==N, hops to N+1 (tie-break: same value)", async () => {
    const sessionKey = "a4b-tie";
    // Parked reservation at hop=4, chain also at 4. max(4, 4) + 1 = 5.
    addDelayedContinuationReservation(sessionKey, makeReservation(4));

    const onFire = vi.fn();
    const result = scheduleWorkContinuation({
      signal: { kind: "work", delayMs: 5_000 },
      chainState: { currentChainCount: 4, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey,
      onFire,
    });

    expect(result.outcome).toBe("scheduled");
    if (result.outcome === "scheduled") {
      expect(result.nextChainCount).toBe(5);
    }

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onFire).toHaveBeenCalledWith(5, 0, 0, undefined);
  });

  it("reservations on a DIFFERENT sessionKey do not affect this session's hop", async () => {
    // Reservation parked at hop=99 on session A.
    // Session B's WORK fire must NOT see it: max(0, 0) + 1 = 1.
    addDelayedContinuationReservation("a4b-session-A", makeReservation(99));

    const onFire = vi.fn();
    const result = scheduleWorkContinuation({
      signal: { kind: "work", delayMs: 5_000 },
      chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 0 },
      config: baseConfig,
      sessionKey: "a4b-session-B",
      onFire,
    });

    expect(result.outcome).toBe("scheduled");
    if (result.outcome === "scheduled") {
      expect(result.nextChainCount).toBe(1);
    }

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onFire).toHaveBeenCalledWith(1, 0, 0, undefined);
  });
});
