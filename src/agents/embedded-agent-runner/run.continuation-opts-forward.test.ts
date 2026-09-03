import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import { createRequestCompactionTool } from "../tools/request-compaction-tool.js";
import { makeAttemptResult } from "./run.overflow-compaction.fixture.js";
import {
  loadRunOverflowCompactionHarness,
  mockedClassifyFailoverReason,
  mockedGlobalHookRunner,
  mockedRunEmbeddedAttempt,
  createOverflowRunParams,
  resetRunOverflowCompactionHarnessMocks,
  useOpenAIPlatformAuthFixture,
} from "./run.overflow-compaction.harness.js";

const resetContinueDelegateTurnBudgetMock = vi.hoisted(() => vi.fn());

vi.mock("../../auto-reply/continuation/delegate-turn-admission.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../auto-reply/continuation/delegate-turn-admission.js")
  >()),
  resetContinueDelegateTurnBudget: (sessionKey: string) =>
    resetContinueDelegateTurnBudgetMock(sessionKey),
}));

// Regression coverage: runEmbeddedAgent must forward continueWorkOpts
// and requestCompactionOpts into the attempt-layer params so that
// createOpenClawCodingTools (which calls createOpenClawTools) gets the
// callbacks. Without forwarding, the createOpenClawTools warn guard fires and
// only continue_delegate registers in the main-session LLM
// tool-schema — continue_work + request_compaction are absent from the
// LLM-callable function-tool-list even though they are configured.
//
// The caller constructs the opts based on agents.defaults.continuation.enabled;
// this regression test pins runEmbeddedAgent forwarding so the configured opts
// survive the trip to the attempt layer.

let runEmbeddedAgent: typeof import("./run.js").runEmbeddedAgent;
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
let overflowBaseRunParams: ReturnType<typeof createOverflowRunParams>;

describe("runEmbeddedAgent continuation opts forwarding", () => {
  beforeAll(async () => {
    ({ runEmbeddedAgent } = await loadRunOverflowCompactionHarness());
  });

  beforeEach(() => {
    overflowBaseRunParams = createOverflowRunParams({
      workspaceDir: tempDirs.make("openclaw-continuation-opts-forward-"),
    });
    resetRunOverflowCompactionHarnessMocks();
    useOpenAIPlatformAuthFixture();
    resetContinueDelegateTurnBudgetMock.mockReset();
    mockedGlobalHookRunner.hasHooks.mockImplementation(() => false);
    mockedClassifyFailoverReason.mockReturnValue(null);
  });

  it("resets continue_delegate admission at the common embedded-run boundary", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    await runEmbeddedAgent({
      ...overflowBaseRunParams,
      provider: "openai",
      model: "gpt-5.4",
      runId: "run-1159-budget-reset",
      config: {
        agents: { defaults: { continuation: { enabled: true } } },
      },
    });

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(1);
    expect(resetContinueDelegateTurnBudgetMock).toHaveBeenCalledOnce();
    expect(resetContinueDelegateTurnBudgetMock).toHaveBeenCalledWith("agent:main:test-key");
  });

  it("resets continue_delegate admission even when continuation config only sets caps", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    await runEmbeddedAgent({
      ...overflowBaseRunParams,
      provider: "openai",
      model: "gpt-5.4",
      runId: "run-1159-budget-reset-partial-config",
      config: {
        agents: { defaults: { continuation: { maxDelegatesPerTurn: 1 } } },
      },
    });

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(1);
    expect(resetContinueDelegateTurnBudgetMock).toHaveBeenCalledOnce();
    expect(resetContinueDelegateTurnBudgetMock).toHaveBeenCalledWith("agent:main:test-key");
  });

  it("does not reset continue_delegate admission before entering the session lane", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));
    let enqueueCalls = 0;

    await runEmbeddedAgent({
      ...overflowBaseRunParams,
      provider: "openai",
      model: "gpt-5.4",
      runId: "run-1159-budget-reset-lane",
      config: {
        agents: { defaults: { continuation: { enabled: true } } },
      },
      enqueue: async (task) => {
        enqueueCalls += 1;
        if (enqueueCalls === 1) {
          expect(resetContinueDelegateTurnBudgetMock).not.toHaveBeenCalled();
        }
        return await task();
      },
    });

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(1);
    expect(enqueueCalls).toBeGreaterThanOrEqual(1);
    expect(resetContinueDelegateTurnBudgetMock).toHaveBeenCalledWith("agent:main:test-key");
  });

  it("forwards continueWorkOpts to runEmbeddedAttempt", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    const continueWorkOpts = {
      requestContinuation: () => undefined,
    };

    await runEmbeddedAgent({
      ...overflowBaseRunParams,
      provider: "openai",
      model: "gpt-5.4",
      runId: "run-868-continue-work-forward",
      continueWorkOpts,
    });

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(1);
    const attemptParams = mockedRunEmbeddedAttempt.mock.calls[0]?.[0] as {
      continueWorkOpts?: typeof continueWorkOpts;
    };
    expect(attemptParams.continueWorkOpts).toBe(continueWorkOpts);
  });

  it("forwards requestCompactionOpts with live context rebinding", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    const requestCompactionOpts = {
      sessionId: "session-868-compaction",
      contextUsageOrigin: "live_runner" as const,
      getContextUsage: () => 0.005,
      triggerCompaction: vi.fn(async () => ({ ok: true, compacted: true })),
    };

    await runEmbeddedAgent({
      ...overflowBaseRunParams,
      provider: "openai",
      model: "gpt-5.4",
      runId: "run-868-request-compaction-forward",
      requestCompactionOpts,
    });

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(1);
    const attemptParams = mockedRunEmbeddedAttempt.mock.calls[0]?.[0] as {
      requestCompactionOpts?: typeof requestCompactionOpts & {
        contextUsageOrigin?: "live_runner" | "inventory_stub";
        bindLiveContextUsage?: (getContextUsage: () => number | null) => void;
      };
    };
    expect(attemptParams.requestCompactionOpts?.triggerCompaction).toBe(
      requestCompactionOpts.triggerCompaction,
    );
    expect(attemptParams.requestCompactionOpts?.contextUsageOrigin).toBe("live_runner");
    expect(attemptParams.requestCompactionOpts?.getContextUsage()).toBe(0.005);

    attemptParams.requestCompactionOpts?.bindLiveContextUsage?.(() => null);
    expect(attemptParams.requestCompactionOpts?.getContextUsage()).toBe(0.005);

    attemptParams.requestCompactionOpts?.bindLiveContextUsage?.(() => 0);
    expect(attemptParams.requestCompactionOpts?.getContextUsage()).toBe(0);

    attemptParams.requestCompactionOpts?.bindLiveContextUsage?.(() => 0.12);
    expect(attemptParams.requestCompactionOpts?.getContextUsage()).toBe(0.12);

    const tool = createRequestCompactionTool({
      agentSessionKey: "agent:main:subagent:first-turn",
      ...attemptParams.requestCompactionOpts!,
    });
    const result = (
      await tool.execute("call-first-turn-child", {
        reason: "first-turn child threshold control",
      })
    )?.details;

    expect(result).toMatchObject({
      status: "rejected",
      guard: "context_threshold",
      contextUsage: 12,
      threshold: 70,
    });
    expect(requestCompactionOpts.triggerCompaction).not.toHaveBeenCalled();
  });

  it("forwards explicit continuation-tool disablement to runEmbeddedAttempt", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    await runEmbeddedAgent({
      ...overflowBaseRunParams,
      provider: "openai",
      model: "gpt-5.4",
      runId: "run-cron-continuation-disabled",
      disableContinuationTools: true,
    });

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(1);
    const attemptParams = mockedRunEmbeddedAttempt.mock.calls[0]?.[0] as {
      disableContinuationTools?: boolean;
    };
    expect(attemptParams.disableContinuationTools).toBe(true);
  });

  it("forwards callbacks and delegate-drain ownership in the same call", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    const continueWorkOpts = { requestContinuation: () => undefined };
    const requestCompactionOpts = {
      sessionId: "session-868-both",
      getContextUsage: () => 0,
      triggerCompaction: async () => ({ ok: true, compacted: true }),
    };

    await runEmbeddedAgent({
      ...overflowBaseRunParams,
      provider: "openai",
      model: "gpt-5.4",
      runId: "run-868-both-forward",
      drainsContinuationDelegateQueue: true,
      continueWorkOpts,
      requestCompactionOpts,
    });

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(1);
    const attemptParams = mockedRunEmbeddedAttempt.mock.calls[0]?.[0] as {
      continueWorkOpts?: typeof continueWorkOpts;
      requestCompactionOpts?: typeof requestCompactionOpts;
      drainsContinuationDelegateQueue?: boolean;
    };
    expect(attemptParams.continueWorkOpts).toBe(continueWorkOpts);
    expect(attemptParams.requestCompactionOpts?.triggerCompaction).toBe(
      requestCompactionOpts.triggerCompaction,
    );
    expect(attemptParams.drainsContinuationDelegateQueue).toBe(true);
  });

  it("leaves both undefined when caller omits them", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    await runEmbeddedAgent({
      ...overflowBaseRunParams,
      provider: "openai",
      model: "gpt-5.4",
      runId: "run-868-omitted",
    });

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(1);
    const attemptParams = mockedRunEmbeddedAttempt.mock.calls[0]?.[0] as {
      continueWorkOpts?: unknown;
      requestCompactionOpts?: unknown;
    };
    expect(attemptParams.continueWorkOpts).toBeUndefined();
    expect(attemptParams.requestCompactionOpts).toBeUndefined();
  });
});
