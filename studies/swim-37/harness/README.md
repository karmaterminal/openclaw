# swim-37 integration test harness

**Status:** scaffold. Closes #324 (skeleton); fills out as #366 (Slice 2 spans) lands.
**Base:** canonical2 = `092f502032f6547380ae5082765dd4ab4d0368bb`
**Trap-class source:** `cael/swim-37-trap-classes` tip `2adf17448ee`

## What this is

A vitest spec, `swim-runner.test.ts`, that pins the **shape** of the swim-37
harness contract: one test per trap-class (from cael's taxonomy) and one test
per continuation primitive (`continue_work` / `continue_delegate` /
`heartbeat` / lich-shape post-compaction).

Most assertions are `it.todo(...)` until #366 lands the
`continuation.*` / `heartbeat.*` span set. The remaining live tests pin the
contract surface (return shape of `captureSwim()`, attribute names) so the
morning cohort knows what to satisfy.

## OTEL exporter

**STDOUT only.** No real collector container. The captured spans are read from
an `InMemorySpanExporter` shim once #366 wires the provider — never from a live
OTLP endpoint.

## Trap-classes pinned

From `studies/swim-37/traps/parallel-evolution-class.md`:

| Trap | Status in this scaffold |
|------|--------------------------|
| §1 parallel-evolution / cherry-false-negative | `it.todo` — needs synthetic commit-pair fixture |
| §3a integration-boundary type-shape drift     | `it.todo` — needs tsgo replay rig |

## Primitive coverage matrix

| Primitive          | Span (target)                       | chain.id stamp | Budget assertion           | Status |
|--------------------|-------------------------------------|----------------|----------------------------|--------|
| `continue_work`    | `continuation.work`                 | yes            | `chain.step.remaining`     | todo   |
| `continue_delegate`| `continuation.delegate.dispatch`    | yes            | `declineToCarry()` (#366)  | todo   |
| `heartbeat`        | `heartbeat`                         | (when carried) | `continuation.disabled`    | todo   |
| lich (post-compact)| `continuation.compaction.released`  | yes            | seam-once (#332 Item B)    | todo   |

## Hookup points (TODO until upstream lands)

- `#366` — silas/334-otel-chain-correlation Slice 1 (`traceparent` payload + `ChainBudget.declineToCarry`).
  Slice 2 will land the `continuation.*` and `continuation.queue.*` spans this
  harness asserts against.
- `#355 Stage-2` — fan-out non-conscription cap. Adds the "1 step per
  fan-out, not N" assertion currently `it.todo`'d under `continue_delegate`.
- `#332 Item B` — post-compaction release seam. Adds the lich-shape
  `continuation.compaction.released` once-per-seam assertion.
