# #334 Slice 2 chunk 6c follow-up — producer-coupling pin + cast cleanup

> Memo-before-wire (Cael🩸 cooling-step). Two narrow follow-ups for chunk 6c
> after #400 merged. Pure instrumentation + test hardening; **no semantic
> changes** to the cap gate, the dispatch path, or the SSOT shape. Additive.

## Scope

Two items, both surfaced during chunk-6c review (🩸/🌫 flags + 🌊 seal-flag):

1. **Producer-coupling test pin** for `incrementRunCompactionCount` →
   `emitContinuationCompactionReleasedSpan` `compaction.id` flow.
2. **Cosmetic cast cleanup** at `continuation-tracer.ts:807`
   (`attrs as Record<string, SpanAttributeValue>`).

Both items are in-scope for a single small PR. Refuse-to-bundle anything
unrelated (e.g. `persistContinuationChainState` return-type tightening,
Q8 memo, openclaw.json drift — all separate PRs per existing TODO list).

## (1) Producer-coupling test pin

### What's there now

`continuation-tracer.test.ts:1440-1463`:

```ts
it("producer-side pin: compactionId values in producer range [1..N] are all accepted", () => {
  const { tracer, spans } = makeRecordingTracer();
  setContinuationTracer(tracer);
  for (const id of [1, 2, 10, 100]) {
    emitContinuationCompactionReleasedSpan({ releasedCount: 1, compactionId: id });
  }
  // ...assertions on integer >= 1...
});
```

This test **samples** the producer's documented range. It does not invoke
the producer. If the producer contract drifts (e.g. a code path that
returns `0` or a non-integer), this test still passes because the input
list is hand-coded.

### What the followup adds

A second test that:

- Builds a minimal `cfg` + `sessionStore` + `sessionEntry` shaped just
  enough for `incrementRunCompactionCount` to run.
- Calls `incrementRunCompactionCount({ ..., amount: 1 })` and captures
  the returned `count`.
- Passes that `count` into `emitContinuationCompactionReleasedSpan` via
  a recording tracer.
- Asserts `attrs["compaction.id"] === count` (the value actually flows
  through, not a hand-coded constant).
- Repeats with `amount: 3` to sanity-check non-1 increments.

This wires the existing reference-by-name JSDoc pin
(`continuation-tracer.ts:193`) to a _called_ contract, not a _sampled_
one. If the producer ever returns something the helper would drop
(e.g. `0`, fractional, negative, undefined-on-error), the test fails
with a precise message identifying which side broke.

### What it does NOT do

- No change to the producer's behavior.
- No change to the helper's validate-and-drop boundary (validate-and-
  drop-with-log stays as-is per chunk-6c memo §B).
- No coverage of the agent-runner integration path — that's a different
  test (`agent-runner.test.ts`) and a different PR if needed.

## (2) Cosmetic cast cleanup

### What's there now (cast cleanup)

`continuation-tracer.ts:797-810`:

```ts
const attrs: ContinuationSpanAttrs = {
  "signal.kind": "compaction-release",
  "compaction.released": releasedCount,
};

const compactionId = args.compactionId;
if (typeof compactionId === "number" && Number.isInteger(compactionId) && compactionId >= 0) {
  (attrs as Record<string, SpanAttributeValue>)["compaction.id"] = compactionId;
} else if (compactionId !== undefined) {
  args.log?.(`...invalid compaction.id (${compactionId}); dropping attr`);
}
```

The cast exists because `ContinuationSpanAttrs` declares `readonly`
fields. Mutating after construction requires the cast.

### What the followup changes

Replace mutation with construction-time conditional spread:

```ts
const compactionId = args.compactionId;
const compactionIdValid =
  typeof compactionId === "number" && Number.isInteger(compactionId) && compactionId >= 0;

if (!compactionIdValid && compactionId !== undefined) {
  args.log?.(`...invalid compaction.id (${compactionId}); dropping attr`);
}

const attrs: ContinuationSpanAttrs = {
  "signal.kind": "compaction-release",
  "compaction.released": releasedCount,
  ...(compactionIdValid ? { "compaction.id": compactionId } : {}),
};
```

- No cast.
- `readonly` invariant preserved (object built once, never mutated).
- Validate-and-drop-with-log semantics preserved (log fires on invalid-
  but-defined; silent on undefined).
- Log fires _before_ construction so the validation path is visible
  even on the (unreachable) future case where construction itself
  throws.

### What it does NOT do (cast cleanup)

- No change to `ContinuationSpanAttrs` type (still `readonly`).
- No change to the boundary contract (same inputs → same outputs).
- No change to the `releasedCount` path (already constructs cleanly).

## Test impact

- One new test in `continuation-tracer.test.ts`
  (`"producer-coupling: incrementRunCompactionCount return value flows
to compaction.id attr"`).
- Existing `producer-side pin` test stays — it documents the _range_
  contract; the new test documents the _call-site_ contract.
- Existing validate-and-drop boundary tests unchanged — same behavior.
- Existing `attrs["signal.kind"]` and `attrs["compaction.id"]`
  assertions unchanged.

## Out of scope (refuse-to-bundle)

- `persistContinuationChainState` return-type tightening (own PR).
- Q8 memo (`continuation.delegate.error`).
- `openclaw.json` drift reconciliation.
- Any wire change in `agent-runner.ts` beyond import-graph stability
  verified by `pnpm lint:core`.
- Bootstrap-repo generalization-memo.

## Cooling-step gate

Memo lands first. Wire follows in a second commit on the same PR (or
a follow-on PR if cohort prefers wire-time-split). Default: single PR
with two commits — memo, then wire — to keep blast radius tight.

## Branch

`ronan/334-slice2-chunk6c-followup` off `cael/325-canonical2` head
`5e90c859b97`.
