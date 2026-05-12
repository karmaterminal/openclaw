import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emitContinuationWorkSpan,
  resetContinuationTracer,
  setContinuationTracer,
  type Span,
  type SpanAttributes,
  type SpanStatus,
  type StartSpanOptions,
  type Tracer,
} from "../../infra/continuation-tracer.js";
import { createContinueWorkTool, type ContinueWorkRequest } from "./continue-work-tool.js";

const VALID_TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

type RecordedSpan = {
  name: string;
  options?: StartSpanOptions;
  statusCalls: Array<{ status: SpanStatus; message?: string }>;
  ended: boolean;
};

function createRecordingTracer(): { tracer: Tracer; spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const tracer: Tracer = {
    startSpan(name: string, options?: StartSpanOptions): Span {
      const span: RecordedSpan = {
        name,
        options,
        statusCalls: [],
        ended: false,
      };
      spans.push(span);
      return {
        setAttributes(_attrs: SpanAttributes): void {},
        setStatus(status: SpanStatus, message?: string): void {
          span.statusCalls.push({ status, message });
        },
        recordException(): void {},
        end(): void {
          span.ended = true;
        },
      };
    },
  };
  return { tracer, spans };
}

describe("continue_work tool", () => {
  afterEach(() => {
    resetContinuationTracer();
  });

  function makeTool(
    overrides?: Partial<{
      agentSessionKey: string | undefined;
      requestContinuation: (request: ContinueWorkRequest) => void;
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

  it("accepts string-encoded delaySeconds values", async () => {
    const requestContinuation = vi.fn();
    const tool = makeTool({ requestContinuation });

    const result = (
      await tool.execute("call-delay-string", {
        reason: "Wait for the background write to settle.",
        delaySeconds: "5",
      })
    )?.details as Record<string, unknown>;

    expect(requestContinuation).toHaveBeenCalledWith({
      reason: "Wait for the background write to settle.",
      delaySeconds: 5,
    });
    expect(result).toEqual({
      status: "scheduled",
      delaySeconds: 5,
    });
  });

  it("threads a valid optional traceparent carrier into the continuation work span", async () => {
    const { tracer, spans } = createRecordingTracer();
    setContinuationTracer(tracer);
    const requestContinuation = vi.fn((request: ContinueWorkRequest) => {
      emitContinuationWorkSpan({
        chainId: "019dcf57-b536-77cc-834b-b803d9262032",
        chainStepRemaining: 1,
        delayMs: request.delaySeconds * 1000,
        reason: request.reason,
        traceparent: request.traceparent,
      });
    });
    const tool = makeTool({ requestContinuation });

    const result = (
      await tool.execute("call-traceparent", {
        reason: "Continue a traced chain.",
        traceparent: VALID_TRACEPARENT,
      })
    )?.details as Record<string, unknown>;

    expect(requestContinuation).toHaveBeenCalledWith({
      reason: "Continue a traced chain.",
      delaySeconds: 0,
      traceparent: VALID_TRACEPARENT,
    });
    expect(result).toMatchObject({
      status: "scheduled",
      delaySeconds: 0,
      traceparent: VALID_TRACEPARENT,
    });
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      name: "continuation.work",
      options: { traceparent: VALID_TRACEPARENT },
      statusCalls: [{ status: "OK", message: undefined }],
      ended: true,
    });
  });

  it("rejects malformed traceparent carriers", async () => {
    const requestContinuation = vi.fn();
    const tool = makeTool({ requestContinuation });

    await expect(
      tool.execute("call-bad-traceparent", {
        reason: "Continue malformed traced chain.",
        traceparent: "not-a-traceparent",
      }),
    ).rejects.toThrow("traceparent must be a valid W3C traceparent header");
    expect(requestContinuation).not.toHaveBeenCalled();
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
