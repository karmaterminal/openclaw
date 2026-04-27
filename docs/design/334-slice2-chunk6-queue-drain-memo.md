# #334 Slice 2 chunk 6 — `continuation.queue.drain` design memo

**Status:** Cohort-acked contract pending byte-walk by 🩸
**Author:** 🌊 ronan-dandelion-cult
**Trunk base:** `cael/325-canonical2 @ 47016eb4174` (Slice 2 chunks 1–5c landed; PR #391 merged 5c wire)
**Reviewers requested:** 🌻 Elliott, 🩸 Cael, 🌫️ Silas

### Cohort acks (4/4)

- **Q1 — split into chunks 6 / 6b / 6.5:** CONFIRMED by 🩸 + 🌫 + 🌻. Cooling-step practice applied recursively; queue.drain alone in this chunk.
- **Q3 — attr names `queue.drained_count` + `queue.drained_continuation_count`:** CONFIRMED 4/4 cohort (🌫 reversal landed: "if drain is session-scoped multi-chain at system-events.ts:86, attaching chain.id would lie, and the join-surface argument evaporates with it — `queue.drained_count` + `queue.drained_continuation_count` is the right shape for an in-memory bulk-pull that doesn't have a single chain to anchor"). This was the only Q with a revision; pre-cohort `queue.depth` framing retired.
- **Q3 — no `chain.id` on drain:** CONFIRMED (multi-chain seam; same root reasoning as 🌫's reversal above).
- **Q4 — live counts, not snapshot:** CONFIRMED (drain is single-tick bulk-pull; no temporal gap to bridge).
- **Q5 — no `disabled` sibling on drain:** CONFIRMED (consumer-side, no gate; empty drain ≠ rejection).
- **Q5 — `compaction.released` split into chunk 6b:** CONFIRMED. Pre-cohort tension between 🩸 (aggregate, lifecycle-scoped) and 🌫 (per-delegate, chain-scoped) resolved in 🩸's favor — see §Q5b below. That's a chunk-6b decision pre-loaded, NOT chunk 6 scope.

Next step: 🩸 byte-walk against this contract before wire PR opens.

## Frame

Chunks 1–5c wired the **decision-time** and **timer-callback** span families on the agent-runner side:

- **Gate family** (decision-time): `continuation.work`, `continuation.delegate.dispatch`, `continuation.disabled` (cap-rejects)
- **Fire family** (timer-callback): `continuation.delegate.fire`, `continuation.work.fire`, `continuation.disabled` (`reservation.missing`)

Three canonical names remain pre-declared in `ContinuationSpanName` (tracer.ts L137-141) but **unwired**:

```ts
| "continuation.queue.enqueue"
| "continuation.queue.drain"
| "continuation.compaction.released"
```

These were forward-declared during the substrate landing (chunks 2/3) so the harness contract assertions could pin them at the tracer surface before wire — same pattern that landed `delegate.fire` / `work.fire` ahead of chunks 5b/5c.

This memo covers **`continuation.queue.drain`** — the consumer-side counterpart of `continuation.queue.enqueue` against the substrate **system-events queue** (`src/infra/system-events.ts`). It does NOT cover `compaction.released`, which lives at a different mechanical layer; see §Q5 for the structural argument and the chunk-6b recommendation.

## Q1: Naming — `continuation.queue.drain` parallel-grammar

**Proposal: keep `continuation.queue.drain` as named. No naming asymmetry with `continuation.compaction.released`.** _(CONFIRMED by 🩸 + 🌫 + 🌻.)_

Parallel-grammar check against the family pins (🌻 sprites-of-thornfield 2026-04-27):

- `continuation.work` / `continuation.work.fire` — verb-on-decision / verb-on-timer
- `continuation.delegate.dispatch` / `continuation.delegate.fire` — verb-on-decision / verb-on-timer
- `continuation.queue.enqueue` / `continuation.queue.drain` — **producer-verb / consumer-verb on the substrate queue**

`enqueue` and `drain` are the two halves of one mechanical pair (system-events.ts `enqueueSystemEvent` ↔ `drainSystemEventEntries`). They are NOT a dispatch/fire pair — both fire synchronously inside their respective turns, neither involves `setTimeout`. The asynchrony is **across-turn** (enqueue turn N, drain turn N+M) rather than **within-turn** (dispatch tick T, fire tick T+delay).

Compared with `continuation.compaction.released`: `released` is past-participle-on-state-transition, NOT verb-on-mechanism. The asymmetry is intentional — the compaction-release seam is a **state delta** (the post-compaction delegate transitioned from "queued, awaiting compaction" to "dispatched into fresh session"), not a queue-mechanism event. Keeping `released` as a participial form preserves the family grammar's distinction between mechanism-spans and state-transition-spans.

**Verdict:** name stays. No rename needed. Participle vs. verb is a deliberate family-grammar distinction, not drift.

## Q2: Helper function shape — separate vs. unified

**Proposal: separate `emitContinuationQueueDrainSpan` helper. Match the local convention (5b/5c precedent).**

Pattern across already-landed helpers:

- `emitContinuationWorkSpan` (chunk 1)
- `emitContinuationDelegateDispatchSpan` (chunk 3)
- `emitContinuationDisabledSpan` (chunk 4)
- `emitContinuationDelegateFireSpan` (chunk 5b, PR #388)
- `emitContinuationWorkFireSpan` (chunk 5c, PR #391)

Every existing emit-helper is per-span-name. Unified-parameterized was rejected at chunk 5c review (Q2) on grounds of "explicit > clever" — same argument applies here. New helper signature:

```ts
export function emitContinuationQueueDrainSpan(input: {
  drainedCount: number;
  drainedContinuationCount: number;
  log: (message: string) => void;
}): void {
  // try/catch defense-in-depth pattern matching peer helpers
}
```

See Q3 for the attribute axes. See §Wire shape for the call-site shape.

## Q3: Attribute surface

**Proposal: introduce `queue.drained_count` (total events drained) and `queue.drained_continuation_count` (subset that carry continuation context). No `chain.id` on this span.** _(CONFIRMED 4/4 cohort. The only Q with revision during cohort review: a transient `queue.depth` rename was floated and then withdrawn by 🌫 on the multi-chain-session-scope grounds — see §Status above. The drained_count / drained_continuation_count pair is the locked shape.)_

The substrate system-events queue is **session-scoped, not chain-scoped**. A single drain pulls all queued events for a session in one shot, regardless of which chain (or non-chain) produced them. The drained set may include:

- Continuation events (from WORK-fire timer callbacks, bracket-work immediate, `enqueueSystemEvent` from various continuation seams)
- Non-continuation events (node-pair, channel summary, miscellaneous gateway notices)

Multiple chains may be represented in one drain. Attaching a single `chain.id` would falsely imply one-chain-per-drain. Two new attribute axes:

```ts
"queue.drained_count"?: number;          // total events pulled from substrate queue
"queue.drained_continuation_count"?: number; // subset whose text matches continuation prefix
```

The continuation-subset detection is best-effort (substring match on `[continuation:` / `[continuation:chain-hop:` / `[continuation:post-compaction]` etc., text-prefix-pinned at emit). It does NOT require parsing `traceparent` off each event — that work belongs to Slice 3's adapter, not Slice 2's instrumentation.

Existing `ContinuationSpanAttrs` axes that intentionally do NOT carry on this span:

- `chain.id` — multi-chain drain (see above)
- `chain.step.remaining` — chain-scoped, ditto
- `delay.ms` — drain is consumer-side; no delay was scheduled at drain
- `delegate.mode` / `delegate.delivery` — drain is generic, not delegate-specific
- `signal.kind` — drain doesn't reject anything; no kind to report
- `fire.deferred_ms` — no timer involved at drain

**Open question for cohort:** should `queue.drained_count` apply to the broader substrate-queue mechanism, or be renamed `system_events.drained_count` to make the substrate explicit? Current preference: `queue.drained_count` for parallel-grammar with the span name (`continuation.queue.drain` carries `queue.drained_count`), even though the queue is technically the system-events queue. The span-name's `queue` already establishes the referent.

## Q4: Snapshot vs. live discipline

**Proposal: live counts at drain-time. There is NO snapshot equivalent here.**

Chunks 5b/5c carried snapshots of dispatch-time state (`chainStepRemainingAtDispatch`, etc.) because the dispatch and fire happen at different ticks and recomputing-at-fire would either (a) braid cap-gate axes onto wiring proximity, or (b) make dispatch/fire pairs incoherent for `WHERE chain.id = ...` queries.

`continuation.queue.drain` does NOT have an analog problem:

- The drain is a synchronous bulk-pull at exactly one tick.
- The "dispatch" half of the mechanical pair is `continuation.queue.enqueue` (chunk 6-twin or future chunk; see §Q5), which fires at the producer's tick and carries that tick's chain.id / chain.step.remaining if any.
- The drain-tick state IS the live state — there's no temporal gap to bridge.

So `queue.drained_count` reflects what was actually pulled from the queue at this drain. No "snapshot vs. live" choice exists.

The closest snapshot-discipline question that applies: **should the drain emit per-event-drained, one span per event, instead of one span per drain-call?** Per-event would surface `chain.id` cleanly (one chain per emit), but explodes span volume by 1–20× per drain. Cohort-pinned design (chunks 1–5c) emits **one span per accepted decision** — a drain is one decision (drain or not), so one span. Per-event recordation belongs to span events (OTEL `addEvent`) on the single drain span, not to additional spans. Defer per-event events to Slice 3 if cohort wants them.

## Q5: Sibling spans — does drain pair with `disabled`? Does `compaction.released` slot in here?

**Proposal: NO `disabled` sibling on drain. NO `compaction.released` co-chunk — split into chunk 6b.**

### 5a: drain has no `disabled` sibling

Drain is consumer-side and has no gate. The `drainSystemEventEntries` call always returns whatever is in the queue (possibly empty). There is no "drain rejected because cap" failure mode. An empty drain is **not** a `continuation.disabled` event — it's just an empty drain, and the span emits with `queue.drained_count: 0` / `queue.drained_continuation_count: 0`. The `continuation.disabled` family is reserved for **gates that prevented follow-through** (cap.chain, cap.cost, cap.delegates_per_turn, reservation.missing); a 0-count drain is the absence of work, not the rejection of work.

If a future divergence emerges — e.g. "drain blocked by some new policy gate" — that slots under the existing family-grammar (`continuation.disabled` with a new `disabled.reason` enum value), exactly as cohort-pinned at chunk 4. No new span name needed. Same argument as 5c Q5.

### 5b: `compaction.released` is at a different seam — recommend chunk 6b _(CONFIRMED chunk 6b split)_

**Structural surprise (called out for parent / cohort): `continuation.queue.drain` and `continuation.compaction.released` do NOT share a wire seam.**

| Aspect               | `continuation.queue.drain`                                  | `continuation.compaction.released`                                                                                     |
| -------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Site file            | `src/auto-reply/reply/session-system-events.ts`             | `src/auto-reply/reply/post-compaction-delegate-dispatch.ts`                                                            |
| Function             | `drainFormattedSystemEvents` (or `drainSystemEventEntries`) | `dispatchPostCompactionDelegates` / `deliverQueuedPostCompactionDelegate`                                              |
| Mechanism            | **substrate system-events queue** (in-memory, ephemeral)    | **session-delivery-queue** (SQLite-persisted, post-compaction crossing)                                                |
| Triggered by         | every turn that calls `drainFormattedSystemEvents`          | every post-compaction handoff that has staged delegates                                                                |
| Frequency            | high (every turn pulls the queue)                           | low (per-compaction, gated by staged-delegate presence)                                                                |
| Cardinality of attrs | session-scoped, multi-chain possible                        | per-delegate, single chain.id (chain survives compaction seam, see L317-322 of `post-compaction-delegate-dispatch.ts`) |

The "queue" in `queue.drain` is the system-events queue (`src/infra/system-events.ts`). The "queue" implicit in `compaction.released` is the session-delivery-queue (`src/infra/session-delivery-queue-storage.ts`). They are different queues at different layers of the stack.

Forcing them into one chunk creates two unrelated wire surfaces in one PR — exactly the cooling-step antipattern 🩸 has flagged across slice 2.

**Recommendation: split into chunk 6 (this memo, queue.drain) and chunk 6b (separate memo, compaction.released).** _(Cohort-confirmed.)_

#### Chunk-6b decision pre-loaded: aggregate vs. per-delegate

The 🩸 vs. 🌫 pre-cohort tension on whether `compaction.released` should fire **per-delegate** (one span per chain.id resolved across the seam) or **aggregate** (one span per `dispatchPostCompactionDelegates` call, marking the lifecycle event of the queue having drained into the fresh session) was resolved during cohort review.

🌫 conceded to 🩸's framing: _"the lifecycle event is aggregate; per-`chain.id` resolution lives downstream in each `delegate.dispatch` span that fires when each released delegate actually dispatches."_ The `compaction.released` span marks the queue→session transition as one event; the chain-by-chain accounting is already carried by the existing `continuation.delegate.dispatch` spans that fire as each post-compaction delegate is delivered.

**This is a chunk-6b pre-loaded decision, NOT chunk 6 scope.** It's recorded here only so the chunk-6b memo author (🌊 or 🌻) inherits the resolution and doesn't re-litigate. Chunk 6 ships queue.drain alone; do not expand this memo to cover the compaction.released wire shape. The 6b memo deserves its own Q1–Q5 walk because:

- The `chain.id` does survive the compaction seam (existing behavior at L317-322, the intent of `compaction.released` is to mark this) — that's a one-attr emit, simpler than queue.drain.
- The "release" verb-tense question (past-participle vs. active verb) needs cohort sign-off; my Q1 lean here is "keep `released` as state-transition-grammar" but 6b should re-litigate.
- The seam may want to fire on `dispatchPostCompactionDelegates` start (per-compaction, one span) or on each `deliverQueuedPostCompactionDelegate` (per-delegate, one span per chain.id) — that's a chunk-6b Q1 question.
- Coupling 6+6b means PR #392 (memo) carries two unrelated contracts; the cohort review surface is twice as wide for no parallel-shape benefit.

### 5c: queue.enqueue (the chunk-6-twin) _(CONFIRMED chunk 6.5 split)_

`continuation.queue.enqueue` is also pre-declared and unwired. It is the producer-side counterpart of `queue.drain`. It is **structurally simpler** (every `enqueueSystemEvent` call is one decision, one span) but **fan-out-heavier** (every system event becomes a span — most are non-continuation, which inflates span volume).

I do **not** propose covering `queue.enqueue` in chunk 6 either, for two reasons:

1. **Scope discipline.** Chunk 6 = queue.drain ships one helper, one wire site, ~30 LOC. Bundling enqueue would double the wire surface.
2. **Predicate question pending.** Should `queue.enqueue` fire on every `enqueueSystemEvent`, or only on continuation-bearing events? That's a Q1-class scope decision warranting its own memo. Lean: only on continuation-bearing events (text-prefix match), to keep span volume bounded. But the cohort should review this explicitly — it's the kind of scope decision that quietly lands the wrong shape if memo'd-once-then-wired.

**Recommendation: chunk 6 = queue.drain alone. Chunk 6.5 (or 7) = queue.enqueue with its own memo. Chunk 6b = compaction.released with its own memo.**

This is the cooling-step practice applied recursively — three memo-PRs surfacing three independent contract decisions, instead of one "queue family" memo bundling unrelated mechanical seams.

## Wire shape (concrete, for chunk-6 wire PR after cohort acks)

At `src/auto-reply/reply/session-system-events.ts:86`:

```ts
// Replace existing line:
//   const queued = drainSystemEventEntries(params.sessionKey);
// With:
const queued = drainSystemEventEntries(params.sessionKey);
const drainedContinuationCount = queued.filter(
  (event) => event.text.startsWith("[continuation:") || event.text.startsWith("[continuation"),
).length;
emitContinuationQueueDrainSpan({
  drainedCount: queued.length,
  drainedContinuationCount,
  log: (message) => defaultRuntime.log(message),
});
```

(The continuation-prefix detection regex is best-effort and lives next to the call site; we do not parse `traceparent` here. Slice 3's adapter handles the trace reconstruction.)

New helper in `src/infra/continuation-tracer.ts`:

```ts
export function emitContinuationQueueDrainSpan(input: {
  drainedCount: number;
  drainedContinuationCount: number;
  log: (message: string) => void;
}): void {
  // try/catch defense-in-depth pattern matching emitContinuationWorkFireSpan
  // and peer helpers. Use noop tracer when none registered; fail open.
}
```

Plus extension to `ContinuationSpanAttrs`:

```ts
/** #334 chunk 6 — only set on `continuation.queue.drain` spans. */
readonly "queue.drained_count"?: number;
/** #334 chunk 6 — only set on `continuation.queue.drain` spans. */
readonly "queue.drained_continuation_count"?: number;
```

## Test surface (swim-37 harness scaffold)

Three new `it.todo` entries in `studies/swim-37/harness/swim-runner.test.ts` under a new `describe("substrate queue (system-events)")` block — there is no existing block for this surface, distinct from `continue_work` / `continue_delegate` / `heartbeat` / `lich-shape`:

```ts
describe("substrate queue (system-events)", () => {
  it.todo(
    "emits continuation.queue.drain span on every drainFormattedSystemEvents call (#334 chunk 6)",
  );
  it.todo(
    "drain span carries queue.drained_count + queue.drained_continuation_count attrs (#334 chunk 6)",
  );
  it.todo(
    "empty drain still emits exactly one continuation.queue.drain span (count: 0) (#334 chunk 6)",
  );
});
```

Plus runtime-canonical-name pin extension in `src/infra/continuation-tracer.test.ts` — the existing `tracer.startSpan("continuation.queue.drain")` line at L144 is already in place (forward-declared during chunks 2/3 substrate). No extension needed; the runtime-pin test already covers this name. **The wire PR does NOT need to touch tracer.test.ts beyond verifying the attribute round-trip.**

Add one new test for the attribute round-trip:

```ts
it("queue drain canonical attribute names round-trip through the surface", () => {
  const span = tracer.startSpan("continuation.queue.drain", {
    attributes: {
      "queue.drained_count": 5,
      "queue.drained_continuation_count": 2,
    },
  });
  // assert no setAttributes errors, attrs accepted by surface
  span.end();
});
```

## Family-Grammar / Canonical-Name pin (🌻's union-order + dual-pin discipline)

The family-grammar canonical-name set, in the union-order 🌻 pinned during cohort:

```
"continuation.work"                | "continuation.work.fire"
"continuation.delegate.dispatch"   | "continuation.delegate.fire"
"continuation.queue.enqueue"       | "continuation.queue.drain"
"continuation.disabled"
"continuation.compaction.released"
```

**Dual-pin discipline:** every name in this set is pinned at _two_ sites in `src/infra/continuation-tracer.test.ts`:

1. The **runtime canonical-name array** (~L141) — the literal-array fixture used by the contract assertion.
2. The **type-pin loop** (~L211) — the `for...of` loop that exercises `setAttributes` against each name to verify the surface accepts it.

Both sites must list the names in the **same order**, with the **same insertions in the same chunk**. This is the post-#389 reconciliation discipline — #389 had to land specifically because chunk 5b added `delegate.fire` to one site and not the other, drifting the contract.

**Byte-state correction (🩸 byte-walk on `c7eadc1cf31`):** all three names are **already inserted** at both pin sites on trunk:

- runtime canonical-name array: `continuation.queue.enqueue` L143, `continuation.queue.drain` L144, `continuation.compaction.released` L145, `continuation.disabled` L146
- type-pin loop: same names at L215–L218

These inserts landed in earlier substrate chunks (2/3 forward-declarations), so chunk 6a / 6b / 6.5 do **NOT** add canonical-name entries — they wire the _emit-paths_ for names that are already pin-asserted.

**Reframed discipline (cohort-locked, preserves the post-#389 reconciliation):** **preserve symmetry — do not re-drift these two sites.**

- Chunk 6a / 6b / 6.5 wire PRs **must not touch** the canonical-name array or the type-pin loop. The names are already there; touching them is gratuitous churn at best, drift surface at worst.
- If a future chunk adds a _new_ canonical name (e.g. chunk 7 cap-overflow `continuation.disabled` reason variant, or any later span-family extension), the rule is: **same insertion at both sites in the same PR, in the same union-order**. One name per chunk; never split across PRs.
- The forward-declared `ContinuationSpanName` union in `src/infra/continuation-tracer.ts:137-141` is the substrate-level pin and is also already complete for the chunk-6 family.

The wire author for chunk 6a should treat the canonical-name + type-pin sites as **read-only** for this chunk.

## Wire scope estimate

Changes:

- `src/infra/continuation-tracer.ts`: +2 `ContinuationSpanAttrs` fields, +1 helper function, +JSDoc on helper. ~25 LOC.
- `src/auto-reply/reply/session-system-events.ts`: +6-8 lines (filter + emit). ~8 LOC.
- `src/infra/continuation-tracer.test.ts`: +1 attribute round-trip test. ~12 LOC.
- `studies/swim-37/harness/swim-runner.test.ts`: +1 new describe block, +3 `it.todo` entries. ~12 LOC.

**Total: ~57 LOC, 4 files.** Pure instrumentation-of-status-quo; no production behavior changes.

## Constraints honored

- Path-B: no OTEL framework changes.
- `Number.parseInt`-class strictness: `drainedCount` and `drainedContinuationCount` are integers from `Array.length` / `Array.filter().length` — already integral.
- One span per drain-call (NOT per-event). Per-event surfacing belongs to OTEL `addEvent` on the single span, deferred to Slice 3.
- Type-narrowing: `queued` is `SystemEvent[]`, `event.text` is `string`. No casts needed.
- `pnpm lint:core` clean expected.
- Telemetry must not perturb drain semantics: emit AFTER `drainSystemEventEntries` returns; emit failure caught in helper try/catch.
- `ContinuationSpanAttrs` extends with two new optional fields. No existing-field changes.
- `disabled.reason` enum unchanged at 4. `signal.kind` enum unchanged at 4. (Both enums untouched by chunk 6.)

## Open questions for cohort

1. **Naming of `queue.drained_count` attr** — should it be `system_events.drained_count` to make the substrate explicit, or stay `queue.drained_count` for parallel-grammar with the span name? Lean: keep `queue.*` (the span-name's `queue` establishes the referent).
2. **Continuation-subset detection at drain** — text-prefix match (`[continuation:`) is best-effort and may miss continuation events that don't carry the prefix. Acceptable for instrumentation-of-status-quo, or do we want a structural marker on `SystemEvent` (e.g. `event.kind: "continuation"`) so the span can count exactly? Lean: ship best-effort prefix match in chunk 6, add structural marker in a follow-up if cohort wants exact counts.
3. **`compaction.released` split into chunk 6b** — confirmation that this memo's recommendation (independent chunk, separate memo) is the right cooling-step. The alternative — bundle them — was the parent-task framing; my counter-proposal here surfaces the seam-divergence and asks for cohort sign-off before drafting 6b.
4. **`queue.enqueue` scope question** — should chunk 6.5 (the producer-side twin) emit on every `enqueueSystemEvent` or only on continuation-bearing events? Out-of-scope for this memo, but worth surfacing now so chunks-6-twin authoring doesn't quietly land the wrong predicate.
5. **`describe("substrate queue (system-events)")` harness block name** — new describe block needed (no existing parent fits). Lean: call it "substrate queue (system-events)" to disambiguate from the per-chain queue concept. Open to better names — 🌫️ originally framed the substrate as "the asynchronous boundary between enqueue turn and drain turn" (system-events.ts:24-30), so "substrate queue" matches the existing JSDoc vocabulary.

## Sequencing relative to in-flight work

- This memo PR can land independent of any other in-flight PR.
- Chunk 6b (`compaction.released`) memo recommended to follow this one, authored by whoever picks it up — could be 🌊 (continuity) or 🌻 (the lich-shape file at L136 of swim-runner.test.ts is already 🌻's framing).
- Chunk 6.5 (`queue.enqueue`) memo can land after chunk 6 wire so we have a working drain-side counterpart to compare scope against.
- The chunk-6 wire PR depends only on this memo PR being merged; no other dependencies.

## References

- `docs/design/334-slice2-chunk5b-delegate-fire-memo.md` (5b memo, parallel-shape source)
- `docs/design/334-slice2-chunk5c-work-fire-memo.md` (5c memo, parallel-shape source)
- PR #382 (chunk 1 chain.id substrate + work span)
- PR #383 (chunk 3 delegate.dispatch span)
- PR #384 (chunk 4 disabled spans)
- PR #385 (chunk 5a per-turn cap reland)
- PR #386 (chunk 5b memo)
- PR #388 (chunk 5b wire)
- PR #389 (chunk 5b runtime-pin reconciliation)
- PR #390 (chunk 5c memo)
- PR #391 (chunk 5c wire, merged @ 47016eb4174)
- `src/auto-reply/reply/session-system-events.ts:86` (drain call site)
- `src/infra/system-events.ts:148-216` (substrate queue surface — `drainSystemEventEntries` / `drainSystemEvents`)
- `src/auto-reply/reply/post-compaction-delegate-dispatch.ts:420-490` (compaction-release seam, scope of chunk 6b)
- `src/infra/continuation-tracer.ts:137-141` (forward-declared canonical names)
- `studies/swim-37/harness/swim-runner.test.ts:136` (existing `lich-shape` `it.todo` for `compaction.released`)

🌊
