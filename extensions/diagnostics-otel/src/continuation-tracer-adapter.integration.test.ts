import { context, metrics, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { runWithDiagnosticTraceContext } from "openclaw/plugin-sdk/plugin-test-runtime";
import { expect, test } from "vitest";
// Test-only crossing into core. The invariant under test spans both packages —
// core decides which span a typed continuation tool captures, schedules the
// durable wake, and fires it, while this plugin decides what the captured id
// resolves to — so proving it needs the real halves on both sides. Plugin
// production code stays on `openclaw/plugin-sdk/*`.
import {
  createContinueWorkTool,
  type ContinueWorkRequest,
} from "../../../src/agents/tools/continue-work-tool.js";
import type { ContinuationRuntimeConfig } from "../../../src/auto-reply/continuation/types.js";
import { executePendingContinuationWork } from "../../../src/auto-reply/continuation/work-dispatch-execution.js";
import {
  classifyContinuationWorkReason,
  resetContinuationWorkDispatchForTests,
  scheduleContinuationWorkBatch,
} from "../../../src/auto-reply/continuation/work-dispatch.js";
import { decodeWorkState } from "../../../src/auto-reply/continuation/work-flow-state.js";
import { consumePendingWork } from "../../../src/auto-reply/continuation/work-store.js";
import { resetSystemEventsForTest } from "../../../src/infra/system-events.js";
import { listTaskFlowsForOwnerKey } from "../../../src/tasks/task-flow-runtime-internal.js";
import { resetTaskFlowRegistryForTests } from "../../../src/tasks/task-runtime.test-helpers.js";
import {
  parseDiagnosticTraceparent,
  resetContinuationTracer,
  setContinuationTracer,
  type ContinuationTracer,
  type DiagnosticEventMetadata,
  type DiagnosticEventPayload,
  type DiagnosticTraceContext,
} from "../api.js";
import { createContinuationOtelTracerAdapter } from "./continuation-tracer-adapter.js";
import { resolveContentCapturePolicy } from "./service-content-normalization.js";
import { createDiagnosticsMetrics } from "./service-metrics.js";
import { createDiagnosticsRecorderRuntime } from "./service-recorder-runtime.js";
import { createHarnessRecorders } from "./service-recorders-harness.js";
import { createUsageRecorders } from "./service-recorders-usage.js";
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

type DiagnosticEventOfType<T extends DiagnosticEventPayload["type"]> = Extract<
  DiagnosticEventPayload,
  { type: T }
>;

const TRUSTED_EVENT_METADATA: DiagnosticEventMetadata = { trusted: true };

/**
 * The pair that opens and closes an earlier turn's root message span.
 * `service-recorders-usage.ts` starts `openclaw.message.processed` on dispatch
 * and completes it on `message.processed`; a parentless trace context is what
 * makes the exporter remember it as the trace id's root, and completing it is
 * what leaves it retained rather than active.
 */
function messageDispatchStartedEvent(
  traceContext: DiagnosticTraceContext,
): DiagnosticEventOfType<"message.dispatch.started"> {
  return {
    type: "message.dispatch.started",
    ts: Date.now(),
    seq: 1,
    channel: "test",
    source: "test",
    trace: traceContext,
  };
}

function messageProcessedEvent(
  traceContext: DiagnosticTraceContext,
): DiagnosticEventOfType<"message.processed"> {
  return {
    type: "message.processed",
    ts: Date.now(),
    seq: 2,
    channel: "test",
    outcome: "completed",
    durationMs: 1,
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
): DiagnosticEventOfType<"harness.run.started"> {
  return {
    type: "harness.run.started",
    ts: Date.now(),
    seq: 3,
    runId,
    harnessId: "openclaw",
    trace: traceContext,
  };
}

function harnessRunCompletedEvent(
  runId: string,
  traceContext: DiagnosticTraceContext,
): DiagnosticEventOfType<"harness.run.completed"> {
  return {
    type: "harness.run.completed",
    ts: Date.now(),
    seq: 4,
    runId,
    harnessId: "openclaw",
    durationMs: 1,
    outcome: "completed",
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
  { chainId: "chain-turn-one", runId: "run-turn-one", spanId: PROOF_TURN_SPAN_IDS[0] },
  { chainId: "chain-turn-two", runId: "run-turn-two", spanId: PROOF_TURN_SPAN_IDS[1] },
] as const;

const CONTINUATION_RUNTIME_CONFIG: ContinuationRuntimeConfig = {
  enabled: true,
  defaultDelayMs: 0,
  minDelayMs: 0,
  maxDelayMs: 1_000,
  maxChainLength: 8,
  costCapTokens: 1_000_000,
  maxDelegatesPerTurn: 5,
  maxPendingWork: 4,
  crossSessionTargeting: "disabled",
};

// `executionPolicyForWork()` derives this from runtime config; the wake path
// under test never branches on the retry knobs, so only the reason category is
// taken from production's classifier.
const CONTINUATION_RETRY_POLICY = {
  busyRetryDelayMs: 1_000,
  idleRetryHedgeMs: 1_000,
  mainCommandLane: "main",
} as const;

/**
 * Mirrors `service.ts::start()`: the same trace runtime, recorder set, and
 * continuation adapter the plugin installs in production, pointed at an
 * in-memory span exporter (metrics land on the API's no-op meter — only spans
 * are under test). Building it here rather than tracking spans by hand is the
 * point: parent selection for the message root and the harness/run span has to
 * be production's, not the test's.
 */
function installProductionDiagnostics(provider: BasicTracerProvider) {
  const traces = createDiagnosticsTraceRuntime(provider.getTracer("openclaw"));
  const recorderRuntime = createDiagnosticsRecorderRuntime({
    contentCapturePolicy: resolveContentCapturePolicy(undefined),
    metrics: createDiagnosticsMetrics(metrics.getMeter("openclaw")),
    traces,
    tracesEnabled: true,
  });
  setContinuationTracer(
    createContinuationOtelTracerAdapter({
      tracerProvider: provider,
      resolveSpanContext: traces.resolveTrustedSpanContext,
      resolveParentContext: traces.resolveTrustedParentContext,
    }),
  );
  return {
    traces,
    recorders: {
      ...createUsageRecorders(recorderRuntime),
      ...createHarnessRecorders(recorderRuntime),
    },
  };
}

function exportedSpans(exporter: InMemorySpanExporter, name: string) {
  return exporter.getFinishedSpans().filter((span) => span.name === name);
}

function spanForChain(exporter: InMemorySpanExporter, name: string, chainId: string) {
  const span = exportedSpans(exporter, name).find(
    (candidate) => candidate.attributes["chain.id"] === chainId,
  );
  if (!span) {
    throw new Error(`expected an exported ${name} span for chain ${chainId}`);
  }
  return span;
}

/** The traceparent the durable row carries, read back through production's decoder. */
function durableQueuedWorkTraceparent(sessionKey: string): string | undefined {
  const queued = listTaskFlowsForOwnerKey(sessionKey).find((flow) => flow.status === "queued");
  return queued ? decodeWorkState(queued)?.traceparent : undefined;
}

/**
 * One production turn, end to end, with nothing hand-built: the recorder opens
 * the harness/run span, the run's diagnostic context is bound the way
 * `agents/harness` binds it, a real `continue_work` call runs inside it, and
 * whatever that call persisted is handed to the real scheduler. The run then
 * ends — a wake matures after its electing turn — and the durable row is
 * claimed and executed by the production path that emits `.fire`.
 */
async function runProductionContinuationTurn(params: {
  exporter: InMemorySpanExporter;
  recorders: ReturnType<typeof installProductionDiagnostics>["recorders"];
  plan: (typeof CONTINUATION_TURN_PLANS)[number];
}) {
  const runTrace: DiagnosticTraceContext = {
    traceId: SESSION_DIAGNOSTIC_TRACE_ID,
    spanId: params.plan.spanId,
    // The ancestor the run scope names is a logical turn span id that no
    // recorder ever tracked — the shape that sends an ancestor capture into
    // `firstTrustedSpanContextForTraceId`.
    parentSpanId: TURN_ANCESTOR_SPAN_ID,
    traceFlags: "01",
  };
  params.recorders.recordHarnessRunStarted(
    harnessRunStartedEvent(params.plan.runId, runTrace),
    TRUSTED_EVENT_METADATA,
  );

  const requests: ContinueWorkRequest[] = [];
  const tool = createContinueWorkTool({
    agentSessionKey: CONTINUATION_WORK_SESSION_KEY,
    requestContinuation: (request) => requests.push(request),
  });
  await runWithDiagnosticTraceContext(runTrace, () =>
    tool.execute("call-1", { reason: "finish this turn's follow-up work" }),
  );

  const batch = await scheduleContinuationWorkBatch({
    sessionKey: CONTINUATION_WORK_SESSION_KEY,
    chainState: {
      currentChainCount: 0,
      chainStartedAt: Date.now(),
      accumulatedChainTokens: 0,
      chainId: params.plan.chainId,
    },
    requests,
    config: CONTINUATION_RUNTIME_CONFIG,
  });
  if (batch.scheduledCount !== 1) {
    throw new Error(`expected one scheduled continuation wake, got ${batch.scheduledCount}`);
  }
  const durableTraceparent = durableQueuedWorkTraceparent(CONTINUATION_WORK_SESSION_KEY);

  params.recorders.recordHarnessRunCompleted(
    harnessRunCompletedEvent(params.plan.runId, runTrace),
    TRUSTED_EVENT_METADATA,
    {},
  );
  const runSpan = exportedSpans(params.exporter, "openclaw.harness.run").at(-1);
  if (!runSpan) {
    throw new Error("expected the recorder to export this turn's harness run span");
  }

  const [claimed] = consumePendingWork(CONTINUATION_WORK_SESSION_KEY);
  if (!claimed) {
    throw new Error("expected the durable continuation row to be claimable");
  }
  // Emits `continuation.work.fire` before it tries to drive the turn. The turn
  // itself cannot run here (no session entry), which is why nothing further
  // needs mocking: the wake terminalizes after the span is already exported.
  await executePendingContinuationWork(claimed, {
    ...CONTINUATION_RETRY_POLICY,
    reasonCategory: classifyContinuationWorkReason(claimed.reason),
  });

  return {
    runSpanContext: runSpan.spanContext(),
    persisted: claimed.traceparent,
    durableTraceparent,
  };
}

// The complete in-process seam in one case, with no hand-built span, no
// hand-built traceparent, and no hand-called span emitter. The production
// recorder opens and completes an earlier turn's root message span, so the
// exporter remembers it for this session's diagnostic trace id; every later run
// scope names a logical ancestor that is in no registry tier. Capturing that
// ancestor therefore resolves through `firstTrustedSpanContextForTraceId` to the
// older remembered root, which is what pulled the reported dispatch/fire spans
// onto an older message trace and accumulated consecutive turns there. Capturing
// the live current span resolves exactly, so each turn's wake stays on the run
// that elected it.
test("keeps a typed continuation tool's dispatch and fire on its executing turn's span", async () => {
  const originalContextManager = registeredContextManager();
  context.disable();
  const contextManager = new AsyncLocalStorageContextManager().enable();
  expect(context.setGlobalContextManager(contextManager)).toBe(true);

  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  resetTaskFlowRegistryForTests({ persist: false });
  const { traces, recorders } = installProductionDiagnostics(provider);
  try {
    // An earlier turn on this session opens and finishes its root message span.
    const olderRootTrace = olderTurnRootTrace();
    recorders.recordMessageDispatchStarted(
      messageDispatchStartedEvent(olderRootTrace),
      TRUSTED_EVENT_METADATA,
    );
    recorders.recordMessageProcessed(messageProcessedEvent(olderRootTrace), TRUSTED_EVENT_METADATA);
    const olderRootSpan = exportedSpans(exporter, "openclaw.message.processed").at(0);
    if (!olderRootSpan) {
      throw new Error("expected the recorder to export the older turn's root message span");
    }
    const olderRootSpanContext = olderRootSpan.spanContext();

    const turns = [];
    for (const plan of CONTINUATION_TURN_PLANS) {
      turns.push(await runProductionContinuationTurn({ exporter, recorders, plan }));
    }
    const firstTurn = expectTurn(turns[0]);
    const secondTurn = expectTurn(turns[1]);

    // Characterizes the miss the ancestor capture rode, through the same
    // resolver the adapter calls: the run scope's ancestor is in no active,
    // alias, or retained tier, so it falls through to the remembered trace-id
    // root. Read before teardown clears the registry.
    const ancestorResolution = traces.resolveTrustedSpanContext({
      traceId: SESSION_DIAGNOSTIC_TRACE_ID,
      spanId: TURN_ANCESTOR_SPAN_ID,
      traceFlags: "01",
    });
    await provider.forceFlush();

    // Ordered so a regression names the older remembered root it fell back to
    // before it reports the span it should have captured.
    expect(ancestorResolution?.spanId).toBe(olderRootSpanContext.spanId);
    expect(turns.map((turn) => parseDiagnosticTraceparent(turn.persisted)?.spanId)).not.toContain(
      olderRootSpanContext.spanId,
    );

    for (const [index, turn] of turns.entries()) {
      const plan = expectTurn(CONTINUATION_TURN_PLANS[index]);
      const expectedTraceparent = `00-${turn.runSpanContext.traceId}-${turn.runSpanContext.spanId}-01`;
      // The tool captured its executing run, and the durable row kept it.
      expect(turn.persisted).toBe(expectedTraceparent);
      expect(turn.durableTraceparent).toBe(expectedTraceparent);
      // Production dispatch and fire both re-entered from that stored string.
      for (const name of ["continuation.work", "continuation.work.fire"]) {
        const span = spanForChain(exporter, name, plan.chainId);
        expect(span.spanContext().traceId).toBe(turn.runSpanContext.traceId);
        expect(span.parentSpanContext?.spanId).toBe(turn.runSpanContext.spanId);
      }
    }

    // Consecutive turns stay on their own run span instead of accumulating on
    // the ancestor both run scopes name.
    expect(secondTurn.runSpanContext.spanId).not.toBe(firstTurn.runSpanContext.spanId);
    expect(secondTurn.persisted).not.toBe(firstTurn.persisted);
  } finally {
    resetContinuationTracer();
    resetContinuationWorkDispatchForTests();
    resetTaskFlowRegistryForTests({ persist: false });
    // The ungranted wake enqueues a real continuation warning; drop it so the
    // module-level session queue stays clean for a non-isolated runner.
    resetSystemEventsForTest();
    traces.stopActiveTrustedSpans();
    await provider.shutdown();
    if (registeredContextManager() !== originalContextManager) {
      context.disable();
      if (originalContextManager) {
        context.setGlobalContextManager(originalContextManager);
      }
    }
  }
});
