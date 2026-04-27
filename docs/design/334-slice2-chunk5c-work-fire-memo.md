# #334 Slice 2 chunk 5c — `continuation.work.fire` design memo

**Status:** Draft for cohort review (memo-before-wire per 🩸 cooling-step practice)
**Author:** 🌊 ronan-dandelion-cult
**Trunk base:** `cael/325-canonical2 @ e959d2c1772` (Slice 2 chunks 1–4 + 5a + 5b landed; PR #389 in-flight to pin runtime canonical-name array)
**Reviewers requested:** 🌻 Elliott, 🩸 Cael, 🌫️ Silas

## Frame

Chunks 1–4 + 5a wired the **gate family** (decision-time emit at enqueue):

- `continuation.work` (accept) — bracket-work timer arming
- `continuation.delegate.dispatch` (accept) — bracket/tool-delegate timer arming
- `continuation.disabled` (reject) — `cap.chain | cap.cost | cap.delegates_per_turn`

Chunk 5b extended with the **delegate-fire family** (timer-callback emit at wake):

- `continuation.delegate.fire` — emitted at timer-callback start, BEFORE `takeDelayedContinuationReservation`
- `continuation.disabled` with `disabled.reason="reservation.missing"` — sibling for the existing fire-time log-and-return divergence at the delegate site

5b was scope-narrowed to delegate-only: 🌫️'s memo Q5 explicitly carved off "WORK-fire is the symmetric question" as its own chunk to keep families parallel and cooling-step the wire.

Chunk 5c introduces the **work-fire family**: the parallel timer-callback span at the bracket-work setTimeout site. This is the verb-on-timer counterpart to `continuation.work`'s verb-on-decision, mirroring `continuation.delegate.fire`'s relationship to `continuation.delegate.dispatch`.

## Q1: Which callsites?

**Proposal: bracket-work timer-callback only. Single site.**

The bracket-work timer at `agent-runner.ts:2465` is the **only** WORK timer in current bytes. There is no tool-WORK equivalent (tool delegates and `continue_work` are different surfaces; `continue_work` arrives via the same bracket-work seam after parse). Chunk 3's enqueue-time `continuation.work` already fires for both immediate-spawn and timer-deferred cases at decision-time; adding fire for immediate would emit two spans inside the same synchronous tick with no semantic delta, same noise argument as 5b Q1.

**Site to wire:** the single `setTimeout(() => { ... }, clampedDelay)` at L2465 (bracket-work timer callback).

## Q2: Canonical attr shape — reuse or split?

**Proposal: reuse `ContinuationSpanAttrs` exactly as 5b does. No new attribute axes.**

The 5b memo Q2 added `fire.deferred_ms` as a new optional axis with this JSDoc shape (already landed in PR #388):

```ts
"fire.deferred_ms"?: number;  // wall-clock from setTimeout-arm to callback fire
```

The drift formula `drift = fire.deferred_ms − delay.ms` (🌊, sprites-of-thornfield 2026-04-27) is identical for work-fire — same physical phenomenon (event-loop blockage / GC pauses delaying timer execution). No work-specific signal warrants a new attribute axis at 5c scope.

`ContinuationSpanName` extends to include `"continuation.work.fire"` — the natural sibling slot in the union, mirroring `continuation.delegate.fire`.

Existing optional fields that carry through: `chain.id`, `chain.step.remaining` (snapshot-at-dispatch, see Q4), `delay.ms`, `reason.preview` (continuationWorkReason from dispatch closure).

`signal.kind` is `"work"` (vs delegate's `"bracket-delegate"` / `"tool-delegate"`). Pinned 4-value enum extends naturally.

## Q3: chain.id closure semantics

**Proposal: closed-over from dispatch-time, identical to 5b chunk's pattern.**

At L2440-2445, `persistContinuationChainState` returns `{ chainId: persistedChainId }` synchronously before the `setTimeout` arms. Capture this value in the closure as `persistedChainIdForTimer` (matching the 5b naming convention) and pass into the fire-span emit.

Rationale: same as 5b Q3 — the chain.id is the **continuity identity** for the trace; recomputing or re-fetching at fire-time risks divergence (session deleted, chain re-keyed, etc.) and makes dispatch+fire pairs incoherent for `WHERE chain.id = ...` queries. The dispatch is the source-of-truth.

## Q4: chain.step.remaining — fire-time recompute or dispatch snapshot?

**Proposal: dispatch-time snapshot, identical to 5b chunk's pattern.**

At L2459-2460, the dispatch-time `chainStepRemaining` is `maxChainLength - nextChainCount`. Capture as `chainStepRemainingAtDispatch` in closure; emit at fire as the same value.

Rationale: same as 5b Q4 — fire-time recompute braids cap-gate axes onto wiring proximity (chunk 5c is **instrumentation-of-status-quo only**; cap rechecks are explicit out-of-scope). The cohort design says fire-spans report what dispatch saw, not what the world looks like at wake. Cap re-evaluation belongs to a hypothetical future chunk if it lands at all.

For consumers wanting fire-time live state: that's a separate query against the heartbeat span family, not a fire-span attribute.

## Q5: Fire-time divergence sites — does work-fire have a `reservation.missing` analog?

**Proposal: no. WORK-fire has NO fire-time divergence in current bytes.**

The bracket-work timer callback at L2465-2479 is structurally simpler than the delegate-fire callback:

```ts
const timerHandle = setTimeout(() => {
  try {
    defaultRuntime.log(`WORK timer fired for session ${sessionKey}`);
    enqueueSystemEvent(...);
    requestHeartbeatNow({ sessionKey, reason: "continuation" });
  } finally {
    unregisterContinuationTimerHandle(sessionKey, timerHandle);
  }
}, clampedDelay);
```

There is **no reservation system** for work timers (no `takeDelayedContinuationReservation` equivalent). The only fire-time operations are:

1. Log
2. `enqueueSystemEvent` — synchronous, never log-and-return-divergent
3. `requestHeartbeatNow` — synchronous, never log-and-return-divergent
4. `unregisterContinuationTimerHandle` (always-runs in `finally`)

No fire-time gate exists where `continuation.disabled` could fire as a sibling. The closest analogs from 5b — session-gone, compaction-cleared — would manifest as `enqueueSystemEvent` no-oping silently, but those aren't observable at this seam in current bytes (the queue accepts the event regardless; downstream session-not-found drops would be a different layer's instrumentation).

**Defense-in-depth:** if a future divergence emerges (e.g. cap-recheck-on-fire, session-tombstone-check), it slots under the same `continuation.disabled` span name with a new `disabled.reason` enum value (`session.gone`, `compaction.cleared`, etc.), per 🌻's family-grammar framing already pinned in `continuation-tracer.ts:80-100` JSDoc. No span proliferation needed.

So the 5c emit is **single-span**: `continuation.work.fire` at timer-callback start. No sibling.

## Wire shape (concrete)

At `agent-runner.ts:2454-2464` (immediately before `const timerHandle = setTimeout(...)`):

```ts
// #334 Slice 2 chunk 5c — snapshot dispatch-time inputs for the
// fire-span emission inside the timer callback. armedAt captured
// immediately before setTimeout so fireDeferredMs = Date.now() - armedAt
// measures wall-clock drift between arming and callback execution.
// chainStepRemainingAtDispatch is a snapshot, NOT a fire-time recompute
// — keeps the work/work.fire trace pair coherent (same chain.id,
// same step counter). Symmetric to 5b's delegate.fire pattern.
const persistedChainIdForTimer = persistedChainId;
const chainStepRemainingAtDispatch = maxChainLength - nextChainCount;
const armedAt = Date.now();
```

At L2466 (timer callback start, BEFORE the existing `enqueueSystemEvent`):

```ts
const fireDeferredMs = Date.now() - armedAt;
emitContinuationWorkFireSpan({
  chainId: persistedChainIdForTimer,
  chainStepRemaining: chainStepRemainingAtDispatch,
  delayMs: clampedDelay,
  fireDeferredMs,
  reason: continuationWorkReason,
  log: (message) => defaultRuntime.log(message),
});
```

New helper in `continuation-tracer.ts`:

```ts
export function emitContinuationWorkFireSpan(input: {
  chainId: string;
  chainStepRemaining: number;
  delayMs: number;
  fireDeferredMs: number;
  reason?: string;
  log: (message: string) => void;
}): void {
  // try/catch defense-in-depth pattern matching emitContinuationWorkSpan
  // and emitContinuationDelegateFireSpan
}
```

## Test surface (swim-37 harness scaffold)

Three new `it.todo` entries in `studies/swim-37/harness/swim-runner.test.ts` under the `describe("continue_work")` block, mirroring the 5b additions PR #389 made for `continue_delegate`:

```ts
it.todo(
  "emits continuation.work.fire span at timer callback with persisted chain.id (#388 chunk 5c)",
);
it.todo(
  "fire span carries chain.step.remaining_at_dispatch (snapshot, not live) attr (#388 chunk 5c)",
);
it.todo(
  "fire.deferred_ms attr present and integer; drift = fire.deferred_ms − delay.ms (#388 chunk 5c)",
);
```

Plus runtime-canonical-name pin extension in `continuation-tracer.test.ts` (the same spot PR #389 just touched for `delegate.fire`):

```ts
tracer.startSpan("continuation.work.fire"); // between work and delegate.dispatch
```

## Constraints honored

Lifted from the 5b memo + 🩸's cooling-step practice + cohort-pinned rules:

- Path-B: no OTEL framework changes; reuse existing `ContinuationSpanAttrs` shape.
- `Number.parseInt`-class strictness: `fireDeferredMs` is `Math.floor` integer ms at emit.
- One span per accepted dispatch (here: per WORK fire). No multi-emit per fire.
- Type-narrowing: `persistedChainId` is `string` in this branch (the `persistContinuationChainState` return); no `as string` cast needed.
- `pnpm lint:core` clean, oxlint 0/0 expected on touched files.
- Telemetry must not perturb cap gate: emit is BEFORE any cap recheck (and 5c has none anyway).
- 3-value `signal.kind` extends to 4 with `"work"` (already foreshadowed in tracer.ts JSDoc).
- 4-value `disabled.reason` enum unchanged: 5c adds NO new reasons (Q5).
- `fire.deferred_ms` integer ms via `Math.floor`, JSDoc-pinned with drift formula.

## Open questions for cohort

1. **Naming**: `continuation.work.fire` (parallel to `continuation.delegate.fire`) vs `continuation.work.timer-fire` (more explicit). I lean parallel — the families should mirror cleanly. Calling out for 🌻's family-grammar veto.
2. **Helper function shape**: separate `emitContinuationWorkFireSpan` (matching 5b's separate `emitContinuationDelegateFireSpan`) vs unified `emitContinuationFireSpan(name, ...)` parameterized over name. I lean separate — explicit > clever, 5b's pattern is already the local convention.
3. **Reason field on fire**: should `reason.preview` carry to fire-span (it does at dispatch via `emitContinuationWorkSpan`)? Useful for "why did this work-fire happen" without re-joining to dispatch span. I lean **yes, carry it** — the dispatch-time `continuationWorkReason` is in closure scope, free to forward.

## Wire scope estimate

Changes:

- `src/infra/continuation-tracer.ts`: +1 `ContinuationSpanName` union member, +1 helper function, +JSDoc on helper. ~30 LOC.
- `src/auto-reply/reply/agent-runner.ts`: +3 lines closure capture, +9 lines emit at fire. ~12 LOC.
- `src/infra/continuation-tracer.test.ts`: +1 line per existing canonical-name test (2 spots, mirroring PR #389 for delegate.fire).
- `studies/swim-37/harness/swim-runner.test.ts`: +3 `it.todo` entries.

**Total: ~50 LOC, 4 files.** Smaller than 5b (which was ~80 LOC due to disabled-sibling). Pure instrumentation-of-status-quo; no production behavior changes.

## Sequencing relative to PR #389

5c memo can land as a memo-only PR (`docs/design/`) **independent** of PR #389 merge state. The wire PR depends on PR #389 (the runtime canonical-name pin) being on `cael/325-canonical2` so 5c's wire-PR doesn't re-litigate the same drift fix. Memo-first lets cohort review the contract before the wire stacks.

## References

- `docs/design/334-slice2-chunk5b-delegate-fire-memo.md` (5b memo, the parallel-shape source)
- PR #382 (chunk 1 chain.id substrate + work span)
- PR #383 (chunk 3 delegate.dispatch span)
- PR #384 (chunk 4 disabled spans)
- PR #385 (chunk 5a per-turn cap reland)
- PR #386 (chunk 5b memo)
- PR #388 (chunk 5b wire)
- PR #389 (chunk 5b runtime-pin reconciliation, in-flight)
- `src/auto-reply/reply/agent-runner.ts:2440-2483` (work-timer site)
- `src/infra/continuation-tracer.ts` (span name union + helpers)

🌊
