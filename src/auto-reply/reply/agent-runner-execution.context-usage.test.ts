/**
 * regression: computeRequestCompactionContextUsage must
 *   (a) honor the totalTokensFresh freshness contract, returning
 *       "no_fresh_usage" when the prior turn could not compute a fresh
 *       totalTokens snapshot, and
 *   (b) resolve the context-window denominator via the canonical pipeline
 *       (session-entry → cfg/provider/model) instead of the prior
 *       hardcoded `?? 200_000` fallback that misreports utilization on any
 *       non-200K model, returning "unknown_context_window" when it cannot.
 *
 * Both causes map to request_compaction's context_unmeasured rejection, so the
 * gate refuses rather than misfires on stale or unresolvable inputs, and says why.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";

const state = vi.hoisted(() => ({
  resolveContextTokensForModelMock:
    vi.fn<
      (params: {
        cfg?: unknown;
        provider?: string;
        model?: string;
        contextTokensOverride?: number;
        fallbackContextTokens?: number;
        allowAsyncLoad?: boolean;
      }) => number | undefined
    >(),
}));

// mock-isolation: Context windows come from the test; the real lookup reads config and the model context cache.
vi.mock("../../agents/context.js", () => ({
  resolveContextTokensForModel: (
    params: Parameters<typeof state.resolveContextTokensForModelMock>[0],
  ) => state.resolveContextTokensForModelMock(params),
}));

async function getComputeRequestCompactionContextUsage() {
  return (await import("./agent-runner-post-compaction-release.js"))
    .computeRequestCompactionContextUsage;
}

function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    sessionId: "session-id-default",
    updatedAt: 1,
    totalTokensFresh: true,
    totalTokensVersion: 1,
    ...overrides,
  } as SessionEntry;
}

const PROVIDER = "anthropic";
const MODEL = "claude-sonnet-4.6";
const CFG = { runtime: { id: "cfg-test" } } as never;

beforeEach(() => {
  state.resolveContextTokensForModelMock.mockReset();
});

describe("computeRequestCompactionContextUsage: freshness contract (axis a)", () => {
  it("returns no_fresh_usage when totalTokensFresh is explicitly false (known-stale)", async () => {
    const compute = await getComputeRequestCompactionContextUsage();
    state.resolveContextTokensForModelMock.mockReturnValue(200_000);

    const result = compute({
      entry: makeEntry({ totalTokens: 100_000, totalTokensFresh: false, contextTokens: 200_000 }),
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
    });

    expect(result).toBe("no_fresh_usage");
    // The freshness short-circuit happens BEFORE context-window resolution, so
    // resolveContextTokensForModel must not be called in this path.
    expect(state.resolveContextTokensForModelMock).not.toHaveBeenCalled();
  });

  it("computes the ratio when totalTokensFresh is true", async () => {
    const compute = await getComputeRequestCompactionContextUsage();

    const result = compute({
      entry: makeEntry({ totalTokens: 150_000, totalTokensFresh: true, contextTokens: 200_000 }),
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
    });

    expect(result).toBeCloseTo(0.75, 5);
  });

  it("returns no_fresh_usage when total-token freshness provenance is missing", async () => {
    const compute = await getComputeRequestCompactionContextUsage();

    const result = compute({
      entry: makeEntry({
        totalTokens: 100_000,
        totalTokensFresh: undefined,
        totalTokensVersion: undefined,
        contextTokens: 200_000,
      }),
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
    });

    expect(result).toBe("no_fresh_usage");
    expect(state.resolveContextTokensForModelMock).not.toHaveBeenCalled();
  });

  it("returns no_fresh_usage when totalTokens is missing (entry has no usage snapshot yet)", async () => {
    const compute = await getComputeRequestCompactionContextUsage();

    const result = compute({
      entry: makeEntry({ contextTokens: 200_000 }),
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
    });

    expect(result).toBe("no_fresh_usage");
  });

  it("returns no_fresh_usage when entry itself is undefined (no active session)", async () => {
    const compute = await getComputeRequestCompactionContextUsage();

    const result = compute({
      entry: undefined,
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
    });

    expect(result).toBe("no_fresh_usage");
  });
});

describe("computeRequestCompactionContextUsage: context-window resolution (axis b)", () => {
  it("prefers entry.contextTokens over the model-resolution fallback when populated", async () => {
    const compute = await getComputeRequestCompactionContextUsage();
    // If resolveContextTokensForModel were called erroneously, the test would
    // pick up its 999_999 return value instead of the session-entry's 100_000.
    state.resolveContextTokensForModelMock.mockReturnValue(999_999);

    const result = compute({
      entry: makeEntry({ totalTokens: 50_000, contextTokens: 100_000 }),
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
    });

    expect(result).toBeCloseTo(0.5, 5);
    expect(state.resolveContextTokensForModelMock).not.toHaveBeenCalled();
  });

  it("falls through to resolveContextTokensForModel when entry.contextTokens is undefined", async () => {
    const compute = await getComputeRequestCompactionContextUsage();
    state.resolveContextTokensForModelMock.mockReturnValue(128_000);

    const result = compute({
      entry: makeEntry({ totalTokens: 32_000 }),
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
    });

    expect(result).toBeCloseTo(0.25, 5);
    expect(state.resolveContextTokensForModelMock).toHaveBeenCalledTimes(1);
    const arg = state.resolveContextTokensForModelMock.mock.calls[0]?.[0];
    expect(arg).toMatchObject({
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
      allowAsyncLoad: false,
    });
  });

  it("returns unknown_context_window when resolveContextTokensForModel returns undefined (unknown model)", async () => {
    const compute = await getComputeRequestCompactionContextUsage();
    state.resolveContextTokensForModelMock.mockReturnValue(undefined);

    const result = compute({
      entry: makeEntry({ totalTokens: 50_000 }),
      cfg: CFG,
      provider: "unknown-provider",
      model: "unknown-model",
    });

    expect(result).toBe("unknown_context_window");
  });

  it("returns unknown_context_window when resolveContextTokensForModel returns 0 or negative", async () => {
    const compute = await getComputeRequestCompactionContextUsage();
    state.resolveContextTokensForModelMock.mockReturnValue(0);

    const zeroResult = compute({
      entry: makeEntry({ totalTokens: 50_000 }),
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
    });
    expect(zeroResult).toBe("unknown_context_window");

    state.resolveContextTokensForModelMock.mockReturnValue(-1);
    const negResult = compute({
      entry: makeEntry({ totalTokens: 50_000 }),
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
    });
    expect(negResult).toBe("unknown_context_window");
  });
});

describe("computeRequestCompactionContextUsage: model-size matrix (anti-hardcode-200K)", () => {
  // Same totalTokens, different real model context-windows — the OLD code's
  // `?? 200_000` hardcode would have reported 0.7 for every row (since
  // entry.contextTokens absent forced the fallback). Threading the real
  // window through resolveContextTokensForModel produces correct ratios.
  const TOTAL_TOKENS = 140_000;
  const cases: Array<{ name: string; modelWindow: number; expectedRatio: number }> = [
    {
      name: "100K context model (under-fired at 200K hardcode)",
      modelWindow: 100_000,
      expectedRatio: 1.4,
    },
    {
      name: "200K context model (matches the prior hardcode coincidentally)",
      modelWindow: 200_000,
      expectedRatio: 0.7,
    },
    { name: "256K context model", modelWindow: 256_000, expectedRatio: 140_000 / 256_000 },
    {
      name: "1M context model (over-fired at 200K hardcode)",
      modelWindow: 1_000_000,
      expectedRatio: 0.14,
    },
  ];

  it.each(cases)("$name → ratio=$expectedRatio", async ({ modelWindow, expectedRatio }) => {
    const compute = await getComputeRequestCompactionContextUsage();
    state.resolveContextTokensForModelMock.mockReturnValue(modelWindow);

    const result = compute({
      entry: makeEntry({ totalTokens: TOTAL_TOKENS }),
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
    });

    expect(result).toBeCloseTo(expectedRatio, 5);
  });
});

describe("computeRequestCompactionContextUsage: signature contract for the consumer", () => {
  // request_compaction's getContextUsage returns a number or, on a live runner,
  // the cause it could not measure usage (anchored by axes a and b above); the
  // tool names that cause in its context_unmeasured rejection.
  it("returns number when both freshness + window resolve cleanly", async () => {
    const compute = await getComputeRequestCompactionContextUsage();
    const result = compute({
      entry: makeEntry({ totalTokens: 10_000, contextTokens: 100_000 }),
      cfg: CFG,
      provider: PROVIDER,
      model: MODEL,
    });
    expect(typeof result).toBe("number");
  });
});
