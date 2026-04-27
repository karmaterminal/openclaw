import { afterEach, describe, expect, it } from "vitest";
import {
  emitContinuationDelegateSpan,
  emitContinuationWorkSpan,
  getContinuationTracer,
  noopTracer,
  resetContinuationTracer,
  setContinuationTracer,
  type ContinuationSpanAttrs,
  type ContinuationSpanName,
  type Span,
  type SpanAttributes,
  type SpanStatus,
  type StartSpanOptions,
  type Tracer,
} from "./continuation-tracer.js";

afterEach(() => {
  resetContinuationTracer();
});

describe("continuation-tracer :: noop default contract (Slice 2)", () => {
  it("default tracer is the no-op tracer (additive Slice-1 contract preserved)", () => {
    expect(getContinuationTracer()).toBe(noopTracer);
  });

  it("noopTracer.startSpan returns a span with all methods callable as no-ops", () => {
    const span = noopTracer.startSpan("continuation.work");
    // None of these should throw — the no-op surface is the safety net for
    // un-opted callers.
    expect(() => span.setAttributes({ "chain.id": "x" })).not.toThrow();
    expect(() => span.setStatus("OK")).not.toThrow();
    expect(() => span.setStatus("ERROR", "boom")).not.toThrow();
    expect(() => span.recordException(new Error("boom"))).not.toThrow();
    expect(() => span.recordException("plain-string")).not.toThrow();
    expect(() => span.end()).not.toThrow();
    // end() is idempotent.
    expect(() => span.end()).not.toThrow();
  });

  it("noopTracer ignores StartSpanOptions (attrs + traceparent) without throwing", () => {
    const opts: StartSpanOptions = {
      attributes: { "chain.id": "abc", "chain.step.remaining": 5 },
      traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    };
    expect(() => noopTracer.startSpan("continuation.work", opts)).not.toThrow();
  });
});

describe("continuation-tracer :: registry (set/get/reset)", () => {
  it("setContinuationTracer installs a custom tracer; getContinuationTracer returns it", () => {
    const calls: Array<{ name: string; opts?: StartSpanOptions }> = [];
    const recorded: Array<{ method: string; args: unknown[] }> = [];

    const recordingSpan: Span = {
      setAttributes(attrs: SpanAttributes): void {
        recorded.push({ method: "setAttributes", args: [attrs] });
      },
      setStatus(status: SpanStatus, message?: string): void {
        recorded.push({ method: "setStatus", args: [status, message] });
      },
      recordException(err: unknown): void {
        recorded.push({ method: "recordException", args: [err] });
      },
      end(): void {
        recorded.push({ method: "end", args: [] });
      },
    };

    const recordingTracer: Tracer = {
      startSpan(name: string, opts?: StartSpanOptions): Span {
        calls.push({ name, opts });
        return recordingSpan;
      },
    };

    setContinuationTracer(recordingTracer);
    expect(getContinuationTracer()).toBe(recordingTracer);

    const span = getContinuationTracer().startSpan("continuation.work", {
      attributes: { "chain.id": "test-chain" },
    });
    span.setAttributes({ "chain.step.remaining": 4 });
    span.setStatus("OK");
    span.end();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("continuation.work");
    expect(calls[0]?.opts?.attributes?.["chain.id"]).toBe("test-chain");
    expect(recorded.map((r) => r.method)).toEqual(["setAttributes", "setStatus", "end"]);
  });

  it("setContinuationTracer(null) resets to the no-op default", () => {
    const customTracer: Tracer = { startSpan: () => noopTracer.startSpan("x") };
    setContinuationTracer(customTracer);
    expect(getContinuationTracer()).toBe(customTracer);

    setContinuationTracer(null);
    expect(getContinuationTracer()).toBe(noopTracer);
  });

  it("setContinuationTracer(undefined) resets to the no-op default", () => {
    const customTracer: Tracer = { startSpan: () => noopTracer.startSpan("x") };
    setContinuationTracer(customTracer);
    expect(getContinuationTracer()).toBe(customTracer);

    setContinuationTracer(undefined);
    expect(getContinuationTracer()).toBe(noopTracer);
  });

  it("resetContinuationTracer() resets to the no-op default", () => {
    const customTracer: Tracer = { startSpan: () => noopTracer.startSpan("x") };
    setContinuationTracer(customTracer);
    expect(getContinuationTracer()).toBe(customTracer);

    resetContinuationTracer();
    expect(getContinuationTracer()).toBe(noopTracer);
  });
});

describe("continuation-tracer :: harness contract pin (#370)", () => {
  // These tests pin the canonical span names + attribute names the swim-37
  // harness (`studies/swim-37/harness/swim-runner.test.ts`) asserts against.
  // If a span name or attribute name renames, this file fails first — before
  // the harness — giving a clearer signal at the source.

  it("canonical continuation span names are accepted by the surface", () => {
    const recorded: string[] = [];
    setContinuationTracer({
      startSpan: (name) => {
        recorded.push(name);
        return noopTracer.startSpan(name);
      },
    });

    const tracer = getContinuationTracer();
    tracer.startSpan("continuation.work");
    tracer.startSpan("continuation.delegate.dispatch");
    tracer.startSpan("continuation.queue.enqueue");
    tracer.startSpan("continuation.queue.drain");
    tracer.startSpan("continuation.compaction.released");
    tracer.startSpan("continuation.disabled");
    tracer.startSpan("heartbeat");

    expect(recorded).toEqual([
      "continuation.work",
      "continuation.delegate.dispatch",
      "continuation.queue.enqueue",
      "continuation.queue.drain",
      "continuation.compaction.released",
      "continuation.disabled",
      "heartbeat",
    ]);
  });

  it("canonical attribute names round-trip through the surface", () => {
    let captured: SpanAttributes | undefined;
    setContinuationTracer({
      startSpan: (_name, opts) => {
        captured = opts?.attributes;
        return noopTracer.startSpan(_name);
      },
    });

    getContinuationTracer().startSpan("continuation.work", {
      attributes: {
        "chain.id": "01J0X0000000000000000000A0",
        "chain.step.remaining": 4,
        "delay.ms": 30000,
        "reason.preview": "context-pressure handoff",
      },
    });

    expect(captured?.["chain.id"]).toBe("01J0X0000000000000000000A0");
    expect(captured?.["chain.step.remaining"]).toBe(4);
    expect(captured?.["delay.ms"]).toBe(30000);
    expect(captured?.["reason.preview"]).toBe("context-pressure handoff");
  });

  // Type-level pin: ContinuationSpanAttrs is the load-bearing canonical
  // attribute-name shape. If the OTEL adapter (Slice 3) ever drifts to
  // chain_id / chainId / camelCase / etc., the assignment below fails
  // compile, BEFORE the runtime harness assertions could catch it.
  // (🌻's nuance, sprites-of-thornfield 2026-04-27.)
  it("ContinuationSpanAttrs is structurally compatible with SpanAttributes", () => {
    const canonical: ContinuationSpanAttrs = {
      "chain.id": "abc",
      "chain.step.remaining": 3,
      "delay.ms": 1000,
      "reason.preview": "x",
      "delegate.mode": "silent-wake",
      "continuation.disabled": false,
    };
    // Assignment to SpanAttributes is the compile-time pin: every
    // ContinuationSpanAttrs MUST be a valid SpanAttributes for the shim
    // surface to accept it.
    const broad: SpanAttributes = canonical;
    expect(broad["chain.id"]).toBe("abc");
  });

  it("ContinuationSpanName values are all accepted by startSpan", () => {
    // Compile-time pin: each canonical name MUST be assignable to the
    // ContinuationSpanName union.
    const names: ContinuationSpanName[] = [
      "continuation.work",
      "continuation.delegate.dispatch",
      "continuation.queue.enqueue",
      "continuation.queue.drain",
      "continuation.compaction.released",
      "continuation.disabled",
      "heartbeat",
    ];
    for (const name of names) {
      expect(() => noopTracer.startSpan(name)).not.toThrow();
    }
  });
});

describe("continuation-tracer :: emitContinuationWorkSpan helper (Slice 2 chunk 2)", () => {
  type RecordedSpan = {
    name: string;
    options?: StartSpanOptions;
    setAttributesCalls: SpanAttributes[];
    statusCalls: Array<{ status: SpanStatus; message?: string }>;
    exceptionCalls: unknown[];
    ended: boolean;
  };

  function makeRecordingTracer(): { tracer: Tracer; spans: RecordedSpan[] } {
    const spans: RecordedSpan[] = [];
    const tracer: Tracer = {
      startSpan(name, options) {
        const recorded: RecordedSpan = {
          name,
          options,
          setAttributesCalls: [],
          statusCalls: [],
          exceptionCalls: [],
          ended: false,
        };
        spans.push(recorded);
        const span: Span = {
          setAttributes(attrs) {
            recorded.setAttributesCalls.push(attrs);
          },
          setStatus(status, message) {
            recorded.statusCalls.push({ status, message });
          },
          recordException(err) {
            recorded.exceptionCalls.push(err);
          },
          end() {
            recorded.ended = true;
          },
        };
        return span;
      },
    };
    return { tracer, spans };
  }

  it("emits a continuation.work span with all expected attrs when chainId is present", () => {
    const { tracer, spans } = makeRecordingTracer();
    setContinuationTracer(tracer);
    emitContinuationWorkSpan({
      chainId: "019dcf57-b536-77cc-834b-b803d9262032",
      chainStepRemaining: 7,
      delayMs: 30000,
      reason: "more work to do",
    });
    expect(spans).toHaveLength(1);
    const span = spans[0];
    expect(span.name).toBe("continuation.work");
    expect(span.options?.attributes).toEqual({
      "delay.ms": 30000,
      "chain.step.remaining": 7,
      "chain.id": "019dcf57-b536-77cc-834b-b803d9262032",
      "reason.preview": "more work to do",
    });
    expect(span.statusCalls).toEqual([{ status: "OK", message: undefined }]);
    expect(span.ended).toBe(true);
  });

  it("omits chain.id and reason.preview when not provided", () => {
    const { tracer, spans } = makeRecordingTracer();
    setContinuationTracer(tracer);
    emitContinuationWorkSpan({
      chainId: undefined,
      chainStepRemaining: 0,
      delayMs: 5000,
    });
    expect(spans[0].options?.attributes).toEqual({
      "delay.ms": 5000,
      "chain.step.remaining": 0,
    });
  });

  it("truncates reason to 80 chars", () => {
    const { tracer, spans } = makeRecordingTracer();
    setContinuationTracer(tracer);
    const long = "x".repeat(200);
    emitContinuationWorkSpan({
      chainId: "abc",
      chainStepRemaining: 1,
      delayMs: 100,
      reason: long,
    });
    const attrs = spans[0].options?.attributes as ContinuationSpanAttrs;
    expect(attrs["reason.preview"]).toBe("x".repeat(80));
  });

  it("rounds delayMs to integer", () => {
    const { tracer, spans } = makeRecordingTracer();
    setContinuationTracer(tracer);
    emitContinuationWorkSpan({ chainId: undefined, chainStepRemaining: 0, delayMs: 1234.7 });
    expect((spans[0].options?.attributes as ContinuationSpanAttrs)["delay.ms"]).toBe(1235);
  });

  it("clamps negative chainStepRemaining to 0", () => {
    const { tracer, spans } = makeRecordingTracer();
    setContinuationTracer(tracer);
    emitContinuationWorkSpan({ chainId: undefined, chainStepRemaining: -3, delayMs: 0 });
    expect((spans[0].options?.attributes as ContinuationSpanAttrs)["chain.step.remaining"]).toBe(0);
  });

  it("swallows tracer errors and forwards them to the log callback", () => {
    const throwingTracer: Tracer = {
      startSpan() {
        throw new Error("boom");
      },
    };
    setContinuationTracer(throwingTracer);
    const messages: string[] = [];
    expect(() =>
      emitContinuationWorkSpan({
        chainId: "abc",
        chainStepRemaining: 1,
        delayMs: 0,
        log: (m) => messages.push(m),
      }),
    ).not.toThrow();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("boom");
  });

  it("is a no-op (no throw) against the default noop tracer", () => {
    expect(getContinuationTracer()).toBe(noopTracer);
    expect(() =>
      emitContinuationWorkSpan({
        chainId: "abc",
        chainStepRemaining: 1,
        delayMs: 0,
        reason: "r",
      }),
    ).not.toThrow();
  });
});

describe("continuation-tracer :: emitContinuationDelegateSpan helper (Slice 2 chunk 3)", () => {
  type RecordedSpan = {
    name: string;
    options?: StartSpanOptions;
    setAttributesCalls: SpanAttributes[];
    statusCalls: Array<{ status: SpanStatus; message?: string }>;
    exceptionCalls: unknown[];
    ended: boolean;
  };

  function makeRecordingTracer(): { tracer: Tracer; spans: RecordedSpan[] } {
    const spans: RecordedSpan[] = [];
    const tracer: Tracer = {
      startSpan(name, options) {
        const recorded: RecordedSpan = {
          name,
          options,
          setAttributesCalls: [],
          statusCalls: [],
          exceptionCalls: [],
          ended: false,
        };
        spans.push(recorded);
        const span: Span = {
          setAttributes(attrs) {
            recorded.setAttributesCalls.push(attrs);
          },
          setStatus(status, message) {
            recorded.statusCalls.push({ status, message });
          },
          recordException(err) {
            recorded.exceptionCalls.push(err);
          },
          end() {
            recorded.ended = true;
          },
        };
        return span;
      },
    };
    return { tracer, spans };
  }

  it("emits a continuation.delegate.dispatch span with all expected attrs", () => {
    const { tracer, spans } = makeRecordingTracer();
    setContinuationTracer(tracer);
    emitContinuationDelegateSpan({
      chainId: "019dcf57-b536-77cc-834b-b803d9262032",
      chainStepRemaining: 5,
      delayMs: 60000,
      delivery: "timer",
      delegateMode: "silent-wake",
      reason: "fan out three queries",
    });
    expect(spans).toHaveLength(1);
    const span = spans[0];
    expect(span.name).toBe("continuation.delegate.dispatch");
    expect(span.options?.attributes).toEqual({
      "delay.ms": 60000,
      "chain.step.remaining": 5,
      "delegate.delivery": "timer",
      "chain.id": "019dcf57-b536-77cc-834b-b803d9262032",
      "delegate.mode": "silent-wake",
      "reason.preview": "fan out three queries",
    });
    expect(span.statusCalls).toEqual([{ status: "OK", message: undefined }]);
    expect(span.ended).toBe(true);
  });

  it("immediate-delivery shape with no chainId or mode", () => {
    const { tracer, spans } = makeRecordingTracer();
    setContinuationTracer(tracer);
    emitContinuationDelegateSpan({
      chainId: undefined,
      chainStepRemaining: 0,
      delayMs: 0,
      delivery: "immediate",
    });
    expect(spans[0].options?.attributes).toEqual({
      "delay.ms": 0,
      "chain.step.remaining": 0,
      "delegate.delivery": "immediate",
    });
  });

  it("threads delegate.mode through unchanged", () => {
    const { tracer, spans } = makeRecordingTracer();
    setContinuationTracer(tracer);
    for (const mode of ["normal", "silent", "silent-wake", "post-compaction"] as const) {
      emitContinuationDelegateSpan({
        chainId: "abc",
        chainStepRemaining: 1,
        delayMs: 0,
        delivery: "immediate",
        delegateMode: mode,
      });
    }
    expect(
      spans.map((s) => (s.options?.attributes as ContinuationSpanAttrs)["delegate.mode"]),
    ).toEqual(["normal", "silent", "silent-wake", "post-compaction"]);
  });

  it("truncates reason to 80 chars", () => {
    const { tracer, spans } = makeRecordingTracer();
    setContinuationTracer(tracer);
    emitContinuationDelegateSpan({
      chainId: "abc",
      chainStepRemaining: 1,
      delayMs: 100,
      delivery: "timer",
      reason: "y".repeat(200),
    });
    expect((spans[0].options?.attributes as ContinuationSpanAttrs)["reason.preview"]).toBe(
      "y".repeat(80),
    );
  });

  it("rounds delayMs and clamps negative chainStepRemaining", () => {
    const { tracer, spans } = makeRecordingTracer();
    setContinuationTracer(tracer);
    emitContinuationDelegateSpan({
      chainId: undefined,
      chainStepRemaining: -2,
      delayMs: 4567.89,
      delivery: "timer",
    });
    const attrs = spans[0].options?.attributes as ContinuationSpanAttrs;
    expect(attrs["delay.ms"]).toBe(4568);
    expect(attrs["chain.step.remaining"]).toBe(0);
  });

  it("swallows tracer errors and forwards to log callback", () => {
    const throwingTracer: Tracer = {
      startSpan() {
        throw new Error("kaboom");
      },
    };
    setContinuationTracer(throwingTracer);
    const messages: string[] = [];
    expect(() =>
      emitContinuationDelegateSpan({
        chainId: "abc",
        chainStepRemaining: 1,
        delayMs: 0,
        delivery: "immediate",
        log: (m) => messages.push(m),
      }),
    ).not.toThrow();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("kaboom");
    expect(messages[0]).toContain("continuation.delegate.dispatch");
  });

  it("is a no-op against the default noop tracer", () => {
    expect(getContinuationTracer()).toBe(noopTracer);
    expect(() =>
      emitContinuationDelegateSpan({
        chainId: "abc",
        chainStepRemaining: 1,
        delayMs: 0,
        delivery: "immediate",
        delegateMode: "normal",
      }),
    ).not.toThrow();
  });
});
