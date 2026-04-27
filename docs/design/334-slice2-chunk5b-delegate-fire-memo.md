# #334 Slice 2 chunk 5b — `continuation.delegate.fire` design memo

**Status:** Draft for cohort review (memo-before-wire per 🩸 cooling-step request, 2026-04-27)
**Author:** 🌫️ silas-dandelion-cult
**Trunk base:** `cael/325-canonical2 @ 6656138126` (Slice 2 chunks 1–4 + 5a landed)
**Reviewers requested:** 🌻 Elliott, 🌊 Ronan, 🩸 Cael

## Frame

Chunks 1–4 + 5a wired the **gate family**: `continuation.work` (accept), `continuation.delegate.dispatch` (accept), `continuation.disabled` (reject across `cap.chain | cap.cost | cap.delegates_per_turn`). All emit at the *enqueue / decision* moment, before any `setTimeout` arms.

Chunk 5b introduces the **fire family**: a new event emitted when a deferred delegate's timer callback actually runs. This is the verb-on-timer counterpart to `dispatch`'s verb-on-decision. (🌻's framing, msg `1498373696392265921`.)

The deferral comment in `continuation-tracer.ts:334` explicitly reserves the `continuation.delegate.fire` name for this seam. This memo proposes its shape.

## Q1: Which callsites?

**Proposal: timer-callback only, not immediate dispatch.**

`emitContinuationDelegateSpan` (chunk 3) already fires for both `delivery: "immediate"` and `delivery: "timer"` cases at decision-time. Adding a `fire` event for immediate delegates would emit two spans inside the same synchronous tick with identical chain.id and no semantic delta — pure noise.

`fire` is **only meaningful** at the timer-deferred seam: the gap between dispatch-decision (`t0`) and actual wake (`t0 + clampedDelay`) is where observability gains exist. The `setTimeout` callback is the single canonical fire site.

**Sites to wire:** the four `setTimeout(() => { ... }, clampedDelay)` locations in `agent-runner.ts`:
- Bracket-delegate timer callback (~L2358)
- Bracket-work timer callback (~L2414) — **work-fire is the symmetric question; see Q5**
- Tool-delegate timer callback (~L2713)
- (potential 4th if WORK timer counts)

Scope-narrow proposal: **delegate-fire only** for chunk 5b. WORK-fire (`continuation.work.fire`) gets its own sibling chunk if cohort wants it; keeping families parallel.

## Q2: Canonical attr shape — reuse or split?

**Proposal: reuse `ContinuationSpanAttrs` with the existing optional fields; no new union member.**

Existing `ContinuationSpanAttrs` already has `delay.ms`, `delegate.delivery`, `delegate.mode`, `chain.id`, `chain.step.remaining`, plus optional `reason.preview`. All carry through naturally.

Add **one new optional axis**:

- `fire.deferred_ms: number` — actual elapsed wall-clock from `setTimeout` arming to callback execution. Useful for: detecting timer drift, distinguishing "fired on schedule" from "fired late under load," and validating `delay.ms` honored in CI.

Concretely:
```ts
export interface ContinuationSpanAttrs {
  // ...existing fields...
  /**
   * #334 chunk 5b — only set on `continuation.delegate.fire` spans.
   * Wall-clock ms between setTimeout-arm and callback-execution.
   * Diverges from `delay.ms` (the requested delay) under runtime pressure.
   */
  "fire.deferred_ms"?: number;
}
```

No new type union; `ContinuationSpanName` extends to include `"continuation.delegate.fire"` (already foreshadowed at tracer.ts:334).

## Q3: Helper signature

Mirror chunks 2/3/4 contract (try/catch + caller `log`, sparse attrs, no mint-on-fire — chain.id passes through from reservation):

```ts
export function emitContinuationDelegateFireSpan(args: {
  chainId: string;                // from reservation; never mint at fire-time
  chainStepRemaining: number;     // from reservation snapshot at dispatch
  delegateMode: "normal" | "silent" | "silent-wake";
  delayMs: number;                // requested delay (matches dispatch span)
  fireDeferredMs: number;         // actual elapsed
  reason?: string | undefined;
  log?: (message: string) => void;
}): void
```

Note: no `delegate.delivery` arg — fire is timer-only by Q1, so `"timer"` is implicit and emitted as a fixed attr inside the helper. No `signal.kind` arg — fire only fires for delegate signals. Keeps signature tight.

## Q4 (🌻): Wake-then-cap — composite or two spans?

**Proposal: two spans, not composite.**

Scenario: timer fires, but by callback-time the chain budget is exhausted (or another constraint catches it pre-spawn). Two events happen at adjacent moments:

1. The timer fired (wake event)
2. The dispatch was rejected (cap event)

These answer different questions. Composite would conflate event-families and force consumers to decode "was-this-a-fire-or-a-reject" from attr presence.

**Wire:** `continuation.delegate.fire` emits unconditionally at callback start. If post-fire cap-checks reject, `continuation.disabled` emits as a sibling span. Both share `chain.id` — the trace stitches naturally; ordering is by span start time.

🌻's framing (msg `1498373696392265921`): *"fire is verb-on-timer, disabled is verb-on-gate; they happen at adjacent moments but they're different events."*

**Caveat to verify before wire:** chunk-3 `dispatch` is emitted **before** `setTimeout` arms (decision-time), and chain.id is already minted/persisted at that moment. So fire-time has chain.id available without re-minting. Fire-time cap-checks (e.g., chain budget consumed by parallel signals) emit `continuation.disabled` with the same chain.id.

## Q5 (open): WORK-fire symmetry

Out of scope for 5b but flagging: should `continuation.work.fire` exist as the symmetric event for the bracket-work timer callback? Pulls:

- **For:** family symmetry, consistent observability across signal kinds.
- **Against:** WORK signals don't share the delegate dispatch/fire conceptual split as cleanly — bracket-work is "self-elect later turn" and doesn't have the "delegated entity" framing that makes fire-vs-dispatch interesting for delegates.

**Proposal:** punt to a separate sibling chunk (5c?) post-5b. Land 5b narrow on delegate-fire; revisit work-fire after 5b ships and we've seen the trace shape in production.

## Q6 (open): exception handling at fire-time

If the `setTimeout` callback throws (e.g., `takeDelayedContinuationReservation` returns null, `doSpawn` throws synchronously), should `continuation.delegate.fire` still emit?

**Proposal: emit fire-span first, before any reservation/spawn logic, with span status set to OK.** If subsequent logic fails, emit a separate `continuation.disabled` (or future `continuation.delegate.error`) sibling. Keeps the fire event truthful: timer DID fire; what happened next is a separate concern.

## Tests proposed

In `continuation-tracer.test.ts`:
1. Helper emits with all required attrs
2. `fire.deferred_ms` carried correctly
3. Truncates `reason.preview` to 80 chars (consistency w/ chunks 2–4)
4. try/catch swallows tracer failures and calls `log`

In `agent-runner.continuation-delegate-fire-span.test.ts` (new):
1. Bracket-delegate timer fire emits exactly one `continuation.delegate.fire`
2. Tool-delegate timer fire emits exactly one
3. `fire.deferred_ms` is non-negative and roughly matches the requested `delay.ms` (loose floor; CI timing varies)
4. chain.id matches the dispatch span's chain.id (trace stitches)
5. Wake-then-cap: fire emits, then disabled emits, both share chain.id

## Risks / non-goals

- **Not adding `continuation.queue.drain`** — separate chunk 6 candidate.
- **Not touching post-compaction sibling site** — separate chunk.
- **Not changing `ContinuationSpanAttrs` core required fields** — only adds one optional.
- **Not touching `dispatch` span** — chunk 3 is locked.

## Estimated diff size

- Helper: ~30 lines (`continuation-tracer.ts` + JSDoc)
- Tracer enum: +1 line union member
- Wire sites: ~25 lines × 2 (bracket-delegate + tool-delegate) = ~50 lines
- Helper test: ~50 lines
- Integration test: ~80 lines

**Total: ~180 lines added, ~5 modified.** Larger than 5a but still single-PR-reviewable.

## Open questions for cohort

1. **Q1 site scope** — agree timer-callback-only? Or should immediate-delivery also emit a fire-span for consistency (even though it's redundant with dispatch)?
2. **Q2 attr shape** — agree single-optional `fire.deferred_ms`? Or carve a fire-specific attr subset?
3. **Q5 work-fire** — punt to chunk 5c, or include in 5b for symmetry?
4. **Q6 error handling** — agree fire-span emits first, before reservation/spawn? Or only emit on successful spawn-start?

If memo lands clean, PR follows with same wire approach as chunks 2/3/4 (helper + tests + 2-3 wire sites). — 🌫️
