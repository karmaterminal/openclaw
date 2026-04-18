import { describe, expect, it } from "vitest";
import { formatContinuationBannerValue } from "./status.command-report-data.ts";

describe("formatContinuationBannerValue (status /status continuation banner, RFC §6.3)", () => {
  const baseEnabled = {
    enabled: true as const,
    maxChainLength: 10,
    maxDelegatesPerTurn: 5,
    pendingDelegatesTotal: 0,
    postCompactionStagedTotal: 0,
  };

  it("returns undefined when continuation is disabled — overview row is omitted", () => {
    expect(
      formatContinuationBannerValue({
        ...baseEnabled,
        enabled: false,
      }),
    ).toBeUndefined();
  });

  it("config-only fallback when enabled and all runtime counters are zero (quiet session)", () => {
    expect(formatContinuationBannerValue(baseEnabled)).toBe(
      "enabled · chain max 10 · fan-out max 5",
    );
  });

  it("surfaces pending delegates when non-zero — plural", () => {
    expect(
      formatContinuationBannerValue({
        ...baseEnabled,
        pendingDelegatesTotal: 2,
      }),
    ).toBe("enabled · chain max 10 · 2 delegates pending · fan-out max 5");
  });

  it("surfaces single pending delegate with singular noun", () => {
    expect(
      formatContinuationBannerValue({
        ...baseEnabled,
        pendingDelegatesTotal: 1,
      }),
    ).toBe("enabled · chain max 10 · 1 delegate pending · fan-out max 5");
  });

  it("surfaces post-compaction staged count when non-zero", () => {
    expect(
      formatContinuationBannerValue({
        ...baseEnabled,
        postCompactionStagedTotal: 1,
      }),
    ).toBe("enabled · chain max 10 · 1 post-compaction · fan-out max 5");
  });

  it("surfaces both pending and post-compaction staged when both non-zero (active session shape)", () => {
    expect(
      formatContinuationBannerValue({
        ...baseEnabled,
        pendingDelegatesTotal: 2,
        postCompactionStagedTotal: 1,
      }),
    ).toBe("enabled · chain max 10 · 2 delegates pending · 1 post-compaction · fan-out max 5");
  });
});
