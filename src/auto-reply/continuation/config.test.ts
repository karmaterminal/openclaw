import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn(() => ({})),
}));

import { clampDelayMs, resolveContinuationRuntimeConfig } from "./config.js";
import type { ContinuationRuntimeConfig } from "./types.js";

describe("resolveContinuationRuntimeConfig", () => {
  it("returns defaults when continuation is not configured", () => {
    const config = resolveContinuationRuntimeConfig({} as never);
    expect(config).toMatchObject({
      enabled: false,
      taskFlowDelegates: true, // ships enabled per RFC §5.1
      defaultDelayMs: 15_000,
      minDelayMs: 5_000,
      maxDelayMs: 300_000,
      maxChainLength: 10,
      costCapTokens: 500_000,
      maxDelegatesPerTurn: 5,
    });
    expect(config.contextPressureThreshold).toBeUndefined();
  });

  it("resolves configured values with clamping", () => {
    const config = resolveContinuationRuntimeConfig({
      agents: {
        defaults: {
          continuation: {
            enabled: true,
            taskFlowDelegates: true,
            maxChainLength: 100,
            costCapTokens: 0,
            maxDelegatesPerTurn: 20,
            contextPressureThreshold: 0.8,
            defaultDelayMs: 30_000,
            minDelayMs: 1_000,
            maxDelayMs: 600_000,
          },
        },
      },
    } as never);
    expect(config).toMatchObject({
      enabled: true,
      taskFlowDelegates: true,
      maxChainLength: 100,
      costCapTokens: 0,
      maxDelegatesPerTurn: 20,
      contextPressureThreshold: 0.8,
      defaultDelayMs: 30_000,
      minDelayMs: 1_000,
      maxDelayMs: 600_000,
    });
  });

  it("clamps negative values to defaults", () => {
    const config = resolveContinuationRuntimeConfig({
      agents: {
        defaults: {
          continuation: {
            maxChainLength: -5,
            costCapTokens: -1,
            maxDelegatesPerTurn: 0,
          },
        },
      },
    } as never);
    expect(config.maxChainLength).toBe(10);
    expect(config.costCapTokens).toBe(500_000);
    expect(config.maxDelegatesPerTurn).toBe(5);
  });

  it("rejects invalid contextPressureThreshold", () => {
    expect(
      resolveContinuationRuntimeConfig({
        agents: { defaults: { continuation: { contextPressureThreshold: 0 } } },
      } as never).contextPressureThreshold,
    ).toBeUndefined();
    expect(
      resolveContinuationRuntimeConfig({
        agents: { defaults: { continuation: { contextPressureThreshold: 1.5 } } },
      } as never).contextPressureThreshold,
    ).toBeUndefined();
  });

  it("has no generationGuardTolerance field", () => {
    const config = resolveContinuationRuntimeConfig({} as never);
    expect("generationGuardTolerance" in config).toBe(false);
  });
});

describe("clampDelayMs", () => {
  const config: ContinuationRuntimeConfig = {
    enabled: true,
    taskFlowDelegates: false,
    defaultDelayMs: 15_000,
    minDelayMs: 5_000,
    maxDelayMs: 300_000,
    maxChainLength: 10,
    costCapTokens: 500_000,
    maxDelegatesPerTurn: 5,
  };

  it("uses default when undefined", () => {
    expect(clampDelayMs(undefined, config)).toBe(15_000);
  });

  it("clamps below minimum", () => {
    expect(clampDelayMs(1_000, config)).toBe(5_000);
  });

  it("clamps above maximum", () => {
    expect(clampDelayMs(600_000, config)).toBe(300_000);
  });

  it("passes through values in range", () => {
    expect(clampDelayMs(60_000, config)).toBe(60_000);
  });
});
