# WORKORDER — openclaw#532 silas event-loop saturation triage + introspection

**Issue**: https://github.com/karmaterminal/openclaw/issues/532
**Repo**: `karmaterminal/openclaw`
**Suggested agent**: copilot xhigh
**Heartbeat webhook username**: `frond-scribe-532-silas-saturation-hook`

## §0 — guardrails

- Branch from current v3 line: `frond-scribe/20260429/v3-cohort-fixes` (tip per `gh api repos/karmaterminal/openclaw/branches/frond-scribe%2F20260429%2Fv3-cohort-fixes` at dispatch time)
- Push branch under `frond-scribe/532-silas-saturation`; never force-push after first push
- Do NOT touch `feature/context-pressure-squashed` or any prince-namespaced branch
- Do NOT touch `/home/figs/flesh_beast_tmp/openclaw/` (off-limits prince-runtime tree)

## §1 — read-first

1. Issue body in full: `karmaterminal/openclaw#532`
2. `src/auto-reply/continuation-delegate-store-taskflow.{ts,test.ts}` (TaskFlow substrate)
3. `src/auto-reply/reply/continuation-runtime.{ts,test.ts}`
4. `src/diagnostics/liveness*.ts` (event-loop warning emit logic)
5. `karmaterminal/openclaw#472` — continuation queue introspection / cancel / drain tooling (sibling — partially overlaps fix scope)

## §2 — work to do

This is a triage + instrumentation lane, not necessarily a code fix on first PR. Three sub-deliverables:

### §2.A — Triage hypotheses

Per #532, three hypotheses for the loop:

1. Continuation-queue work coming in at rate ≥ drain rate, no backpressure → infinite-fill
2. A single failed-but-not-cleared task being retried in a tight loop, blocking the queue
3. Codex auth failure (unrelated) producing a side-effect that wedges embedded-run loop

For each hypothesis, identify the source-code path that would manifest it. Write a §2.A markdown receipt (in journal) naming the most likely + the eliminating evidence.

### §2.B — Instrumentation patch

Add structured logging or a queue-state introspection seam so the next time this happens it's diagnosable in one log query, not multi-hour log archaeology. Targets:

- Periodic queue-depth + drain-rate emission to journal (or to existing `liveness warning` logger with a `queue_depth_history` field)
- Continuation runner: stamp run with reason-for-firing (timer / external-trigger / continuation-chain) + `parent_run_id` if applicable so loops are visually obvious in trace

This may overlap with `#472` scope — coordinate with that issue's drain-tooling lane (don't duplicate).

### §2.C — Hardening (optional, scope-permitting)

If §2.A points cleanly at one hypothesis, a defensive-fix is in scope:

- For hypothesis 1: add backpressure threshold (queue_depth > N drops the run-spawn rate)
- For hypothesis 2: surface failed-task retry counter; circuit-break after N retries
- For hypothesis 3: defer; refresh-token-cascade is its own lane

Defensive fix is OPTIONAL — instrumentation alone is the v1 deliverable. A v2 PR can land the fix once #532's root cause is named.

## §3 — push + open PR

After §2.A receipt + §2.B instrumentation pass `pnpm tsgo` + `pnpm check` + scoped tests:

- Push `frond-scribe/532-silas-saturation` to origin
- Open PR against `frond-scribe/20260429/v3-cohort-fixes` (NOT main, NOT legacy canary)
- Title: `instrumentation: surface continuation-queue depth + run-spawn provenance for #532`
- Body: triage receipt + diff scope + which hypotheses §2.B addresses

## §4 — stop-condition

- §2.A hypothesis-receipt filed in journal
- §2.B instrumentation patch committed
- PR opened against v3-cohort-fixes line
- All gates green (tsgo / check / scoped tests)
- Final heartbeat declaring done

## §5 — what NOT to do

- Don't auto-merge — figs admin-merges
- Don't widen scope to all of #472's drain-tooling
- Don't touch silas's runtime tree (`/home/figs/flesh_beast_tmp/openclaw/`)
- Don't claim root-cause until §2.A receipt is signed by triage evidence

## Journal

### §2.A hypothesis receipt — 2026-05-02T19:30:07Z

Scope read:

- #532 symptom: one Silas `sessionId=56b05f2c-0ec1-4220-b140-370a9fd68ec6` emitted fresh run ids roughly every 40s while diagnostic liveness reported `queued=115`, high event-loop delay/utilization/CPU, and only a gateway restart cleared it.
- Current TaskFlow substrate is `src/auto-reply/continuation/delegate-store.ts` plus `src/auto-reply/continuation/delegate-store.test.ts`; the workorder's `src/auto-reply/continuation-delegate-store-taskflow.*` path is now a shim/drifted name.
- Current continuation runner path is `src/auto-reply/reply/agent-runner.ts`, `src/auto-reply/reply/agent-runner-execution.ts`, `src/auto-reply/reply/followup-runner.ts`, and heartbeat wake dispatch in `src/infra/heartbeat-runner.ts`; the workorder's `src/auto-reply/reply/continuation-runtime.*` path is drifted.
- Current liveness warning emitter is `src/logging/diagnostic.ts`; no `src/diagnostics/liveness*.ts` path exists on this branch.
- #472 overlaps only at queue introspection/cancel/drain operator tooling. This PR intentionally stays at passive diagnostics and does not add drain/cancel CLI behavior.

Hypothesis 1 — continuation queue work arrives at rate >= drain rate, no backpressure, infinite fill.

- Manifesting path: `continue_delegate`/continuation signaling enqueues TaskFlow rows through `enqueuePendingDelegate()` in `src/auto-reply/continuation/delegate-store.ts`; reply/follow-up finalization drains with `consumePendingDelegates()` / `consumeStagedPostCompactionDelegates()` and can schedule new runs through `src/auto-reply/reply/agent-runner.ts` timers plus `requestHeartbeatNow()` into `src/infra/heartbeat-runner.ts`.
- Evidence for plausibility: #532's pinned aggregate diagnostic `queued=115` with fresh run ids every ~40s matches a producer/drainer imbalance or repeated timer/external wake pattern, but existing liveness diagnostics only exposed aggregate diagnostic-session work depth, not continuation-specific queued/runnable/scheduled/staged counts or drain rate.
- Eliminating evidence absent: before this patch, logs could not answer whether continuation TaskFlow depth was growing, pinned, draining, or unrelated. This remains the most likely hypothesis by symptom fit, not a signed root cause.

Hypothesis 2 — a single failed-but-not-cleared task is retried in a tight loop and blocks the queue.

- Manifesting path if present: a corrupt or failed TaskFlow row in `consumePendingDelegates()` / `consumeStagedPostCompactionDelegates()` would need to remain `queued` after decode/dispatch failure and be selected again on every drain cycle.
- Eliminating evidence in current code: invalid payloads call `failFlow()` and valid released rows call `finishFlow()` before being returned to the scheduler, so the same malformed row should not remain queued for tight retry. Revision conflicts can skip a row, but they do not create an explicit retry loop in this path.
- Residual uncertainty: a failed child spawn or downstream embedded-run failure can still create more wake/system-event traffic, but that is separate from a single uncleared TaskFlow row blocking the continuation store.

Hypothesis 3 — Codex auth failure side-effect wedges the embedded-run loop.

- Manifesting path if present: auth/profile refresh and embedded runner failure handling flow through the run execution/auth path in `src/auto-reply/reply/agent-runner-execution.ts` and `src/agents/pi-embedded-runner/run/attempt.ts`, not the TaskFlow continuation queue store itself.
- Eliminating evidence in current continuation code: the queue enqueue/drain lifecycle has no Codex-auth-specific branch and does not inspect provider auth state when counting or releasing TaskFlow delegates.
- Disposition: defer to the refresh-token/auth lane unless new evidence links an auth failure to repeated continuation wake scheduling. This PR only stamps run-spawn provenance so a future trace can show whether auth failures are adjacent to timer/external/continuation-chain fires.

Instrumentation receipt:

- Added continuation queue metrics with total/pending runnable/scheduled/staged/invalid depth, per-sample enqueue/drain/fail deltas, drain-rate fields, bounded top queues, and `queue_depth_history` on liveness warnings plus `diagnostic.continuation_queue.sample` events.
- Added run-spawn provenance on trusted `run.started`/`run.completed` events: `fireReason` (`timer`, `external-trigger`, `continuation-chain`) and `parentRunId` when a run is fired by a previous run's continuation timer or delegate-return wake.
