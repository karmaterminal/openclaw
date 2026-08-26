import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  emitContinuationDisabledSpan,
  emitContinuationDelegateSpan,
  emitContinuationQueueDrainSpan,
  emitContinuationWorkFireSpan,
  emitContinuationWorkSpan,
  resetContinuationTracer,
  setContinuationTracer,
  type Span,
  type SpanAttributes,
  type SpanStatus,
  type StartSpanOptions,
} from "./continuation-tracer.js";
import {
  emitDiagnosticEvent,
  emitTrustedDiagnosticEvent,
  onInternalDiagnosticEvent,
  resetDiagnosticEventsForTest,
  waitForDiagnosticEventsDrained,
  type DiagnosticEventPayload,
} from "./diagnostic-events.js";

type RecordedSpan = {
  name: string;
  attributes: Record<string, unknown>;
  status?: SpanStatus;
  ended: boolean;
};

function installRecordingTracer(): RecordedSpan[] {
  const spans: RecordedSpan[] = [];
  const salt = "test-fleet-correlation-salt-32-bytes";
  const fingerprint = (kind: string, values: readonly string[]) =>
    createHmac("sha256", salt)
      .update(JSON.stringify(["openclaw.continuation.telemetry.v1", kind, ...values]))
      .digest("hex")
      .slice(0, 16);
  setContinuationTracer({
    startSpan(name: string, options?: StartSpanOptions): Span {
      const runId = options?.correlation?.runId;
      const sessionId = options?.correlation?.sessionId;
      const recorded: RecordedSpan = {
        name,
        attributes: {
          ...options?.attributes,
          ...(runId ? { "continuation.origin.run.fingerprint": fingerprint("run", [runId]) } : {}),
          ...(sessionId
            ? { "continuation.session.fingerprint": fingerprint("session", [sessionId]) }
            : {}),
          ...(runId && sessionId
            ? { "continuation.turn.fingerprint": fingerprint("turn", [sessionId, runId]) }
            : {}),
        },
        ended: false,
      };
      spans.push(recorded);
      return {
        setAttributes(attributes: SpanAttributes) {
          Object.assign(recorded.attributes, attributes);
        },
        setStatus(status) {
          recorded.status = status;
        },
        recordException() {},
        end() {
          recorded.ended = true;
        },
      };
    },
  });
  return spans;
}

const proof = {
  runId: "0123456789abcdef",
  rowId: "R-OBS-CONT-PROVENANCE",
  candidateSha: "a".repeat(40),
  harnessRef: "b".repeat(40),
} as const;

afterEach(() => {
  resetContinuationTracer();
  resetDiagnosticEventsForTest();
});

describe("continuation observability contracts", () => {
  it("joins typed-tool and accepted-entry spans through public-safe correlation", async () => {
    const rawRunId = "private-run-id";
    const rawSessionId = "private-session-id";
    const spans = installRecordingTracer();
    const events: DiagnosticEventPayload[] = [];
    const stop = onInternalDiagnosticEvent((event, metadata) => {
      if (metadata.trusted) {
        events.push(event);
      }
    });

    emitTrustedDiagnosticEvent({
      type: "run.started",
      runId: rawRunId,
      sessionId: rawSessionId,
      provider: "openai",
      model: "gpt-5.6-luna",
      diagnosticContext: { proof },
    });
    emitTrustedDiagnosticEvent({
      type: "model.call.started",
      runId: rawRunId,
      callId: "model-call-observed",
      sessionId: rawSessionId,
      provider: "openai",
      model: "gpt-5.6-luna",
      diagnosticContext: { proof },
    });
    emitTrustedDiagnosticEvent({
      type: "tool.execution.completed",
      runId: rawRunId,
      sessionId: rawSessionId,
      toolName: "continue_work",
      durationMs: 1,
      diagnosticContext: { proof },
    });
    await waitForDiagnosticEventsDrained();
    stop();

    emitContinuationWorkSpan({
      chainId: "chain-typed",
      chainStepRemaining: 3,
      delayMs: 0,
      reason: "private prompt reason",
      telemetry: {
        origin: "typed-tool",
        kind: "work",
        runId: rawRunId,
        sessionId: rawSessionId,
        diagnosticContext: { proof },
      },
    });
    emitContinuationWorkSpan({
      chainId: "chain-bracket",
      chainStepRemaining: 2,
      delayMs: 0,
      telemetry: {
        origin: "bracket",
        kind: "work",
        runId: "bracket-run-id",
        sessionId: rawSessionId,
        diagnosticContext: { proof },
      },
    });
    emitContinuationWorkSpan({
      chainId: "chain-organic",
      chainStepRemaining: 1,
      delayMs: 0,
    });
    emitContinuationDelegateSpan({
      chainId: "chain-delegate-tool",
      chainStepRemaining: 1,
      delayMs: 0,
      delivery: "immediate",
      telemetry: {
        origin: "typed-tool",
        kind: "delegate",
        runId: rawRunId,
        sessionId: rawSessionId,
        diagnosticContext: { proof },
      },
    });
    emitContinuationDelegateSpan({
      chainId: "chain-delegate-bracket",
      chainStepRemaining: 1,
      delayMs: 0,
      delivery: "immediate",
      telemetry: {
        origin: "bracket",
        kind: "delegate",
        runId: "bracket-delegate-run",
        sessionId: rawSessionId,
        diagnosticContext: { proof },
      },
    });

    const toolTelemetry = events.find(
      (event) => event.type === "tool.execution.completed",
    )?.telemetry;
    const runTelemetry = events.find((event) => event.type === "run.started")?.telemetry;
    const modelTelemetry = events.find((event) => event.type === "model.call.started")?.telemetry;
    const [typed, bracket, organic] = spans;
    expect(typed?.attributes).toMatchObject({
      "continuation.signal.origin": "typed-tool",
      "continuation.signal.kind": "work",
      "continuation.origin.run.fingerprint": expect.stringMatching(/^[a-f0-9]{16}$/u),
      "continuation.session.fingerprint": expect.stringMatching(/^[a-f0-9]{16}$/u),
      "continuation.turn.fingerprint": expect.stringMatching(/^[a-f0-9]{16}$/u),
      "continuation.outcome": "scheduled",
      "continuation.outcome.reason": "dispatch.accepted",
      "openclaw.proof.run_id": proof.runId,
      "openclaw.proof.row_id": proof.rowId,
      "openclaw.proof.candidate_sha": proof.candidateSha,
      "openclaw.proof.harness_ref": proof.harnessRef,
      "openclaw.proof.synthetic": true,
    });
    expect(runTelemetry).toMatchObject({
      "openclaw.proof.run_id": proof.runId,
      "openclaw.proof.synthetic": true,
    });
    expect(modelTelemetry).toMatchObject({
      "openclaw.proof.run_id": proof.runId,
      "openclaw.proof.synthetic": true,
    });
    expect(toolTelemetry).toMatchObject({
      "openclaw.proof.run_id": proof.runId,
      "openclaw.proof.synthetic": true,
    });
    expect(bracket?.attributes).toMatchObject({
      "continuation.signal.origin": "bracket",
      "continuation.signal.kind": "work",
      "continuation.session.fingerprint": typed?.attributes["continuation.session.fingerprint"],
    });
    expect(typed?.attributes["continuation.turn.fingerprint"]).not.toBe(
      bracket?.attributes["continuation.turn.fingerprint"],
    );
    expect(organic?.attributes).toMatchObject({
      "continuation.outcome": "scheduled",
    });
    expect(organic?.attributes).not.toHaveProperty("openclaw.proof.synthetic");
    expect(organic?.attributes).not.toHaveProperty("continuation.session.fingerprint");
    expect(spans[3]?.attributes).toMatchObject({
      "continuation.signal.origin": "typed-tool",
      "continuation.signal.kind": "delegate",
      "continuation.outcome": "scheduled",
    });
    expect(spans[4]?.attributes).toMatchObject({
      "continuation.signal.origin": "bracket",
      "continuation.signal.kind": "delegate",
      "continuation.outcome": "scheduled",
    });
    const exported = JSON.stringify([toolTelemetry, typed?.attributes, bracket?.attributes]);
    expect(exported).not.toContain(rawRunId);
    expect(exported).not.toContain(rawSessionId);
    expect(exported).not.toContain("private prompt reason");
  });

  it("drops invalid proof markers and emits canonical terminal outcomes", () => {
    const spans = installRecordingTracer();
    const invalidProof = {
      ...proof,
      runId: "not-a-public-proof-id",
      arbitraryAttribute: "openclaw.injected",
    };

    emitContinuationWorkSpan({
      chainId: "chain-invalid-marker",
      chainStepRemaining: 2,
      delayMs: 0,
      telemetry: {
        origin: "typed-tool",
        kind: "work",
        runId: "run-invalid-marker",
        sessionId: "session-invalid-marker",
        diagnosticContext: { proof: invalidProof } as never,
      },
    });
    emitContinuationWorkFireSpan({
      chainId: "chain-fire",
      chainStepRemainingAtDispatch: 1,
      delayMs: 0,
      fireDeferredMs: 1,
    });
    emitContinuationDisabledSpan({
      chainId: "chain-cap",
      chainStepRemaining: 0,
      disabledReason: "cap.chain",
      signalKind: "work",
    });
    emitContinuationQueueDrainSpan({
      drainedCount: 0,
      drainedContinuationCount: 0,
    });
    emitContinuationQueueDrainSpan({
      drainedCount: 2,
      drainedContinuationCount: 1,
    });

    expect(spans[0]?.attributes).not.toHaveProperty("openclaw.proof.run_id");
    expect(spans.map((span) => span.attributes["continuation.outcome"])).toEqual([
      "scheduled",
      "fired",
      "rejected-cap",
      "no-op",
      "delivered",
    ]);
    expect(spans[2]?.attributes["continuation.outcome.reason"]).toBe("cap.chain");
    expect(spans[3]?.attributes["continuation.outcome.reason"]).toBe("queue.empty");
    expect(spans.every((span) => span.ended)).toBe(true);
  });

  it("drops proof markers from untrusted diagnostic producers", async () => {
    const events: DiagnosticEventPayload[] = [];
    const stop = onInternalDiagnosticEvent((event) => {
      events.push(event);
    });

    emitDiagnosticEvent({
      type: "run.started",
      runId: "plugin-run",
      provider: "external",
      model: "external",
      diagnosticContext: { proof },
    });
    await waitForDiagnosticEventsDrained();
    stop();

    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty("diagnosticContext");
    expect(events[0]).not.toHaveProperty("telemetry");
  });
});
