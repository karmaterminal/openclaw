/**
 * Tests for the in-memory span recorder shim used by the swim-37 harness.
 *
 * Tracks: karmaterminal/openclaw#324
 *
 * The recorder itself needs its own contract pin so that downstream
 * harness assertions can rely on it. These tests pin:
 *   - construction returns a fresh independent recorder
 *   - startSpan records name + initial attributes + traceparent
 *   - setAttributes appends/overwrites with OTEL last-write-wins semantics
 *   - setStatus + recordException + end() round-trip into the record
 *   - spansByName filters correctly
 *   - reset() clears records without un-installing the tracer
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  emitContinuationDelegateFireSpan,
  emitContinuationDelegateSpan,
  emitContinuationWorkSpan,
  resetContinuationTracer,
  setContinuationTracer,
} from "../../../src/infra/continuation-tracer.js";
import {
  createInMemorySpanRecorder,
  type InMemorySpanRecorder,
} from "./in-memory-span-recorder.js";

let recorder: InMemorySpanRecorder;

beforeEach(() => {
  recorder = createInMemorySpanRecorder();
  setContinuationTracer(recorder.tracer);
});

afterEach(() => {
  resetContinuationTracer();
});

describe("in-memory-span-recorder :: contract", () => {
  it("createInMemorySpanRecorder returns a fresh independent recorder per call", () => {
    const a = createInMemorySpanRecorder();
    const b = createInMemorySpanRecorder();
    expect(a).not.toBe(b);
    expect(a.tracer).not.toBe(b.tracer);
    expect(a.spans()).toEqual([]);
    expect(b.spans()).toEqual([]);
  });

  it("startSpan records name + initial attributes from StartSpanOptions", () => {
    const span = recorder.tracer.startSpan("continuation.work", {
      attributes: { "chain.id": "abc", "chain.step.remaining": 3 },
    });
    span.end();
    const spans = recorder.spans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("continuation.work");
    expect(spans[0]?.attributes).toEqual({
      "chain.id": "abc",
      "chain.step.remaining": 3,
    });
    expect(spans[0]?.ended).toBe(true);
  });

  it("setAttributes is last-write-wins per OTEL semantics", () => {
    const span = recorder.tracer.startSpan("continuation.work", {
      attributes: { "chain.id": "first" },
    });
    span.setAttributes({ "chain.id": "second", "chain.step.remaining": 7 });
    span.end();
    const [s] = recorder.spans();
    expect(s?.attributes["chain.id"]).toBe("second");
    expect(s?.attributes["chain.step.remaining"]).toBe(7);
  });

  it("traceparent is captured when supplied", () => {
    const tp = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    recorder.tracer.startSpan("continuation.work", { traceparent: tp }).end();
    expect(recorder.spans()[0]?.traceparent).toBe(tp);
  });

  it("setStatus + recordException round-trip", () => {
    const span = recorder.tracer.startSpan("continuation.work");
    span.setStatus("ERROR", "boom");
    span.recordException(new Error("e1"));
    span.recordException("plain-string");
    span.end();
    const [s] = recorder.spans();
    expect(s?.status).toBe("ERROR");
    expect(s?.statusMessage).toBe("boom");
    expect(s?.exceptions).toHaveLength(2);
  });

  it("end() is idempotent", () => {
    const span = recorder.tracer.startSpan("continuation.work");
    span.end();
    span.end();
    span.end();
    expect(recorder.spans()[0]?.ended).toBe(true);
    // Still one span, not three.
    expect(recorder.spans()).toHaveLength(1);
  });

  it("spansByName filters by canonical name", () => {
    recorder.tracer.startSpan("continuation.work").end();
    recorder.tracer.startSpan("continuation.delegate.dispatch").end();
    recorder.tracer.startSpan("continuation.work").end();
    expect(recorder.spansByName("continuation.work")).toHaveLength(2);
    expect(recorder.spansByName("continuation.delegate.dispatch")).toHaveLength(1);
    expect(recorder.spansByName("nonexistent")).toHaveLength(0);
  });

  it("reset() clears recorded spans without un-installing the tracer", () => {
    recorder.tracer.startSpan("continuation.work").end();
    expect(recorder.spans()).toHaveLength(1);
    recorder.reset();
    expect(recorder.spans()).toHaveLength(0);
    // Tracer still works.
    recorder.tracer.startSpan("continuation.work").end();
    expect(recorder.spans()).toHaveLength(1);
  });

  it("spans() returns a defensive copy; mutations don't leak", () => {
    recorder.tracer.startSpan("continuation.work", {
      attributes: { "chain.id": "abc" },
    }).end();
    const snap1 = recorder.spans();
    // Try to mutate via the snapshot.
    (snap1[0] as unknown as { name: string }).name = "MUTATED";
    const snap2 = recorder.spans();
    expect(snap2[0]?.name).toBe("continuation.work");
  });
});

describe("in-memory-span-recorder :: integration with emit* helpers (harness contract)", () => {
  // These exercises pin that the recorder captures the actual
  // continuation.* spans driven by the production emit* helpers — so
  // harness tests can use the recorder as a black-box span observer
  // and trust attribute shapes.

  it("emitContinuationWorkSpan stamps chain.id + chain.step.remaining (#366)", () => {
    emitContinuationWorkSpan({
      chainId: "chain-abc",
      chainStepRemaining: 5,
      delayMs: 0,
    });
    const spans = recorder.spansByName("continuation.work");
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes["chain.id"]).toBe("chain-abc");
    expect(spans[0]?.attributes["chain.step.remaining"]).toBe(5);
    expect(spans[0]?.status).toBe("OK");
    expect(spans[0]?.ended).toBe(true);
  });

  it("emitContinuationDelegateSpan stamps chain.id + delegate.delivery + delegate.mode (#366)", () => {
    // delivery: "timer" mirrors a scheduled (delayed) delegate dispatch.
    emitContinuationDelegateSpan({
      chainId: "chain-xyz",
      chainStepRemaining: 4,
      delivery: "timer",
      delegateMode: "silent-wake",
      delayMs: 1500,
    });
    const spans = recorder.spansByName("continuation.delegate.dispatch");
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes["chain.id"]).toBe("chain-xyz");
    expect(spans[0]?.attributes["delegate.delivery"]).toBe("timer");
    expect(spans[0]?.attributes["delegate.mode"]).toBe("silent-wake");
    expect(spans[0]?.attributes["delay.ms"]).toBe(1500);
  });

  it(
    "emitContinuationDelegateFireSpan carries fire.deferred_ms + persisted chain.id snapshot (#388 chunk 5b)",
    () => {
      emitContinuationDelegateFireSpan({
        chainId: "chain-fire",
        chainStepRemainingAtDispatch: 3,
        delegateMode: "silent-wake",
        delayMs: 1000,
        fireDeferredMs: 1234,
      });
      const spans = recorder.spansByName("continuation.delegate.fire");
      expect(spans).toHaveLength(1);
      const s = spans[0];
      expect(s?.attributes["chain.id"]).toBe("chain-fire");
      expect(s?.attributes["chain.step.remaining"]).toBe(3);
      expect(s?.attributes["fire.deferred_ms"]).toBe(1234);
      // Drift formula: drift = fire.deferred_ms − delay.ms (per chunk-5b/5c JSDoc).
      const drift =
        (s?.attributes["fire.deferred_ms"] as number) - (s?.attributes["delay.ms"] as number);
      expect(drift).toBe(234);
    },
  );
});
