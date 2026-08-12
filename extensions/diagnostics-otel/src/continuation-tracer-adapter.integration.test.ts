import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { runWithDiagnosticTraceContext } from "openclaw/plugin-sdk/plugin-test-runtime";
import { expect, test } from "vitest";
// Test-only crossing into core. The invariant under test spans both packages —
// core decides which span a typed continuation tool captures, this plugin
// decides what that captured id resolves to — so proving it needs the real
// halves on both sides. Plugin production code stays on `openclaw/plugin-sdk/*`.
import {
  createContinueWorkTool,
  type ContinueWorkRequest,
} from "../../../src/agents/tools/continue-work-tool.js";
import {
  emitContinuationWorkFireSpan,
  emitContinuationWorkSpan,
  resolveContinuationTraceparent,
} from "../../../src/infra/continuation-tracer.js";
import {
  parseDiagnosticTraceparent,
  resetContinuationTracer,
  setContinuationTracer,
  type ContinuationTracer,
  type DiagnosticEventPayload,
  type DiagnosticTraceContext,
} from "../api.js";
import { createContinuationOtelTracerAdapter } from "./continuation-tracer-adapter.js";
import { createDiagnosticsTraceRuntime } from "./service-traces.js";

const OTEL_GLOBAL_API_KEY = Symbol.for("opentelemetry.js.api.1");

// When turns share one diagnostic trace id, the exporter remembers a trace-id
// root only for a context with no parent span, so the first turn's root message
// span becomes the answer for every later ancestor lookup on that trace id.
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
 * The event that opens the harness/run span the typed tool executes inside.
 * `service-recorders-harness.ts::recordHarnessRunStarted` tracks exactly this
 * event as a trusted span, which is what makes the run's own span id resolvable.
 */
function harnessRunStartedEvent(
  runId: string,
  traceContext: DiagnosticTraceContext,
): DiagnosticEventPayload {
  return {
    type: "harness.run.started",
    ts: Date.now(),
    seq: 1,
    runId,
    harnessId: "openclaw",
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
// trusted-span registry, the real adapter, and real SDK spans. It composes the
// two candidate contexts directly, so it is a reproduction of the exporter's
// answer to each — not the typed-tool boundary proof. The complete in-process
// seam (core capture through this adapter) is the final test in this file, and
// the core-side helper-selection proof is
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

const CONTINUATION_WORK_SESSION_KEY = "agent:main:otel-boundary";
const CONTINUATION_TURN_PLANS = [
  { chainId: "chain-turn-one", spanId: PROOF_TURN_SPAN_IDS[0] },
  { chainId: "chain-turn-two", spanId: PROOF_TURN_SPAN_IDS[1] },
] as const;

/**
 * Drives one production turn end to end against the installed adapter:
 * a tracked harness/run span, the run context bound in async-local storage,
 * a real `continue_work` invocation, then the production dispatch and fire
 * emitters fed by whatever that invocation persisted.
 */
async function runContinuationTurnThroughInstalledTracer(params: {
  traceRuntime: ReturnType<typeof createDiagnosticsTraceRuntime>;
  tracer: ReturnType<BasicTracerProvider["getTracer"]>;
  runTrace: DiagnosticTraceContext;
  chainId: string;
}) {
  const harnessSpan = params.traceRuntime.trackTrustedSpan(
    harnessRunStartedEvent(params.chainId, params.runTrace),
    { trusted: true },
    params.tracer.startSpan("openclaw.harness.run"),
  );

  const requests: ContinueWorkRequest[] = [];
  const tool = createContinueWorkTool({
    agentSessionKey: CONTINUATION_WORK_SESSION_KEY,
    requestContinuation: (request) => requests.push(request),
  });
  await runWithDiagnosticTraceContext(params.runTrace, () =>
    tool.execute("call-1", { reason: "finish this turn's follow-up work" }),
  );
  const request = requests.at(0);
  if (!request) {
    throw new Error("expected continue_work to record a continuation request");
  }

  // Dispatch carries the persisted string as `work-dispatch.ts` does; fire
  // re-resolves it through the adapter as `work-dispatch-execution.ts` does.
  const fireTraceparent = resolveContinuationTraceparent(request.traceparent);
  emitContinuationWorkSpan({
    chainId: params.chainId,
    chainStepRemaining: 4,
    delayMs: 0,
    reason: request.reason,
    ...(request.traceparent !== undefined ? { traceparent: request.traceparent } : {}),
  });
  emitContinuationWorkFireSpan({
    chainId: params.chainId,
    chainStepRemainingAtDispatch: 4,
    delayMs: 0,
    fireDeferredMs: 0,
    reason: request.reason,
    ...(fireTraceparent !== undefined ? { traceparent: fireTraceparent } : {}),
  });

  return { harnessSpanContext: harnessSpan.spanContext(), persisted: request.traceparent };
}

// The complete in-process seam in one case: core's typed-tool capture running
// under the real diagnostics-otel adapter installed through
// `setContinuationTracer`, with the run context bound in async-local storage the
// way `agents/harness` and `agents/cli-runner` bind it. Nothing here hand-builds
// a traceparent — the tool persists whatever production resolves, and dispatch
// and fire re-enter from that stored string. The run scope's `parentSpanId` is
// the session's older remembered trace-id root, so capturing the ancestor
// instead of the current span is exactly what pulled the reported dispatch/fire
// spans onto an older message trace and accumulated later turns there.
test("keeps a typed continuation tool's dispatch and fire on its executing turn's trace", async () => {
  const originalContextManager = registeredContextManager();
  context.disable();
  const contextManager = new AsyncLocalStorageContextManager().enable();
  expect(context.setGlobalContextManager(contextManager)).toBe(true);

  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  try {
    const tracer = provider.getTracer("openclaw");
    const traceRuntime = createDiagnosticsTraceRuntime(tracer);
    setContinuationTracer(
      createContinuationOtelTracerAdapter({
        tracerProvider: provider,
        resolveSpanContext: traceRuntime.resolveTrustedSpanContext,
        resolveParentContext: traceRuntime.resolveTrustedParentContext,
      }),
    );

    // An earlier turn on this session already registered the trace-id root, and
    // its span id is what every later run scope names as its ancestor.
    const olderTurnRootSpan = traceRuntime.trackTrustedSpan(
      trustedEvent("message.received", olderTurnRootTrace()),
      { trusted: true },
      tracer.startSpan("openclaw.message"),
    );
    const olderTurnContext = olderTurnRootSpan.spanContext();

    const turns = [];
    for (const plan of CONTINUATION_TURN_PLANS) {
      turns.push(
        await runContinuationTurnThroughInstalledTracer({
          traceRuntime,
          tracer,
          runTrace: {
            traceId: SESSION_DIAGNOSTIC_TRACE_ID,
            spanId: plan.spanId,
            parentSpanId: OLDER_TURN_ROOT_SPAN_ID,
            traceFlags: "01",
          },
          chainId: plan.chainId,
        }),
      );
    }
    const firstTurn = expectTurn(turns[0]);
    const secondTurn = expectTurn(turns[1]);
    olderTurnRootSpan.end();
    await provider.forceFlush();

    const spanFor = (chainId: string, name: string) =>
      exporter
        .getFinishedSpans()
        .find((span) => span.name === name && span.attributes["chain.id"] === chainId);

    const [firstPlan, secondPlan] = CONTINUATION_TURN_PLANS;
    const dispatchSpan = spanFor(firstPlan.chainId, "continuation.work");
    const fireSpan = spanFor(firstPlan.chainId, "continuation.work.fire");
    const secondDispatchSpan = spanFor(secondPlan.chainId, "continuation.work");
    expect([dispatchSpan?.name, fireSpan?.name, secondDispatchSpan?.name]).toEqual([
      "continuation.work",
      "continuation.work.fire",
      "continuation.work",
    ]);

    // The tool captured its own turn, and both continuation spans landed on it.
    // Ordered so a regression names the older remembered root it fell back to
    // before it reports the span it should have captured.
    for (const turn of [firstTurn, secondTurn]) {
      expect(turn.persisted).not.toContain(olderTurnContext.traceId);
    }
    expect(firstTurn.persisted).toBe(
      `00-${firstTurn.harnessSpanContext.traceId}-${firstTurn.harnessSpanContext.spanId}-01`,
    );
    for (const span of [dispatchSpan, fireSpan]) {
      expect(span?.spanContext().traceId).toBe(firstTurn.harnessSpanContext.traceId);
      expect(span?.parentSpanContext?.spanId).toBe(firstTurn.harnessSpanContext.spanId);
    }
    expect(dispatchSpan?.spanContext().traceId).not.toBe(olderTurnContext.traceId);

    // Consecutive turns export separate traces instead of accumulating on the
    // ancestor both run scopes name.
    expect(secondTurn.harnessSpanContext.traceId).not.toBe(firstTurn.harnessSpanContext.traceId);
    expect(secondDispatchSpan?.spanContext().traceId).toBe(secondTurn.harnessSpanContext.traceId);
    expect(secondDispatchSpan?.spanContext().traceId).not.toBe(dispatchSpan?.spanContext().traceId);
  } finally {
    resetContinuationTracer();
    await provider.shutdown();
    if (registeredContextManager() !== originalContextManager) {
      context.disable();
      if (originalContextManager) {
        context.setGlobalContextManager(originalContextManager);
      }
    }
  }
});
