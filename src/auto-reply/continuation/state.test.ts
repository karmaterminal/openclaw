import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContinuationChainState } from "./state.js";

describe("loadContinuationChainState (openclaw#216)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zeroed chain with chainStartedAt=now for undefined source", () => {
    const state = loadContinuationChainState(undefined);
    expect(state.currentChainCount).toBe(0);
    expect(state.chainStartedAt).toBe(Date.now());
    expect(state.accumulatedChainTokens).toBe(0);
  });

  it("reads chain fields directly when all three are present", () => {
    const state = loadContinuationChainState({
      continuationChainCount: 3,
      continuationChainStartedAt: 1_700_000_000_000,
      continuationChainTokens: 42_000,
    });
    expect(state).toEqual({
      currentChainCount: 3,
      chainStartedAt: 1_700_000_000_000,
      accumulatedChainTokens: 42_000,
    });
  });

  it("folds turnTokens into accumulatedChainTokens", () => {
    const state = loadContinuationChainState(
      {
        continuationChainCount: 1,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 1_000,
      },
      2_500,
    );
    expect(state.accumulatedChainTokens).toBe(3_500);
    expect(state.currentChainCount).toBe(1);
    expect(state.chainStartedAt).toBe(1_700_000_000_000);
  });

  it("defaults chainStartedAt to now when field is missing", () => {
    const state = loadContinuationChainState({
      continuationChainCount: 2,
      continuationChainTokens: 100,
    });
    expect(state.chainStartedAt).toBe(Date.now());
    expect(state.currentChainCount).toBe(2);
    expect(state.accumulatedChainTokens).toBe(100);
  });

  it("treats missing count/tokens as zero (no undefined leak into arithmetic)", () => {
    const state = loadContinuationChainState(
      { continuationChainStartedAt: 1_700_000_000_000 },
      500,
    );
    expect(state.currentChainCount).toBe(0);
    expect(state.accumulatedChainTokens).toBe(500);
    expect(state.chainStartedAt).toBe(1_700_000_000_000);
  });

  it("defaults turnTokens to 0 when not provided", () => {
    const state = loadContinuationChainState({
      continuationChainCount: 1,
      continuationChainStartedAt: 1_700_000_000_000,
      continuationChainTokens: 777,
    });
    expect(state.accumulatedChainTokens).toBe(777);
  });
});
