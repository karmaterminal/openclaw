import { afterEach, describe, expect, it } from "vitest";
import {
  checkContextPressure,
  clearContextPressureState,
  type PressureBand,
  resetContextPressureForTests,
  resolveContextPressureBand,
} from "./context-pressure.js";

afterEach(() => {
  resetContextPressureForTests();
});

describe("resolveContextPressureBand", () => {
  it("returns 0 below all bands", () => {
    expect(resolveContextPressureBand(0.1)).toBe(0);
    expect(resolveContextPressureBand(0.24)).toBe(0);
  });

  it("returns correct band at thresholds", () => {
    expect(resolveContextPressureBand(0.25)).toBe(25);
    expect(resolveContextPressureBand(0.8)).toBe(80);
    expect(resolveContextPressureBand(0.9)).toBe(90);
    expect(resolveContextPressureBand(0.95)).toBe(95);
  });

  it("return type is the closed PressureBand union (#228)", () => {
    // Compile-time assertion: assigning to PressureBand forces the closed union.
    const band: PressureBand = resolveContextPressureBand(0.5);
    expect(band).toBe(25);
  });

  it("returns highest crossed band", () => {
    expect(resolveContextPressureBand(0.92)).toBe(90);
    expect(resolveContextPressureBand(0.99)).toBe(95);
  });
});

describe("checkContextPressure", () => {
  const base = {
    sessionKey: "test-session",
    contextWindow: 200_000,
    threshold: 0.8,
  };

  it("returns null below threshold", () => {
    expect(checkContextPressure({ ...base, totalTokens: 100_000 })).toBeNull();
  });

  it("fires at threshold", () => {
    const result = checkContextPressure({ ...base, totalTokens: 160_000 });
    expect(result).toContain("[system:context-pressure]");
    expect(result).toContain("80%");
  });

  it("deduplicates same band", () => {
    expect(checkContextPressure({ ...base, totalTokens: 162_000 })).not.toBeNull();
    expect(checkContextPressure({ ...base, totalTokens: 164_000 })).toBeNull(); // same band
  });

  it("fires on band escalation", () => {
    expect(checkContextPressure({ ...base, totalTokens: 162_000 })).not.toBeNull(); // 80
    expect(checkContextPressure({ ...base, totalTokens: 182_000 })).not.toBeNull(); // 90
  });

  it("fires again after compaction resets to lower band", () => {
    expect(checkContextPressure({ ...base, totalTokens: 190_000 })).not.toBeNull(); // 95
    clearContextPressureState("test-session");
    // After compaction, lower ratio fires fresh:
    expect(checkContextPressure({ ...base, totalTokens: 60_000, threshold: 0.25 })).not.toBeNull();
  });

  it("post-compaction fires unconditionally regardless of level", () => {
    const result = checkContextPressure({
      ...base,
      totalTokens: 20_000, // only 10% — well below threshold
      postCompaction: true,
    });
    expect(result).not.toBeNull();
    expect(result).toContain("Post-compaction");
    expect(result).toContain("compacted");
  });

  it("returns null for zero context window", () => {
    expect(checkContextPressure({ ...base, contextWindow: 0, totalTokens: 100 })).toBeNull();
  });

  // karmaterminal/openclaw#580 regression: when configured threshold is below the lowest hard-coded
  // band (currently 25%), the resolved band is 0. Without the -1 sentinel,
  // first-time-seen sessions had previous=0 (the `?? 0` default), so the very
  // first crossing collided band===previous===0 and was dedup-suppressed,
  // producing zero `:fire` events fleet-wide despite `:reach` firing every
  // turn. The sentinel ensures the first crossing of any band fires once.
  it("karmaterminal/openclaw#580: fires once at sub-25% threshold (band=0) for first-time-seen session", () => {
    const lowParams = {
      sessionKey: "low-threshold-session",
      contextWindow: 200_000,
      threshold: 0.05, // 5% — well below the lowest hard-coded band (25%)
      totalTokens: 20_000, // 10% — above threshold, below all bands → resolves to band 0
    };

    const first = checkContextPressure(lowParams);
    expect(first).not.toBeNull();
    expect(first).toContain("[system:context-pressure]");
    expect(first).toContain("10%");

    // Second call at same band-0 level: dedup should suppress.
    const second = checkContextPressure(lowParams);
    expect(second).toBeNull();

    // Escalating into a real band still fires.
    const escalated = checkContextPressure({
      ...lowParams,
      totalTokens: 60_000, // 30% → band 25
    });
    expect(escalated).not.toBeNull();
  });
});
