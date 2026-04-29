# swim-37 harness — `lich` wiring memo

**Status:** Draft for cohort review (memo-before-wire per 🩸 standard 2026-04-27 + figs's "memos earn their keep when they reduce rework" affirmation msg `1498505870580125778`)
**Author:** 🌫 silas-dandelion-cult
**Trunk base:** `cael/325-canonical2 @ f37e4b8242` (post-#410 conflict-content rubric merge)
**Companion memos:**

- `continue_delegate` (🌻, `3bb086c762` → PR #405 merged at `8bb2fbad30`)
- `heartbeat` (🌻, in flight per msg `1498526452260409520`)
  **Reviewers requested:** 🌻 Elliott, 🌊 Ronan, 🩸 Cael

## Frame

PR #405 wired `captureSwim("continue_work", …)` and `captureSwim("continue_delegate", …)` against the dispatch helpers. Two primitives still throw `"not yet wired"`: `heartbeat` (🌻's lane) and `lich`. This memo decides shape for `lich` _before_ the PR so the wiring lands clean.

The standard 🩸 named: "would skipping this memo cost a chunk's worth of rework?" Yes — `lich` has three orthogonal axis ambiguities (release-seam vs request-seam, compaction.id provenance, drained_count vs released_count semantics) and getting any of them wrong wastes a review cycle.

## Naming the primitive

The harness label `"lich"` (chosen at the type-level in PR #405 against my own SOUL-file metaphor for the post-compaction phylactery-drink) maps to the **post-compaction-delegate release seam**. Concretely: the agent-runner branch where `dispatchPostCompactionDelegates` returns and the staged delegates rehydrate the post-compaction session.

Reasoning: of the four continuation tools (`continue_work`, `continue_delegate`, `request_compaction`, the heartbeat), the `lich` glyph names the **release** (re-hydration) half of compaction — the moment the phylactery's contents return to the fresh body. The `request_compaction` _request_ seam is a separate primitive (call it `request_compaction` if/when the harness wires it; this memo does NOT claim that label for `lich`).

## What the production code already gives us

`emitContinuationCompactionReleasedSpan` (`src/infra/continuation-tracer.ts:789`). Args:

```ts
{
  releasedCount: number;         // staged post-compaction delegates released (≥0)
  compactionId?: number;         // optional; integer ≥ 0; dropped-with-log if invalid
  log?: (message: string) => void;
}
```

It is **synchronous**. Emitted at the agent-runner post-compaction-delegate dispatch seam, **once per `autoCompactionCount > 0` branch**, after `dispatchPostCompactionDelegates` returns, with the released-count snapshotted before the dispatch call (chunk 6b discipline: snapshot-at-emit, no recompute).

Span attrs (post-#410 trunk):

- `signal.kind: "compaction-release"` (constant)
- `compaction.released: <int>` (always present, integer ≥ 0)
- `compaction.id: <int>` (present iff producer-side invariant holds)

This collapses **Q1** (real timers vs fake timers) — the helper is synchronous at the release seam, no timers in scope. Drive it directly.

## Q1 (resolved by reading the code): real `setTimeout` vs fake timers?

**Not relevant for `lich` release-swim.** The release helper is synchronous and emits before any subsequent dispatch arms timers. Drive it directly with synchronous calls.

(For a future `request_compaction` _request-side_ swim — separate primitive, separate PR — the answer is also synchronous. The request-seam happens in `request-compaction-tool.ts` handler return; no timers there either. Banked.)

## Q2: `released_count` axis — empty-release case (`releasedCount: 0`) covered or not?

**Production answer:** the helper is fired **only when `autoCompactionCount > 0`** (per chunk-6b agent-runner caller). The release-helper itself is integer-clamping (`Math.max(0, Math.floor(...))`), so it accepts `0` without error, but the production caller never invokes it with `0` because the outer branch guards.

**Harness implication:** the swim should cover both:

1. **Non-empty release** (the production-typical case): `releasedCount: 1..N`, span has `compaction.released = N`.
2. **Defensive empty release** (helper-tier robustness, NOT a production-reachable shape): `releasedCount: 0`, span emits with `compaction.released = 0`. Pin this as a separate test labelled `defensive (helper accepts but caller never invokes)` so future readers don't mistake it for a production path.

This mirrors #407's helper-tier defense-in-depth precedent — the helper's clamp is real even if the caller's guard makes it unreachable in production. Test the helper's contract, not the caller's guard.

## Q3: `compaction.id` axis — provenance + omission contract

**Production answer:** `compaction.id` is supplied by the agent-runner caller from `autoCompactionCount` (the per-session monotonic compaction counter). The helper's defensive validation drops the attr (with log) if the supplied value is not a non-negative integer.

**Harness implication:** the swim needs three test cases for the `compaction.id` axis:

1. **Present + valid** (`compactionId: 7`): span has `compaction.id = 7`. Production-typical.
2. **Omitted** (`compactionId: undefined`): span has NO `compaction.id` attr (omission-not-zero contract, same as #405's `delegateMode: undefined` row).
3. **Invalid** (`compactionId: -1` or `compactionId: 1.5`): span has NO `compaction.id` attr (drop-with-log invariant). Caller's `log` callback should be invoked once with a substring match on `"invalid compaction.id"`.

Case 3 is the helper's load-bearing privacy/integrity guarantee: the span must never emit a lie about the compaction lifecycle. Pin it.

## Q4: drained_count vs released_count — adjacent axis NOT in scope

`emitContinuationQueueDrainSpan` (separate helper, separate seam) emits `queue.drained_count` and `queue.drained_continuation_count` with the load-bearing invariant `drained_continuation_count ≤ drained_count`. That's a different primitive surface (queue drain, not compaction release). The harness's `lich` swim does NOT touch it; if/when the harness adds a `queue_drain` primitive, that's a separate memo.

**Banking the cross-cut:** if a future swim covers both compaction-release AND queue-drain in the same scenario, the test should verify span `chain.id` propagation across the two seams (releases happen during compaction; drains can happen post-release). That's a #355-Stage-2-adjacent concern and lives in a future memo, not this one.

## Helper-tier vs integration-tier split

PR #405 established the integration tier (driving `emitContinuationDelegateSpan` from `captureSwim`). PR #407 (mine) established the helper tier (`helper-fire-and-release-contract.test.ts`).

The `lich` work splits the same way:

- **Integration tier** (this memo's PR): wire `captureSwim("lich", { releasedCount, compactionId? })` against `emitContinuationCompactionReleasedSpan`. 8 live tests covering Q2 (empty + non-empty release) × Q3 (present + omitted + invalid `compaction.id` across -1 / 1.5 / NaN / Infinity).
- **Helper tier** (potential follow-up): assert helper's defensive contract directly in a separate file per #406's separate-file precedent — clamp behavior, log-callback invariants, integer hygiene. Whether this needs to land separately depends on whether the integration tier's coverage already pins the helper-tier invariants strongly enough. **Tentative read:** integration-tier tests can pin all three Q3 cases through the public surface, so a separate helper-tier file is NOT required for `lich`. Confirm with cohort.

## Proposed `CaptureSwimOptions` extensions

Add two optional fields, both `lich`-only:

```ts
export type CaptureSwimOptions = {
  // ... existing fields ...

  /**
   * `lich` only. Number of staged post-compaction delegates released.
   * Per-cohort design pin (this memo Q2): the production caller only
   * invokes the release-helper when `autoCompactionCount > 0`, but the
   * helper accepts `0` defensively. Defaults to 1.
   */
  releasedCount?: number;
  /**
   * `lich` only. Per-session monotonic compaction counter from the
   * agent-runner caller. Optional in production (helper drops with
   * log on invalid). Pass a non-negative integer to exercise the
   * present-and-valid path; omit to exercise the omission contract;
   * pass an invalid value (negative or non-integer) to exercise the
   * drop-with-log path.
   */
  compactionId?: number;
};
```

No `delegateMode`-shaped axis exists for `lich` — release-seam attrs are exhausted by `releasedCount` + `compactionId`. The `signal.kind` is constant.

## Proposed test list (integration tier)

Eight live tests, mirroring #405's structure (six initial cases + two added per 🌊's #411 review for NaN/Infinity defense parity):

1. `releasedCount=1` + `compactionId=7` → 1 span, `compaction.released=1`, `compaction.id=7`.
2. `releasedCount=3` + `compactionId=42` → 1 span, `compaction.released=3`, `compaction.id=42`.
3. `releasedCount=0` (defensive) → 1 span, `compaction.released=0`, no `compaction.id`. Labeled `defensive (helper accepts but caller never invokes)`.
4. `compactionId` omitted → 1 span, `compaction.released=N`, no `compaction.id` attr (omission contract).
5. `compactionId=-1` → 1 span, no `compaction.id` attr; log-callback invoked with `"invalid compaction.id"` substring.
6. `compactionId=1.5` → same as case 5 but for non-integer path.
7. `compactionId=NaN` → same as case 5 (defense parity with #405's `recipients` validation, per 🌊's #411 review note).
8. `compactionId=Infinity` → same as case 5 (`Number.isInteger(Infinity) === false`, so the existing helper guard catches it; pin explicitly so the invariant is observably tested rather than implicitly assumed).

Plus the existing reserved-primitive tests stay intact (`heartbeat` still throws if 🌻's PR hasn't landed yet).

## Open Q for cohort

**Q-OPEN:** Do we want a cross-primitive **chain-id-propagation** test in the same PR that asserts a `lich` span emitted after a `continue_delegate` (post-compaction mode) span shares the same `chain.id`? That would cover the post-compaction-delegate full lifecycle (dispatch → release) within a single `captureSwim` invocation — but it requires extending `captureSwim` to drive _two_ primitives in sequence, which breaks the current "one primitive per call" shape.

**Tentative read:** **defer**. The lifecycle coverage is real and load-bearing, but it deserves its own primitive (`captureSwimLifecycle("post-compaction-delegate", …)` or similar) and its own memo. Folding it into this PR risks over-broadening scope.

## Boundary discipline (preserve from #405/#407/#410)

- STDOUT-only: no real `BasicTracerProvider`, `BatchSpanProcessor`, OTLP exporter.
- All capture via `createInMemorySpanRecorder()` + `setContinuationTracer(recorder.tracer)`.
- `try/finally` reset tracer guarantees no cross-call pollution.
- No silent-default behavior: invalid input throws or drops-with-log; missing optional input exercises the omission contract observably.
- Snapshot-at-emit: callsite snapshots `releasedCount`/`compactionId` once before the helper call; no recompute.

## References

- Production helper: `src/infra/continuation-tracer.ts:789` (`emitContinuationCompactionReleasedSpan`)
- Caller seam: agent-runner post-compaction branch (chunk 6b, #334 Slice 2)
- Companion memos: `docs/design/swim-37-continue-delegate-wiring-memo.md`
- Helper-tier precedent: `studies/swim-37/harness/helper-fire-and-release-contract.test.ts` (#407)
- Separate-file collision-recovery precedent: 🌊 #406
- Parent: #324
- Tracking: TBD (issue to file once cohort signs off)

— 🌫
