# SWIM-37 — `heartbeat` continuation primitive wiring memo

**Status**: design memo, pre-wire.
**Author**: 🌻 elliott.
**Memo-companion to**: `swim-37-continue-delegate-wiring-memo.md` (commit `3bb086c762`, merged via PR #405).
**Cohort sign-off needed**: 🌊, 🌫, 🩸 on Q1–Q4.

---

## 0. Why a memo before the wire

The `continue_delegate` memo paid its keep at #405 review — both 🌊 and 🌫 LGTM'd the wiring without re-deriving the contract. figs's "measure thrice, cut 1x" + "let the tongues do some of the measuring" framing endorses the pattern. The `heartbeat` primitive is _less_ obvious than `continue_delegate` (no user-elected dispatch surface, fires from runtime poll cadence), so the memo has more to chew on, not less.

## 1. What `heartbeat` is — production shape

From `src/infra/continuation-tracer.ts`:

- L213: `"heartbeat"` is declared in the `ContinuationSpanName` union — a peer of `continuation.work`, `continuation.delegate.dispatch`, `continuation.queue.enqueue`, etc.
- L74: comment notes `heartbeat` carries `continuation.disabled` but no `delay.ms` (i.e., the span surfaces when a heartbeat-fired turn would have continued but for a gate)
- L108, L277: `heartbeat` is an explicit chain-correlated participant; it's expected to emit when continuation context is present

**No production emit-helper exists yet** (`grep -rn "emitContinuationHeartbeatSpan" src/` returns zero hits). No callsite either. This memo therefore defines:

1. the shape of the missing emit-helper, and
2. the harness surface that will exercise it once it lands.

The harness surface is the only thing #405 promised — the `it.todo` for `heartbeat` in `swim-runner.test.ts` and the explicit `throw` in `swim-runner.ts :: case "heartbeat"`. Production helper lands separately (production-helper issue, like the `recipient.index` axis issue from #405).

## 2. Span shape — proposed contract

### Name

`heartbeat`

(Note: the canonical name is the bare token `heartbeat`, NOT `continuation.heartbeat`. This is intentional and pre-pinned in `ContinuationSpanName`. The bare name reflects that heartbeats exist at runtime regardless of continuation context — the span is the heartbeat itself, not a continuation-of-heartbeat. When continuation context is present, attributes are added; when absent, the span still emits with no continuation attrs, so the heartbeat cadence is observable independent of continuation activity.)

### Required attributes (always present)

- `signal.kind: "heartbeat"` — fixed string discriminator
- `heartbeat.id: string` — opaque per-fire id (uuid v4 OK; only requirement is uniqueness within a process lifetime for trace correlation)

### Continuation-context attributes (present iff continuation context is live at heartbeat fire)

- `chain.id: string` — propagates from the active continuation chain
- `chain.step.remaining: number` — current chain budget at the heartbeat's fire moment (snapshot, NOT side-effect; mirrors `chain.step.remaining` semantics on `continuation.delegate.dispatch`)
- `continuation.disabled: boolean` — true iff the heartbeat noticed a gate (cap.chain / cap.cost / cap.delegates*per_turn) that \_would* have prevented continuation if the heartbeat had elected to continue

### Conditional attributes (omitted under documented conditions — same omission discipline as #405's `delegateMode`)

- `disabled.reason: "cap.chain" | "cap.cost" | "cap.delegates_per_turn"` — present iff `continuation.disabled === true`. Omitted when `continuation.disabled === false` or when `continuation.disabled` itself is omitted (no continuation context).

### Negative-assert pins (non-attributes the contract MUST NOT silently invent)

Per 🩸's pattern from #407:

- `delay.ms` — heartbeats have no caller-elected delay; they fire on poll cadence. Asserting absence prevents future drift toward conflating heartbeat cadence with delegate timer-elapsed semantics.
- `chain.step.remaining_at_dispatch` — same canonical-vs-snapshot confusion 🩸 pinned on `delegate.fire` / `work.fire`. Heartbeat is a snapshot-by-nature event; the canonical attr stays `chain.step.remaining`.

## 3. Harness surface — proposed `captureSwim()` extension

Currently `case "heartbeat"` throws in `studies/swim-37/harness/swim-runner.ts` L161. Wire-shape proposal:

```ts
case "heartbeat": {
  const heartbeatId = opts.heartbeatId ?? `hb-${randomUUID()}`;
  emitContinuationHeartbeatSpan({
    heartbeatId,
    chainId,                       // undefined when opts.chainId omitted
    chainStepRemaining: opts.chainStepRemaining,
    continuationDisabled: opts.disabledReason !== undefined,
    disabledReason: opts.disabledReason,
  });
  return { spans: recorder.spans(), chainId };
}
```

`CaptureSwimOpts` extension:

- `heartbeatId?: string` — caller-injected for deterministic test pins; harness mints one if omitted
- `chainStepRemaining?: number` — required when `chainId` is present, optional (omitted) when no chain
- `disabledReason?: "cap.chain" | "cap.cost" | "cap.delegates_per_turn"` — drives the `continuation.disabled` boolean implicitly (set ↔ true; omitted ↔ false)

Validation (synchronous, throw-on-bad-input — matches #405 shape):

- if `chainId` provided, `chainStepRemaining` MUST be a non-negative integer
- if `chainId` absent, both `chainStepRemaining` and `disabledReason` MUST be absent (no silent "disabled with no chain" surface — that would be a meaningless span)

## 4. Open design questions for cohort

### Q1 (🩸/🌊): heartbeat-with-no-continuation-context — emit or skip?

Production: heartbeats fire constantly; most don't intersect continuation context. Two candidate shapes:

- **Always-emit**: every heartbeat emits a `heartbeat` span; continuation attrs added conditionally. Pro: heartbeat cadence is independently observable in traces. Con: span-volume amplifies (every heartbeat × every session).
- **Continuation-gated emit**: heartbeat span emits ONLY when continuation context is present. Pro: matches `continuation.delegate.dispatch` shape (no continuation → no span). Con: heartbeat-cadence health requires a separate metric.

Lean: **continuation-gated emit** for the production helper, **always-emit** for the harness shim (so the test surface can pin the no-continuation-context attribute-omission contract). The harness diverges intentionally and the divergence is documented in the README primitive-coverage matrix.

### Q2 (🌊): does `heartbeat` need a sibling `heartbeat.fire` like `delegate.fire`?

`continue_delegate` has both `dispatch` (synchronous decision) and `fire` (timer callback). Heartbeats are simpler: no dispatch decision, the cadence-poll IS the fire. One span, not two.

Lean: **one span**. If we discover later that there's a meaningful gap between "heartbeat scheduled" and "heartbeat fires" (e.g., event-loop-lag), that's a `heartbeat.lag.ms` _attribute_, not a separate span. Recording the lag as an attribute keeps the trace narrative single-row instead of paired.

### Q3 (🌫): test matrix for the harness

Proposed `it.each` rows for the wire PR (post-🌫 review-fold on #412):

| chain context | chainStepRemaining | continuation disabled | disabledReason         | expect                                                                                                              |
| ------------- | ------------------ | --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| present       | 5                  | false                 | (omitted)              | chain attrs present, `continuation.disabled=false`, no `disabled.reason`                                            |
| present       | 5                  | true                  | cap.chain              | chain attrs present, `continuation.disabled=true`, `disabled.reason="cap.chain"`                                    |
| present       | 5                  | true                  | cap.cost               | … `cap.cost`                                                                                                        |
| present       | 5                  | true                  | cap.delegates_per_turn | … `cap.delegates_per_turn`                                                                                          |
| present       | **0**              | true                  | cap.chain              | chain attrs present with `chain.step.remaining=0` (empty-budget heartbeat is observable; boundary the clamp guards) |
| absent        | (forced-undefined) | (forced-undefined)    | (omitted)              | no chain attrs, no `continuation.disabled`, no `disabled.reason`                                                    |

6 rows. Under 🌊's split-threshold of 12. Plus negative-assert pins on `delay.ms` and `chain.step.remaining_at_dispatch` per row (🩸 pattern from #407).

**Plus separate (non-matrix) describe blocks** per 🌫's #412 review fold:

- `describe("heartbeat.id provenance")`: one test pinning the **caller-injected** path (`heartbeatId: "hb-fixed-test-id"` → span carries that exact value, NOT auto-minted). Current matrix only covers the default-mint path; this isolates the override seam.
- `describe("validation")`: throw-on-bad-input rules from §3 (e.g., `chainStepRemaining` non-integer when `chainId` present, `disabledReason` set when `chainId` absent). These don't fit matrix shape — same precedent as #405's `recipients` validation block.

### Q4 (cohort): production-helper issue or in-PR?

The `continue_delegate` precedent: the helper-axis (`recipient.index`) was filed as a separate production-helper issue, with the harness gap-pinning current reality and asserting on the missing axis once it lands. Same play here:

- **In-PR**: write `emitContinuationHeartbeatSpan` in `src/infra/continuation-tracer.ts` AS PART of the wire PR.
- **Separate issue**: file production-helper issue for `emitContinuationHeartbeatSpan`; harness wire PR uses a local mock that emits the same span shape; gap-pin live test asserts the helper signature once production lands.

Lean: **in-PR** for `heartbeat` (unlike `recipient.index`). Reasoning: the `recipient.index` axis was a _new attribute_ on an _existing helper_ — touching the helper signature meant cohort sign-off on the broader chunk-3 fan-out shape. `emitContinuationHeartbeatSpan` is an entirely new helper; its addition doesn't affect any existing seam. Lower-risk to land both halves in one PR.

## 5. Layering / lane discipline

- Span name `heartbeat` → `ContinuationSpanName` union (already declared)
- Production helper: NEW function `emitContinuationHeartbeatSpan` in `src/infra/continuation-tracer.ts`, peer of `emitContinuationDelegateSpan` etc.
- Helper-tier coverage: NEW file `studies/swim-37/harness/helper-heartbeat-contract.test.ts` (mirrors #406/#407 sibling pattern — does NOT touch `swim-runner.test.ts` or `emit-helper-contract.test.ts`)
- Integration-tier coverage: extends `swim-runner.test.ts` (mine, owned, lane-clean)

This avoids the lane-cross that bit #407 v1.

## 6. Out of scope (explicit refusals)

- Heartbeat _production cadence_ tuning (config keys, jitter, etc.) — orthogonal to the span shape
- Heartbeat _delivery_ (Discord status messages, etc.) — different subsystem entirely (`src/config/schema.help.ts:1608` lives in user-facing visibility config)
- Multi-channel heartbeat fan-out — heartbeats are per-process, not per-channel; no fan-out shape needed
- `heartbeat.lag.ms` attribute — flagged in Q2 as a _future addition_ if event-loop-lag plugin grows trace integration; out of scope for this memo

## 7. Acceptance shape for cohort

When 🌊, 🌫, 🩸 have signed off Q1–Q4 (or proposed amendments), the wire PR will:

1. Add `emitContinuationHeartbeatSpan` to `src/infra/continuation-tracer.ts`
2. Wire `case "heartbeat":` in `studies/swim-37/harness/swim-runner.ts`
3. Extend `CaptureSwimOpts` per §3
4. Add `studies/swim-37/harness/helper-heartbeat-contract.test.ts` per §3 + Q3 matrix
5. Extend `swim-runner.test.ts` `it.todo` for heartbeat → live, with the 5-row `it.each` matrix
6. Negative-assert `delay.ms` + `chain.step.remaining_at_dispatch` absence per row

— 🌻
