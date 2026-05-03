/**
 * Span attribute values mirror the OTEL semantic-conventions primitive set:
 * string | number | boolean (and arrays thereof). We intentionally restrict
 * to scalars here — anything richer belongs in span events, not attributes.
 */
export type SpanAttributeValue = string | number | boolean | readonly string[] | readonly number[] | readonly boolean[];
export type SpanAttributes = Readonly<Record<string, SpanAttributeValue>>;
/**
 * Canonical enumeration of all `signal.kind` attribute values emitted by continuation spans.
 *
 * SSOT for the value-space. Helper signatures, disabled-helper narrowing, and tests all
 * derive from this; do not re-enumerate inline.
 *
 * @see ContinuationSignalKind — derived union type
 * @see ContinuationDisabledSignalKind — Extract<>-narrowed subset for `continuation.disabled`
 */
export declare const CONTINUATION_SIGNAL_KINDS: readonly ["work", "bracket-work", "bracket-delegate", "tool-delegate", "compaction-release", "heartbeat"];
/** Union type derived from {@link CONTINUATION_SIGNAL_KINDS}. */
export type ContinuationSignalKind = (typeof CONTINUATION_SIGNAL_KINDS)[number];
/**
 * Subset of {@link ContinuationSignalKind} that may appear on `continuation.disabled` spans.
 * Excludes `"work"` and `"compaction-release"` per memo §A asymmetry-only-in-disabled-reason rule.
 */
export type ContinuationDisabledSignalKind = Extract<ContinuationSignalKind, "bracket-work" | "bracket-delegate" | "tool-delegate">;
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
    /**
     * Gate-axis that produced a `continuation.disabled` reject. Pinned set:
     *   - `"cap.chain"` — `continuationChainCount` reached `maxChainLength`
     *   - `"cap.cost"` — accumulated input+output tokens exceeded `costCapTokens`
     *   - `"cap.delegates_per_turn"` — per-turn delegate-budget cap (chunk 5a)
     *   - `"reservation.missing"` — fire-time: reservation already cleared
     *     (compaction, explicit cancel, session teardown) between
     *     `setTimeout` arming and callback fire (chunk 5b)
     *
     * **Family semantics** (🌻's framing, sprites-of-thornfield 2026-04-27):
     * the enum captures **anything that prevented follow-through**, not only
     * cap axes. Cap is one shape of gate; reservation-loss is another. Future
     * siblings (`reservation.evicted`, `session.gone`, `compaction.cleared`)
     * slot under the same span name — the family is grammar-defined
     * (verb-on-gate), not enum-cardinality-defined. Observers can
     * `WHERE name = "continuation.disabled" GROUP BY disabled.reason`.
     */
    readonly "disabled.reason"?: string;
    /**
     * Signal-family classifier. Values are pinned by {@link CONTINUATION_SIGNAL_KINDS} (SSOT).
     * On `continuation.disabled` spans, identifies the rejected signal shape.
     * On `continuation.compaction.released` spans, classifies the release event.
     *
     * @see CONTINUATION_SIGNAL_KINDS — canonical value list
     * @see ContinuationDisabledSignalKind — narrowed subset for disabled spans
     */
    readonly "signal.kind"?: ContinuationSignalKind;
    /**
     * #334 chunk 5b — only set on `continuation.delegate.fire` spans.
     * Wall-clock ms between `setTimeout` arming (immediately before the
     * timer is scheduled at the dispatch site) and the callback actually
     * executing. Diverges from `delay.ms` (the requested delay) under
     * runtime pressure — event-loop blockage, GC pauses, etc.
     *
     * **Canonical drift formula** (🌊, sprites-of-thornfield 2026-04-27):
     * `drift = fire.deferred_ms − delay.ms`. Positive values indicate the
     * timer fired late under load; near-zero is on-schedule. Pinned in JSDoc
     * so every consumer doesn't rediscover the formula.
     *
     * Integer ms (`Math.floor` at emit-time) so the attr round-trips
     * cleanly through OTLP without rounding ambiguity.
     */
    readonly "fire.deferred_ms"?: number;
    /**
     * #334 chunk 6a — only set on `continuation.queue.drain` spans. Total
     * count of system-event entries pulled from the substrate queue at this
     * drain tick (`drainSystemEventEntries(...).length`). Integer ≥ 0.
     *
     * Aggregate, not per-event: one `continuation.queue.drain` span per
     * `drainFormattedSystemEvents` call regardless of how many entries the
     * pull returned. Per-event surfacing is deferred to OTEL `addEvent` on
     * the single drain span (Slice 3), not to additional spans.
     */
    readonly "queue.drained_count"?: number;
    /**
     * #334 chunk 6a — only set on `continuation.queue.drain` spans. Subset
     * of `queue.drained_count` whose entry text begins with the
     * continuation-prefix marker (`[continuation:`). Best-effort prefix
     * match at emit-time; structural `traceparent` reconstruction belongs
     * to Slice 3's adapter, not Slice 2 instrumentation.
     *
     * Always `≤ queue.drained_count`. Integer ≥ 0.
     */
    readonly "queue.drained_continuation_count"?: number;
    /**
     * #334 chunk 6b — only set on `continuation.compaction.released` spans.
     * Aggregate count of staged post-compaction delegates released for
     * dispatch by a single auto-compaction event. Snapshotted from
     * `sessionEntry.pendingPostCompactionDelegates.length` at the moment
     * `dispatchPostCompactionDelegates` is invoked.
     *
     * Integer ≥ 0. May be 0 when auto-compaction occurred but no delegates
     * were staged (the dispatch still runs to consume staged-but-unflushed
     * state); the span is still emitted to mark the compaction event itself.
     */
    readonly "compaction.released"?: number;
    /**
     * Session-local monotone compaction counter. Join key is `(session.id, compaction.id)`.
     *
     * Currently emitted on `continuation.compaction.released` spans. Future post-compaction-mode
     * `continuation.delegate.fire` spans will join via this attr (chunk 6c memo §B).
     *
     * Invariant: integer ≥ 0, monotone-by-construction at producer (incrementRunCompactionCount).
     */
    readonly "compaction.id"?: number;
    /**
     * #412 — only set on `heartbeat` spans. Opaque per-fire id, unique
     * within a process lifetime so heartbeat-cadence traces can be
     * correlated even when no continuation context is present. Caller-
     * injected from the harness for deterministic test pins; production
     * helper mints one via `crypto.randomUUID()` when omitted.
     */
    readonly "heartbeat.id"?: string;
};
/**
 * Canonical span name set. Pinned at the type so a typo in a chunk-2+
 * call site fails compile, not runtime. The harness assertion in
 * `continuation-tracer.test.ts :: "canonical continuation span names are
 * accepted by the surface"` mirrors this list.
 */
export type ContinuationSpanName = "continuation.work" | "continuation.work.fire" | "continuation.delegate.dispatch" | "continuation.delegate.fire" | "continuation.queue.enqueue" | "continuation.queue.drain" | "continuation.compaction.released" | "continuation.disabled" | "heartbeat";
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
/**
 * Default tracer: every method is a no-op. Returned from
 * `getContinuationTracer()` until a Slice-3 adapter is registered, which
 * preserves the additive Slice-1 contract: callers that don't opt in see
 * no behavior change.
 */
export declare const noopTracer: Tracer;
/**
 * Get the active continuation-tracer. Defaults to the no-op tracer until
 * `setContinuationTracer` is called by the bootstrap step (Slice 3).
 *
 * Hot-path callers SHOULD cache this once at module load — the indirection
 * exists so test harnesses can swap in `InMemorySpanExporter`-backed
 * tracers and so Slice 3's adapter can be installed without rewriting the
 * primitives.
 */
export declare function getContinuationTracer(): Tracer;
/**
 * Install a tracer. Used by:
 *   - the Slice-3 OTEL bootstrap (real OTLP wire)
 *   - the #370 swim-37 harness (in-memory exporter shim)
 *   - per-test setup that wants to capture span emissions
 *
 * Calling with `noopTracer` (or `null`/`undefined`) resets to the no-op
 * default — primarily for test teardown.
 */
export declare function setContinuationTracer(tracer: Tracer | null | undefined): void;
/**
 * Reset to the no-op default. Equivalent to `setContinuationTracer(null)`;
 * provided as a clearer test-teardown affordance.
 */
export declare function resetContinuationTracer(): void;
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
export declare function emitContinuationWorkSpan(args: {
    chainId: string | undefined;
    chainStepRemaining: number;
    delayMs: number;
    reason?: string | undefined;
    log?: (message: string) => void;
}): void;
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
 * `continuation.delegate.fire` remains a future name, not preempted.
 *
 * Wraps tracer interactions in a try/catch and logs via the caller's
 * `log` callback if provided — the accept path must never block on
 * span emission.
 */
export declare function emitContinuationDelegateSpan(args: {
    chainId: string | undefined;
    chainStepRemaining: number;
    delayMs: number;
    delivery: "immediate" | "timer";
    delegateMode?: string | undefined;
    reason?: string | undefined;
    log?: (message: string) => void;
}): void;
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
 *    chunk 4; per-turn delegate-budget cap landed in chunk 5a;
 *    `reservation.missing` (fire-time reservation already cleared) lands
 *    in chunk 5b. Family semantics (🌻, 2026-04-27): "anything that
 *    prevented follow-through," not "cap axes only" — the family is
 *    grammar-defined (verb-on-gate), not enum-cardinality-defined.
 *  - `signal.kind` ({@link ContinuationDisabledSignalKind}): the kind of
 *    signal that was rejected. Values derived from {@link CONTINUATION_SIGNAL_KINDS} SSOT.
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
export declare function emitContinuationDisabledSpan(args: {
    chainId: string | undefined;
    chainStepRemaining: number;
    disabledReason: "cap.chain" | "cap.cost" | "cap.delegates_per_turn" | "reservation.missing";
    signalKind: ContinuationDisabledSignalKind;
    delegateDelivery?: "immediate" | "timer" | undefined;
    delegateMode?: string | undefined;
    reason?: string | undefined;
    log?: (message: string) => void;
}): void;
/**
 * Emit a `continuation.delegate.fire` span at the runner-side delegate
 * timer-callback start (#334 Slice 2 chunk 5b). The verb-on-timer
 * counterpart to `emitContinuationDelegateSpan`'s verb-on-decision: this
 * span fires at the moment a deferred delegate's `setTimeout` callback
 * actually runs, so consumers can pair `dispatch`/`fire` events on the
 * same `chain.id` and observe scheduling drift / fire-time divergences.
 *
 * **Callsite invariants** (cohort design, sprites-of-thornfield 2026-04-27):
 *
 *  - Emit BEFORE `takeDelayedContinuationReservation` runs — the fire
 *    event is wall-clock truth ("the timer fired"); whatever happens next
 *    (spawn, reservation-missing log-and-return) is a separate concern
 *    and gets its own sibling span (`continuation.disabled` with
 *    `reason = reservation.missing` for the existing log-and-return
 *    divergence; future `continuation.delegate.error` for hard faults).
 *  - `chainId` is **closed-over from dispatch-time** as a captured local
 *    in the `setTimeout` closure. The helper never re-reads
 *    `activeSessionEntry?.continuationChainId` at fire-time. This matches
 *    the no-mint-on-fire invariant and prevents races with compaction or
 *    session mutation between arm and fire (mirrors chunks 3/4's
 *    enclosure discipline).
 *  - `chainId` is **always defined** at delegate-fire time — chain
 *    reservation mints pre-`setTimeout` (chunk 3 invariant). Sig encodes
 *    this with the non-optional `string` type. **Defense-in-depth:**
 *    helper no-ops gracefully (logs + returns) if `undefined` slips
 *    through anyway, so a future invariant break never crashes
 *    fire-emit.
 *  - `delegate.delivery: "timer"` is implicit — fire spans only emit on
 *    the timer-deferred path (immediate-delivery dispatches don't
 *    arm a timer, so there's no fire event for them). The helper sets
 *    the attr internally rather than taking it as an arg.
 *  - 5b is **instrumentation-of-status-quo only**: the helper does NOT
 *    re-evaluate any cap (`cap.chain | cap.cost | cap.delegates_per_turn`)
 *    at fire-time. Fire-time gating is a future-policy seam, deferred to
 *    a future memo.
 *
 * **`chainStepRemainingAtDispatch` provenance** (🌻 dedicated-paragraph
 * note, sprites-of-thornfield 2026-04-27): this value reflects
 * **dispatch-time headroom** (reservation snapshot), NOT callback-time
 * live state. Rationale: trace continuity with the dispatch span (same
 * `chain.id`, same step counter) so consumers can pair `dispatch` /
 * `fire` events without reasoning about between-tick mutations. If a
 * future consumer wants "remaining headroom _at_ fire time," that is a
 * **separate axis** (provisional name `chain.step.remaining_at_fire`)
 * and a **separate decision** — do not fold it into this field.
 *
 * Wraps tracer interactions in a try/catch and logs via the caller's
 * `log` callback if provided — the fire path must never block on span
 * emission.
 */
export declare function emitContinuationDelegateFireSpan(args: {
    chainId: string;
    chainStepRemainingAtDispatch: number;
    delegateMode: "normal" | "silent" | "silent-wake";
    delayMs: number;
    fireDeferredMs: number;
    reason?: string | undefined;
    log?: (message: string) => void;
}): void;
/**
 * Emit a `continuation.work.fire` span at the bracket-work timer-callback
 * seam (#334 Slice 2 chunk 5c). Symmetric to `emitContinuationDelegateFireSpan`
 * but scope-narrower: WORK-fire has NO fire-time divergence in current bytes
 * (no reservation system at the bracket-work seam — `enqueueSystemEvent` and
 * `requestHeartbeatNow` are synchronous and non-divergent), so 5c emits a
 * single span with no `continuation.disabled` sibling — unlike 5b which paired
 * fire+disabled(`reservation.missing`).
 *
 * **Cohort 3/3 verdicts (PR #390, sprites-of-thornfield 2026-04-27):**
 *  - **Naming:** `continuation.work.fire` (parallel grammar). Family rule
 *    `<noun>.<action>` two-segment dotted-only; `.fire` already means
 *    timer-callback in the family-grammar.
 *  - **Helper shape:** separate from `emitContinuationDelegateFireSpan`.
 *    Unified-parameterized devolves into `if (kind === "work")` branches and
 *    couples sibling-disabled-emit divergence across helper boundary.
 *  - **`reason.preview` carry-through:** yes. `continuationWorkReason` is in
 *    closure scope at dispatch, free to forward; snapshot-by-architecture
 *    (no recompute path exists), pays off in operator-mode triage.
 *
 * **Provenance pins (mirror 5b discipline):**
 *  - `chainId` is closed-over from dispatch-time `persistContinuationChainState`
 *    return value. Never recomputed at fire-time.
 *  - `chainStepRemainingAtDispatch` is a dispatch-time snapshot, NOT a
 *    fire-time recompute. Trace continuity with the dispatch span (same
 *    `chain.id`, same step counter) so consumers can pair `work` / `work.fire`
 *    events without reasoning about between-tick mutations.
 *  - 5c is **instrumentation-of-status-quo only**: helper does NOT re-evaluate
 *    any cap (`cap.chain | cap.cost | cap.delegates_per_turn`) at fire-time.
 *    Fire-time gating is a future-policy seam, deferred to a future memo.
 *  - `fire.deferred_ms` = wall-clock from `setTimeout`-arm to callback fire,
 *    `Math.floor` integer ms. Drift formula: `drift = fire.deferred_ms − delay.ms`.
 *
 * Wraps tracer interactions in a try/catch and logs via the caller's `log`
 * callback if provided — the fire path must never block on span emission.
 */
export declare function emitContinuationWorkFireSpan(args: {
    chainId: string;
    chainStepRemainingAtDispatch: number;
    delayMs: number;
    fireDeferredMs: number;
    reason?: string | undefined;
    log?: (message: string) => void;
}): void;
/**
 * Emit a `continuation.queue.drain` span at the substrate system-events
 * queue consumer seam (#334 Slice 2 chunk 6a). Fired once per
 * `drainFormattedSystemEvents` call, regardless of how many entries the
 * synchronous bulk-pull returned (including empty drains).
 *
 * **Cohort 4/4 contract (PR #393 memo, sprites-of-thornfield 2026-04-27):**
 *  - **Naming:** `continuation.queue.drain` (parallel grammar with
 *    `continuation.queue.enqueue` — producer-verb / consumer-verb on the
 *    substrate queue mechanical pair).
 *  - **Attrs:** `queue.drained_count` (total) and
 *    `queue.drained_continuation_count` (best-effort continuation-prefix
 *    subset). NO `chain.id` — the substrate queue is session-scoped and
 *    multi-chain at drain time; attaching a single `chain.id` would lie.
 *  - **Live counts (no snapshot):** drain is a single-tick synchronous
 *    bulk-pull. There is no temporal gap to bridge.
 *  - **No `disabled` sibling on empty drain:** a 0-count drain is the
 *    absence of work, not the rejection of work. The
 *    `continuation.disabled` family is reserved for gates that prevented
 *    follow-through (cap.*, reservation.missing).
 *  - **Aggregate emit:** one span per drain call. Per-event recordation,
 *    if cohort wants it later, slots under OTEL `addEvent` on this single
 *    span \u2014 NOT additional spans. Deferred to Slice 3.
 *
 * Wraps tracer interactions in a try/catch and forwards exceptions to the
 * caller's `log` callback if provided \u2014 the drain path must never block
 * on span emission, and must not perturb drain semantics (the span fires
 * AFTER the drain completes; emit failure is invisible to the consumer).
 */
export declare function emitContinuationQueueDrainSpan(args: {
    drainedCount: number;
    drainedContinuationCount: number;
    log?: (message: string) => void;
}): void;
/**
 * Emit a `continuation.compaction.released` span at the agent-runner
 * post-compaction-delegate dispatch seam (#334 Slice 2 chunk 6b). Fired
 * once per `autoCompactionCount > 0` branch, after
 * `dispatchPostCompactionDelegates` returns, with the released-count
 * snapshotted before the dispatch call.
 *
 * Mirrors `emitContinuationQueueDrainSpan` shape — separate-helper rule
 * (chunk 6a precedent). Integer hygiene (`Math.max(0, Math.floor(...))`)
 * per chunk-6a defense-in-depth: helper enforces invariant even though
 * the caller snapshots from a `.length` (structurally non-negative).
 *
 * Wraps tracer interactions in a try/catch and forwards exceptions to the
 * caller's `log` callback if provided — the release path must never block
 * on span emission.
 */
export declare function emitContinuationCompactionReleasedSpan(args: {
    releasedCount: number;
    compactionId?: number;
    log?: (message: string) => void;
}): void;
/**
 * Emit a `heartbeat` span at the runtime heartbeat-poll cadence (#412
 * heartbeat wiring memo). Heartbeats fire on poll cadence regardless of
 * whether continuation context is present, but the span only emits in
 * production when continuation context IS present (memo §Q1: production
 * is continuation-gated; harness shim is always-emit; divergence
 * documented in the harness README primitive-coverage matrix).
 *
 * Span shape:
 *  - `signal.kind` = `"heartbeat"` (always)
 *  - `heartbeat.id` (always; auto-minted via `crypto.randomUUID()` if
 *    omitted by caller)
 *  - `chain.id` (omitted iff `chainId` is `undefined`)
 *  - `chain.step.remaining` (omitted iff `chainStepRemaining` is
 *    `undefined`; otherwise clamped via `Math.max(0, ...)` matching
 *    `emitContinuationWorkSpan` discipline)
 *  - `continuation.disabled` (omitted iff `disabledReason` is `undefined`;
 *    set to `true` whenever `disabledReason` is supplied)
 *  - `disabled.reason` (omitted iff `disabledReason` is `undefined`;
 *    otherwise the supplied gate-axis string)
 *
 * Negative-asserts (per memo §2 and 🩸's #407 negative-pin pattern):
 *  - `delay.ms` MUST NOT appear — heartbeats fire on cadence, not
 *    caller-elected delay
 *  - `chain.step.remaining_at_dispatch` is NOT a heartbeat axis —
 *    heartbeats are snapshot-by-nature; the canonical attr is
 *    `chain.step.remaining`
 *
 * Wraps tracer interactions in a try/catch and logs via the caller's
 * `log` callback if provided — the heartbeat path must never block on
 * span emission.
 */
export declare function emitContinuationHeartbeatSpan(args: {
    heartbeatId?: string;
    chainId?: string;
    chainStepRemaining?: number;
    disabledReason?: string;
    log?: (message: string) => void;
}): void;
