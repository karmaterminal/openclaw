import { describe, expect, it, vi } from "vitest";
import { createContinuationCorrelationResolver } from "../api.js";
import { createContinuationOtelTracerAdapter } from "./continuation-tracer-adapter.js";
import { createDiagnosticsTraceRuntime } from "./service-traces.js";

describe("diagnostics OTel telemetry attributes", () => {
  it("joins run-owned and continuation spans through one salted public-safe fingerprint", () => {
    const salt = "test-fleet-correlation-salt-32-bytes";
    const correlationAttributes = createContinuationCorrelationResolver(salt);
    expect(correlationAttributes).toBeDefined();
    const runtime = createDiagnosticsTraceRuntime(
      {
        startSpan: vi.fn(),
      } as never,
      correlationAttributes,
    );
    const attrs: Record<string, string | number | boolean> = {};
    const telemetry = {
      "openclaw.proof.run_id": "0123456789abcdef",
      "openclaw.proof.row_id": "R-OBS-PROOF-MARKER",
      "openclaw.proof.candidate_sha": "a".repeat(40),
      "openclaw.proof.harness_ref": "b".repeat(40),
      "openclaw.proof.synthetic": true,
    } as const;

    runtime.addRunAttrs(attrs, {
      runId: "raw-run-id",
      sessionId: "raw-session-id",
      telemetry,
    });

    const startSpan = vi.fn(
      (_name: string, _options?: { attributes?: Record<string, string | number | boolean> }) =>
        ({}) as never,
    );
    const adapter = createContinuationOtelTracerAdapter({
      correlationAttributes,
      tracerProvider: {
        getTracer: () => ({ startSpan }) as never,
      },
    });
    adapter.startSpan("continuation.work", {
      attributes: telemetry,
      correlation: {
        runId: "raw-run-id",
        sessionId: "raw-session-id",
      },
    });
    const continuationAttrs = startSpan.mock.calls[0]?.[1]?.attributes;

    expect(attrs).toMatchObject(telemetry);
    expect(attrs["continuation.origin.run.fingerprint"]).toBe(
      continuationAttrs?.["continuation.origin.run.fingerprint"],
    );
    expect(attrs["continuation.session.fingerprint"]).toBe(
      continuationAttrs?.["continuation.session.fingerprint"],
    );
    expect(attrs["continuation.turn.fingerprint"]).toBe(
      continuationAttrs?.["continuation.turn.fingerprint"],
    );
    expect(attrs["continuation.origin.run.fingerprint"]).toMatch(/^[a-f0-9]{16}$/u);
    expect(JSON.stringify(attrs)).not.toContain("raw-run-id");
    expect(JSON.stringify(attrs)).not.toContain("raw-session-id");
    expect(JSON.stringify(attrs)).not.toContain(salt);
  });

  it("omits correlation without a valid runtime salt and leaves organic traffic unmarked", () => {
    expect(createContinuationCorrelationResolver("too-short")).toBeUndefined();
    const runtime = createDiagnosticsTraceRuntime({
      startSpan: vi.fn(),
    } as never);
    const attrs: Record<string, string | number | boolean> = {};

    runtime.addRunAttrs(attrs, {
      runId: "organic-run",
      sessionId: "organic-session",
    });

    expect(attrs).toEqual({});
  });
});
