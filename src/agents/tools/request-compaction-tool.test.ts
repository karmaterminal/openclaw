import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolInputError } from "./common.js";
import {
  _guards,
  _resetGuardState,
  _resetVolitionalCounts,
  _setPending,
  createRequestCompactionTool,
  getVolitionalCompactionCount,
  type RequestCompactionToolOpts,
} from "./request-compaction-tool.js";

const SESSION_KEY = "agent:main:discord:channel:test-session";
const SESSION_ID = "test-session-id-x5.1";
const TURN_REASON =
  "context pressure at 92%, working state evacuated to memory files and 2 post-compaction delegates staged.";

type ExecuteResult = Awaited<ReturnType<ReturnType<typeof createRequestCompactionTool>["execute"]>>;

type JsonPayload = {
  status: string;
  guard?: string;
  contextUsage?: number;
  threshold?: number;
  reason?: string;
  retryAfterSeconds?: number;
  note?: string;
};

function readJsonPayload(result: ExecuteResult): JsonPayload {
  // jsonResult() returns content = [{ type: "text", text: JSON.stringify(...) }]
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  expect(content[0]?.type).toBe("text");
  return JSON.parse(content[0]?.text ?? "{}") as JsonPayload;
}

function buildOpts(overrides: Partial<RequestCompactionToolOpts> = {}): RequestCompactionToolOpts {
  return {
    agentSessionKey: SESSION_KEY,
    sessionId: SESSION_ID,
    getContextUsage: () => 0.85,
    triggerCompaction: vi.fn(async () => ({ ok: true, compacted: true })),
    ...overrides,
  };
}

async function flushBackgroundCompaction(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("request_compaction tool (swim-34/X5.1)", () => {
  beforeEach(() => {
    _resetGuardState();
    _resetVolitionalCounts();
  });

  afterEach(() => {
    _resetGuardState();
    _resetVolitionalCounts();
    vi.restoreAllMocks();
  });

  // (a) ToolInputError on missing session
  it("throws ToolInputError when agentSessionKey is absent", async () => {
    const tool = createRequestCompactionTool(buildOpts({ agentSessionKey: undefined }));
    await expect(tool.execute("call-1", { reason: TURN_REASON })).rejects.toBeInstanceOf(
      ToolInputError,
    );
  });

  it("throws ToolInputError when sessionId is absent", async () => {
    const tool = createRequestCompactionTool(buildOpts({ sessionId: undefined }));
    await expect(tool.execute("call-2", { reason: TURN_REASON })).rejects.toBeInstanceOf(
      ToolInputError,
    );
  });

  // (b) context_threshold guard when usage < 70%
  it("rejects with context_threshold guard when contextUsage is below MIN_CONTEXT_THRESHOLD (70%)", async () => {
    const tool = createRequestCompactionTool(buildOpts({ getContextUsage: () => 0.5 }));
    const result = await tool.execute("call-3", { reason: TURN_REASON });
    const payload = readJsonPayload(result);
    expect(payload.status).toBe("rejected");
    expect(payload.guard).toBe("context_threshold");
    expect(payload.contextUsage).toBe(50);
    expect(payload.threshold).toBe(Math.round(_guards.MIN_CONTEXT_THRESHOLD * 100));
    expect(payload.reason).toMatch(/below the minimum threshold/i);
  });

  it("still rejects at exactly 69% (just below the floor)", async () => {
    const tool = createRequestCompactionTool(buildOpts({ getContextUsage: () => 0.69 }));
    const payload = readJsonPayload(await tool.execute("call-3b", { reason: TURN_REASON }));
    expect(payload.status).toBe("rejected");
    expect(payload.guard).toBe("context_threshold");
  });

  // (b2) context_unknown guard when getContextUsage returns null (Refs karmaterminal/openclaw#222).
  // The followup-runner path has no live token count; returning null lets the
  // tool surface that distinctly from the 70% floor instead of lying with `0`.
  it("rejects with context_unknown guard when getContextUsage returns null", async () => {
    const tool = createRequestCompactionTool(buildOpts({ getContextUsage: () => null }));
    const result = await tool.execute("call-3c", { reason: TURN_REASON });
    const payload = readJsonPayload(result);
    expect(payload.status).toBe("rejected");
    expect(payload.guard).toBe("context_unknown");
    expect(payload.guard).not.toBe("context_threshold");
    expect(payload.reason).toMatch(/not measurable/i);
    // Should NOT carry a contextUsage / threshold field — we don't know.
    expect(payload.contextUsage).toBeUndefined();
    expect(payload.threshold).toBeUndefined();
  });

  // (c) enqueue when >=70% no rate limit
  it("enqueues compaction when contextUsage >= MIN_CONTEXT_THRESHOLD and no rate limit", async () => {
    const triggerCompaction = vi.fn(async () => ({ ok: true, compacted: true }));
    const tool = createRequestCompactionTool(
      buildOpts({ getContextUsage: () => 0.92, triggerCompaction }),
    );
    const payload = readJsonPayload(await tool.execute("call-4", { reason: TURN_REASON }));
    expect(payload.status).toBe("compaction_requested");
    expect(payload.contextUsage).toBe(92);
    expect(payload.reason).toBe(TURN_REASON);
    expect(payload.note).toMatch(/Compaction has been enqueued/i);
    // The background call is fire-and-forget; drain microtasks before assertion.
    await Promise.resolve();
    await Promise.resolve();
    expect(triggerCompaction).toHaveBeenCalledTimes(1);
  });

  it("accepts at exactly the 70% threshold (inclusive floor)", async () => {
    const tool = createRequestCompactionTool(buildOpts({ getContextUsage: () => 0.7 }));
    const payload = readJsonPayload(await tool.execute("call-4b", { reason: TURN_REASON }));
    expect(payload.status).toBe("compaction_requested");
  });

  // (d) rate_limit guard within 5 minutes
  it("rejects with rate_limit guard when called again within RATE_LIMIT_MS window", async () => {
    vi.useFakeTimers();
    const startMs = 1_700_000_000_000;
    vi.setSystemTime(new Date(startMs));
    try {
      const tool = createRequestCompactionTool(buildOpts({ getContextUsage: () => 0.85 }));
      // First request: accepted.
      const first = readJsonPayload(await tool.execute("call-5a", { reason: TURN_REASON }));
      expect(first.status).toBe("compaction_requested");
      await Promise.resolve();

      // Advance less than the rate-limit window — second call should be rejected.
      vi.setSystemTime(new Date(startMs + _guards.RATE_LIMIT_MS - 1000));
      const second = readJsonPayload(await tool.execute("call-5b", { reason: TURN_REASON }));
      expect(second.status).toBe("rejected");
      expect(second.guard).toBe("rate_limit");
      expect(second.retryAfterSeconds).toBeGreaterThan(0);
      expect(second.retryAfterSeconds).toBeLessThanOrEqual(Math.ceil(_guards.RATE_LIMIT_MS / 1000));
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts a new request once the rate-limit window has elapsed", async () => {
    vi.useFakeTimers();
    const startMs = 1_700_000_000_000;
    vi.setSystemTime(new Date(startMs));
    try {
      const tool = createRequestCompactionTool(buildOpts({ getContextUsage: () => 0.85 }));
      readJsonPayload(await tool.execute("call-5c", { reason: TURN_REASON }));
      await Promise.resolve();
      await Promise.resolve();

      // The in-flight promise has resolved and `pendingCompactionSessions` cleared.
      vi.setSystemTime(new Date(startMs + _guards.RATE_LIMIT_MS + 1));
      const payload = readJsonPayload(await tool.execute("call-5d", { reason: TURN_REASON }));
      expect(payload.status).toBe("compaction_requested");
    } finally {
      vi.useRealTimers();
    }
  });

  describe("volitional counter integrity (issue #639)", () => {
    it("increments only when triggerCompaction resolves { ok: true, compacted: true }", async () => {
      const tool = createRequestCompactionTool(
        buildOpts({ triggerCompaction: vi.fn(async () => ({ ok: true, compacted: true })) }),
      );

      readJsonPayload(await tool.execute("call-5e", { reason: TURN_REASON }));
      await flushBackgroundCompaction();

      expect(getVolitionalCompactionCount(SESSION_KEY)).toBe(1);
    });

    it("does not increment when triggerCompaction resolves { ok: false, compacted: false }", async () => {
      const tool = createRequestCompactionTool(
        buildOpts({ triggerCompaction: vi.fn(async () => ({ ok: false, compacted: false })) }),
      );

      readJsonPayload(await tool.execute("call-5f", { reason: TURN_REASON }));
      await flushBackgroundCompaction();

      expect(getVolitionalCompactionCount(SESSION_KEY)).toBe(0);
    });

    it("does not increment when triggerCompaction resolves { ok: true, compacted: false }", async () => {
      const tool = createRequestCompactionTool(
        buildOpts({ triggerCompaction: vi.fn(async () => ({ ok: true, compacted: false })) }),
      );

      readJsonPayload(await tool.execute("call-5g", { reason: TURN_REASON }));
      await flushBackgroundCompaction();

      expect(getVolitionalCompactionCount(SESSION_KEY)).toBe(0);
    });

    it("does not increment when triggerCompaction throws", async () => {
      const tool = createRequestCompactionTool(
        buildOpts({
          triggerCompaction: vi.fn(async () => {
            throw new Error("boom");
          }),
        }),
      );

      readJsonPayload(await tool.execute("call-5h", { reason: TURN_REASON }));
      await flushBackgroundCompaction();

      expect(getVolitionalCompactionCount(SESSION_KEY)).toBe(0);
    });

    it("clears pendingCompactionSessions whether triggerCompaction succeeds or fails", async () => {
      vi.useFakeTimers();
      const startMs = 1_700_000_100_000;
      vi.setSystemTime(new Date(startMs));
      try {
        const successTool = createRequestCompactionTool(
          buildOpts({ triggerCompaction: vi.fn(async () => ({ ok: true, compacted: true })) }),
        );
        readJsonPayload(await successTool.execute("call-5i", { reason: TURN_REASON }));
        await flushBackgroundCompaction();

        vi.setSystemTime(new Date(startMs + _guards.RATE_LIMIT_MS + 1));
        expect(
          readJsonPayload(await successTool.execute("call-5j", { reason: TURN_REASON })).status,
        ).toBe("compaction_requested");

        _resetGuardState();
        _resetVolitionalCounts();

        const failureStartMs = startMs + (_guards.RATE_LIMIT_MS + 1) * 2;
        vi.setSystemTime(new Date(failureStartMs));
        const failureTool = createRequestCompactionTool(
          buildOpts({
            triggerCompaction: vi.fn(async () => {
              throw new Error("boom");
            }),
          }),
        );
        readJsonPayload(await failureTool.execute("call-5k", { reason: TURN_REASON }));
        await flushBackgroundCompaction();

        vi.setSystemTime(new Date(failureStartMs + _guards.RATE_LIMIT_MS + 1));
        expect(
          readJsonPayload(await failureTool.execute("call-5l", { reason: TURN_REASON })).status,
        ).toBe("compaction_requested");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // (e) [already-pending] short-circuit
  it("short-circuits with status=already_pending when a compaction is already in-flight", async () => {
    _setPending(SESSION_KEY);
    const triggerCompaction = vi.fn(async () => ({ ok: true, compacted: true }));
    const tool = createRequestCompactionTool(
      buildOpts({ getContextUsage: () => 0.95, triggerCompaction }),
    );
    const payload = readJsonPayload(await tool.execute("call-6", { reason: TURN_REASON }));
    expect(payload.status).toBe("already_pending");
    expect(payload.reason).toMatch(/already in-flight/i);
    // triggerCompaction must not be re-entered on this call.
    expect(triggerCompaction).not.toHaveBeenCalled();
  });

  // (f) wire markers: jsonResult payload stays stable for downstream consumers
  it("emits the documented status markers (compaction_requested / rejected / already_pending)", async () => {
    // Case: accepted
    const acceptTool = createRequestCompactionTool(buildOpts({ getContextUsage: () => 0.85 }));
    const accepted = readJsonPayload(await acceptTool.execute("call-7a", { reason: TURN_REASON }));
    expect(accepted.status).toBe("compaction_requested");

    // Case: below threshold
    _resetGuardState();
    const belowTool = createRequestCompactionTool(buildOpts({ getContextUsage: () => 0.5 }));
    const below = readJsonPayload(await belowTool.execute("call-7b", { reason: TURN_REASON }));
    expect(below.status).toBe("rejected");
    expect(below.guard).toBe("context_threshold");

    // Case: already pending
    _resetGuardState();
    _setPending(SESSION_KEY);
    const pendingTool = createRequestCompactionTool(buildOpts({ getContextUsage: () => 0.9 }));
    const pending = readJsonPayload(await pendingTool.execute("call-7c", { reason: TURN_REASON }));
    expect(pending.status).toBe("already_pending");
  });
});
