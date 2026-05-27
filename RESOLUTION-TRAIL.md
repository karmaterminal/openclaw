# PR #85651 Drift-Cure-N+2 Resolution Trail

Lane: `ronan-seat-copilot`

Base: `6350531e32ae665db0ef3d524aa92f40b9e7f991`
Target used: `7299c5695317f74ddbe4a1a68efafd723a38c6c1` (`origin/main` had advanced beyond workorder target `bb752c2b4701f6742550c1e8d56303d9b04e87ab`).

## Preservation mandate

Cherry-pick upstream delta; do not wholesale file-replace. PR-head continuation feature additions are preserved unless a deletion is explicitly classified with replacement proof.

## Pre-flight

Base SHA, karma PR head, and seven preservation counts matched the workorder before rebase:

- `continue_work`: 29 files
- `continue_delegate`: 41 files
- `request_compaction`: 25 files
- `crossSessionTargeting`: 27 files
- `drainsContinuationDelegateQueue`: 34 files
- `sessionContinuationTraceparent`: 2 files
- `continuationDelegate|continuation-delegate|ContinuationDelegate`: 58 files

Receipts: `gates/ronan-preflight-base.txt`, `gates/ronan-journal-preflight.md`.

## Halt / scribe surfacing

The initial rebase paused with preservation-token conflicts and modify/delete or rename/delete cases. I posted the required HALT journal to karmaterminal/openclaw#796 before resolving. The Discord webhook file was malformed in this seat, so the storm-channel attempt failed without printing the secret; that was also journaled.

Receipts: `gates/ronan-conflict-classification.txt`, `gates/ronan-journal-conflict-halt.md`, `gates/ronan-journal-webhook-failed.md`.

## Modify/delete and rename/delete decisions

| Path                                                                  | Decision                            | Replacement / preservation proof                                                                                                                                      |
| --------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/embedded-agent-runner/session-file-key.ts`                | Keep upstream/current renamed file. | Upstream internalized the embedded runner under `src/agents/embedded-agent-runner/**`; current callers import `resolveEmbeddedSessionFileKey` from this path.         |
| `src/agents/pi-embedded-runner.ts`                                    | Delete obsolete old facade.         | Replacement is current `src/agents/embedded-agent-runner.ts` plus `src/agents/embedded-agent.ts`; stale `pi-*` imports were ported to embedded-agent names.           |
| `src/agents/pi-embedded.runtime.ts`                                   | Delete obsolete old runtime facade. | Replacement is current `src/agents/embedded-agent.runtime.ts`; exports now include session-file active-run resolution.                                                |
| `src/agents/pi-tools.read.host-edit-recovery.test.ts`                 | Delete obsolete old test path.      | Host write/edit guard coverage is preserved under current `src/agents/pi-tools.{append,write.guard,write.message-truthfulness}.test.ts` ported to `agent-tools.read`. |
| `src/commands/doctor/shared/active-tool-schema-warnings.{ts,test.ts}` | Keep upstream/current files.        | Feature commit deleted these, but current upstream uses them through doctor repair/preview warnings; no continuation byte depended on deletion.                       |

## Main content-resolution classes

| Area                                | Resolution                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generated i18n files                | Preserved upstream generated output first, restored the PR/feature English keys, then regenerated locale bundles with `pnpm ui:i18n:sync`.                                                 |
| Codex app-server/package/shrinkwrap | Kept current upstream Codex app-server split and `@openai/codex@0.134.0`; package-lock state was refreshed by pnpm during i18n sync.                                                       |
| Embedded runner rename churn        | Preserved feature continuation logic while porting stale `pi-*` references to `embedded-agent-*` modules and adding the current session-file active-run map needed by diagnostic recovery. |
| Continuation session fields         | Restored `SessionEntry` continuation fields and `SessionPostCompactionDelegate` type so chain, pressure, traceparent, and post-compaction delegate state remains typed/persistable.        |
| Reply-source delivery helpers       | Restored current upstream internal-source reply contracts while keeping continuation call sites.                                                                                           |
| UI exec approval                    | Kept current upstream view/controller behavior and restored `allowAlwaysUnavailable` plus generated locale fallbacks.                                                                      |
| Build entries                       | Restored continuation lazy-runtime entries in `tsdown.config.ts` so singleton continuation state remains in the unified graph.                                                             |

## Focused fixes after typecheck

- Added `resolveSessionStoreEntry` back to `src/config/sessions/store.runtime.ts` for lazy runtime users.
- Restored session-file active-run lookup exports across `embedded-agent-runner/runs.ts`, `embedded-agent.ts`, and `embedded-agent.runtime.ts`.
- Ported stale `pi-*` test/import names to current embedded-agent modules and removed stale `@earendil-works/pi-ai` test mocks.
- Added `preserveUserFacingSessionModelState` handling to `session-usage.ts` so queued internal/fallback accounting does not overwrite user-visible session model state.
- Restored current OpenAI/Codex fallback and transport metadata for cold-cache `openai/gpt-5.5`, Codex response alias `store=false`, and context-engine auth-profile selection.
- Reconciled queued follow-up progress policy with current session verbose state so tool-error suppression, full-verbose output, and quiet auto-compaction notices match the live session surface.
- Restored synchronous post-compaction context injection into the first fresh-session system event, preserving queued workspace startup context before delegate delivery.
- Kept Codex app-server native compaction available for automatic/budget triggers while preserving manual-trigger guard behavior.
- Reconciled Codex app-server `0.134.0` manifest/version pin, restored source-reply developer instructions, and split logical thread/start cleanup so top-level runs retire failed clients while spawned helper startup errors keep the shared daemon.

## Receipts

- `gates/ronan-tsgo-after-import-fix.log` — production TypeScript check passed.
- `gates/ronan-ui-i18n-sync.log` — UI i18n regenerated.
- `gates/ronan-gate-C-worktree-after-count-restore.txt` — seven preservation counts restored to 29/41/25/27/34/2/58.
- `gates/ronan-focused-final11.log` — focused regression batch passed: 11 files, 892 tests.
- `gates/ronan-tsgo-final11.log` — production TypeScript check passed after final drift fixes.
- `gates/ronan-gate-C-final11.txt` — seven preservation counts are 30/42/26/28/35/2/59, above the workorder minimums.
- `gates/ronan-gate-D-deleted-tests-final11.txt` — deleted-test audit still matches the earlier classified upstream/rename-deletion set.
- `gates/ronan-gate-E-prepush-final-candidate.log` — full Gate E red on three Codex regressions before final Codex repair.
- `gates/ronan-codex-failures-final13.log` — Codex regression shard passed after final repair: 3 files, 81 tests.
- `gates/ronan-tsgo-final13-codex.log` — production TypeScript check passed after final Codex repair.
- `gates/ronan-gate-E-prepush-final14.log` — full Gate E red on post-compaction dispatch test expectations after context-ordering repair.
- `gates/ronan-post-compaction-final15.log` — post-compaction focused regression batch passed: 2 files, 69 tests.
- `gates/ronan-tsgo-final15-post-compaction.log` — production TypeScript check passed after the post-compaction dispatch adjustment.
- `gates/ronan-gate-E-prepush-final15.log` — full Gate E red on `memory-search.test.ts` under unit-fast shard plugin-runtime mock contamination.
- `gates/ronan-memory-search-final16.log` — memory search focused test passed after scoping the no-runtime-registry case to plugins disabled: 1 file, 30 tests.
- `gates/ronan-tsgo-final16-memory.log` — production TypeScript check passed after the memory test adjustment.
