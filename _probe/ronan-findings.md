# Probe findings: v2026.4.20 vs feature/context-pressure-squashed

- HEAD: `e8dcccbdcf` (feature/context-pressure-squashed)
- Upstream tag: v2026.4.20 (FETCH_HEAD `115f05d595`)
- `merge-base HEAD FETCH_HEAD` = no shared ancestor; FETCH_HEAD is a shallow 100-commit fetch, so PR squash-merges predate the visible window and cannot be found by commit message alone. Verified instead by blob contents + v2026.4.20 `CHANGELOG.md`.

## PR #69404 — Sessions/Maintenance OOM prune on load

- Status: **in v2026.4.20, NOT in HEAD.**
- CHANGELOG credit: "enforce the built-in entry cap and age prune by default, and prune oversized stores at load time" — thanks @bobrenze-bot.
- No commit SHA recoverable from the 100-commit shallow fetch; diff is visible only as blob divergence.
- Files that diverge (pick scope):
  - `src/config/sessions/store-maintenance.ts` — upstream flips `DEFAULT_SESSION_MAINTENANCE_MODE` from `"warn"` to `"enforce"`, drops `resolveMaintenanceConfig()`, extracts a `wouldCapActiveSession` helper (~24 net lines).
  - `src/config/sessions/store-load.ts` — upstream adds load-time `pruneStaleEntries` + `capEntryCount` when `mode === "enforce"` and `size > maxEntries` (~20 lines). HEAD has no such hook.
- Adjacent divergence (not required but nearby): upstream has 5 files HEAD lacks under `src/config/sessions/`: `reset-policy.ts`, `reset-preserved-selection.ts`, `store-entry.ts`, `store-maintenance-runtime.ts`, `transcript-resolve.runtime.ts`.
- Cherry-pick viability: **trivial-to-moderate conflict.** The two touched files are structurally compatible (339 vs 363 LOC). Mode flip is a one-liner; load-time prune hook imports only existing symbols. Risk: the removed `resolveMaintenanceConfig` still has HEAD callers, so either keep a shim or update callers.

## PR #67830 — Agents/compaction start and completion notices

- Status: **already integrated in HEAD** (via a sibling PR).
- HEAD commit `2b68d20ab3` "feat: notify user when context compaction starts and completes (#38805)" by zidongdesign, 2026-03-21. Same feature, different upstream PR number.
- Identical user-facing strings on both sides:
  - `src/auto-reply/reply/agent-runner-execution.ts:1234` (HEAD) / `:635` (upstream): `"🧹 Compacting context..."`
  - `src/auto-reply/reply/followup-runner.ts:388` (HEAD) / `:393` (upstream): `"🧹 Auto-compaction complete${suffix}."`
- No cherry-pick needed.

## PR #68915 — Plugins/tasks detached runtime registration contract

- Status: **in v2026.4.20, NOT in HEAD.**
- CHANGELOG credit: "add a detached runtime registration contract so plugin executors can own detached task lifecycle and cancellation without reaching into core task internals" — thanks @mbelinky.
- Findable SHA on a sibling branch: `bd3ad3436e` on `origin/silas/cot-leak-fix-upstream` ("tasks: add detached runtime plugin registration contract (#68915)", 2026-04-19, Mariano).
- Files touched by `bd3ad3436e` (19 paths, +759 / -49):
  - Adds: `src/tasks/detached-task-runtime-contract.ts`, `src/tasks/detached-task-runtime-state.ts`.
  - Modifies: `src/tasks/detached-task-runtime.ts`, `src/tasks/detached-task-runtime.test.ts`, `src/tasks/task-executor.ts`, `src/tasks/task-executor.test.ts`, `src/commands/tasks.ts`, `src/plugin-sdk/index.ts`, `src/plugins/api-builder.ts`, `src/plugins/loader.ts`, `src/plugins/loader.test.ts`, `src/plugins/registry.ts`, `src/plugins/runtime/runtime-task-test-harness.ts`, `src/plugins/runtime/runtime-tasks.test.ts`, `src/plugins/runtime/runtime-tasks.ts`, `src/plugins/runtime/runtime-tasks.types.ts`, `src/plugins/types.ts`, `test/helpers/plugins/plugin-api.ts`, `CHANGELOG.md`.
- **Blocking prereq:** `#68915` modifies `src/tasks/detached-task-runtime.ts`, but that file is absent on HEAD (the entire `detached-task-runtime*` subsystem is upstream-only). Cherry-pick needs a prior detached-task-runtime backport first.
- Adjacent divergence on modified files: `plugins/registry.ts` (198 LOC diff HEAD↔upstream from unrelated context), `tasks/task-executor.ts` (190 LOC diff). Both would bring conflicts.
- Cherry-pick viability: **deep conflict.** Not a drop-in — requires backporting the detached-task-runtime subsystem base first, then reconciling `plugins/registry.ts` and `task-executor.ts` against our divergent versions.

## Cael's `src/auto-reply/continuation-delegate-store-taskflow.ts` vs #68915

- Cael's file (149 LOC) uses `src/tasks/task-flow-registry.ts` APIs (`createManagedTaskFlow`, `finishFlow`, `listTaskFlowsForOwnerKey`, `requestFlowCancel`, `updateFlowRecordByIdExpectedRevision`). Identifier: `flowId` (TaskFlowRecord). Controller: `"core/continuation-delegate"`.
- #68915 lives in `src/tasks/detached-task-runtime.ts` — a completely different registry (`task-registry.*`, identifier `runId`, types from `task-registry.types.ts`). Its contract is plugin-owned lifecycle (`createQueuedTaskRun`/`startTaskRunByRunId`/`completeTaskRunByRunId`/`cancelDetachedTaskRunById`).
- **These are two orthogonal registries.** `task-flow-registry` (where Cael works) is untouched by #68915. Adding `flowId?`/`ownershipPath?` to continuation-delegate TaskFlow records does not collide with the detached-task-runtime plugin contract.
- **#68915 does NOT supersede Cael's work.** Different registry, different identifier, different abstraction layer.

## Verdict

- **#69404:** viable to cherry-pick (trivial-to-moderate, scope it to `store-maintenance.ts` + `store-load.ts` and patch the `resolveMaintenanceConfig` call sites).
- **#67830:** already integrated / no action needed.
- **#68915:** needs rework — requires detached-task-runtime subsystem backport first; independent of Cael's TaskFlow-based continuation delegate work, so Cael can proceed.
