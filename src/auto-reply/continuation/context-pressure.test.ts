import { afterEach, describe, expect, it } from "vitest";
import {
  checkContextPressure,
  clearContextPressureState,
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
});
