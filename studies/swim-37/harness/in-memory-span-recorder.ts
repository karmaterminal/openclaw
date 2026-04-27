/**
 * In-memory span recorder for the swim-37 harness.
 *
 * Tracks: karmaterminal/openclaw#324 (swim-37 harness)
 *
 * **Purpose.** A test-only `Tracer` implementation that captures every
 * `startSpan` call into an in-memory array. Tests install it via
 * `setContinuationTracer(recorder.tracer)` in `beforeEach`, drive the
 * `emit*Span` helpers from `continuation-tracer.ts`, then read recorded
 * spans back via `recorder.spans()` for assertion.
 *
 * **STDOUT-only discipline.** This shim is the local-process-memory
 * equivalent of OTEL's `InMemorySpanExporter`. It deliberately does NOT
 * spin up `BasicTracerProvider`, `@opentelemetry/sdk-trace-base`, or any
 * real exporter — the harness must NEVER touch a live OTLP collector or
 * STDOUT-export from a worker. All capture stays in-process so vitest
 * runs are hermetic.
 *
 * **Shape parallel.** This mirrors the `recordingTracer` pattern already
 * used inline in `src/infra/continuation-tracer.test.ts` (registry tests
 * around L51-100). Lifting it into a reusable harness helper centralizes
 * the recorder shape so harness tests share one capture surface instead
 * of redefining it inline.
 *
 * **Lifecycle.** Tests MUST:
 *   1. Construct a fresh recorder per test (`createInMemorySpanRecorder()`).
 *   2. Install via `setContinuationTracer(recorder.tracer)` (typically in
 *      `beforeEach`).
 *   3. Drive emit calls.
 *   4. Read spans via `recorder.spans()`.
 *   5. Reset via `resetContinuationTracer()` (typically in `afterEach`).
 *
 * **What gets recorded.** Each `startSpan(name, options)` call records:
 *   - `name` (string)
 *   - `attributes` (snapshot of `options.attributes` at start; subsequent
 *     `setAttributes` calls append/overwrite into the same record so the
 *     final state matches OTEL semantics)
 *   - `traceparent` (when provided)
 *   - `status` (last `setStatus` call, default `"UNSET"`)
 *   - `statusMessage` (when provided to `setStatus`)
 *   - `exceptions` (array, in record order from `recordException` calls)
 *   - `ended` (boolean; set to true on first `end()` call, idempotent)
 *
 * Records are appended in `startSpan` call order. End-time is not
 * captured; the `emit*Span` helpers all start+end synchronously inside
 * one synchronous block, so call-order matches end-order.
 */

import {
  type Span,
  type SpanAttributes,
  type SpanStatus,
  type StartSpanOptions,
  type Tracer,
} from "../../../src/infra/continuation-tracer.js";

/**
 * One captured span. Read-only from the test perspective; the recorder
 * mutates the underlying record as the span receives `setAttributes` /
 * `setStatus` / `recordException` / `end` calls.
 */
export type RecordedSpan = {
  /** Span name passed to `startSpan`. */
  readonly name: string;
  /**
   * Final attribute state. Initial values come from
   * `StartSpanOptions.attributes`; subsequent `setAttributes` calls
   * shallow-merge with overwrite-on-collision (matches OTEL).
   */
  readonly attributes: Readonly<Record<string, unknown>>;
  /** W3C `traceparent` if supplied to `startSpan`. */
  readonly traceparent: string | undefined;
  /** Last status set on the span. Default `"UNSET"`. */
  readonly status: SpanStatus;
  /** Status message from the most recent `setStatus(_, message)` call. */
  readonly statusMessage: string | undefined;
  /** Exceptions recorded via `recordException`, in call order. */
  readonly exceptions: readonly unknown[];
  /** True once `end()` has been called at least once. */
  readonly ended: boolean;
};

/**
 * Recorder handle. Construct one per test via
 * `createInMemorySpanRecorder()`, install on the global tracer registry
 * via `setContinuationTracer(recorder.tracer)`, drive emit calls, then
 * read `recorder.spans()` for assertions.
 */
export type InMemorySpanRecorder = {
  /** The `Tracer` instance to register via `setContinuationTracer`. */
  readonly tracer: Tracer;
  /**
   * Snapshot of recorded spans, in `startSpan` call order. Returns a
   * new array each call so callers can mutate without affecting the
   * underlying capture.
   */
  spans(): RecordedSpan[];
  /**
   * Convenience: filter `spans()` by canonical name. Useful for
   * `recorder.spansByName("continuation.work.fire")` style queries.
   */
  spansByName(name: string): RecordedSpan[];
  /** Clear all captured spans without re-installing the tracer. */
  reset(): void;
};

type MutableSpanRecord = {
  name: string;
  attributes: Record<string, unknown>;
  traceparent: string | undefined;
  status: SpanStatus;
  statusMessage: string | undefined;
  exceptions: unknown[];
  ended: boolean;
};

/**
 * Create a fresh in-memory span recorder. Each call returns an
 * independent recorder + tracer pair so tests don't share capture state.
 */
export function createInMemorySpanRecorder(): InMemorySpanRecorder {
  const records: MutableSpanRecord[] = [];

  const tracer: Tracer = {
    startSpan(name: string, options?: StartSpanOptions): Span {
      // Snapshot initial attributes; subsequent setAttributes calls
      // mutate this same object so the final RecordedSpan reflects the
      // last-write-wins state (matches OTEL semantics — see Span.setAttributes
      // contract in continuation-tracer.ts).
      const initialAttrs: Record<string, unknown> = options?.attributes
        ? { ...options.attributes }
        : {};
      const record: MutableSpanRecord = {
        name,
        attributes: initialAttrs,
        traceparent: options?.traceparent,
        status: "UNSET",
        statusMessage: undefined,
        exceptions: [],
        ended: false,
      };
      records.push(record);

      const span: Span = {
        setAttributes(attrs: SpanAttributes): void {
          // Last-write-wins per OTEL semantics.
          for (const [k, v] of Object.entries(attrs)) {
            record.attributes[k] = v;
          }
        },
        setStatus(status: SpanStatus, message?: string): void {
          record.status = status;
          record.statusMessage = message;
        },
        recordException(err: unknown): void {
          record.exceptions.push(err);
        },
        end(): void {
          // Idempotent.
          record.ended = true;
        },
      };
      return span;
    },
  };

  function snapshot(): RecordedSpan[] {
    // Defensive copy: callers shouldn't mutate the underlying records.
    return records.map((r) => ({
      name: r.name,
      attributes: { ...r.attributes },
      traceparent: r.traceparent,
      status: r.status,
      statusMessage: r.statusMessage,
      exceptions: [...r.exceptions],
      ended: r.ended,
    }));
  }

  return {
    tracer,
    spans: snapshot,
    spansByName(name: string): RecordedSpan[] {
      return snapshot().filter((s) => s.name === name);
    },
    reset(): void {
      records.length = 0;
    },
  };
}
