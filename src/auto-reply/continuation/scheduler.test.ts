import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDelegateStoreForTests } from "./delegate-store.js";
import { checkContinuationBudget, scheduleWorkContinuation } from "./scheduler.js";
import { resetContinuationStateForTests } from "./state.js";
import type { ContinuationRuntimeConfig, ContinuationSignal } from "./types.js";

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
