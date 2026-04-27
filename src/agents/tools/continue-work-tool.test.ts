import { afterEach, describe, expect, it, vi } from "vitest";
import {
  noopTracer,
  resetContinuationTracer,
  setContinuationTracer,
  type Span,
  type SpanAttributes,
  type SpanStatus,
  type StartSpanOptions,
  type Tracer,
} from "../../infra/continuation-tracer.js";
import { createContinueWorkTool, type ContinueWorkRequest } from "./continue-work-tool.js";

describe("continue_work tool", () => {
  function makeTool(
    overrides?: Partial<{
      agentSessionKey: string | undefined;
      requestContinuation: (request: ContinueWorkRequest) => void;
      chainContext: () =>
        | {
            readonly chainId?: string;
            readonly chainStepRemaining?: number;
          }
        | undefined;
    }>,
  ) {
    return createContinueWorkTool({
      agentSessionKey: "test-session",
      requestContinuation: vi.fn(),
      ...overrides,
    });
  }

  it("schedules another turn with the default delay and forwards the reason", async () => {
    const requestContinuation = vi.fn();
    const tool = makeTool({ requestContinuation });

    const result = (
      await tool.execute("call-1", {
        reason: "Need one more turn to finish the summary.",
      })
    )?.details as Record<string, unknown>;

    expect(requestContinuation).toHaveBeenCalledWith({
      reason: "Need one more turn to finish the summary.",
      delaySeconds: 0,
    });
    expect(result).toEqual({
      status: "scheduled",
      delaySeconds: 0,
    });
  });

  it("honors an explicit delaySeconds value", async () => {
    const requestContinuation = vi.fn();
    const tool = makeTool({ requestContinuation });

    const result = (
      await tool.execute("call-2", {
        reason: "Wait for the background write to settle.",
        delaySeconds: 15,
      })
    )?.details as Record<string, unknown>;

    expect(requestContinuation).toHaveBeenCalledWith({
      reason: "Wait for the background write to settle.",
      delaySeconds: 15,
    });
    expect(result).toEqual({
      status: "scheduled",
      delaySeconds: 15,
    });
  });

  it("requires a reason", async () => {
    const tool = makeTool();
    await expect(tool.execute("call-3", {})).rejects.toThrow(/reason required/i);
  });

  it("requires an active session", async () => {
    const tool = makeTool({ agentSessionKey: undefined });
    await expect(tool.execute("call-4", { reason: "Need another turn" })).rejects.toThrow(
      /requires an active session/i,
    );
  });
});

// ---------------------------------------------------------------------------
// #334 Slice 2 chunk 2 — OTEL `continuation.work` span emission
// ---------------------------------------------------------------------------

type RecordedSpan = {
  name: string;
  options?: StartSpanOptions;
  setAttributesCalls: SpanAttributes[];
  setStatusCalls: Array<{ status: SpanStatus; message?: string }>;
  recordExceptionCalls: unknown[];
  ended: boolean;
};

function installRecordingTracer(): { tracer: Tracer; spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const tracer: Tracer = {
    startSpan(name: string, options?: StartSpanOptions): Span {
      const recorded: RecordedSpan = {
        name,
        options,
        setAttributesCalls: [],
        setStatusCalls: [],
        recordExceptionCalls: [],
        ended: false,
      };
      spans.push(recorded);
      return {
        setAttributes(attrs) {
          recorded.setAttributesCalls.push(attrs);
        },
        setStatus(status, message) {
          recorded.setStatusCalls.push({ status, message });
        },
        recordException(err) {
          recorded.recordExceptionCalls.push(err);
        },
        end() {
          recorded.ended = true;
        },
      };
    },
  };
  setContinuationTracer(tracer);
  return { tracer, spans };
}

describe("continue_work tool :: OTEL span emission", () => {
  afterEach(() => {
    resetContinuationTracer();
  });

  it("emits a `continuation.work` span on successful schedule", async () => {
    const { spans } = installRecordingTracer();
    const tool = createContinueWorkTool({
      agentSessionKey: "test-session",
      requestContinuation: vi.fn(),
    });

    await tool.execute("call-1", { reason: "x", delaySeconds: 5 });

    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("continuation.work");
    expect(spans[0]?.ended).toBe(true);
    expect(spans[0]?.setStatusCalls).toEqual([{ status: "OK", message: undefined }]);
  });

  it("populates `delay.ms` (rounded ms) and `reason.preview` (≤80 chars) on the span", async () => {
    const { spans } = installRecordingTracer();
    const longReason = "x".repeat(200);
    const tool = createContinueWorkTool({
      agentSessionKey: "test-session",
      requestContinuation: vi.fn(),
    });

    await tool.execute("call-2", { reason: longReason, delaySeconds: 1.5 });

    const attrs = spans[0]?.options?.attributes;
    expect(attrs?.["delay.ms"]).toBe(1500);
    expect(attrs?.["reason.preview"]).toBe("x".repeat(80));
    // Chain attrs MUST NOT appear when no chainContext provided (additive
    // contract: don't sneak attributes the call site didn't supply).
    expect(attrs?.["chain.id"]).toBeUndefined();
    expect(attrs?.["chain.step.remaining"]).toBeUndefined();
  });

  it("populates `chain.id` + `chain.step.remaining` when chainContext supplies them", async () => {
    const { spans } = installRecordingTracer();
    const tool = createContinueWorkTool({
      agentSessionKey: "test-session",
      requestContinuation: vi.fn(),
      chainContext: () => ({ chainId: "chain-abc", chainStepRemaining: 3 }),
    });

    await tool.execute("call-3", { reason: "r", delaySeconds: 0 });

    const attrs = spans[0]?.options?.attributes;
    expect(attrs?.["chain.id"]).toBe("chain-abc");
    expect(attrs?.["chain.step.remaining"]).toBe(3);
  });

  it("chainContext returning undefined leaves chain attrs unset", async () => {
    const { spans } = installRecordingTracer();
    const tool = createContinueWorkTool({
      agentSessionKey: "test-session",
      requestContinuation: vi.fn(),
      chainContext: () => undefined,
    });

    await tool.execute("call-4", { reason: "r", delaySeconds: 0 });

    const attrs = spans[0]?.options?.attributes;
    expect(attrs?.["chain.id"]).toBeUndefined();
    expect(attrs?.["chain.step.remaining"]).toBeUndefined();
  });

  it("records exception + sets ERROR status when requestContinuation throws, and re-throws", async () => {
    const { spans } = installRecordingTracer();
    const boom = new Error("requestContinuation boom");
    const tool = createContinueWorkTool({
      agentSessionKey: "test-session",
      requestContinuation: () => {
        throw boom;
      },
    });

    await expect(tool.execute("call-5", { reason: "r" })).rejects.toThrow(boom);

    expect(spans[0]?.recordExceptionCalls).toEqual([boom]);
    expect(spans[0]?.setStatusCalls).toEqual([
      { status: "ERROR", message: "requestContinuation boom" },
    ]);
    expect(spans[0]?.ended).toBe(true);
  });

  it("default no-op tracer is used when no tracer installed (additive contract)", async () => {
    // No installRecordingTracer call — the default noopTracer is active.
    expect(getContinuationTracerForTest()).toBe(noopTracer);
    const tool = createContinueWorkTool({
      agentSessionKey: "test-session",
      requestContinuation: vi.fn(),
    });
    // Should complete without throwing; the noop span swallows everything.
    await expect(tool.execute("call-6", { reason: "r" })).resolves.toBeDefined();
  });
});

// helper: re-export of the registry getter so the additive-contract test
// can assert the default-tracer state without leaking the import surface
// onto the production tool module.
import { getContinuationTracer as getContinuationTracerForTest } from "../../infra/continuation-tracer.js";
