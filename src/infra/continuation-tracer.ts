// Continuation-tracer shim — Slice 2 surface for #334 OTEL chain-correlation.
//
// Per Slice-2 design checkpoint (sprites-of-thornfield, 2026-04-27, path B):
// the substrate adds the **span-emission surface** here, not the wire. A
// thin `Tracer` interface with a no-op default keeps the additive contract
// from Slice 1 — callers that don't opt in see no behavior change, and the
// real OTEL adapter lands in Slice 3 once the bauble policy conversation
// resolves which deps may live in the gateway hot-path.
//
// The harness in `studies/swim-37/harness/swim-runner.test.ts` (#370) pins
// against THIS module's surface — `tracer.startSpan(name, attrs)` — not
// against `@opentelemetry/api`. That keeps the harness durable across
// upstream-OTEL renames and across any future exporter swap.
//
// Naming pinned by Slice 1 substrate (`SystemEvent.traceparent`,
// `ChainBudget.declineToCarry`, `chain.id`, `chain.step.remaining`). When
// Slice 3 wires the real provider, no test in the harness or in this
// module's tests should need to change.

/**
 * Span attribute values mirror the OTEL semantic-conventions primitive set:
 * string | number | boolean (and arrays thereof). We intentionally restrict
 * to scalars here — anything richer belongs in span events, not attributes.
 */
export type SpanAttributeValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | readonly boolean[];

export type SpanAttributes = Readonly<Record<string, SpanAttributeValue>>;

/**
 * Normative attribute-key set for continuation spans.
 *
 * **Pinning these names at the shim type — NOT at the adapter — is the
 * load-bearing decision** (🌻's nuance, sprites-of-thornfield 2026-04-27):
 * if the OTEL adapter (Slice 3) ever drifts to `chain_id` / `chainId` /
 * etc., this type catches the drift at compile-time, before the #370
 * harness contract assertions could detect it at runtime.
 *
 * All keys are optional because not every span carries every attribute
 * (e.g. `heartbeat` carries `continuation.disabled` but no `delay.ms`).
 * The `Readonly<Record<string, SpanAttributeValue>>` superset on
 * `setAttributes` / `StartSpanOptions.attributes` permits diagnostic /
 * adapter-internal attributes that aren't part of the canonical contract;
 * `ContinuationSpanAttrs` is what the canonical-attribute-name pin tests
 * (and #370 harness) assert against.
 *
 * Mirror in tests at `continuation-tracer.test.ts ::
 * "canonical attribute names round-trip through the surface"`.
 */
export type ContinuationSpanAttrs = {
  /** Stable id for the continuation chain this span belongs to. */
  readonly "chain.id"?: string;
  /** Remaining chain-step budget, post-decrement at this span. */
  readonly "chain.step.remaining"?: number;
  /** Scheduled delay (ms) until the next-turn / delegate fires. */
  readonly "delay.ms"?: number;
  /** First ≤80 chars of the tool-call `reason`, for operator readability. */
  readonly "reason.preview"?: string;
  /** Mode of a `continue_delegate` dispatch (normal/silent/silent-wake/post-compaction). */
  readonly "delegate.mode"?: string;
  /**
   * Delivery shape of the delegate dispatch — `"immediate"` when no
   * delay was requested (or delay was 0), `"timer"` when `setTimeout`
   * armed for a non-zero clamped delay. Distinct from `delegate.mode`
   * (which captures *intent*: normal/silent/silent-wake/post-compaction).
   * Threaded so chunk 4's `continuation.disabled` reject-spans can
   * distinguish cap-rejected-immediate (no timer ever armed) from
   * cap-rejected-timer (timer armed then reaped).
   */
  readonly "delegate.delivery"?: string;
  /**
   * `true` when `ChainBudget.declineToCarry` silenced emission for this
   * step. Carried on the `continuation.disabled` event-span and on the
   * `heartbeat` span when continuation context is present.
   */
  readonly "continuation.disabled"?: boolean;
};

/**
 * Canonical span name set. Pinned at the type so a typo in a chunk-2+
 * call site fails compile, not runtime. The harness assertion in
 * `continuation-tracer.test.ts :: "canonical continuation span names are
 * accepted by the surface"` mirrors this list.
 */
export type ContinuationSpanName =
  | "continuation.work"
  | "continuation.delegate.dispatch"
  | "continuation.queue.enqueue"
  | "continuation.queue.drain"
  | "continuation.compaction.released"
  | "continuation.disabled"
  | "heartbeat";

/**
 * Status code for a span. Mirrors OTEL's `SpanStatusCode` (UNSET=0, OK=1,
 * ERROR=2) with explicit string names so callers don't depend on the
 * numeric ordinal — keeps the surface OTEL-compatible without being
 * OTEL-bound.
 */
export type SpanStatus = "UNSET" | "OK" | "ERROR";

/**
 * Active span returned by `Tracer.startSpan`. Callers MUST `end()` every
 * span exactly once — the no-op tracer doesn't enforce this, but the real
 * Slice-3 adapter will.
 *
 * The shape intentionally mirrors `@opentelemetry/api`'s `Span` interface
 * surface (the subset we care about) so the Slice-3 adapter is a thin
 * pass-through, not a re-implementation.
 */
export type Span = {
  /**
   * Add or overwrite attributes on the span. Calling with the same key
   * replaces the previous value (matches OTEL semantics).
   */
  setAttributes(attrs: SpanAttributes): void;
  /**
   * Set the span status. Once set to ERROR, transitioning to OK is
   * permitted (matches OTEL). Implementations SHOULD record the most
   * recent status only.
   */
  setStatus(status: SpanStatus, message?: string): void;
  /**
   * Record an exception against the span. Pure-string variants are
   * accepted for sites that don't carry an Error instance (matches OTEL's
   * `recordException` permissive shape).
   */
  recordException(err: unknown): void;
  /**
   * End the span. Idempotent: subsequent calls are no-ops. Matches OTEL.
   */
  end(): void;
};

export type StartSpanOptions = {
  /**
   * Initial attributes attached at span creation. Equivalent to calling
   * `setAttributes` immediately after `startSpan`.
   *
   * The shim accepts `SpanAttributes` (the broader `Record<string,...>`)
   * to permit diagnostic / adapter-internal attributes; canonical-contract
   * keys are pinned by `ContinuationSpanAttrs` and the harness tests.
   */
  attributes?: SpanAttributes;
  /**
   * W3C `traceparent` to anchor the span to an existing trace. When
   * omitted the span starts a new trace. Slice 1 lifts this onto
   * `SystemEvent.traceparent` so producer-side reconstruction at drain
   * time has the field to read from.
   */
  traceparent?: string;
};

/**
 * Tracer surface used by continuation primitives (`continue_work`,
 * `continue_delegate`, heartbeat) to emit chain-correlated spans.
 *
 * Slice 2 ships this interface + `noopTracer`. Slice 3 ships an OTEL
 * adapter that conforms to this same surface — the call sites don't change.
 */
export type Tracer = {
  /**
   * Start a span. Callers MUST `end()` the returned span exactly once.
   *
   * `name` SHOULD be one of the canonical continuation span names so the
   * harness contract assertions hold:
   *   - `continuation.work`
   *   - `continuation.delegate.dispatch`
   *   - `continuation.queue.enqueue`
   *   - `continuation.queue.drain`
   *   - `continuation.compaction.released`
   *   - `continuation.disabled`
   *   - `heartbeat`
   *
   * The `name` parameter is not type-narrowed to that union because some
   * call sites (diagnostic / debug spans, future adapters) need
   * arbitrary names; the harness pins the canonical set.
   */
  startSpan(name: string, options?: StartSpanOptions): Span;
};

const noopSpan: Span = Object.freeze({
  setAttributes(_attrs: SpanAttributes): void {
    /* no-op */
  },
  setStatus(_status: SpanStatus, _message?: string): void {
    /* no-op */
  },
  recordException(_err: unknown): void {
    /* no-op */
  },
  end(): void {
    /* no-op */
  },
});

/**
 * Default tracer: every method is a no-op. Returned from
 * `getContinuationTracer()` until a Slice-3 adapter is registered, which
 * preserves the additive Slice-1 contract: callers that don't opt in see
 * no behavior change.
 */
export const noopTracer: Tracer = Object.freeze({
  startSpan(_name: string, _options?: StartSpanOptions): Span {
    return noopSpan;
  },
});

let activeTracer: Tracer = noopTracer;

/**
 * Get the active continuation-tracer. Defaults to the no-op tracer until
 * `setContinuationTracer` is called by the bootstrap step (Slice 3).
 *
 * Hot-path callers SHOULD cache this once at module load — the indirection
 * exists so test harnesses can swap in `InMemorySpanExporter`-backed
 * tracers and so Slice 3's adapter can be installed without rewriting the
 * primitives.
 */
export function getContinuationTracer(): Tracer {
  return activeTracer;
}

/**
 * Install a tracer. Used by:
 *   - the Slice-3 OTEL bootstrap (real OTLP wire)
 *   - the #370 swim-37 harness (in-memory exporter shim)
 *   - per-test setup that wants to capture span emissions
 *
 * Calling with `noopTracer` (or `null`/`undefined`) resets to the no-op
 * default — primarily for test teardown.
 */
export function setContinuationTracer(tracer: Tracer | null | undefined): void {
  activeTracer = tracer ?? noopTracer;
}

/**
 * Reset to the no-op default. Equivalent to `setContinuationTracer(null)`;
 * provided as a clearer test-teardown affordance.
 */
export function resetContinuationTracer(): void {
  activeTracer = noopTracer;
}

/**
 * Emit a `continuation.work` span at the runner-side accept seam
 * (#334 Slice 2 chunk 2). Centralized helper so the runner stays
 * narrow at the call site and the span shape is testable in
 * isolation. Sites that don't have a chainId yet (chain not
 * persisted, or substrate-disabled deploys) MAY pass `chainId:
 * undefined` — the attribute is omitted, downstream collectors
 * see a span without a correlation key.
 *
 * Wraps tracer interactions in a try/catch and logs via the caller's
 * `log` callback if provided — the accept path must never block on
 * span emission.
 */
export function emitContinuationWorkSpan(args: {
  chainId: string | undefined;
  chainStepRemaining: number;
  delayMs: number;
  reason?: string | undefined;
  log?: (message: string) => void;
}): void {
  try {
    const reasonPreview = args.reason
      ? args.reason.length > 80
        ? args.reason.slice(0, 80)
        : args.reason
      : undefined;
    const attrs: ContinuationSpanAttrs = {
      "delay.ms": Math.round(args.delayMs),
      "chain.step.remaining": Math.max(0, args.chainStepRemaining),
      ...(args.chainId !== undefined && { "chain.id": args.chainId }),
      ...(reasonPreview !== undefined && { "reason.preview": reasonPreview }),
    };
    const span = activeTracer.startSpan("continuation.work", { attributes: attrs });
    span.setStatus("OK");
    span.end();
  } catch (err) {
    args.log?.(`Failed to emit continuation.work span: ${String(err)}`);
  }
}

/**
 * Emit a `continuation.delegate.dispatch` span at the runner-side
 * delegate accept seam (#334 Slice 2 chunk 3). Mirrors
 * `emitContinuationWorkSpan` shape — same try/catch wrap, same
 * `chain.id` / `chain.step.remaining` / `delay.ms` / `reason.preview`
 * plumbing — plus two delegate-specific axes:
 *
 *  - `delegate.delivery` (`"immediate" | "timer"`): runner-internal
 *    scheduling axis. `"immediate"` when no delay was requested or
 *    the delay was 0 (no `setTimeout` armed); `"timer"` when a
 *    non-zero clamped delay armed `setTimeout`.
 *  - `delegate.mode` (`"normal" | "silent" | "silent-wake" |
 *    "post-compaction"`): caller-intent semantic axis. Optional
 *    because some call sites (e.g. bracket-`CONTINUE_DELEGATE` without
 *    the `silent`/`silent-wake` modifier) emit without a mode
 *    annotation; the attribute is omitted in that case.
 *
 * Per cohort design (sprites-of-thornfield, 2026-04-27): emit at the
 * **enqueue/accept seam**, NOT at the timer-fire callback. The chain-step
 * is committed when the runner accepts the dispatch into the chain;
 * the `setTimeout` is a delivery mechanism, not a chain semantic.
 * Cancelled-but-accepted dispatches (compaction, reset, gateway shutdown)
 * still happened, and a fire-time span would underreport them.
 * `continuation.delegate.fire` remains a future name, not preempted.
 *
 * Wraps tracer interactions in a try/catch and logs via the caller's
 * `log` callback if provided — the accept path must never block on
 * span emission.
 */
export function emitContinuationDelegateSpan(args: {
  chainId: string | undefined;
  chainStepRemaining: number;
  delayMs: number;
  delivery: "immediate" | "timer";
  delegateMode?: string | undefined;
  reason?: string | undefined;
  log?: (message: string) => void;
}): void {
  try {
    const reasonPreview = args.reason
      ? args.reason.length > 80
        ? args.reason.slice(0, 80)
        : args.reason
      : undefined;
    const attrs: ContinuationSpanAttrs = {
      "delay.ms": Math.round(args.delayMs),
      "chain.step.remaining": Math.max(0, args.chainStepRemaining),
      "delegate.delivery": args.delivery,
      ...(args.chainId !== undefined && { "chain.id": args.chainId }),
      ...(args.delegateMode !== undefined && { "delegate.mode": args.delegateMode }),
      ...(reasonPreview !== undefined && { "reason.preview": reasonPreview }),
    };
    const span = activeTracer.startSpan("continuation.delegate.dispatch", {
      attributes: attrs,
    });
    span.setStatus("OK");
    span.end();
  } catch (err) {
    args.log?.(`Failed to emit continuation.delegate.dispatch span: ${String(err)}`);
  }
}
