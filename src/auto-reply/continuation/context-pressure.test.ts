import { describe, expect, it } from "vitest";
import { resolveCompactionThreshold } from "../../../packages/agent-core/src/harness/compaction/compaction-threshold.js";
import {
  type PressureBand,
  resolveContextPressureBand,
  resolveTriggerPressureBand,
} from "./context-pressure.js";

describe("resolveContextPressureBand", () => {
  it("returns 0 below all bands", () => {
    expect(resolveContextPressureBand(0.1, 0.25)).toBe(0);
    expect(resolveContextPressureBand(0.24, 0.25)).toBe(0);
  });

  it("returns configured first-threshold and escalation bands", () => {
    expect(resolveContextPressureBand(0.25, 0.25)).toBe(25);
    expect(resolveContextPressureBand(0.8, 0.8)).toBe(80);
    expect(resolveContextPressureBand(0.9, 0.8)).toBe(90);
    expect(resolveContextPressureBand(0.95, 0.8)).toBe(95);
  });

  it("return type is the pressure band type", () => {
    const band: PressureBand = resolveContextPressureBand(0.5, 0.25);
    expect(band).toBe(25);
  });

  it("returns highest crossed band", () => {
    expect(resolveContextPressureBand(0.92, 0.8)).toBe(90);
    expect(resolveContextPressureBand(0.99, 0.8)).toBe(95);
  });

  it("resolves the configured early-warning band below threshold", () => {
    expect(resolveContextPressureBand(0.1, 0.8, 0.3125)).toBe(0);
    expect(resolveContextPressureBand(0.25, 0.8, 0.3125)).toBe(25);
    expect(resolveContextPressureBand(0.25, 0.8, 0)).toBe(0);
  });
});

describe("resolveTriggerPressureBand", () => {
  // Bands at each boundary of a trigger from upstream's resolver: first warning at trigger - 20k,
  // second at trigger - 10k, nothing from the trigger on.
  it.each([
    { branch: "the 0.75 cap", window: 200_000, reserve: 20_000, trigger: 150_000 },
    { branch: "a reserve below the cap", window: 200_000, reserve: 60_000, trigger: 140_000 },
    {
      branch: "a reserve pulling it under 60%",
      window: 200_000,
      reserve: 90_000,
      trigger: 110_000,
    },
  ])("keeps both warnings before $branch", ({ window, reserve, trigger }) => {
    expect(
      resolveCompactionThreshold({ contextWindowTokens: window, reserveTokensFloor: reserve }),
    ).toBe(trigger);
    const bands = [
      trigger - 20_001,
      trigger - 20_000,
      trigger - 10_001,
      trigger - 10_000,
      trigger - 1,
      trigger,
      trigger + 50_000,
    ].map((total) => resolveTriggerPressureBand(total, trigger));
    expect(bands).toEqual([0, 1, 1, 2, 2, 0, 0]);
  });

  it("keeps only the second warning when the trigger cannot hold the first headroom", () => {
    const bands = [1, 9_999, 10_000, 19_999, 20_000].map((total) =>
      resolveTriggerPressureBand(total, 20_000),
    );
    expect(bands).toEqual([0, 0, 2, 2, 0]);
  });

  it("has no warning when the trigger cannot hold the second headroom", () => {
    const bands = [1, 5_000, 9_999, 10_000].map((total) =>
      resolveTriggerPressureBand(total, 10_000),
    );
    expect(bands).toEqual([0, 0, 0, 0]);
  });
});
