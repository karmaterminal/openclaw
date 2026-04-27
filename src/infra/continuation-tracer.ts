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
   * #334 Slice 2 chunk 5b — only set on `continuation.delegate.fire`
   * spans. Wall-clock ms between `setTimeout` arming (dispatch-time) and
   * the timer-callback actually executing (fire-time). Diverges from
   * `delay.ms` (the requested delay) under runtime pressure.
   *
   * **Canonical drift formula** (cohort design 2026-04-27, 🌊):
   * `drift = fire.deferred_ms − delay.ms`. Positive values indicate the
   * timer fired late under load; near-zero is on-schedule. Integer ms
   * (`Math.floor` at emit-time) so the shape matches `delay.ms`.
   */
  readonly "fire.deferred_ms"?: number;
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
  /**
   * Reason the `continuation.disabled` span was emitted. Pinned set
   * (4-value as of #334 chunk 5b, cohort design 2026-04-27):
   *   - `"cap.chain"` — `continuationChainCount` reached `maxChainLength`
   *   - `"cap.cost"` — accumulated input+output tokens exceeded `costCapTokens`
   *   - `"cap.delegates_per_turn"` — per-turn delegate-budget cap (chunk 5a)
   *   - `"reservation.missing"` — fire-time reservation already cleared
   *     between `setTimeout` arm and callback execution (chunk 5b)
   *
   * **Enum semantics** (🌻 + 🩸 grammar-fit, msg `1498378311259394158`):
   * the family is **"anything that prevented follow-through,"** NOT
   * "cap axes only." `cap.*` is one shape of gate (per-chain or per-turn);
   * `reservation.missing` is another (compaction / cancel / teardown
   * cleared the reservation between arm and fire). Future siblings under
   * this family slot here too: `reservation.evicted`, `session.gone`,
   * `compaction.cleared`, etc. Observers can
   * `WHERE name = "continuation.disabled" GROUP BY disabled.reason`.
   *
   * Hard-fault failures (uncaught exception in spawn, store write fail)
   * are a **future taxonomy** that may graduate to a dedicated
   * `continuation.delegate.error` span name (Q8 deferred memo) — they do
   * NOT live on `continuation.disabled`.
   */
  readonly "disabled.reason"?: string;
  /**
   * Signal shape that was rejected. Pinned set:
   *   - `"bracket-work"` — bracket CONTINUE_WORK signal at the bracket gate
   *   - `"bracket-delegate"` — bracket CONTINUE_DELEGATE signal at the bracket gate
   *   - `"tool-delegate"` — `continue_delegate` tool signal at the tool gate
   * Lets observers separate self-elected (work) from delegated (delegate)
   * rejection rates without parsing other attributes.
   */
  readonly "signal.kind"?: string;
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
  | "continuation.delegate.fire"
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
 *    "post-compaction"`): caller-intent semantic axis. Optional in
 *    the helper signature so future call sites (e.g. an exporter
 *    replaying a partial dispatch record) can emit without a mode
 *    annotation; current runner wiring always supplies one.
 *
 * Per cohort design (sprites-of-thornfield, 2026-04-27): emit at the
 * **enqueue/accept seam**, NOT at the timer-fire callback. The chain-step
 * is committed when the runner accepts the dispatch into the chain;
 * the `setTimeout` is a delivery mechanism, not a chain semantic.
 * Cancelled-but-accepted dispatches (compaction, reset, gateway shutdown)
 * still happened, and a fire-time span would underreport them.
 * `continuation.delegate.fire` is the timer-callback sibling (#334
 * Slice 2 chunk 5b, helper `emitContinuationDelegateFireSpan`):
 * dispatch is the enqueue-time event, fire is the delivery-time event.
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

/**
 * Emit a `continuation.disabled` span at a runner-side cap-gate reject
 * (#334 Slice 2 chunk 4). Mirrors `emitContinuationWorkSpan` /
 * `emitContinuationDelegateSpan` shape — same try/catch wrap, same
 * `chain.id` / `chain.step.remaining` / `reason.preview` plumbing. Adds
 * three reject-specific axes:
 *
 *  - `disabled.reason` (`"cap.chain" | "cap.cost" |
 *    "cap.delegates_per_turn" | "reservation.missing"`): which gate
 *    prevented follow-through. Per-chain (chain/cost) gates landed in
 *    chunk 4; per-turn delegate-budget cap landed in chunk 5a; fire-time
 *    `reservation.missing` lands in chunk 5b. Family semantics are
 *    "anything that prevented follow-through," NOT cap-axes only —
 *    grammar-fit cohort decision (sprites-of-thornfield 2026-04-27,
 *    🩸 + 🌻, msg `1498378311259394158`).
 *  - `signal.kind` (`"bracket-work" | "bracket-delegate" |
 *    "tool-delegate"`): the kind of signal that was rejected.
 *  - `delegate.delivery` / `delegate.mode`: only set when the rejected
 *    signal was a delegate (bracket-delegate or tool-delegate). Work
 *    signals omit both — they're self-elected single-session and don't
 *    share that taxonomy.
 *
 * IMPORTANT (per cohort design 2026-04-27, 🌊): a reject means the chain
 * never advanced for this signal. Helper does NOT mint or persist a
 * `chain.id` for reject spans — callers pass `chainId` through as-is
 * from the live session entry (which may be `undefined` when the
 * rejected signal would have been the first chain step). `chain.step.remaining`
 * is set to the chain-budget remaining at the moment of reject, NOT
 * post-decrement (no decrement happens on rejects).
 *
 * Wraps tracer interactions in a try/catch and logs via the caller's
 * `log` callback if provided — the reject path must never block on
 * span emission.
 */
export function emitContinuationDisabledSpan(args: {
  chainId: string | undefined;
  chainStepRemaining: number;
  disabledReason: "cap.chain" | "cap.cost" | "cap.delegates_per_turn" | "reservation.missing";
  signalKind: "bracket-work" | "bracket-delegate" | "tool-delegate";
  delegateDelivery?: "immediate" | "timer" | undefined;
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
      "chain.step.remaining": Math.max(0, args.chainStepRemaining),
      "disabled.reason": args.disabledReason,
      "signal.kind": args.signalKind,
      "continuation.disabled": true,
      ...(args.chainId !== undefined && { "chain.id": args.chainId }),
      ...(args.delegateDelivery !== undefined && {
        "delegate.delivery": args.delegateDelivery,
      }),
      ...(args.delegateMode !== undefined && { "delegate.mode": args.delegateMode }),
      ...(reasonPreview !== undefined && { "reason.preview": reasonPreview }),
    };
    const span = activeTracer.startSpan("continuation.disabled", {
      attributes: attrs,
    });
    span.setStatus("OK");
    span.end();
  } catch (err) {
    args.log?.(`Failed to emit continuation.disabled span: ${String(err)}`);
  }
}

/**
 * Emit a `continuation.delegate.fire` span at the timer-deferred
 * delegate-fire seam (#334 Slice 2 chunk 5b). Mirrors chunks 2/3/4
 * helpers — same try/catch wrap, same `chain.id` /
 * `chain.step.remaining` / `reason.preview` plumbing.
 *
 * **Scope (cohort-pinned 2026-04-27, memo PR #386):** instrument-the-current-seam
 * only. The wire emits at the start of each `setTimeout` callback BEFORE
 * `takeDelayedContinuationReservation`, so the fire event is truthful
 * regardless of what happens next (reservation hit, reservation cleared,
 * or eventual spawn). NO fire-time cap rechecks are introduced — those
 * are a future-policy seam, deferred to a later memo.
 *
 * Axes:
 *  - `fire.deferred_ms` (number): wall-clock ms between `setTimeout` arm
 *    (dispatch-time) and callback execution (fire-time). Integer ms via
 *    `Math.floor` at emit-time. Drift formula:
 *    `drift = fire.deferred_ms − delay.ms`.
 *  - `delay.ms` (number): the requested delay, carried through from
 *    dispatch so trace consumers can pair `dispatch`/`fire` events
 *    without a join.
 *  - `delegate.delivery` (`"timer"`): emitted as a fixed attr — fire is
 *    timer-only by Q1, immediate dispatches don't have a fire-event seam.
 *  - `delegate.mode` (string): closed-over from the dispatch-time
 *    reservation; never re-read at fire-time.
 *  - `chain.id` / `chain.step.remaining`: dispatch-time snapshot, NOT a
 *    fire-time recompute.
 *
 * **chain.id provenance** (🌊 msg `1498377809591013516`; 🩸 msg
 * `1498377886686777486`): the `setTimeout` callback **closes over**
 * `chainId` from dispatch-time as a captured local. This helper never
 * re-reads `activeSessionEntry?.continuationChainId` at fire-time. This
 * matches the no-mint-on-fire invariant, prevents races with compaction
 * or session mutation between arm and fire, and mirrors chunks 3/4's
 * enclosure discipline.
 *
 * **Always-defined invariant** (🌻 msg `1498377947944456294`): chain
 * reservation mints pre-`setTimeout` (chunk 3 invariant), so `chainId`
 * is always defined at delegate-fire time. The signature pins this in
 * the type (`chainId: string`, not optional). Defense-in-depth: helper
 * no-ops gracefully if a future invariant break ever slipped through,
 * so fire-emit can't crash the timer callback.
 *
 * **`chainStepRemainingAtDispatch` provenance** (🩸 msg `1498377749499351203`;
 * 🌻 dedicated-paragraph note, msg `1498378054462869524`): the value
 * reflects **dispatch-time headroom** (reservation snapshot), NOT
 * callback-time live state. Rationale: trace continuity with the
 * dispatch span (same `chain.id`, same step counter) so consumers can
 * pair `dispatch`/`fire` events without reasoning about between-tick
 * mutations. If a future consumer wants "remaining headroom _at_ fire
 * time," that is a **separate axis** (provisional name
 * `chain.step.remaining_at_fire`) and a **separate decision** — do not
 * fold it into this field.
 *
 * Wraps tracer interactions in a try/catch and logs via the caller's
 * `log` callback if provided — the timer-callback path must never block
 * on span emission, even on tracer failure.
 */
export function emitContinuationDelegateFireSpan(args: {
  chainId: string;
  chainStepRemainingAtDispatch: number;
  delegateMode: "normal" | "silent" | "silent-wake";
  delayMs: number;
  fireDeferredMs: number;
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
      "chain.id": args.chainId,
      "chain.step.remaining": Math.max(0, args.chainStepRemainingAtDispatch),
      "delay.ms": Math.round(args.delayMs),
      "fire.deferred_ms": Math.max(0, Math.floor(args.fireDeferredMs)),
      "delegate.delivery": "timer",
      "delegate.mode": args.delegateMode,
      ...(reasonPreview !== undefined && { "reason.preview": reasonPreview }),
    };
    const span = activeTracer.startSpan("continuation.delegate.fire", {
      attributes: attrs,
    });
    span.setStatus("OK");
    span.end();
  } catch (err) {
    args.log?.(`Failed to emit continuation.delegate.fire span: ${String(err)}`);
  }
}
