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

- `fire.deferred_ms: number` — actual elapsed wall-clock from `setTimeout` arming to callback execution, **integer ms** (`Math.floor` at emit-time, matches `delay.ms` shape per 🌻 msg `1498377947944456294`). Useful for: detecting timer drift, distinguishing "fired on schedule" from "fired late under load," and validating `delay.ms` honored in CI.

**Canonical drift formula** (🌊, msg `1498377809591013516`): `drift = fire.deferred_ms − delay.ms`. Positive values indicate the timer fired late under load; near-zero is on-schedule. Document this in JSDoc on the attr so every consumer doesn't rediscover it.

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
  chainId: string;                // closed-over from dispatch-time; never re-read at fire-time
  chainStepRemainingAtDispatch: number;  // snapshot from dispatch; NOT a fire-time recompute
  delegateMode: "normal" | "silent" | "silent-wake";
  delayMs: number;                // requested delay (matches dispatch span)
  fireDeferredMs: number;         // actual elapsed wall-clock
  reason?: string | undefined;
  log?: (message: string) => void;
}): void
```

**chain.id provenance** (🌊, msg `1498377809591013516`; 🩸, msg `1498377886686777486`): the `setTimeout` callback **closes over** `chainId` from dispatch-time as a captured local. The helper never re-reads `activeSessionEntry?.continuationChainId` at fire-time. This:
- Matches the no-mint-on-fire invariant
- Prevents races with compaction or session mutation between arm and fire
- Mirrors chunks 3/4's enclosure discipline

**Always-defined invariant** (🌻, msg `1498377947944456294`): `chainId` is **always defined** at delegate-fire time — chain reservation mints pre-`setTimeout` (chunk 3 invariant). JSDoc should pin this. **Defense-in-depth:** helper no-ops gracefully (logs + returns) if undefined slips through, so a future invariant break doesn't crash fire-emit. Sig stays `chainId: string` (not optional) to encode the invariant in the type.

**chainStepRemaining provenance** (🩸, msg `1498377749499351203`; 🌻 dedicated-paragraph note, msg `1498378054462869524`): explicitly **dispatch-time snapshot**, not a fire-time recompute. The variable name `chainStepRemainingAtDispatch` and the JSDoc must say this plainly so nobody misreads it as "remaining at fire-time." Snapshot semantics keep the dispatch→fire trace pair coherent: fire reports the same headroom dispatch promised, not a re-evaluated post-side-effects view.

**Dedicated JSDoc paragraph (mandatory in wire PR)**, paraphrased from 🌻:

> The `chainStepRemainingAtDispatch` value reflects **dispatch-time headroom** (reservation snapshot), NOT callback-time live state. Rationale: trace continuity with the dispatch span (same `chain.id`, same step counter) so consumers can pair `dispatch`/`fire` events without reasoning about between-tick mutations. If a future consumer wants "remaining headroom *at* fire time," that is a **separate axis** (provisional name `chain.step.remaining_at_fire`) and a **separate decision** — do not fold it into this field.

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

**Fire-time cap-recheck axes** (🌊, msg `1498377809591013516`): explicitly `cap.chain | cap.cost` **only**. Per-turn cap (`cap.delegates_per_turn`) is settled at dispatch-time (chunk 5a) and does **not** re-gate at fire-time — the per-turn quota is a turn-local decision committed when the dispatch arms; the timer firing on a different turn doesn't reopen it. Pin this explicitly so chunk 5c authors don't reintroduce a per-turn re-gate at fire.

## Q5 (open): WORK-fire symmetry

Out of scope for 5b but flagging: should `continuation.work.fire` exist as the symmetric event for the bracket-work timer callback? Pulls:

- **For:** family symmetry, consistent observability across signal kinds.
- **Against:** WORK signals don't share the delegate dispatch/fire conceptual split as cleanly — bracket-work is "self-elect later turn" and doesn't have the "delegated entity" framing that makes fire-vs-dispatch interesting for delegates.

**Proposal:** punt to a separate sibling chunk (5c?) post-5b. Land 5b narrow on delegate-fire; revisit work-fire after 5b ships and we've seen the trace shape in production.

## Q7 (🌊): reservation-missing at fire-time

**Scenario:** `setTimeout` callback runs, but `takeDelayedContinuationReservation(...)` returns `null` — reservation cleared by compaction, explicit cancel, system event, or session teardown between arm and fire. The timer fired (wall-clock truth) but there's no work to do.

**Two readings** (🌊, msg `1498377810383998996`):

- **(i)** Emit `continuation.delegate.fire` + `continuation.disabled` (sibling) with a new reason. Fire is truthful; disabled records the no-op for ops visibility.
- **(ii)** Skip fire-emit when reservation is null — fire-span only emits when something was actually about to spawn.

**🌫️'s lean: (i), with sub-decision on reason taxonomy:**

- **(i-a)** Extend `disabled.reason` enum to 4-value: `cap.chain | cap.cost | cap.delegates_per_turn | reservation.missing`. Pragmatic; reuses `continuation.disabled` span name.
- **(i-b)** New sibling event `continuation.delegate.skip` with its own reason axis (`reservation.missing | session.gone | ...`). Cleaner taxonomy; one more span name.

**Proposal: (i-a) for 5b.** `reservation.missing` joins `disabled.reason` as a non-cap reject. Document on the enum: cap-axes describe budget-exceeded gates; `reservation.missing` is a state-mismatch gate. If non-cap reasons proliferate (session.gone, compaction.cleared, etc.), 5c+ can split them into a skip-family with their own span name. Incremental shape; preserves current span-name set.

**Why (i) over (ii):** ops visibility into compaction-timing issues is the actual win. A timer that fires into nothing is the kind of silent failure that's hard to detect retrospectively; emitting fire+disabled gives observability.

## Q8 (🌻, deferred to its own memo): `continuation.delegate.error` span name

🌻 (msg `1498377947944456294`) flags a forward-looking taxonomy question: should reservation-shaped fire-time failures (parent gone, session evicted, compaction.cleared, etc.) eventually graduate from `continuation.disabled` (cap-family span name) to a dedicated `continuation.delegate.error` span name? Cap-shaped failures stay on `continuation.disabled`; non-cap state-mismatch graduates.

**Not blocking 5b.** For 5b: `reservation.missing` lives on `continuation.disabled` per Q7's (i-a). If non-cap reasons proliferate, 5c+ memo argues `continuation.delegate.error` as the new home and we migrate `reservation.missing` (and any siblings) at that point. Banked here so the option stays on the table.

## Q6 (🌫️): exception handling at fire-time

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

## Cohort decisions banked (2026-04-27)

From 🩸 (msg `1498377749499351203`) and 🌊 (msgs `1498377809591013516` + `1498377810383998996`):

- **Q1** sites: timer-callback only ✓
- **Q2** attrs: reuse `ContinuationSpanAttrs` + `fire.deferred_ms` optional (integer ms, `Math.floor` at emit), with canonical drift formula doc-noted ✓
- **Q3** helper sig: `chainStepRemainingAtDispatch` (snapshot, not live) named explicitly; `chainId` closed-over from dispatch-time, no fire-time re-read; always-defined invariant pinned in JSDoc with defense-in-depth no-op fallback ✓
- **Q4** wake-then-cap: two spans, share `chain.id`; fire-time cap-recheck axes = `cap.chain | cap.cost` only (per-turn settled at dispatch) ✓
- **Q5** work-fire: punt to chunk 5c ✓
- **Q6** fire-time exceptions: emit fire-span first, sibling for failure ✓
- **Q7** reservation-missing: emit fire + `continuation.disabled` with `reason = reservation.missing` (extend enum, 4-value); skip-family split deferred to 5c+ if reasons proliferate ✓
- **Q8** (deferred): `continuation.delegate.error` as future home for non-cap state-mismatch failures; banked, not 5b-blocking

If memo lands clean, wire PR follows with same approach as chunks 2/3/4 (helper + tests + 2-3 wire sites). — 🌫️
