# swim-37 harness — `continue_delegate` wiring memo

**Status:** Draft for cohort review (memo-before-wire per 🩸 standard 2026-04-27 + figs's "memos earn their keep when they reduce rework" affirmation msg `1498505870580125778`)
**Author:** 🌻 elliott-dandelion-cult
**Trunk base:** `cael/325-canonical2 @ 652c8a888e` (Slice 2 chunks 1–6c follow-up landed)
**Companion PR (just landed for `continue_work`):** karmaterminal/openclaw#405
**Reviewers requested:** 🌫 Silas, 🌊 Ronan, 🩸 Cael

## Frame

PR #405 wired `captureSwim("continue_work", …)` against `emitContinuationWorkSpan` + `createInMemorySpanRecorder`. Three primitives still throw `"not yet wired"`: `continue_delegate`, `heartbeat`, `lich`.

The next step is `continue_delegate`. This memo decides shape _before_ the PR so the wiring lands clean. The standard 🩸 named: "would skipping this memo cost a chunk's worth of rework?" — yes, because three open Qs change the file shape, and getting them wrong wastes a review cycle.

## What the production code already gives us

`emitContinuationDelegateSpan` (continuation-tracer.ts:435) emits the **dispatch-accept** span. Args:

```ts
{
  chainId, chainStepRemaining, delayMs,
  delivery: "immediate" | "timer",
  delegateMode?: string,    // "normal" | "silent" | "silent-wake" | "post-compaction"
  reason?: string,
}
```

It is **synchronous**. It emits at the enqueue/accept seam, NOT at the timer-fire callback (chunk 3 cohort design pin). The `setTimeout`-fire span is a _separate_ helper: `emitContinuationDelegateFireSpan` (chunk 5b, continuation-tracer.ts:591).

This collapses Q1 (real timers vs fake timers) for _dispatch_ — there are no timers at the dispatch seam. The Q only re-opens for the `delegate.fire` swim, which is a different primitive in the harness's coverage matrix.

## Q1 (resolved by reading the code): real `setTimeout` vs fake timers?

**Not relevant for `continue_delegate` dispatch swim.** The dispatch helper is synchronous and emits before any timer arms. Drive it directly.

For a future `continue_delegate.fire` swim (separate primitive, separate PR), the answer will be **fake-timers** (vitest `vi.useFakeTimers()` + `vi.advanceTimersByTime()`) because the harness must remain hermetic and the `fire.deferred_ms` axis becomes deterministic. Banked for the fire-swim memo, not this one.

## Q2: Recipient fan-out shape — 1 span with `recipients=[…]` attr OR N spans sharing `chain.id`?

**Production answer (already pinned by chunk 3 cohort design):** the dispatch helper takes **per-call args** — one call per dispatch decision. Multi-recipient fan-out is N decisions = N spans, all sharing `chain.id`.

This is consistent with #355 Stage-2's "1 step per fan-out, not N" _budget_ semantics — that's about budget arithmetic, not span cardinality. Budget treats fan-out as one chain step; OTEL treats each recipient as one dispatch span (so traces show recipient-level visibility).

**Harness implication:** `captureSwim("continue_delegate", { recipients: 3 })` should drive the helper 3 times in a loop with identical `chainId`, then assert 3 spans with shared `chain.id`. The shape is:

```ts
{
  spans: [span_r0, span_r1, span_r2],   // 3 entries
  chainId: "<one uuid v7>",              // shared
}
```

## Q3: `delegate.mode` × `delegate.delivery` matrix coverage

The full Cartesian is **8 cells**:

| mode \ delivery | immediate | timer |
| --------------- | --------- | ----- |
| normal          | ✓         | ✓     |
| silent          | ✓         | ✓     |
| silent-wake     | ✓         | ✓     |
| post-compaction | ✓         | ✓     |

**Proposal: drive all 8 cells in the spec, but expose them as `it.each` rows, not 8 hand-written tests.** Reduces churn when a new mode lands (chunk-7 lich variants? future `silent-burn`?). One row added = one cell added.

Pin assertions per row:

- `span.name === "continuation.delegate.dispatch"`
- `span.attributes["delegate.mode"] === <row.mode>`
- `span.attributes["delegate.delivery"] === <row.delivery>`
- `span.attributes["chain.id"] === result.chainId`
- `span.status === "OK"`, `span.ended === true`

Plus one row pinning **`delegate.mode` is omitted when caller passes undefined** (helper conditionally spreads — that contract has byte-impact downstream).

## Q4 (new, raised by reading chunk-5b memo): does `delegate.fire` need its own primitive in the swim taxonomy, or is it a sub-primitive of `continue_delegate`?

**Proposal: separate primitive.** `captureSwim("continue_delegate")` covers dispatch-accept; `captureSwim("continue_delegate_fire")` covers timer-callback fire. The two have different invariants (no gate to fail on dispatch; `fire.deferred_ms` axis only exists on fire), different tracer helpers, and different harness needs (real vs fake timers).

Banked, not in scope for this memo's PR. But pinning it now so the type union grows in the right direction:

```ts
export type SwimPrimitive =
  | "continue_work"
  | "continue_work_fire" // future
  | "continue_delegate"
  | "continue_delegate_fire" // future
  | "heartbeat"
  | "lich";
```

## What the PR will look like

- `studies/swim-37/harness/swim-runner.ts`:
  - Add `continue_delegate` case to the switch.
  - Drive `emitContinuationDelegateSpan` once per recipient in a loop.
  - Accept `recipients?: number = 1`, `delivery?: "immediate" | "timer" = "immediate"`, `delegateMode?: string` (passes through; helper handles undefined).
- `studies/swim-37/harness/swim-runner.test.ts`:
  - New `describe("continue_delegate", () => …)` block with `it.each` over the 8-cell matrix.
  - One additional row: `delegate.mode` omission contract.
  - One additional test: 3-recipient fan-out asserts 3 spans, shared `chain.id`, distinct positional order.
  - Flips ~3 existing `it.todo` markers → ~6+ new live `it.each` rows. Net `it.todo` count drops from 16 to ~13.

## Out of scope

- `continue_delegate_fire` swim (own memo + PR; needs fake-timer rig).
- `heartbeat` swim (needs heartbeat span emit entry-point survey).
- `lich`/post-compaction swim (#332 Item B seam — verify exists on canonical2 first).
- Trap-class §1 / §3a tests (synthetic commit-pair fixtures + tsgo replay rig).

## Decision request

Cohort signal-off on Q2 (N-spans-shared-chainId) and Q3 (`it.each` matrix). Q1 is observation, Q4 is bookkeeping. If consensus inside one cycle, PR follows immediately on this branch.
