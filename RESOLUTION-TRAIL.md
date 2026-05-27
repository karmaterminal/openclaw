# RESOLUTION-TRAIL — PR #85651 Drift-Cure (cael-seat claude lane)

**Composed**: 2026-05-27 by 🩸 cael-dandelion-cult (claude code-agent)
**Base SHA**: `39a8c295deac062a6ffde5bc7396f88bedb07538` (🌊 Ronan's verified-clean preservation reference)
**Rebased onto**: `530468259392ed8b77b43d8811bae058addf1ddb` (upstream/main pinned)
**Candidate SHA**: `85ae6106bb7a10e4d6d5405f136eb366bc7e7db7`
**Branch**: `claude/pr85651-driftcure-20260527T020345Z`
**Lane journal**: `karmaterminal/openclaw#790`

---

## Replay state

| #   | Commit                                      | Result                                        | Conflicts    |
| --- | ------------------------------------------- | --------------------------------------------- | ------------ |
| 1/7 | `0dff94dbe4` PR-head (continuation feature) | Applied with manual resolution                | **19 files** |
| 2/7 | `116d88d1b6` workorder doc                  | Auto-applied                                  | 0            |
| 3/7 | `3532df32d2` session-store restoration      | Auto-applied                                  | 0            |
| 4/7 | `b6191b43eb` agent-command restoration      | Auto-applied                                  | 0            |
| 5/7 | `30cc1607e8` gateway-agent restoration      | Applied with manual resolution                | **1 file**   |
| 6/7 | `97a636588c` test mocks restoration         | **DROPPED** — patch contents already upstream | n/a          |
| 7/7 | `85ae6106bb` journal doc                    | Auto-applied                                  | 0            |

Final tree on top of `530468259392`: 6 commits.

---

## Preservation-surface verification (deletion-audit gate)

| #   | Surface                                                                     | Base | Post-PR-head | Final    |
| --- | --------------------------------------------------------------------------- | ---- | ------------ | -------- |
| 1   | `runWithDiagnosticTraceparent` in `src/agents/agent-command.ts`             | 2    | 2            | **2** ✅ |
| 2   | `runWithDiagnosticTraceparent` in `src/agents/command/attempt-execution.ts` | 3    | 3            | **3** ✅ |
| 3   | Test `sets inherited traceparent active for embedded child runs`            | 1    | 1            | **1** ✅ |
| 4   | `senderIsOwner` in `src/gateway/server-methods/agent.ts`                    | 2    | 2            | **2** ✅ |
| 5   | `continuationTrigger` in `src/gateway/server-methods/agent.ts`              | 2    | 2            | **2** ✅ |
| 6   | `sessionContinuationTraceparent` in `src/gateway/server-methods/agent.ts`   | 3    | 3            | **3** ✅ |

All 6 preservation surfaces intact through every rebase step.

---

## Conflict resolutions

### Commit 1/7 — `0dff94dbe4` (PR-head feature) — 19 conflicts

#### 1. `scripts/crabbox-wrapper.mjs` (1 region) — NOT preservation-list

**Resolution**: take PR-head side (adds `|| hasOption(commandArgs, "--id")` check; upstream had only `--no-sync`).
**Reasoning**: PR-head adds `--id` exclusion to `shouldUseFullCheckoutForCleanSparseRemoteSync`. Byte-proof of `--id` flag existing: `crabbox-wrapper.mjs:482, 1841`. Semantic-consistent feature addition.

#### 2. `src/agents/command/attempt-execution.ts` (1 region) — **PRESERVATION-LIST**

**Resolution**: merge both intents — kept PR-head's `runWithDiagnosticTraceparent` wrapper AND added upstream's new `sessionEntry: params.sessionEntry,` field.
**Reasoning**: Preservation surface #2. Upstream added `sessionEntry` field to `runCliAgent({...})` call; PR-head added the diagnostic-trace wrapper around the call. Both compose cleanly.

#### 3. `src/agents/model-fallback.test.ts` (1 region) — NOT preservation-list

**Resolution**: take HEAD side (upstream added 2 new test cases + `(regression #946)` tag).
**Reasoning**: PR-head changed test to `async` without using `await` in body — non-load-bearing cosmetic difference. Upstream's new tests are real coverage additions.

#### 4. `src/agents/openclaw-tools.ts` (2 regions) — NOT preservation-list

**Resolution A (imports)**: merge — keep PR-head's `createSubsystemLogger` import + upstream's split-secrets imports (`runtime-state.js`, `runtime-web-tools-state.js`) + upstream's new sessions/transcripts imports. PR-head's `../secrets/runtime.js` is no longer a valid path (upstream refactor 77d9ac30bb split it).
**Resolution B (includeUpdatePlanTool block)**: take HEAD's `shouldIncludeUpdatePlanToolForOpenClawTools` helper + HEAD's `includeTranscriptsTool` + ADD PR-head's `sessionToolConfig`.
**Byte-proof of factory-policy preservation**: `openclaw-tools.registration.ts:70-82` shows `shouldIncludeUpdatePlanToolForOpenClawTools` internally ORs `isToolExplicitlyAllowedByOpenClawToolPolicy` (the factory-policy check) with `isUpdatePlanToolEnabledForOpenClawTools` — semantically equivalent to PR-head's inline OR.

#### 5. `src/agents/pi-embedded-runner/compact-reasons.test.ts` (1 region) — NOT preservation-list

**Resolution**: merge — keep HEAD's 2 new tests (`below_threshold`, `deferred_background`) AND PR-head's 1 new test (`no_real_conversation_messages`).
**Reasoning**: All three reason codes exist in compact-reasons.ts. Tests are additive coverage.

#### 6. `src/agents/pi-embedded-runner/compact-reasons.ts` (2 regions) — NOT preservation-list

**Resolution A (top of file)**: merge — keep HEAD's `DEFERRED_CONTEXT_ENGINE_COMPACTION_REASON` constant AND PR-head's `CompactionReasonCode` closed-union type, `SKIP_CODES` set, `isCompactionSkipCode`, `isCompactionSkipReason` helpers. Added `"deferred_background"` to the union and to SKIP_CODES (upstream classifier returns this code; test title says "skip-like reason").
**Resolution B (classifier branches)**: merge — keep PR-head's `no real conversation messages` and `unknown model` branches AND upstream's `|| text.includes("already under target")` extension to the `below threshold` branch.

#### 7. `src/agents/pi-embedded-runner/compact.types.ts` (1 region) — NOT preservation-list

**Resolution**: merge — PR-head's `"volitional"` added to `trigger` union AND HEAD's `deferOwningContextEngineCompaction?: boolean` field.

#### 8. `src/agents/pi-embedded-runner/run/failover-policy.ts` (1 region) — NOT preservation-list

**Resolution**: merge — keep both `harnessOwnsTransport?: boolean` (HEAD) AND `compactionFailureContext?: boolean` (PR-head). Both fields are referenced elsewhere (`run.ts:1578, 1894, 2456, 2495`; `assistant-failover.ts:46, 199`).

#### 9. `src/agents/pi-embedded-runner/run.ts` (1 region) — NOT preservation-list

**Resolution**: merge — pass both `harnessOwnsTransport` AND `compactionFailureContext` to `resolveRunFailoverDecision`.

#### 10. `src/agents/session-write-lock.ts` (1 region) — NOT preservation-list

**Resolution**: take PR-head side (empty conflict region — rejected upstream's `shouldRemoveStaleLock` callback addition).
**Reasoning**: PR-head intentionally deleted the `maxHoldMs`/`respectMaxHold` infrastructure from `inspectLockPayload` and `inspectLockPayloadForSession` signatures. Upstream's NEW `shouldRemoveStaleLock` callback at the contended-lock acquire path depends on `respectMaxHold` being in the signature, which PR-head removed. PR-head's `removeReportedStaleLockIfStillStale` helper (called from the catch-block on `file_lock_stale` error) provides the functional equivalent recheck semantics. Two competing approaches with overlapping intent; preserved PR-head's design choice.
**Loss**: upstream's `shouldRemoveStaleLock` callback NOT applied. Functional behavior preserved via PR-head's catch-block recheck.

#### 11. `src/auto-reply/reply/agent-runner-execution.ts` (5 regions, ~330 lines total) — NOT preservation-list

**Resolution**: took PR-head wholesale via `git checkout --theirs` after manual resolution of conflict 1 (imports). Single-import merge for conflict 1 was overwritten by `--theirs`.
**Reasoning**: PR-head's continuation execution path (12 references to `ContinueWorkRequest`/`isContinuationWrappedRunResult`) is feature-load-bearing. Upstream's `agentTurnTiming.measure(...)` profiler wraps (16 references) are non-feature-bearing instrumentation that interleaved with PR-head's continuation result-wrapping logic at the SAME lines. Manual line-by-line merge of 300+ interleaved lines was high-risk for introducing subtle bugs in the continuation path.
**Loss**: upstream's `agentTurnTiming` profiler labels (`model_fallback`, `fallback_prepare_harness`) and `isReplyProfilerEnabled` import NOT applied. Follow-up work item — not load-bearing for any preservation surface or for the continuation feature.

#### 12. `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts` (1 region) — NOT preservation-list

**Resolution**: merge — keep both `clearRuntimeConfigSnapshot`+`setRuntimeConfigSnapshot` (HEAD adds `setRuntimeConfigSnapshot`) AND `type OpenClawConfig` import (PR-head). Both are used.

#### 13. `src/auto-reply/reply/get-reply.ts` (2 regions) — NOT preservation-list

**Resolution A (imports)**: merge — both `createSubsystemLogger` (HEAD, used at line 100) and `removeSystemEvents` (PR-head, used at lines 748/855) kept.
**Resolution B (directive-handled-reply path)**: merge — both PR-head's continuation timer/wake-event cleanup AND HEAD's `logResolverTiming("completed", "directive_reply")` profiling.

#### 14. `src/auto-reply/tokens.test.ts` (1 region) — NOT preservation-list

**Resolution**: merge — keep both HEAD's huge new test suites (`stripSilentToken`, `custom silent tokens`) AND PR-head's `isSilentReplyPrefixText` section comment header.

#### 15. `src/config/sessions/store-load.ts` (1 region) — NOT preservation-list

**Resolution**: take HEAD side (`serialized: serializedFromDisk, takeOwnership: serializedFromDisk !== undefined,` fields).
**Reasoning**: upstream extended `writeSessionStoreCache` signature to accept these fields (verified: `store-cache.ts:404-414`). PR-head didn't have them.

#### 16. `src/flows/doctor-health-contributions.test.ts` (1 region) — NOT preservation-list

**Resolution**: take HEAD side (2 new upstream tests added; PR-head added nothing).

#### 17. `src/infra/session-cost-usage.ts` (2 regions) — **workorder-pre-identified**, NOT preservation-list

**Resolution A (file iteration)**: take HEAD side — accept upstream's `listUsageCountedTranscriptFileStats(...)` helper extraction. Object-shape consumer (`file.filePath`) at line 1338 required.
**Resolution B (checkpoint dedup)**: take PR-head side ADAPTED — PR-head's checkpoint-twin dedup logic preserved but adapted from `entry.name`/`stats.mtimeMs` to `fileName`/`file.mtimeMs` (post-upstream-extraction shape).
**Reasoning**: workorder example confirmed accepting upstream's helper. PR-head's dedup is a real semantic addition (prevents over-counting checkpoint twins as distinct sessions); adapting to object shape is straightforward.

#### 18. `src/tasks/task-flow-registry.store.sqlite.ts` (2 regions) — NOT preservation-list

**Resolution A (FLOW_RUNS_COLUMNS)**: take HEAD's `${FLOW_RUNS_COLUMNS}` template substitution; ADD `chain_id TEXT` to the `FLOW_RUNS_COLUMNS` constant at line 75 (preserving PR-head's chain_id schema).
**Resolution B (ALTER TABLE migrations)**: merge — keep both HEAD's owner_session_key→owner_key rebuild migration AND PR-head's chain_id ALTER TABLE migration.
**Byte-proof of chain_id preservation**: line 448 `CREATE INDEX idx_flow_runs_chain_id ON flow_runs(chain_id)` was auto-merged — confirms downstream usage requires `chain_id` column.

#### 19. `test/scripts/crabbox-wrapper.test.ts` (2 regions) — NOT preservation-list

**Resolution A**: take HEAD side — `shellSingleQuote` helper added by upstream, used at lines 47, 67.
**Resolution B**: take HEAD side — `scriptContent?: string` field added by upstream, used at lines 708-710.

### Commit 5/7 — `30cc1607e8` (gateway-agent restoration) — 1 conflict

#### `src/gateway/server-methods/agent.ts` (1 region) — PRESERVATION-LIST FILE

**Resolution**: take HEAD side (empty conflict region — rejected duplicate type re-addition).
**Reasoning**: PR-head's commit `30cc1607e8` re-adds `type AgentSendSessionLifecycleTransition = {...}` at line 227, but the same type is ALREADY defined at line 168 in the upstream-evolved state of the file. Duplicate type would cause TS error. Took HEAD side because the type already exists earlier in the file (byte-proof: `grep -n "type AgentSendSessionLifecycleTransition" src/gateway/server-methods/agent.ts` shows definitions at lines 168 and 227 before resolution).
**Preservation-list impact**: zero — none of the 6 preservation surfaces touched by this conflict region; the conflict was about a duplicate type declaration.

### Commit 6/7 — `97a636588c` (DROPPED)

Git rebase reported: `dropping 97a636588c2dc67227a3ae132452a229f9b2b2b1 test(gateway-agent): wire emitGatewaySession*PluginHook mocks (#782) -- patch contents already upstream`. The mock-wiring test changes were already absorbed by upstream's evolution; no manual action needed.

---

## Documented losses (follow-up work, NOT preservation-list)

1. **Upstream profiler/timing additions** in `src/auto-reply/reply/agent-runner-execution.ts` — `agentTurnTiming.measure(...)` labels (`model_fallback`, `fallback_prepare_harness`, etc.) and `isReplyProfilerEnabled` import NOT applied. PR-head's continuation execution path preserved instead.
2. **Upstream's `shouldRemoveStaleLock` callback** in `src/agents/session-write-lock.ts` — NOT applied. PR-head's `removeReportedStaleLockIfStillStale` catch-block recheck (functional equivalent) preserved instead.

Both are non-preservation-list, non-feature-load-bearing. Can be re-applied as follow-up patches.

---

## Gate receipts

See `/tmp/wo-pr85651-driftcure-2026-05-27/gates/`:

- `pre-rebase-preservation.log` — all 6 surface checks PASS on base SHA
- `deletion-audit-prhead.log` — all 6 surface checks PASS post-conflict-resolution
- `rebase-stdout.log` — full rebase stdout
- `post-rebase-sha.txt` — final candidate SHA
- `gate-3a-install.log` — pnpm install
- `gate-3b-tsgo.log` — production typecheck
- `gate-3c-tsgo-test.log` — test typecheck
- `gate-3d-check.log` — umbrella check
- `gate-3e-test.log` — full test suite
- `gate-3f-build.log` — build
- `gate-3g-prepush-ci.log` — prepush-ci mirror
