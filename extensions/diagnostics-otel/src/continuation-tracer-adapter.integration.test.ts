import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { expect, test } from "vitest";
import {
  parseDiagnosticTraceparent,
  type ContinuationTracer,
  type DiagnosticEventPayload,
  type DiagnosticTraceContext,
} from "../api.js";
import { createContinuationOtelTracerAdapter } from "./continuation-tracer-adapter.js";
import { createDiagnosticsTraceRuntime } from "./service-traces.js";

const OTEL_GLOBAL_API_KEY = Symbol.for("opentelemetry.js.api.1");

// One session keeps one diagnostic trace id across turns. The exporter remembers
// a trace-id root only for a context with no parent span, so the first turn's
// root message span becomes the answer for every later ancestor lookup on it.
const SESSION_DIAGNOSTIC_TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const OLDER_TURN_ROOT_SPAN_ID = "9999999999999999";
// A turn scope always descends from an ancestor span, so a tracked turn context
// never registers as a trace-id root itself.
const TURN_ANCESTOR_SPAN_ID = "1111111111111111";
const PROOF_TURN_SPAN_IDS = ["2222222222222222", "3333333333333333"] as const;

function olderTurnRootTrace(): DiagnosticTraceContext {
  return {
    traceId: SESSION_DIAGNOSTIC_TRACE_ID,
    spanId: OLDER_TURN_ROOT_SPAN_ID,
    traceFlags: "01",
  };
}

function diagnosticTurnTrace(spanId: string): DiagnosticTraceContext {
  return {
    traceId: SESSION_DIAGNOSTIC_TRACE_ID,
    spanId,
    parentSpanId: TURN_ANCESTOR_SPAN_ID,
    traceFlags: "01",
  };
}

function turnAncestorTrace(): DiagnosticTraceContext {
  return {
    traceId: SESSION_DIAGNOSTIC_TRACE_ID,
    spanId: TURN_ANCESTOR_SPAN_ID,
    traceFlags: "01",
  };
}

function trustedEvent(
  type: "message.received" | "tool.execution.started",
  traceContext: DiagnosticTraceContext,
): DiagnosticEventPayload {
  return type === "message.received"
    ? { type, ts: Date.now(), seq: 1, channel: "test", source: "test", trace: traceContext }
    : {
        type,
        ts: Date.now(),
        seq: 1,
        toolName: "continue_delegate",
        trace: traceContext,
      };
}

/**
 * Production never starts a delayed continuation span straight from the stored
 * string: `resolveContinuationTraceparent()` parses it and re-resolves it
 * through the same exporter formatter first, falling back to the parsed context
 * when the exporter resolves nothing.
 */
function reresolveCarriedTraceparent(
  continuationTracer: ContinuationTracer,
  carried: string | undefined,
): string {
  if (!carried) {
    throw new Error("expected a captured traceparent");
  }
  const parsed = parseDiagnosticTraceparent(carried);
  if (!parsed) {
    throw new Error(`expected a parseable traceparent, got ${carried}`);
  }
  return continuationTracer.formatTraceparent?.(parsed) ?? carried;
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

// Exporter-side characterization of the two capture candidates, against the real
// trusted-span registry, the real adapter, and real SDK spans. The pre-fix
// behavior lives here as a reproduction: the pre-fix-failing regression proof of
// the capture change itself is
// `src/agents/tools/continuation-tools.current-span-traceparent.test.ts`.
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

    // An earlier turn on this session already registered the trace-id root.
    const olderTurnRootSpan = traceRuntime.trackTrustedSpan(
      trustedEvent("message.received", olderTurnRootTrace()),
      { trusted: true },
      provider.getTracer("openclaw").startSpan("openclaw.message"),
    );
    const olderTurnContext = olderTurnRootSpan.spanContext();

    const proofTurns = PROOF_TURN_SPAN_IDS.map((spanId) => {
      const turnTrace = diagnosticTurnTrace(spanId);
      const toolSpan = traceRuntime.trackTrustedSpan(
        trustedEvent("tool.execution.started", turnTrace),
        { trusted: true },
        provider.getTracer("openclaw").startSpan("openclaw.tool.execution"),
      );
      return {
        captured: {
          currentSpan: continuationTracer.formatTraceparent?.(turnTrace),
          ancestor: continuationTracer.formatTraceparent?.(turnAncestorTrace()),
        },
        toolSpanContext: toolSpan.spanContext(),
      };
    });
    const firstTurn = expectTurn(proofTurns[0]);
    const secondTurn = expectTurn(proofTurns[1]);

    // Delayed hop: the stored string is re-resolved and reconstructed long after
    // the originating tool span left the active context.
    const dispatch = continuationTracer.startSpan("continuation.delegate.dispatch", {
      traceparent: reresolveCarriedTraceparent(continuationTracer, firstTurn.captured.currentSpan),
    });
    const dispatchTraceparent = dispatch.traceparent?.();
    dispatch.end();
    const fire = continuationTracer.startSpan("continuation.delegate.fire", {
      traceparent: reresolveCarriedTraceparent(continuationTracer, dispatchTraceparent),
    });
    fire.end();
    const secondTurnDispatch = continuationTracer.startSpan("continuation.delegate.dispatch", {
      traceparent: reresolveCarriedTraceparent(continuationTracer, secondTurn.captured.currentSpan),
    });
    const secondTurnDispatchTraceparent = secondTurnDispatch.traceparent?.();
    secondTurnDispatch.end();
    olderTurnRootSpan.end();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const dispatchSpan = spans.find((span) => span.name === "continuation.delegate.dispatch");
    const fireSpan = spans.find((span) => span.name === "continuation.delegate.fire");

    // Tool, dispatch, and fire share the proof turn's trace.
    expect(dispatchSpan?.spanContext().traceId).toBe(firstTurn.toolSpanContext.traceId);
    expect(dispatchSpan?.parentSpanContext?.spanId).toBe(firstTurn.toolSpanContext.spanId);
    expect(fireSpan?.spanContext().traceId).toBe(firstTurn.toolSpanContext.traceId);
    expect(fireSpan?.parentSpanContext?.spanId).toBe(dispatchSpan?.spanContext().spanId);
    expect(dispatchSpan?.spanContext().traceId).not.toBe(olderTurnContext.traceId);

    // Consecutive turns stay on their own traces instead of accumulating.
    expect(secondTurn.toolSpanContext.traceId).not.toBe(firstTurn.toolSpanContext.traceId);
    expect(secondTurnDispatchTraceparent).toContain(secondTurn.toolSpanContext.traceId);

    // Reproduction: the ancestor span id is in no registry tier, so every turn
    // resolves to the session's remembered trace-id root — the older message
    // trace the reported dispatch/fire spans accumulated on.
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
