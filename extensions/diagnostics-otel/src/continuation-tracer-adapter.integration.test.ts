import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { expect, test } from "vitest";
import type { DiagnosticEventPayload, DiagnosticTraceContext } from "../api.js";
import { createContinuationOtelTracerAdapter } from "./continuation-tracer-adapter.js";
import { createDiagnosticsTraceRuntime } from "./service-traces.js";

const OTEL_GLOBAL_API_KEY = Symbol.for("opentelemetry.js.api.1");

// A turn scope always descends from an ancestor span, so the tracked turn
// context never registers as a trace-id root in the exporter.
const TURN_ANCESTOR_SPAN_ID = "1111111111111111";
const PROOF_TURNS = [
  { traceSuffix: "01", spanDigit: "2" },
  { traceSuffix: "02", spanDigit: "3" },
] as const;

function diagnosticTurnTrace(turn: (typeof PROOF_TURNS)[number]): DiagnosticTraceContext {
  return {
    traceId: `0af7651916cd43dd8448eb211c8031${turn.traceSuffix}`,
    spanId: turn.spanDigit.repeat(16),
    parentSpanId: TURN_ANCESTOR_SPAN_ID,
    traceFlags: "01",
  };
}

function toolExecutionStartedEvent(traceContext: DiagnosticTraceContext): DiagnosticEventPayload {
  return {
    type: "tool.execution.started",
    ts: Date.now(),
    seq: 1,
    toolName: "continue_delegate",
    trace: traceContext,
  };
}

function expectTraceparent(traceparent: string | undefined): string {
  if (!traceparent) {
    throw new Error("expected a captured traceparent");
  }
  return traceparent;
}

function expectTurn<T>(turn: T | undefined): T {
  if (!turn) {
    throw new Error("expected a recorded turn");
  }
  return turn;
}

function registeredContextManager() {
  return (
    globalThis as unknown as Record<
      symbol,
      { context?: Parameters<typeof context.setGlobalContextManager>[0] } | undefined
    >
  )[OTEL_GLOBAL_API_KEY]?.context;
}

test("parents owned-provider spans from active and carried trace context", async () => {
  const originalContextManager = registeredContextManager();
  context.disable();
  const contextManager = new AsyncLocalStorageContextManager().enable();
  expect(context.setGlobalContextManager(contextManager)).toBe(true);

  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  try {
    const parent = provider.getTracer("test.parent").startSpan("parent");
    const parentContext = parent.spanContext();
    const continuationTracer = createContinuationOtelTracerAdapter({
      tracerProvider: provider,
    });

    context.with(trace.setSpan(context.active(), parent), () => {
      const activeChild = continuationTracer.startSpan("continuation.work");
      activeChild.end();
    });
    const carriedChild = continuationTracer.startSpan("continuation.work.fire", {
      traceparent: `00-${parentContext.traceId}-${parentContext.spanId}-01`,
    });
    carriedChild.end();
    parent.end();
    await provider.forceFlush();

    for (const name of ["continuation.work", "continuation.work.fire"]) {
      const child = exporter.getFinishedSpans().find((span) => span.name === name);
      expect(child?.spanContext().traceId).toBe(parentContext.traceId);
      expect(child?.parentSpanContext?.traceId).toBe(parentContext.traceId);
      expect(child?.parentSpanContext?.spanId).toBe(parentContext.spanId);
    }
  } finally {
    await provider.shutdown();
    if (registeredContextManager() !== originalContextManager) {
      context.disable();
      if (originalContextManager) {
        context.setGlobalContextManager(originalContextManager);
      }
    }
  }
});

// Simulates a full continue_delegate round trip against a real SDK: the
// originating tool span dispatches, the dispatch traceparent is serialized
// across the hop, and the far side re-enters from that string alone. The
// trusted-span registry is forced to resolve nothing because it is
// process-local and capacity-evicted, so it cannot be what keeps a delegate
// stitched. Regression guard for orphaned continuation spans.
test("keeps one trace across a continue_delegate out-and-back hop", async () => {
  const originalContextManager = registeredContextManager();
  context.disable();
  const contextManager = new AsyncLocalStorageContextManager().enable();
  expect(context.setGlobalContextManager(contextManager)).toBe(true);

  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  try {
    const continuationTracer = createContinuationOtelTracerAdapter({
      tracerProvider: provider,
      resolveSpanContext: () => undefined,
    });

    // Leaving: the continue_delegate tool call is the active span.
    const toolSpan = provider.getTracer("test.delegate").startSpan("continue_delegate.tool");
    const toolContext = toolSpan.spanContext();

    const carried = context.with(trace.setSpan(context.active(), toolSpan), () => {
      const dispatch = continuationTracer.startSpan("continuation.delegate.dispatch");
      const dispatchTraceparent = dispatch.traceparent?.();
      dispatch.end();
      return dispatchTraceparent;
    });
    toolSpan.end();

    expect(carried).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    expect(carried).toContain(toolContext.traceId);

    // Coming back: only the serialized traceparent survived the hop, and the
    // originating span is already ended and out of the active context.
    expect(carried).toBeDefined();
    const fire = continuationTracer.startSpan("continuation.delegate.fire", {
      traceparent: carried,
    });
    fire.end();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const dispatchSpan = spans.find((span) => span.name === "continuation.delegate.dispatch");
    const fireSpan = spans.find((span) => span.name === "continuation.delegate.fire");

    // One trace end to end.
    expect(dispatchSpan?.spanContext().traceId).toBe(toolContext.traceId);
    expect(fireSpan?.spanContext().traceId).toBe(toolContext.traceId);
    // Dispatch hangs off the originating tool span, and the far side hangs off
    // dispatch rather than starting a new root.
    expect(dispatchSpan?.parentSpanContext?.spanId).toBe(toolContext.spanId);
    expect(fireSpan?.parentSpanContext?.spanId).toBe(dispatchSpan?.spanContext().spanId);
  } finally {
    await provider.shutdown();
    if (registeredContextManager() !== originalContextManager) {
      context.disable();
      if (originalContextManager) {
        context.setGlobalContextManager(originalContextManager);
      }
    }
  }
});

// Typed continuation tools capture the traceparent their delayed dispatch/fire
// spans reconstruct from. Whichever diagnostic span id core hands the exporter
// is looked up in the trusted-span registry, so this exercises the real
// registry, the real adapter, and real SDK spans against both candidates.
test("keeps typed continuation dispatch and fire on the originating turn trace", async () => {
  const originalContextManager = registeredContextManager();
  context.disable();
  const contextManager = new AsyncLocalStorageContextManager().enable();
  expect(context.setGlobalContextManager(contextManager)).toBe(true);

  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  try {
    const traceRuntime = createDiagnosticsTraceRuntime(provider.getTracer("openclaw"));
    const continuationTracer = createContinuationOtelTracerAdapter({
      tracerProvider: provider,
      resolveSpanContext: traceRuntime.resolveTrustedSpanContext,
      resolveParentContext: traceRuntime.resolveTrustedParentContext,
    });

    // An earlier message trace is still the ambient OTEL context. That is the
    // state the reported cross-turn split fell back to.
    const olderTurnSpan = provider.getTracer("test.older-turn").startSpan("older.turn.message");
    const olderTurnContext = olderTurnSpan.spanContext();

    const turnTraceparents = PROOF_TURNS.map((turn) => {
      const turnTrace = diagnosticTurnTrace(turn);
      const toolSpan = traceRuntime.trackTrustedSpan(
        toolExecutionStartedEvent(turnTrace),
        { trusted: true },
        provider.getTracer("openclaw").startSpan("openclaw.tool.execution"),
      );
      // The tool runs while the older turn's span is still ambient.
      const captured = context.with(trace.setSpan(context.active(), olderTurnSpan), () => ({
        currentSpan: continuationTracer.formatTraceparent?.(turnTrace),
        ancestor: continuationTracer.formatTraceparent?.({
          traceId: turnTrace.traceId,
          spanId: TURN_ANCESTOR_SPAN_ID,
          traceFlags: turnTrace.traceFlags,
        }),
      }));
      return { captured, toolSpanContext: toolSpan.spanContext() };
    });

    // Delayed hop: dispatch and fire reconstruct from the carried string alone,
    // long after the tool span left the active context.
    const dispatch = continuationTracer.startSpan("continuation.delegate.dispatch", {
      traceparent: expectTraceparent(turnTraceparents[0]?.captured.currentSpan),
    });
    const dispatchTraceparent = dispatch.traceparent?.();
    dispatch.end();
    const fire = continuationTracer.startSpan("continuation.delegate.fire", {
      traceparent: expectTraceparent(dispatchTraceparent),
    });
    fire.end();
    const secondTurnDispatch = continuationTracer.startSpan("continuation.delegate.dispatch", {
      traceparent: expectTraceparent(turnTraceparents[1]?.captured.currentSpan),
    });
    secondTurnDispatch.end();
    olderTurnSpan.end();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const dispatchSpan = spans.find((span) => span.name === "continuation.delegate.dispatch");
    const fireSpan = spans.find((span) => span.name === "continuation.delegate.fire");
    const firstTurn = expectTurn(turnTraceparents[0]);
    const secondTurn = expectTurn(turnTraceparents[1]);

    // Tool, dispatch, and fire share the proof turn's trace.
    expect(dispatchSpan?.spanContext().traceId).toBe(firstTurn.toolSpanContext.traceId);
    expect(dispatchSpan?.parentSpanContext?.spanId).toBe(firstTurn.toolSpanContext.spanId);
    expect(fireSpan?.spanContext().traceId).toBe(firstTurn.toolSpanContext.traceId);
    expect(fireSpan?.parentSpanContext?.spanId).toBe(dispatchSpan?.spanContext().spanId);
    expect(dispatchSpan?.spanContext().traceId).not.toBe(olderTurnContext.traceId);

    // Consecutive turns stay on their own traces instead of accumulating.
    expect(secondTurn.toolSpanContext.traceId).not.toBe(firstTurn.toolSpanContext.traceId);
    expect(secondTurnDispatch.traceparent?.()).toContain(secondTurn.toolSpanContext.traceId);

    // The ancestor span id was never exported, so it resolves to nothing in the
    // registry and falls through to the ambient older turn — the defect this
    // capture change removes.
    for (const turn of [firstTurn, secondTurn]) {
      expect(turn.captured.ancestor).toContain(olderTurnContext.traceId);
      expect(turn.captured.ancestor).not.toContain(turn.toolSpanContext.traceId);
    }
  } finally {
    await provider.shutdown();
    if (registeredContextManager() !== originalContextManager) {
      context.disable();
      if (originalContextManager) {
        context.setGlobalContextManager(originalContextManager);
      }
    }
  }
});
