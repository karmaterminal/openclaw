// Diagnostics Otel tests cover continuation-tracer install/uninstall and parenting in the service plugin.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const telemetryState = vi.hoisted(() => {
  type TestSpanContext = {
    traceId: string;
    spanId: string;
    traceFlags: number;
  };
  const counters = new Map<string, { add: ReturnType<typeof vi.fn> }>();
  const histograms = new Map<string, { record: ReturnType<typeof vi.fn> }>();
  const spans: Array<{
    name: string;
    addEvent: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    setAttributes: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
    spanContext: ReturnType<typeof vi.fn<() => TestSpanContext>>;
  }> = [];
  const tracer = {
    startSpan: vi.fn((name: string, _opts?: unknown, _ctx?: unknown) => {
      const spanNumber = spans.length + 1;
      const spanId = spanNumber.toString(16).padStart(16, "0");
      const span = {
        addEvent: vi.fn(),
        end: vi.fn(),
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        spanContext: vi.fn<() => TestSpanContext>(() => ({
          traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
          spanId,
          traceFlags: 1,
        })),
      };
      spans.push({ name, ...span });
      return span;
    }),
    setSpanContext: vi.fn((_ctx: unknown, spanContext: unknown) => ({ spanContext })),
  };
  const meter = {
    createCounter: vi.fn((name: string) => {
      const counter = { add: vi.fn() };
      counters.set(name, counter);
      return counter;
    }),
    createHistogram: vi.fn((name: string) => {
      const histogram = { record: vi.fn() };
      histograms.set(name, histogram);
      return histogram;
    }),
  };
  return { counters, histograms, spans, tracer, meter };
});

const traceProviderCtor = vi.hoisted(() => vi.fn());
const traceProviderGetTracer = vi.hoisted(() => vi.fn(() => telemetryState.tracer));
const traceProviderShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const meterProviderCtor = vi.hoisted(() => vi.fn());
const meterProviderShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const diagWarn = vi.hoisted(() => vi.fn());
const detectResourcesMock = vi.hoisted(() =>
  vi.fn((_options: { detectors?: unknown[] }) => ({
    attributes: { "openclaw.test.detected": "1" },
    merge: vi.fn((configured: { attributes?: Record<string, unknown> }) => ({
      attributes: {
        "openclaw.test.detected": "1",
        ...configured.attributes,
      },
    })),
  })),
);
const logEmit = vi.hoisted(() => vi.fn());
const logShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const traceExporterCtor = vi.hoisted(() => vi.fn());
const metricExporterCtor = vi.hoisted(() => vi.fn());
const logExporterCtor = vi.hoisted(() => vi.fn());
const traceExporterExport = vi.hoisted(() => vi.fn());
const metricExporterExport = vi.hoisted(() => vi.fn());
const logExporterExport = vi.hoisted(() => vi.fn());
const traceExporterShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const metricExporterShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const logExporterShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const exporterForceFlush = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const logProcessorCtor = vi.hoisted(() => vi.fn());
const spanProcessorCtor = vi.hoisted(() => vi.fn());
const metricReaderCtor = vi.hoisted(() => vi.fn());
const ownedSdkRuntimeCleanup = vi.hoisted(() => vi.fn());
const registerOwnedSdkRuntimeMock = vi.hoisted(() => vi.fn(() => ownedSdkRuntimeCleanup));
const createNodeProxyAgentMock = vi.hoisted(() => vi.fn());
const unhandledRejectionHandlerState = vi.hoisted(() => {
  let handlers: Array<(reason: unknown) => boolean> = [];
  return {
    getHandlers: () => handlers,
    register: vi.fn((handler: (reason: unknown) => boolean) => {
      handlers.push(handler);
      return () => {
        handlers = handlers.filter((candidate) => candidate !== handler);
      };
    }),
    reset: () => {
      handlers = [];
    },
  };
});

vi.mock("@opentelemetry/api", async (importOriginal) => ({
  createNoopMeter: (await importOriginal<typeof import("@opentelemetry/api")>()).createNoopMeter,
  ROOT_CONTEXT: (await importOriginal<typeof import("@opentelemetry/api")>()).ROOT_CONTEXT,
  context: {
    active: () => ({}),
  },
  diag: {
    warn: diagWarn,
  },
  metrics: {
    getMeter: () => telemetryState.meter,
  },
  isSpanContextValid: () => true,
  trace: {
    getTracer: () => telemetryState.tracer,
    setSpanContext: telemetryState.tracer.setSpanContext,
  },
  TraceFlags: {
    NONE: 0,
    SAMPLED: 1,
  },
  SpanStatusCode: {
    ERROR: 2,
  },
  SpanKind: {
    CLIENT: 2,
  },
}));

vi.mock("./service-propagation.js", () => ({
  registerOwnedSdkRuntime: registerOwnedSdkRuntimeMock,
}));

vi.mock("@opentelemetry/exporter-metrics-otlp-proto", () => ({
  OTLPMetricExporter: function OTLPMetricExporter(options?: unknown) {
    metricExporterCtor(options);
    return {
      export: metricExporterExport,
      forceFlush: exporterForceFlush,
      shutdown: metricExporterShutdown,
    };
  },
}));

vi.mock("@opentelemetry/exporter-trace-otlp-proto", () => ({
  OTLPTraceExporter: function OTLPTraceExporter(options?: unknown) {
    traceExporterCtor(options);
    return {
      export: traceExporterExport,
      forceFlush: exporterForceFlush,
      shutdown: traceExporterShutdown,
    };
  },
}));

vi.mock("@opentelemetry/exporter-logs-otlp-proto", () => ({
  OTLPLogExporter: function OTLPLogExporter(options?: unknown) {
    logExporterCtor(options);
    return {
      export: logExporterExport,
      forceFlush: exporterForceFlush,
      shutdown: logExporterShutdown,
    };
  },
}));

vi.mock("openclaw/plugin-sdk/runtime-env", () => ({
  registerUnhandledRejectionHandler: unhandledRejectionHandlerState.register,
}));

vi.mock("openclaw/plugin-sdk/fetch-runtime", () => ({
  createNodeProxyAgent: createNodeProxyAgentMock,
}));

vi.mock("@opentelemetry/sdk-logs", () => ({
  BatchLogRecordProcessor: function BatchLogRecordProcessor(options?: unknown) {
    logProcessorCtor(options);
  },
  LoggerProvider: class {
    getLogger = vi.fn(() => ({
      emit: logEmit,
    }));
    shutdown = logShutdown;
  },
}));

vi.mock("@opentelemetry/sdk-metrics", () => ({
  MeterProvider: class {
    constructor(options?: unknown) {
      meterProviderCtor(options);
    }

    getMeter = () => telemetryState.meter;
    shutdown = meterProviderShutdown;
  },
  PeriodicExportingMetricReader: function PeriodicExportingMetricReader(options?: unknown) {
    metricReaderCtor(options);
  },
}));

vi.mock("@opentelemetry/sdk-trace-base", () => ({
  BasicTracerProvider: class {
    constructor(options?: unknown) {
      traceProviderCtor(options);
    }

    getTracer = traceProviderGetTracer;
    shutdown = traceProviderShutdown;
  },
  BatchSpanProcessor: function BatchSpanProcessor(exporter?: unknown, options?: unknown) {
    spanProcessorCtor(exporter, options);
  },
  ParentBasedSampler: function ParentBasedSampler() {},
  TraceIdRatioBasedSampler: function TraceIdRatioBasedSampler() {},
}));

vi.mock("@opentelemetry/resources", () => ({
  detectResources: detectResourcesMock,
  envDetector: { detector: "env" },
  hostDetector: { detector: "host" },
  osDetector: { detector: "os" },
  processDetector: { detector: "process" },
  serviceInstanceIdDetector: { detector: "serviceinstance" },
  resourceFromAttributes: vi.fn((attrs: Record<string, unknown>) => ({
    attributes: attrs,
    merge: vi.fn((other: unknown) => other ?? {}),
  })),
  Resource: function Resource(_value?: unknown) {
    // Constructor shape required by the mocked OpenTelemetry API.
  },
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
  ATTR_SERVICE_NAME: "service.name",
}));

import {
  emitTrustedDiagnosticEvent,
  resetDiagnosticEventsForTest,
} from "openclaw/plugin-sdk/diagnostic-runtime";
import { getContinuationTracer, noopTracer, resetContinuationTracer } from "../api.js";
import { CONTINUATION_OTEL_TRACER_NAME } from "./continuation-tracer-adapter.js";
import { resetContinuationTracerIfOwned } from "./continuation-tracer-ownership.js";
import { createDiagnosticsOtelService } from "./service.js";
import {
  CHILD_SPAN_ID,
  createOtelContext,
  OTEL_TEST_ENDPOINT,
  SPAN_ID,
  startOtelService,
  stopStartedOtelServices,
  TOOL_SPAN_ID,
  TRACE_ID,
} from "./service.test-helpers.js";

const OTEL_PROTOCOL_ENV_KEYS = [
  "OTEL_EXPORTER_OTLP_PROTOCOL",
  "OTEL_EXPORTER_OTLP_TRACES_PROTOCOL",
  "OTEL_EXPORTER_OTLP_METRICS_PROTOCOL",
  "OTEL_EXPORTER_OTLP_LOGS_PROTOCOL",
] as const;
const OTEL_PROVIDER_ENV_KEYS = [
  "OTEL_BSP_EXPORT_TIMEOUT",
  "OTEL_BSP_MAX_EXPORT_BATCH_SIZE",
  "OTEL_BSP_MAX_QUEUE_SIZE",
  "OTEL_BSP_SCHEDULE_DELAY",
  "OTEL_METRIC_EXPORT_INTERVAL",
  "OTEL_METRIC_EXPORT_TIMEOUT",
  "OTEL_NODE_EXPERIMENTAL_SDK_METRICS",
  "OTEL_NODE_RESOURCE_DETECTORS",
  "OTEL_SERVICE_NAME",
  "OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT",
  "OTEL_SPAN_ATTRIBUTE_PER_EVENT_COUNT_LIMIT",
  "OTEL_SPAN_ATTRIBUTE_PER_LINK_COUNT_LIMIT",
  "OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT",
  "OTEL_SPAN_EVENT_COUNT_LIMIT",
  "OTEL_SPAN_LINK_COUNT_LIMIT",
  "OTEL_TRACES_SAMPLER",
  "OTEL_TRACES_SAMPLER_ARG",
] as const;
const OTEL_CERT_ENV_KEYS = [
  "OTEL_EXPORTER_OTLP_CERTIFICATE",
  "OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE",
  "OTEL_EXPORTER_OTLP_CLIENT_KEY",
  "OTEL_EXPORTER_OTLP_TRACES_CERTIFICATE",
  "OTEL_EXPORTER_OTLP_TRACES_CLIENT_CERTIFICATE",
  "OTEL_EXPORTER_OTLP_TRACES_CLIENT_KEY",
  "OTEL_EXPORTER_OTLP_METRICS_CERTIFICATE",
  "OTEL_EXPORTER_OTLP_METRICS_CLIENT_CERTIFICATE",
  "OTEL_EXPORTER_OTLP_METRICS_CLIENT_KEY",
  "OTEL_EXPORTER_OTLP_LOGS_CERTIFICATE",
  "OTEL_EXPORTER_OTLP_LOGS_CLIENT_CERTIFICATE",
  "OTEL_EXPORTER_OTLP_LOGS_CLIENT_KEY",
] as const;
const OTEL_ENV_KEYS = [
  "OPENCLAW_OTEL_PRELOADED",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
  "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
  "OTEL_SEMCONV_STABILITY_OPT_IN",
  "OTEL_SDK_DISABLED",
  "OTEL_PROPAGATORS",
  ...OTEL_PROTOCOL_ENV_KEYS,
  ...OTEL_PROVIDER_ENV_KEYS,
  ...OTEL_CERT_ENV_KEYS,
];
const originalOtelEnv = new Map(OTEL_ENV_KEYS.map((key) => [key, process.env[key]]));

function startedSpanCall(name: string) {
  const calls = telemetryState.tracer.startSpan.mock.calls as unknown as Array<
    [
      string,
      { attributes?: Record<string, unknown>; kind?: unknown; startTime?: unknown }?,
      unknown?,
    ]
  >;
  return calls.find(([spanName]) => spanName === name);
}

function mockCall(mock: { mock: { calls: unknown[][] } }, callIndex = 0): unknown[] {
  const call = mock.mock.calls.at(callIndex);
  if (!call) {
    throw new Error(`Expected mock call at index ${callIndex}`);
  }
  return call;
}

function mockCallArg(mock: { mock: { calls: unknown[][] } }, argIndex: number, callIndex = 0) {
  return mockCall(mock, callIndex)[argIndex];
}

function flushDiagnosticEvents() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

type OtelServiceOptions = NonNullable<Parameters<typeof startOtelService>[0]>;
type OtelSignal = "traces" | "metrics" | "logs";

function startServiceFixture(
  signals: readonly OtelSignal[],
  optionsOrConfigure:
    | Omit<OtelServiceOptions, OtelSignal>
    | NonNullable<OtelServiceOptions["configure"]> = {},
) {
  const options =
    typeof optionsOrConfigure === "function"
      ? { configure: optionsOrConfigure }
      : optionsOrConfigure;
  return startOtelService({
    traces: signals.includes("traces"),
    metrics: signals.includes("metrics"),
    logs: signals.includes("logs"),
    ...options,
  });
}

describe("diagnostics-otel service", () => {
  beforeAll(() => {
    // The continuation-tracer registry is a process-wide singleton shared across
    // module identities. A test file that ran earlier in this worker can leave
    // its own module instance's noop tracer installed, so start from this file's.
    resetContinuationTracer();
  });

  beforeEach(() => {
    resetDiagnosticEventsForTest();
    for (const key of OTEL_ENV_KEYS) {
      delete process.env[key];
    }
    telemetryState.counters.clear();
    telemetryState.histograms.clear();
    telemetryState.spans.length = 0;
    telemetryState.tracer.startSpan.mockClear();
    telemetryState.tracer.setSpanContext.mockClear();
    telemetryState.meter.createCounter.mockClear();
    telemetryState.meter.createHistogram.mockClear();
    traceProviderCtor.mockClear();
    traceProviderGetTracer.mockClear();
    traceProviderShutdown.mockClear();
    meterProviderCtor.mockClear();
    meterProviderShutdown.mockClear();
    diagWarn.mockClear();
    logEmit.mockReset();
    logShutdown.mockClear();
    traceExporterCtor.mockClear();
    metricExporterCtor.mockClear();
    logExporterCtor.mockClear();
    traceExporterExport.mockReset();
    metricExporterExport.mockReset();
    logExporterExport.mockReset();
    traceExporterShutdown.mockReset();
    traceExporterShutdown.mockResolvedValue(undefined);
    metricExporterShutdown.mockReset();
    metricExporterShutdown.mockResolvedValue(undefined);
    logExporterShutdown.mockReset();
    logExporterShutdown.mockResolvedValue(undefined);
    exporterForceFlush.mockReset();
    exporterForceFlush.mockResolvedValue(undefined);
    logProcessorCtor.mockClear();
    spanProcessorCtor.mockClear();
    metricReaderCtor.mockClear();
    ownedSdkRuntimeCleanup.mockClear();
    registerOwnedSdkRuntimeMock.mockClear();
    registerOwnedSdkRuntimeMock.mockReturnValue(ownedSdkRuntimeCleanup);
    createNodeProxyAgentMock.mockReset();
    createNodeProxyAgentMock.mockReturnValue(undefined);
    unhandledRejectionHandlerState.reset();
    unhandledRejectionHandlerState.register.mockClear();
  });

  afterEach(async () => {
    await stopStartedOtelServices();
    resetDiagnosticEventsForTest();
    for (const [key, value] of originalOtelEnv) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  // Retained after #158714 removed this case: it carries the
  // continuation-tracer invariant (a rejected traces protocol leaves the
  // continuation tracer a no-op).
  test("keeps rejected traces disabled when metrics still start owned SDK", async () => {
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "http/protobuf";
    process.env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL = "grpc";
    process.env.OTEL_EXPORTER_OTLP_METRICS_PROTOCOL = "http/protobuf";
    const registerBridge = vi.fn(() => vi.fn());

    const { ctx } = await startServiceFixture(["traces", "metrics"], (context) => {
      delete context.config.diagnostics?.otel?.protocol;
      context.internalDiagnostics = {
        ...context.internalDiagnostics!,
        registerTracePropagationBridge: registerBridge,
      };
    });

    expect(traceExporterCtor).not.toHaveBeenCalled();
    expect(metricExporterCtor).toHaveBeenCalledTimes(1);
    expect(traceProviderCtor).not.toHaveBeenCalled();
    expect((mockCallArg(meterProviderCtor, 0) as { readers?: unknown[] }).readers).toHaveLength(1);
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      "diagnostics-otel: unsupported traces protocol grpc; OTLP export disabled",
    );
    expect(registerBridge).not.toHaveBeenCalled();
    expect(getContinuationTracer()).toBe(noopTracer);
  });

  // Production wiring assertion: `start` installs the OTEL adapter and `stop`
  // resets to the noop default so span emission reaches the configured exporter.
  describe("continuation-tracer install/uninstall", () => {
    afterEach(() => {
      // Defense-in-depth: ensure no test in this describe block leaks a
      // non-noop tracer into the rest of the suite (or into other test
      // files in the same vitest worker, since `resetModules:false`).
      resetContinuationTracer();
    });

    test("installs the OTEL adapter on start when traces are enabled, resets on stop", async () => {
      expect(getContinuationTracer()).toBe(noopTracer);
      const service = createDiagnosticsOtelService();
      const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });
      await service.start(ctx);
      expect(getContinuationTracer()).not.toBe(noopTracer);
      expect(traceProviderGetTracer).toHaveBeenCalledWith("openclaw");
      expect(traceProviderGetTracer).toHaveBeenCalledWith(CONTINUATION_OTEL_TRACER_NAME);
      await service.stop?.(ctx);
      expect(getContinuationTracer()).toBe(noopTracer);
    });

    test("stale service cleanup does not reset a newer continuation tracer", async () => {
      expect(getContinuationTracer()).toBe(noopTracer);
      const firstService = createDiagnosticsOtelService();
      const secondService = createDiagnosticsOtelService();
      const firstContext = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });
      const secondContext = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });

      await firstService.start(firstContext);
      const firstTracer = getContinuationTracer();
      await secondService.start(secondContext);
      const secondTracer = getContinuationTracer();

      expect(firstTracer).not.toBe(noopTracer);
      expect(secondTracer).not.toBe(noopTracer);
      expect(secondTracer).not.toBe(firstTracer);

      await firstService.stop?.(firstContext);
      expect(getContinuationTracer()).toBe(secondTracer);

      await secondService.stop?.(secondContext);
      expect(getContinuationTracer()).toBe(noopTracer);
    });

    test("conditional reset preserves a newer continuation tracer owner", async () => {
      const firstService = createDiagnosticsOtelService();
      const secondService = createDiagnosticsOtelService();
      const firstContext = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });
      const secondContext = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });

      await firstService.start(firstContext);
      const firstTracer = getContinuationTracer();
      await secondService.start(secondContext);
      const secondTracer = getContinuationTracer();

      expect(resetContinuationTracerIfOwned(firstTracer)).toBe(false);
      expect(getContinuationTracer()).toBe(secondTracer);
      expect(resetContinuationTracerIfOwned(secondTracer)).toBe(true);
      expect(getContinuationTracer()).toBe(noopTracer);

      await firstService.stop?.(firstContext);
      await secondService.stop?.(secondContext);
    });

    test("parents continuation spans to registered trusted diagnostic spans", async () => {
      const service = createDiagnosticsOtelService();
      const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });
      await service.start(ctx);

      emitTrustedDiagnosticEvent({
        type: "run.started",
        runId: "run-1",
        provider: "openai",
        model: "gpt-5.5",
        trace: {
          traceId: TRACE_ID,
          spanId: CHILD_SPAN_ID,
          traceFlags: "01",
        },
      });
      await flushDiagnosticEvents();

      const runSpanId = telemetryState.spans.find((span) => span.name === "openclaw.run")
        ?.spanContext.mock.results[0]?.value?.spanId;
      expect(
        getContinuationTracer().formatTraceparent?.({
          traceId: TRACE_ID,
          spanId: CHILD_SPAN_ID,
          traceFlags: "01",
        }),
      ).toBe(`00-${TRACE_ID}-${runSpanId}-01`);
      telemetryState.tracer.startSpan.mockClear();
      telemetryState.tracer.setSpanContext.mockClear();

      getContinuationTracer()
        .startSpan("openclaw.continue_delegate", {
          traceparent: `00-${TRACE_ID}-${CHILD_SPAN_ID}-01`,
        })
        .end();

      expect(telemetryState.tracer.setSpanContext).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          traceId: TRACE_ID,
          spanId: runSpanId,
        }),
      );
      const continuationParent = telemetryState.tracer.startSpan.mock.calls[0]?.[2] as
        | { spanContext?: { spanId?: string } }
        | undefined;
      expect(continuationParent?.spanContext?.spanId).toBe(runSpanId);
      expect(continuationParent?.spanContext?.spanId).not.toBe(CHILD_SPAN_ID);
      await service.stop?.(ctx);
      expect(getContinuationTracer()).toBe(noopTracer);
    });

    test("formats continuation traceparents from a registered diagnostic parent when the current child span is not registered yet", async () => {
      const service = createDiagnosticsOtelService();
      const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });
      await service.start(ctx);

      emitTrustedDiagnosticEvent({
        type: "run.started",
        runId: "run-parent-for-tool",
        provider: "openai",
        model: "gpt-5.5",
        trace: {
          traceId: TRACE_ID,
          spanId: CHILD_SPAN_ID,
          traceFlags: "01",
        },
      });
      await flushDiagnosticEvents();

      const runSpanId = telemetryState.spans.find((span) => span.name === "openclaw.run")
        ?.spanContext.mock.results[0]?.value?.spanId;
      expect(
        getContinuationTracer().formatTraceparent?.({
          traceId: TRACE_ID,
          spanId: TOOL_SPAN_ID,
          parentSpanId: CHILD_SPAN_ID,
          traceFlags: "01",
        }),
      ).toBe(`00-${TRACE_ID}-${runSpanId}-01`);

      await service.stop?.(ctx);
    });

    test("formats continuation traceparents from the registered run when only the logical trace id is available", async () => {
      const service = createDiagnosticsOtelService();
      const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });
      await service.start(ctx);

      emitTrustedDiagnosticEvent({
        type: "run.started",
        runId: "run-trace-fallback",
        provider: "openai",
        model: "gpt-5.5",
        trace: {
          traceId: TRACE_ID,
          spanId: CHILD_SPAN_ID,
          traceFlags: "01",
        },
      });
      await flushDiagnosticEvents();

      const runSpanId = telemetryState.spans.find((span) => span.name === "openclaw.run")
        ?.spanContext.mock.results[0]?.value?.spanId;
      expect(
        getContinuationTracer().formatTraceparent?.({
          traceId: TRACE_ID,
          spanId: TOOL_SPAN_ID,
          traceFlags: "01",
        }),
      ).toBe(`00-${TRACE_ID}-${runSpanId}-01`);

      await service.stop?.(ctx);
    });

    test("parents carried logical contexts to the registered run context", async () => {
      const service = createDiagnosticsOtelService();
      const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });
      await service.start(ctx);

      emitTrustedDiagnosticEvent({
        type: "run.started",
        runId: "run-logical-parent",
        provider: "openai",
        model: "gpt-5.5",
        trace: {
          traceId: TRACE_ID,
          spanId: CHILD_SPAN_ID,
          traceFlags: "01",
        },
      });
      await flushDiagnosticEvents();

      const runSpanId = telemetryState.spans.find((span) => span.name === "openclaw.run")
        ?.spanContext.mock.results[0]?.value?.spanId;
      telemetryState.tracer.startSpan.mockClear();
      telemetryState.tracer.setSpanContext.mockClear();

      emitTrustedDiagnosticEvent({
        type: "run.started",
        runId: "run-logical-child",
        provider: "openai",
        model: "gpt-5.5",
        trace: {
          traceId: TRACE_ID,
          spanId: TOOL_SPAN_ID,
          parentSpanId: SPAN_ID,
          traceFlags: "01",
        },
      });
      await flushDiagnosticEvents();

      expect(telemetryState.tracer.setSpanContext).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          traceId: TRACE_ID,
          spanId: runSpanId,
        }),
      );
      const runStart = startedSpanCall("openclaw.run");
      expect(runStart?.[2]).toEqual(
        expect.objectContaining({
          spanContext: expect.objectContaining({
            traceId: TRACE_ID,
            spanId: runSpanId,
          }),
        }),
      );

      await service.stop?.(ctx);
    });

    test("keys logical trace fallback by diagnostic trace id when OTEL root trace differs", async () => {
      const service = createDiagnosticsOtelService();
      const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });
      const originalStartSpan = telemetryState.tracer.startSpan.getMockImplementation();
      const otelRootTraceId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      if (!originalStartSpan) {
        throw new Error("expected startSpan mock implementation");
      }
      telemetryState.tracer.startSpan.mockImplementationOnce((name, opts, parentCtx) => {
        const span = originalStartSpan(name, opts, parentCtx);
        span.spanContext.mockReturnValue({
          traceId: otelRootTraceId,
          spanId: CHILD_SPAN_ID,
          traceFlags: 1,
        });
        return span;
      });
      await service.start(ctx);

      emitTrustedDiagnosticEvent({
        type: "run.started",
        runId: "run-logical-root-otel-trace-mismatch",
        provider: "openai",
        model: "gpt-5.5",
        trace: {
          traceId: TRACE_ID,
          spanId: CHILD_SPAN_ID,
          traceFlags: "01",
        },
      });
      await flushDiagnosticEvents();
      telemetryState.tracer.startSpan.mockClear();
      telemetryState.tracer.setSpanContext.mockClear();

      emitTrustedDiagnosticEvent({
        type: "run.started",
        runId: "run-logical-child-otel-trace-mismatch",
        provider: "openai",
        model: "gpt-5.5",
        trace: {
          traceId: TRACE_ID,
          spanId: TOOL_SPAN_ID,
          parentSpanId: SPAN_ID,
          traceFlags: "01",
        },
      });
      await flushDiagnosticEvents();

      expect(telemetryState.tracer.setSpanContext).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          traceId: otelRootTraceId,
          spanId: CHILD_SPAN_ID,
        }),
      );
      expect(startedSpanCall("openclaw.run")?.[2]).toEqual(
        expect.objectContaining({
          spanContext: expect.objectContaining({
            traceId: otelRootTraceId,
            spanId: CHILD_SPAN_ID,
          }),
        }),
      );

      await service.stop?.(ctx);
    });

    test("prefers carried remote traceparent span ids over logical trace fallback", async () => {
      const service = createDiagnosticsOtelService();
      const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });
      await service.start(ctx);

      emitTrustedDiagnosticEvent({
        type: "run.started",
        runId: "run-logical-parent-before-remote",
        provider: "openai",
        model: "gpt-5.5",
        trace: {
          traceId: TRACE_ID,
          spanId: CHILD_SPAN_ID,
          traceFlags: "01",
        },
      });
      await flushDiagnosticEvents();
      telemetryState.tracer.startSpan.mockClear();
      telemetryState.tracer.setSpanContext.mockClear();

      emitTrustedDiagnosticEvent({
        type: "run.started",
        runId: "run-remote-child",
        provider: "openai",
        model: "gpt-5.5",
        trace: {
          traceId: TRACE_ID,
          spanId: TOOL_SPAN_ID,
          parentSpanId: SPAN_ID,
          parentSpanIdSource: "remote",
          traceFlags: "01",
        },
      });
      await flushDiagnosticEvents();

      expect(telemetryState.tracer.setSpanContext).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          traceId: TRACE_ID,
          spanId: SPAN_ID,
        }),
      );
      const runStart = startedSpanCall("openclaw.run");
      expect(runStart?.[2]).toEqual(
        expect.objectContaining({
          spanContext: expect.objectContaining({
            traceId: TRACE_ID,
            spanId: SPAN_ID,
          }),
        }),
      );

      await service.stop?.(ctx);
    });

    test("parents trusted spans to carried traceparent span ids when no logical mapping exists", async () => {
      const service = createDiagnosticsOtelService();
      const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true });
      await service.start(ctx);

      emitTrustedDiagnosticEvent({
        type: "run.started",
        runId: "run-carried-parent",
        provider: "openai",
        model: "gpt-5.5",
        trace: {
          traceId: TRACE_ID,
          spanId: CHILD_SPAN_ID,
          parentSpanId: SPAN_ID,
          parentSpanIdSource: "remote",
          traceFlags: "01",
        },
      });
      await flushDiagnosticEvents();

      expect(telemetryState.tracer.setSpanContext).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          traceId: TRACE_ID,
          spanId: SPAN_ID,
        }),
      );
      const runStart = startedSpanCall("openclaw.run");
      expect(runStart?.[2]).toEqual(
        expect.objectContaining({
          spanContext: expect.objectContaining({
            traceId: TRACE_ID,
            spanId: SPAN_ID,
          }),
        }),
      );

      await service.stop?.(ctx);
    });

    test("does not install the adapter when traces are disabled (continuation-tracer stays noop)", async () => {
      expect(getContinuationTracer()).toBe(noopTracer);
      const service = createDiagnosticsOtelService();
      const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { metrics: true, logs: true });
      await service.start(ctx);
      expect(getContinuationTracer()).toBe(noopTracer);
      await service.stop?.(ctx);
      expect(getContinuationTracer()).toBe(noopTracer);
    });
  });
});
