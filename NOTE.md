# #343 (queue-drain-budget) — implementation note

## Question (per TASK.md)

Move chain-budget enforcement into the queue-drain layer so post-compaction
releases can go through proper substrate adoption instead of direct
`spawnSubagentDirect`. Tractable?

## Verdict

**Tractable, in two stages.** Stage 1 (this PR) is the structural
prerequisite: extract chain-budget enforcement and the spawn from the
agent-runner inline loop into a portable helper. Stage 2 (follow-up) wires
the helper into the `session-delivery-queue` substrate via a new payload
kind. The audit at `docs/design/332-item-b-post-compaction-release-audit.md`
(branch `elliott/332-item-b-audit`) names Stage 2 as
"substrate-extension; non-trivial cross-cutting change" — it is, and doing
both stages atomically would exceed "smallest correct" for one PR.

## What changed

### Added: `src/auto-reply/reply/post-compaction-delegate-dispatch.ts`

- `evaluatePostCompactionChainBudget({...})`: pure decision returning
  `{ allow: true } | { allow: false; reason: "chain-length" | "cost-cap" }`.
- `dispatchPostCompactionDelegate({...})`: encapsulates per-delegate
  chain-budget enforcement, the `spawnSubagentDirect` call, and the
  lifecycle log/`enqueueSystemEvent` side effects. Returns a discriminated
  outcome the caller uses to drive aggregate counters and re-stage lists.

### Changed: `src/auto-reply/reply/agent-runner.ts`

- The post-compaction release loop in `runReplyAgent` (~line 2144) is now a
  thin aggregator over `dispatchPostCompactionDelegate` outcomes. The
  inline budget checks, `spawnSubagentDirect` call, and per-iteration
  log/event emissions moved into the helper. Behavior is preserved: same
  log strings, same system event strings, same re-stage trigger
  (rejected-spawn / error → push to `postCompactionDelegatesToPreserve`).

### Added: `src/auto-reply/reply/post-compaction-delegate-dispatch.test.ts`

- 12 unit tests covering: budget evaluation truth-table (4 cases), happy
  path dispatch (1), chain-length rejection (1), cost-cap rejection (1),
  spawn-rejection re-stage signal (1), spawn-error re-stage signal (1),
  silent-flag derivation (legacy default + non-silent variants, 2).

## Why this is a real Stage-1 win, not a no-op refactor

The audit's bespoke retention is justified by: "chain-budget enforcement
lives in agent-runner, requires synchronous spawn-result return, loop uses
that return to gate the next iteration's budget check."

After Stage 1:

- Chain-budget enforcement no longer lives _inline in agent-runner_. It
  lives in a portable helper that:
  - takes chain state as inputs (no closure over agent-runner local vars);
  - returns a discriminated outcome (no closure over loop counters);
  - is invokable from any caller.
- The next-iteration gate is now driven by the caller updating
  `currentChainCount` from the helper's `nextChainCount` — i.e., the
  in-process loop carry-over is now an explicit data contract, not an
  implicit one. That is exactly what a queue-drain deliver callback would
  need.

A queue-drain deliver callback can read live `SessionEntry.continuationChainCount`
and `continuationChainTokens` at delivery time, pass them into the helper,
and act on the outcome — chain-budget enforcement runs at drain time
without any further refactor of the helper itself.

## Stage 2 sketch (follow-up; not in this PR)

For full substrate adoption of post-compaction release:

1. Extend `QueuedSessionDeliveryPayload` in
   `src/infra/session-delivery-queue-storage.ts` with a third variant:

   ```ts
   | {
       kind: "postCompactionDelegate";
       sessionKey: string;
       delegate: SessionPostCompactionDelegate;
       originatingContext: PostCompactionDelegateOriginatingContext;
       idempotencyKey?: string;
     }
   ```

   Idempotency-key composition (per #335 §3.6 LOCKED spec):
   `(sourceSessionId, targetSessionId, taskHash, scheduledAt)` —
   `targetSessionId === sourceSessionId` here; `scheduledAt` =
   compaction-completion timestamp.

2. Add a deliver helper (new module, e.g.
   `src/auto-reply/reply/post-compaction-delegate-deliver.ts`) that:
   - reads `SessionEntry` for live chain state;
   - reads runtime config via `resolveContinuationRuntimeConfig`;
   - calls `dispatchPostCompactionDelegate({...})` (this PR's helper);
   - persists chain-count update to the session store on dispatch;
   - throws on `error`/`rejected-spawn` so the substrate retry path fires
     (or, alternatively, returns void on `reStage` outcomes and lets the
     payload remain for a later drain — TBD per backoff semantics).

3. Modify `agent-runner.ts` post-compaction block: replace the per-delegate
   `dispatchPostCompactionDelegate` call with `enqueueSessionDelivery({
kind: "postCompactionDelegate", ... })`, then call
   `drainPendingSessionDeliveries({...})` filtered by sessionKey + kind to
   trigger immediate-drain for in-turn timing parity. Aggregate counters
   become side-effect channels (or the drain returns per-entry decisions).

4. Update `gateway/server-restart-sentinel.ts:deliverQueuedSessionDelivery`
   to dispatch on the new kind (delegate to the deliver helper). Required
   so `recoverPendingSessionDeliveries` at gateway start can drain
   post-compaction-delegate entries that crashed mid-dispatch.

5. Tests: substrate payload roundtrip; deliver-helper budget paths;
   integration smoke through enqueue → drain → spawn.

### Stage-2 blockers / risks

- `drainPendingSessionDeliveries` returns `Promise<void>`, not per-entry
  outcomes. Aggregating dispatched/dropped counters for the
  `[system:post-compaction]` lifecycle event needs either a
  side-effect aggregator closed over by the deliver callback or a new
  drain helper that surfaces results.
- Async drain semantics differ subtly from in-process loop: per-iteration
  budget gating becomes "evaluate at delivery time against fresh state"
  instead of "carry local var across iterations." Same end-result for
  most cases; subtly better behavior under concurrent chain growth from
  bracket/tool delegates.
- Recovery-drain at gateway start (`recoverPendingSessionDeliveries` in
  `server-restart-sentinel.ts`) currently delivers ALL queued kinds; the
  new kind needs handling there too, otherwise restart drops queued
  post-compaction-delegate spawns.

## PR #343 disposition recommendation

PR #343 in the actual repo (`fix: remove duplicate daemon-runtime imports`)
is unrelated to this work — TASK.md uses #343 as a reference number for
this branch's scope, not the literal GitHub PR. **No update is needed to
the merged GH PR #343.**

For the audit at `docs/design/332-item-b-post-compaction-release-audit.md`
(currently on `elliott/332-item-b-audit`, not on this branch): once Stage 1
lands, the "Concrete functional reason for bespoke at release" section can
soften from "loop uses [spawn-result] to gate the next iteration's budget
check" to "loop carries chain-count across iterations" (now an explicit
contract on `dispatchPostCompactionDelegate`'s `nextChainCount` return,
trivial to surface to a substrate-side deliver callback). The Verdict's
"queue-with-bespoke-fallback" label still holds at v2026.4.24 — Stage 2
flips it to "always-queue."

## Verification

- `pnpm tsgo:core --project tsconfig.core.json` — clean.
- `pnpm test src/auto-reply/reply/post-compaction-delegate-dispatch.test.ts`
  — 12/12 passed.
- `pnpm test src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
  — 36/36 passed.
- `pnpm test src/auto-reply/reply/post-compaction-context.test.ts
src/auto-reply/reply/session.test.ts
src/auto-reply/continuation-delegate-store.test.ts` — 121/121 passed.
- `pnpm check:changed` — typecheck/lint/cycles all green; one unrelated
  flake in `extensions/amazon-bedrock/index.test.ts` (passes in isolation,
  no surface touched by this change).
