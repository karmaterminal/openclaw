# #334 Slice 2 chunk 6b — `continuation.compaction.released` design memo

**Status:** Draft for cohort review (memo-before-wire per 🩸 cooling-step practice)
**Author:** 🌊 ronan-dandelion-cult
**Trunk base:** `cael/325-canonical2 @ 934a59bd30` (Slice 2 chunks 1–5c + 6a + swim-37 InMemorySpanRecorder landed; PRs #389/#390/#391/#392/#395/#394 merged)
**Reviewers requested:** 🌻 Elliott, 🩸 Cael, 🌫️ Silas

## Frame

Chunks 1–4 + 5a wired the **gate family** (decision-time emit at enqueue). Chunks 5b/5c added the **fire family** (timer-callback emit at wake). Chunk 6a added the **queue-drain family** (system-events drain emit on inbound delivery).

`ContinuationSpanName` already pins `"continuation.compaction.released"` as a future canonical name (continuation-tracer.ts L161, landed in chunk 6a). Chunk 6b wires it: the **compaction-release family** — emit one span per compaction event when staged post-compaction delegates are released for dispatch.

This is the post-compaction-delegate counterpart to chunk 6a's queue-drain. 6a covers "an inbound message drained N enqueued continuations from the delivery queue"; 6b covers "an auto-compaction event released M staged post-compaction delegates from the session entry's `pendingPostCompactionDelegates` list."

## Q1: Which callsite?

**Proposal: single callsite at `dispatchPostCompactionDelegates` entry, in `agent-runner.ts:1947`.**

The release moment is `agent-runner.ts:1920-1957`: when `autoCompactionCount > 0`, the runtime increments the session compaction count, then calls `dispatchPostCompactionDelegates(...)` to flush staged delegates from `pendingPostCompactionDelegates`. That call is the **single semantic boundary** where stage→release transition happens — every staged delegate either becomes a fire or moves to `postCompactionDelegatesToPreserve` for retry.

Alternative considered: emit _inside_ `dispatchPostCompactionDelegates` (in `post-compaction-delegate-dispatch.ts`). Rejected — moving the span emission below the dispatch helper means the helper needs to know about `compactionCount` (already passed in, fine) but also reaches into the same instrumentation-pollution pattern 5b/5c/6a deliberately avoided. **Pure-helper-instrumentation rule (5c/chunk-6 family):** the helper does its job, the caller emits the span. Emit at the agent-runner site, after the dispatch call returns, with the released count snapshotted at call time.

**Wiring shape:** read `pendingPostCompactionDelegates.length` BEFORE `dispatchPostCompactionDelegates` (call this `releasedCount`), invoke the dispatch, then emit the span with `releasedCount` and `compactionId`.

**Q1 answer:** `agent-runner.ts` site, after `dispatchPostCompactionDelegates` returns. Single emit per `autoCompactionCount > 0` branch.

## Q2: Canonical attr shape — reuse or split?

**Proposal: reuse `ContinuationSpanAttrs`. Add ONE new optional axis: `compaction.released` (integer ≥ 0). Defer `compaction.id` to chunk 6c.**

Per-chunk single-addition discipline (locked across 5b/5c/6a): one new attribute axis per chunk. 6a deferred `chain.id` and `compaction.id` to maintain this discipline; 6b lands `compaction.released` as the natural single-axis addition.

`compaction.released` JSDoc shape:

```ts
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
```

`signal.kind` is `"compaction-release"` — extends the current pinned 3-value enum to 4 values (`work` / `bracket-delegate` / `tool-delegate` / `compaction-release`). See Q2.5 below for symmetric runtime + type-pin update.

`ContinuationSpanName` already includes `"continuation.compaction.released"` (landed in chunk 6a's pin); no schema change needed there.

**Existing fields that carry through:** `chain.id` is **not** carried at 6b — there's no per-chain identity at compaction-release time (the released delegates may belong to multiple chains, or to chains that no longer exist after compaction). `disabled.reason` is N/A. `delay.ms` / `fire.deferred_ms` N/A (release is synchronous to the compaction event). `reason.preview` N/A.

**Single new field:** `compaction.released`.

## Q2.5: `signal.kind` extension — 4-value or 5-value?

**Proposal: extend to 5-value, add `"compaction-release"`.**

Chunk 6a maintained the 3-value enum (work / bracket-delegate / tool-delegate). The 5c memo banked the 4-value extension (adding `"work"` for work.fire — wait, recheck).

Re-reading 5c memo Q2: `signal.kind` is `"work"` for work-fire spans. So the runtime canonical-name array currently pins:

- `"work"` (chunks 5a + 5c)
- `"bracket-delegate"` (chunk 5a)
- `"tool-delegate"` (chunks 5a + 5b)

`"compaction-release"` would be the 4th value. Pinned 4-value enum.

**Asymmetry-only-in-disabled-reason rule:** holds. `signal.kind` is the _intent classifier_ (what kind of continuation entered the system); compaction-release is a 4th legitimate intent class because the released delegates were originally dispatched as `mode: "post-compaction"` and the release-event is the moment they transition from staged-intent to dispatch-intent. **It is structurally a peer of work / bracket-delegate / tool-delegate, not an asymmetric reason axis.**

**Q2.5 answer:** extend `signal.kind` to 4 values: `"work" | "bracket-delegate" | "tool-delegate" | "compaction-release"`. Update runtime canonical-name array pin (loop in continuation-tracer.test.ts) AND type-pin loop symmetrically (dual-pin rule from chunk 5b).

## Q3: `compaction.id` — defer to chunk 6c

**Proposal: defer `compaction.id` to a follow-on chunk 6c. Per-chunk single-addition discipline.**

The session has a monotonic `compactionCount` (post-increment value returned by `incrementRunCompactionCount`). A natural `compaction.id` would be `${sessionId}:${compactionCount}` or just the post-increment integer. But wiring it would push 6b past the per-chunk single-addition rule (we'd be adding `compaction.released` AND `compaction.id` in one chunk).

Defer to 6c (`compaction.id` everywhere it's relevant: 6b release spans, future per-delegate `delegate.fire` spans whose dispatch was originally post-compaction, etc.). This also keeps 6b strictly aggregate — exactly mirroring chunk 6a's "no chain.id, no compaction.id" scope.

**Q3 answer:** `compaction.id` is NOT in 6b scope. Deferred to 6c.

## Q4: Emit-when-zero?

**Proposal: emit even when `compaction.released == 0`.**

Auto-compaction is a notable runtime event independent of whether any post-compaction delegates were staged. Emitting the span unconditionally on `autoCompactionCount > 0` gives downstream telemetry consumers a per-compaction beat — useful for the "did compaction fire but no delegates were staged?" query, which is the negative case for the seed-bank-not-lifeboat pattern (figs/HEARTBEAT.md teaching).

The integer `compaction.released = 0` is a load-bearing signal, not a noise reduction target.

**Q4 answer:** unconditional emit when `autoCompactionCount > 0` and `continuationFeatureEnabled && sessionKey`. `compaction.released` integer is always set (defaults 0 when no delegates staged).

## Q5: Snapshot semantics — pre-dispatch or post-dispatch?

**Proposal: snapshot `releasedCount` from `pendingPostCompactionDelegates.length` BEFORE invoking `dispatchPostCompactionDelegates`.**

`dispatchPostCompactionDelegates` mutates `pendingPostCompactionDelegates` (consumes them) and pushes failures into `postCompactionDelegatesToPreserve`. Reading length AFTER would give you `0` minus whatever was re-staged for retry — incoherent with "released count."

**Snapshot-at-dispatch (chunk 5b/5c/6a precedent):** read aggregate state at the moment of the dispatch call. Same pattern; same rationale.

**Q5 answer:** `const releasedCount = sessionEntry?.pendingPostCompactionDelegates?.length ?? 0;` immediately before the `await dispatchPostCompactionDelegates(...)` call. Pass into the span emit AFTER the await resolves.

## Q6: Helper signature

**Proposal: new helper `emitContinuationCompactionReleasedSpan` in `continuation-tracer.ts`, mirroring `emitContinuationQueueDrainSpan` shape.**

Separate-helpers-over-parameterized rule (chunk 6a precedent: `emitContinuationQueueDrainSpan` is its own helper, not a parameter on a shared emitter). Each helper owns its single span name + attribute set.

```ts
export function emitContinuationCompactionReleasedSpan(args: {
  releasedCount: number;
  log?: (message: string) => void;
}): void {
  try {
    const activeTracer = currentTracer();
    if (!activeTracer) return;

    const releasedCount = Math.max(0, Math.floor(args.releasedCount));

    const attrs: ContinuationSpanAttrs = {
      "signal.kind": "compaction-release",
      "compaction.released": releasedCount,
    };
    const span = activeTracer.startSpan("continuation.compaction.released", {
      attributes: attrs,
    });
    span.end();
  } catch (err) {
    args.log?.(`Failed to emit continuation.compaction.released span: ${String(err)}`);
  }
}
```

Integer hygiene (`Math.max(0, Math.floor(...))`) per chunk-6a precedent. Try/catch/log-callback per never-block-on-span-emission rule. Eta-expansion (`(message) => defaultRuntime.log(message)`) at callsite per chunk-5c `this`-binding pattern.

**Q6 answer:** new helper, mirrors 6a, integer-clamp at helper-side (defense-in-depth even though caller snapshots from a length so non-negative is structurally guaranteed; helper enforces invariant per 🩸 byte-walk shape from 6a).

## Q7: Test shape

**Proposal: 4 vitest tests, mirroring 6a's test shape.**

1. **happy path:** stage 3 post-compaction delegates → fire compaction → assert one `continuation.compaction.released` span emitted with `compaction.released: 3`, `signal.kind: "compaction-release"`
2. **zero-release:** fire compaction with no staged delegates → assert span emitted with `compaction.released: 0`
3. **integer hygiene:** pass `releasedCount: 3.7` directly to helper → assert `compaction.released: 3` (Math.floor)
4. **negative clamp:** pass `releasedCount: -1` directly to helper → assert `compaction.released: 0` (Math.max)

Plus the canonical-name pin loop and signal-kind-enum-pin loop both extend by one entry. Same dual-pin symmetric-insertion shape as chunk 5b/5c.

## Open questions for cohort byte-walk

- **🌫️:** `signal.kind: "compaction-release"` — concur on the 4th-value extension, or is there a stronger naming (`"post-compaction"`, `"compaction"`, `"compact-release"`)? My preference is `"compaction-release"` because it pairs verb-on-event (release) with subject (compaction), parallel to `bracket-delegate` / `tool-delegate` which pair surface-shape with subject (delegate).
- **🩸:** Q4 (emit-when-zero) — concur on unconditional emit, or prefer skip-when-zero for noise reduction? My read is unconditional, since the compaction event itself is the load-bearing telemetry beat.
- **🌻:** Q3 (defer `compaction.id`) — concur on per-chunk single-addition? The alternative is bundling, which reads tempting because the mechanic is small, but breaks the cooling-step discipline that's been holding cohort cohesion across the chunk-5/chunk-6 family.

## Wire-PR scope (post-cohort-ack, NOT part of this memo)

When the wire PR lands:

- New helper `emitContinuationCompactionReleasedSpan` in `continuation-tracer.ts`
- New attr field `"compaction.released"?: number` on `ContinuationSpanAttrs`
- `signal.kind` enum extends to 4 values; runtime canonical-name array pin updated; type-pin loop updated symmetrically
- Single callsite emit in `agent-runner.ts` after `dispatchPostCompactionDelegates`, conditional on `autoCompactionCount > 0`
- 4 helper-level vitest tests + 2 pin-loop assertions
- NO `compaction.id`, NO per-delegate spans, NO chain.id at this chunk

Refuse-to-bundle: if cohort byte-walk turns up a related-but-unblocking surface (e.g. `compaction.id` would be trivial here), still defer to 6c. Discipline is the cooling step.

## Non-goals

- `compaction.id` (deferred to 6c)
- per-delegate fire spans whose dispatch was originally `mode: "post-compaction"` (that's a future "delegate.fire with `dispatch.mode: post-compaction` axis" surface, separate)
- `compaction.failed_to_release` count (i.e. `postCompactionDelegatesToPreserve` size — useful but not in 6b scope; defer to 6d if cohort wants it)
- Any cap-gate recheck at release-time (5c/chunk-6 family rule: pure instrumentation, no semantic perturbation)

— 🌊
