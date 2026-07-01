# PR #1144 review — REVIEW ONLY / DO NOT MERGE

**PR:** https://github.com/karmaterminal/openclaw/pull/1144
**Base:** `karmaterminal/openclaw:main`
**Head:** `frond-scribe/20260624/assembly-continuation-followons` (`322b5c755e` at review time)
**Merge base:** `a6aaba76ac`
**Verdict:** Sound, unusually well-engineered continuation subsystem with strong durable-state discipline, **but** it carries two confirmed correctness bugs in the post-compaction / delegate-commit paths and ships **without** the #1138/#1142 no-op-replay guard (that lands via separate PR #1143). Do **not** merge #1144 (review artifact). Findings below are drift-correction backlog for the assembly branch before it lands to fork `main`.

---

## 1. Scope reviewed

The PR implements the `CONTINUE_WORK` continuation/delegation/compaction subsystem (RFC `docs/design/continue-work-signal-v2.md`, status "Implemented").

- **328 files** changed, **+51,262 / −995**. Split: **171 production files (+17,317)**, **157 test files (+33,945)**.
- Byte-walked personally (continuation core + integration seams):
  - `src/auto-reply/continuation/{types,state,config,work-store,delegate-store,targeting-pure,targeting,signal,scheduler,context-pressure,post-compaction-release,work-dispatch,delegate-dispatch}.ts`
  - `src/auto-reply/tokens.ts` (signal parser), `src/config/zod-schema.agent-defaults.ts` (new config surface)
  - `src/auto-reply/reply/{agent-runner.ts (post-compaction + continuation seams), agent-runner-execution.ts (wired release), post-compaction-delegate-dispatch.ts}`
  - `src/agents/subagent-announce.ts` (tool/bracket delegate chain-hop paths)
  - `src/infra/continuation-tracer.ts` (tracer boundary), `scripts/deadcode-unused-files.allowlist.mjs`
- Delegated deep reads (4 parallel read-only review agents, findings independently re-verified at source before inclusion): subagent-announce family, agent-runner/compaction/tools, no-op-replay/room-event guard, diagnostics/tracing.
- **Not fully byte-walked in this lane** (named per workorder): the full 157-file test suite line-by-line; `src/agents/subagent-registry-*` internals; the `extensions/diagnostics-otel` service beyond the adapter/boundary; media/gateway-protocol schema deltas; `src/infra/session-delivery-queue-*` recovery. Continuation-relevant tests were confirmed green in the full run (see §9).

## 2. Commands run

```bash
gh pr view 1144 --repo karmaterminal/openclaw --json ...        # metadata
gh issue view 1135|1138|1142 --repo karmaterminal/openclaw       # bug-class context
gh pr view 1143|1141|1137 --repo karmaterminal/openclaw          # related PRs
git fetch origin main frond-scribe/20260624/assembly-continuation-followons
git diff --numstat origin/main...origin/frond-scribe/20260624/assembly-continuation-followons  # 328 files
git diff origin/main...HEAD -- <path>                            # per-file diffs by domain
# Full suite (sanctioned runner, worker-capped for shared host):
OPENCLAW_VITEST_MAX_WORKERS=4 node scripts/test-projects.mjs 2>&1 | tee /tmp/pr1144_fullsuite.log
```

`gh pr diff 1144` is unusable (HTTP 406 — diff exceeds 300 files); reviewed via local `git diff`.

## 3. Aspects emulated (frond-scribe pr-review-toolkit)

`code-reviewer`, `pr-test-analyzer`, `silent-failure-hunter`, `type-design-analyzer`, `comment-analyzer`, `code-simplifier` — run as separate passes and aggregated (slash command `/review-pr` unavailable in this non-interactive lane). Confidence ≥ 80 for reported issues.

Related items: #1135/#1138/#1142 (issues, all OPEN), #1143 (open guard PR based on this branch), #1141 (open audit-script PR), #1137 (MERGED into this branch: park continue_work on end-of-turn lifecycle).

---

## 4. Critical issues

### C1 — Post-compaction delegate silently discarded when compaction fires the same turn it is staged  `[code-reviewer / silent-failure-hunter]` — verified
`src/auto-reply/reply/agent-runner.ts:2507`, `:2695-2724`, `:3137-3155`, `:3397-3402`

On a turn where auto/preflight compaction is applied (`autoCompactionCount` truthy) **and** the model's final response stages a post-compaction delegate (`[[CONTINUE_DELEGATE: … | post-compaction]]`), the delegate is lost:
1. `dispatchPostCompactionDelegates(...)` runs at **:2507** (inside the `if (autoCompactionCount)` block) — *before* staging, so it cannot see the new delegate.
2. The delegate is staged into TaskFlow at **:2701** (`stagePostCompactionDelegate`).
3. Persistence into `pendingPostCompactionDelegates` at **:3137** is gated by `if (!autoCompactionCount …)` → **skipped**.
4. The `finally` block (opens at `:3371`) drains at **:3399**: `consumeStagedPostCompactionDelegates(sessionKey)` — a **bare call, result discarded** — which `finishFlow`s the staged row terminally.

Net: not dispatched, not persisted, discarded. Because the drain is in the `finally`, this happens on the **success** path too. This is precisely the high-context-pressure "stage working-state survival, then request_compaction" flow the feature exists for (see `context-pressure.ts:113-121` urgency text). No test exercises the auto-compaction-and-stage-same-turn window.

**Fix direction:** stage → persist even when `autoCompactionCount` is set (or dispatch the just-staged delegate), and make the `finally` drain distinguish "leftover from a failed turn" from "intentionally staged this turn." Add a regression test.

### C2 — Announce-path tool delegates are spawned without committing the TaskFlow row or threading the flow id  `[code-reviewer / silent-failure-hunter]` — verified
`src/agents/subagent-announce.ts:1322-1432` (accepted branch `:1414-1417`)

The in-announce tool-delegate chain-hop path consumes delegates via `consumePendingDelegates()` (moves the row to `running`, `:1074`/`:1084`) then `spawnSubagentDirect(...)`, but on `status === "accepted"` it only **logs** (`:1415`). It never calls `markPendingDelegateSpawnAccepted()` (that symbol appears **nowhere** in the file) and never threads `continuationDelegateFlowId` into the spawn params (`:1389-1405`). The canonical dispatcher does both — `delegate-dispatch.ts:420` (`continuationDelegateFlowId`) and `:446` (`markPendingDelegateSpawnAccepted`).

Consequences: the flow row is stranded in `running` forever, and because `isRecoverablePendingFlow` treats `running` as recoverable (`delegate-store.ts:182-184`), **restart recovery re-spawns the same delegate → duplicate continuation work**. The child also can't be correlated back to the flow (no flow id), so child-side acceptance (`hasAcceptedContinuationChildRun`) can't finish it either.

**Fix direction:** on this path, thread `continuationDelegateFlowId` and call `markPendingDelegateSpawnAccepted` on acceptance — ideally by collapsing this duplicated loop onto the shared dispatcher/spawn helper (see S4; this duplication is also the root cause of I6).

---

## 5. Important issues

### I1 — The #1138/#1142 no-op-replay / provider-admission guard is NOT in #1144  `[silent-failure-hunter / code-reviewer]` — verified
`src/auto-reply/reply/followup-runner.ts:602,1144,1635`, `src/auto-reply/continuation/work-dispatch.ts:463,488`

The guard for issues #1138/#1142 (stale room-event backlog and no-op continuation wakes buying provider calls) is **not present** in this diff — no `no-op-rearm`/admission-classifier symbols exist. It ships via the separate open PR **#1143** (based on this branch, head `codeagent/1138-1142-noop-replay-guard`). In #1144, room-event followups pass lane-ownership admission then run `runEmbeddedAgent`; continuation wakes call `getReplyFromConfig` (`work-dispatch.ts:463`) *before* any no-op/outcome classification, then mark delivered/granted (`:493`) regardless of output. For `continue_work` this is bounded by chain/cost caps (`scheduler.ts:27-39`); for **stale inbound room-event backlog it is not**. Disclosed in the PR body, but this is the top merge-risk for the assembly line: the assembly branch alone can still replay no-op turns that spend provider tokens.

### I2 — Volitional `request_compaction` release loses delegates on double persistence failure  `[silent-failure-hunter]` — verified
`src/auto-reply/reply/agent-runner-execution.ts:236-246`, `src/auto-reply/reply/post-compaction-delegate-dispatch.ts:745-779`

On enqueue failure, `dispatchPostCompactionDelegates` pushes delegates into `postCompactionDelegatesToPreserve` (`:753`) and itself tries to re-persist them (`:762-779`); if that persist **also** throws, it only logs. The auto-compaction caller recovers via a third tier (`agent-runner.ts:3400` re-stages the preserve array to TaskFlow), but the volitional caller passes a throwaway `postCompactionDelegatesToPreserve: []` (`agent-runner-execution.ts:240`) and does nothing after the call — so under a delivery-queue-write + session-store-write double failure, recovery work is silently lost after a destructive compaction. Lower probability (needs two independent write failures) but real asymmetry.

### I3 — Tracer/span methods run unguarded in core control flow  `[silent-failure-hunter]` — verified
`src/infra/continuation-tracer.ts:415`, `:487-498`; `src/auto-reply/continuation/delegate-dispatch.ts:399,409,448,459,472-485`; sibling `src/auto-reply/reply/agent-runner.ts` dispatch span

`startContinuationDelegateSpan` guards only the `startSpan` call and returns the **raw adapter span** (`:493`). The caller then drives `span.traceparent()` / `setStatus` / `recordException` / `end` across the spawn in the main try/catch/finally. `formatContinuationTraceparent` (`:415`) also calls the injected tracer's `formatTraceparent` unguarded. With a `diagnostics-otel` adapter installed whose span methods throw, a **live, accepted child's delegate gets marked failed** (throw at `:409`/`:448` → catch `:469` → `markDelegateFailed` `:475`), or a throw inside the catch/`finally` (`:472-485`) escapes the dispatch loop. The no-op default tracer is safe, so this is latent (OTEL users only), but it violates "diagnostics must never break the main path." Clean fix: return a fully-guarded span wrapper from the boundary so no call site needs try/catch (see S4).

### I4 — Unguarded TaskFlow calls in the agent-runner `finally` can mask the run error and skip typing cleanup  `[silent-failure-hunter]` — verified
`src/auto-reply/reply/agent-runner.ts:3397-3402` (inside `finally` at `:3371`)

`consumePendingDelegates` / `consumeStagedPostCompactionDelegates` at `:3398-3399` are not wrapped in their own try/catch (the nested try at `:3372` only covers `clearRestartRecoveryDeliveryContext`). A TaskFlow/SQLite throw here overrides the original run outcome and skips `typing.markDispatchIdle()` (`:3410`) — the exact "typing keepalive runs forever" failure that safety-net comment guards against. (Same block as C1; both should be fixed together.)

### I5 — `hasUsableSessionEntry` accepts malformed entries  `[code-reviewer]` — agent-surfaced, spot-checked
`src/agents/subagent-announce.ts:188-193`, used at `:815-823`

Reported to return `true` for a non-string `sessionId`, so `refreshRequesterTarget` can treat a stale/corrupt internal requester as usable and skip registry fallback → risk of lost completion routing. Worth an author type-guard tighten (`typeof sessionId === "string" && sessionId.length > 0`).

### I6 — Chain-hop traceparent dropped on announce-spawned bracket/tool delegates  `[code-reviewer / comment-analyzer]` — verified
`src/agents/subagent-announce.ts:1389-1405` (tool), bracket path likewise; contrast post-compaction `:1144` which passes it

The spawn param objects on the announce delegate paths omit `traceparent`, while `spawnSubagentDirect`/`SpawnSubagentParams` consume it and the post-compaction path in the same file passes it. Breaks RFC §3.3 root→child→deeper-child trace continuity for exactly the announce-driven chain hops. Same-root cause as C2 (divergent duplicated dispatch).

### I7 — Post-compaction release span undercounts; tracer comment stale  `[pr-test-analyzer / comment-analyzer]` — verified
`src/auto-reply/reply/agent-runner.ts:2506,2518-2523`; `post-compaction-delegate-dispatch.ts:641-667`; `src/infra/continuation-tracer.ts` release-span comment

`releasedCount` is snapshotted from `activeSessionEntry.pendingPostCompactionDelegates.length` only, but `dispatchPostCompactionDelegates` releases **both** persisted and TaskFlow-staged delegates (`:662-667`). Tool-staged post-compaction delegates can be released while the span reports `released=0`. The tracer comment describing release spans as auto-compaction-only is also stale (the volitional path emits them via `agent-runner-execution.ts:248-255`).

### I8 — Post-compaction consume finalizes to `succeeded` before spawn  `[type-design-analyzer / silent-failure-hunter]` — verified
`src/auto-reply/continuation/delegate-store.ts:705-716`

`consumeStagedPostCompactionDelegates` calls `finishFlow` (terminal `succeeded`) at consume time, then hands the delegate to dispatch. Unlike the pending path (claim to `running` → accept/fail), a post-compaction delegate whose downstream spawn fails cannot be flipped to `failed` (its revision is already terminal) — the audit trail reads "released/succeeded" although no child ran. Observability inconsistency rather than data loss, but the asymmetry with the pending path is worth aligning.

---

## 6. Suggestions

- **S1 — Wire-or-delete `post-compaction-release.ts` (dead code).** `releasePostCompactionLifecycle` has **no production caller** (only tests). `scripts/deadcode-unused-files.allowlist.mjs` self-documents this ("TODO: refactor call-site to use this helper … not-block-CI") and adds it to the Knip unused-file allowlist. The live path is `releaseQueuedCompactionCompletion` (`agent-runner-execution.ts:188`) → `dispatchPostCompactionDelegates`. The dead helper diverges (fires token-path context-pressure, skips `incrementRunCompactionCount` and the tracer span), so its dedicated tests give false confidence about a non-production path. Per lean-code AGENTS.md ("helpers must pay rent"; "a refactor that adds a second path has probably failed"), either complete the extraction (call it from `agent-runner-execution.ts`, delete the inline body) or delete the helper + its tests.
- **S2 — De-duplicate the Knip allowlist.** `scripts/deadcode-unused-files.allowlist.mjs` now lists `ui/src/ui/browser-redact.ts` twice (lines 33 & 53) and the two `extensions/qa-lab/*.fixture.ts` twice (26/54, 27/55) — rebase artifact.
- **S3 — Type design.** `ContinuationSignal` delegate variant still uses parallel booleans (`silent`/`silentWake`/`postCompaction`) 5/10 while the runtime `PendingContinuationDelegate.mode` union is 8/10 — collapse the signal onto the same discriminated `mode` so illegal combos are unrepresentable. `SpawnSubagentParams` silent/wake + targeting option bags 5/10. `RequestCompactionToolOpts.sessionId` optional-but-required-at-exec 6/10 (`request-compaction-tool.ts:184-194`).
- **S4 — Simplify by de-duplicating dispatch.** Replace the hand-rolled tool-delegate loop in `subagent-announce.ts` with the shared `dispatchToolDelegates`/spawn helper — the duplication has already diverged on flow-acceptance (C2), traceparent (I6), spans, and system events. Add one guarded span wrapper at the tracer boundary instead of per-caller try/catch (fixes I3 cleanly). Give post-compaction release an explicit `{ queued, drained, failed, preserved }` result instead of mixing queueing, fire-and-forget drain, and an external preserve array.
- **S5 — Comment rot.** `continuation-tracer.ts` "auto-compaction-only" release-span comment (I7); `extensions/diagnostics-otel/src/service.ts` stale `PR #85651` lore comment; `agent-runner.ts:3395` "stale delegates from a failed turn" is misleading since the block also runs (and clobbers) on success (C1).

---

## 7. Positive signals

- **Durable-state discipline is excellent.** TaskFlow-backed stores use `expectedRevision` optimistic-concurrency claims throughout; the #990 locus-3 durable delivered-mark (`work-store.ts:383-409`, read-guard `:257`) closes the restart-gap double-delivery window; cancel-requested rows are never driven (`:234`).
- **Orphan-reap safety invariant correctly enforced.** `bucket1ReapVerdict` (`work-dispatch.ts:191-205`): no lineage or `alive`/`uncertain` → `rate-cap-forever`; only `confident-terminal` → `reap` (never-wrongful-reap, asymmetric cost). `partitionSupersededWork` is pure, tie-broken by `hop`, and never folds a `running` member.
- **Config surface is additive and fail-closed.** `zod-schema.agent-defaults.ts:272-326`: all-optional, `.strict()`, delay-bound refinement, `contextPressureThreshold > 0`, and `crossSessionTargeting` defaults `"disabled"`. No breaking change to existing config.
- **Signal parsing is defensive.** Rejects `fanout`+explicit-targets combos (`tokens.ts:481-487`), normalizes/validates W3C traceparent, honors a `model:"default"` inherit sentinel, scans all payloads for the marker; traceparent parser rejects malformed/all-zero/`ff` (`diagnostic-trace-context-pure.ts:65-94`).
- **Cross-session gate + delivery-time re-check + persist-before-spawn** all present; extension boundary respected (diagnostics-otel imports via `../api.js`/`plugin-sdk`, OTEL deps plugin-local).
- **Massive behavioral test suite** (157 files, +33.9k LOC) with all 69 continuation-related test files green in the full run.

---

## 8. Recommended action before any drift correction or merge

1. **Do not merge #1144** — it is a review artifact (DO NOT MERGE). Track findings against the assembly branch.
2. **Fix C1 first** — the same-turn post-compaction discard silently defeats the feature's headline working-state-survival guarantee in the exact pressure scenario. Add the missing regression test.
3. **Fix C2** — thread `continuationDelegateFlowId` + call `markPendingDelegateSpawnAccepted` on the announce path (ideally via S4's shared-dispatcher dedupe, which also fixes I6).
4. **Land the #1138/#1142 guard (#1143)** before/with the assembly (I1).
5. **Harden silent-failure paths:** I2 (volitional re-stage), I3 (guard the tracer span boundary), I4 (guard the `finally` drain).
6. **Housekeeping:** wire-or-delete `post-compaction-release.ts` (S1); dedupe the Knip allowlist (S2).
7. **Validation:** full suite passed on logic (continuation tests green, 0 assertion failures). One worker OOM'd (memory pressure, shared-host artifact — AGENTS.md flags this) rather than a test failure; rerun the affected shard under `OPENCLAW_VITEST_MAX_WORKERS=1` or on Crabbox/Testbox for a definitive green. Live provider/gateway proof intentionally not run (review-only guardrail).

## 9. Full-suite evidence

`OPENCLAW_VITEST_MAX_WORKERS=4 node scripts/test-projects.mjs` on the head branch (89 shards, 1060.97s):

- **Aggregate across shards: 6,489 test files passed, 0 test-file failures; 85,688 tests passed, 0 tests failed, 50 skipped. 0 assertion-failure lines.**
- **1 non-passing shard:** `test/vitest/vitest.agents-core.config.ts` exited 1 due to a single **worker OOM** (`ERR_WORKER_OUT_OF_MEMORY`, JS heap) — a memory-pressure artifact of this shared host (AGENTS.md flags this exact mode: use `OPENCLAW_VITEST_MAX_WORKERS=1`), not a PR regression. That shard still reported `301 test files passed (302)` with 0 assertion failures before the worker was terminated.
- All 69 continuation/announce/compaction/tracer test files passed.
- Confirmatory rerun of the OOM'd shard, memory-constrained:
  `OPENCLAW_VITEST_MAX_WORKERS=1 node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-core.config.ts --maxWorkers=1` → **clean: 325 test files passed (325), 5,669 tests passed / 4 skipped, 0 failures, no OOM.** Confirms the full-run blemish was purely memory pressure, not a code/test defect.

Live provider/gateway proof intentionally not run (review-only guardrail). The two confirmed bugs (C1, C2) are **not** covered by any existing test — corroborating the pr-test-analyzer coverage-gap findings.
