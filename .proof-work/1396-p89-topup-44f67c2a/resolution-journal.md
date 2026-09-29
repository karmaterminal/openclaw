# P89 top-up absorb of upstream 44f67c2a7d — resolution journal

Lane `codeagent/1396-p89-topup-44f67c2a`, bound to karmaterminal/openclaw#1396.

## Refs

| category | ref | full SHA |
| --- | --- | --- |
| product/base (accepted candidate) | `codeagent/1396-p89-topup-44f67c2a` pre-merge = `scribe/20260926/p89-absorb-b1c68b93` | `7b3815d7f55ee68dd1322c6aec47efa3eabcda11` |
| pinned upstream floor | `openclaw/openclaw` | `44f67c2a7d3b1752de4d8998fcc85cab1afbc756` (= `6652f7eac8^`) |
| previous absorb | upstream | `e834097fb7e6baab4a397385dfb79d443b93996c` (merge-base of the two parents) |
| presentation (read-only) | `codeagent/85651-upstream-1ba243c8-gates` = savegame `savegame/presentation-129388-20260926T155000Z` | `9eb655afa7f70886e8dcd034e56df659eabf33df` |
| deploy composite (read-only, not merged) | `codeagent/1396-deploy-composite-7b3815d7` | `11442f8596a5f4a298768bea2f8879253ed5ccc3` |
| pre-merge savegame | `savegame/p89-topup-pre-44f67c2a-20260929T060900Z` | `7b3815d7f55ee68dd1322c6aec47efa3eabcda11` |
| bootstrap tools | `karmaterminal/openclaw-bootstrap` `main` (fetched) | `ed62d6719888e97feb41904561fa195ea147e2b0` |
| CI | Mode-B — not dispatched by this lane (orchestrator dispatches after review) | N/A |
| docs / proof | N/A this lane | N/A |

Lane branch published unchanged before any gate: local = tracking = server = `7b3815d7…`.

## Envelope

`git merge-tree --write-tree --name-only 44f67c2a7d 7b3815d7` → **4** conflicted files, equal to the dispatch count. 90 upstream commits in `e834097fb7..44f67c2a7d`. Upstream changed 2050 files, our side 884; 45 overlap.

## Conflict decisions (4 files, 9 hunks)

| file | hunk | kind | decision | reason |
| --- | --- | --- | --- | --- |
| `subagent-announce-descendant-wake.ts` | 1 (`isWakeContinuation` vs `hasUsableSessionEntry`) | behaviour | ours | Upstream deslopped `isWakeContinuation`/`stripWakeRunSuffixes` (regex form). Our side replaced them with the exported `isWakeContinuationRun`/`stripWakeRunSuffixes`, consumed by `subagent-announce.ts:50-51,287,297`. Regex and loop forms agree, including `":wake"` → false. |
| same | 2 (`terminateUnownedWake` / `normalizeOptionalString`) | behaviour | ours | `runDescendantWake` was replaced by the durable reservation in `wakeSubagentRunAfterDescendants`, which already reads `expectedSessionId`/`expectedLifecycleRevision` through `normalizeOptionalString`. Result is byte-identical to `7b3815d7`. |
| `subagent-registry-sweeper.ts` | 1–5 (collector-group loop) | behaviour | upstream in all five | Upstream converted `keepGroup` flags to a labeled `continue collectorGroups`. Ours had `deleteFailed`/`groupMembershipChanged` flags and **no pre-delete `runs.get(id) !== candidate` guard**. That guard exists at both `e834097fb7` and `44f67c2a7d`; our `5a6971fc3a` ("reconcile continuation with current upstream") dropped it while replacing the body with an older upstream shape. Frozen-upstream loss, not a feature decision. Taking upstream restores it. Our ownership-predicate `deleteSession(key, identity, isCurrent, run)` call (outside the hunks) is kept. Regression test added (below). |
| `subagent-attachments.ts` | 1 (imports/docblock) | imports | union of used names | Keep `resolveIntegerOption`, `asOptionalRecord` (used). Drop `resolveNonNegativeIntegerOption` (0 uses outside the hunk). Drop the docblock (upstream deslop). |
| same | 2 (`decodeStrictBase64` + `SubagentInlineAttachment`) | declarations | ours | Base64 decoding moved to the shared owner `src/shared/inline-attachments.ts:71`. Keep `type SubagentInlineAttachment = InlineAttachment`. Upstream's `SpawnSubagentParams`-derived alias is then unused, so the auto-merged import is trimmed to `SpawnSubagentResult`. |
| same | 3 (`files` receipt type) | declarations | union | Upstream's clean hunk deleted `SubagentAttachmentReceiptFile` and derives `SubagentAttachmentReceipt` from `SpawnSubagentResult["attachments"]`, which has the same shape (`subagent-spawn-contract.ts:122-127`). Take `SubagentAttachmentReceipt["files"]` and keep our `materializationStage = "attachment_write"` marker. |
| `subagent-spawn.ts` | 1 (docblock + ACP/audit imports) | imports | neither | Upstream drops the docblock. `isAcpRuntimeSpawnAvailable`/`isExecutionIdentityCollectionEnabled` live in our split modules (`subagent-spawn-envelope.ts`, `subagent-spawn-gateway-identity.ts`, `acp-spawn.ts`); zero uses here. Upstream's `completionRequesterLifecycleRevision` threading (3d62d4e2a5) auto-merged into our spawn body. |

## Post-merge fixups (commit `871c03c018`)

| file | failure | fix |
| --- | --- | --- |
| `subagent-announce.format.e2e.test.ts` | TS2783 ×3 at `tsgo:core:test`: upstream `296228fbdf` moved the child/requester keys into `defaultOutcomeAnnounce` and spreads it first. Our `omits continuationTrigger when continuation is disabled` listed them before the spread. | Follow upstream's fixture pattern (spread first, then `childRunId`). Values unchanged. |
| `subagent-registry-sweeper-recovery.test.ts` | Guard restored by the merge had no pinning test. | Regression test "leaves a collector group untouched when a member is replaced during a groupmate's deletion" (see regression record). |
| `src/gateway/agent-turn/agent-turn-service.ts` | Type-aware lint `max-lines` 701 > 700. Each side added one net line (upstream `ac4c248d77` `.catch(dedupeLifecycle.handlePreparationFailure…)` + `assertAdmissionCurrent`; ours `sessionContinuationTraceparent`). Emergent in the merge; both parents are under. | Join the adjacent initializer-free `resolvedSessionAgentId`/`supersededSessionId` declarations. Same pattern our `05d2f4da07` used in this file. |

## Regression record — sweeper collector-group guard

- **Invariant:** once a collector-group member is replaced in `runs` during an awaited cleanup step, the sweep abandons that group for this pass before its attachment and context-engine phases. The final live-membership check is a backstop, not the only fence.
- **Owning boundary:** `createSubagentRegistrySweeper().sweepOnce()` collector-group loop, driven with the real sweeper, the real `createSubagentSweepSessionCleanup` and the harness's `callGateway` (`sessions.delete`).
- **Pre-fix negative control** (`7b3815d7`, same test file copied into a detached worktree): 1 failed / 36 passed. `AssertionError: expected 1790663276263 to be undefined`: the groupmate's `contextEngineCleanupCompletedAt` was written for a group the pass then deferred.
- **Post-fix:** 37/37 at `871c03c018`.
- **Nearest sibling:** the existing "defers a collector group with a $change after an earlier cleanup await" cases (replacement before the group is read; caught by `cleanupIdentities.has`). Still green.
- **Persistence / restart:** the guard only skips work in one pass. Nothing is written for the skipped group, so the next pass re-reads authoritative `runs`. No new persisted state.

## Install

The lockfile does not move in this window (`pnpm-lock.yaml` and every `package.json` are identical at `7b3815d7`, `44f67c2a7d` and the merge). The shared `source/openclaw` checkout's lockfile blob differs (`09f3aa93…` vs lane `559e13f7…`), so the dispatched `node_modules` symlink pointed at a different install. Replaced it with a real lane-local `pnpm install --frozen-lockfile` (pnpm 12.5.0, node v26.9.0, 9.2 s).

## Generated artifacts

`config:docs:check`, `config:schema:check`, `prompt:snapshots:check`, `runtime-sidecars:check`, `sqlite:sessions-schema:check`, `plugins:inventory:check`, `plugin-sdk:surface:check`, `deps:ownership-surface:check`: all green; nothing to regenerate.

`db:worker-inventory:check` is red on the candidate **and on both parents** (`7b3815d7` and `44f67c2a7d`): an upstream-baseline stale inventory. Not regenerated here.

## Gate 2 anchor

The workorder's `feature-cores-byte-check.sh 9eb655afa7 …` exits 2 with `PR_HEAD is not on CANDIDATE's first-parent lineage`. The presentation head is an ancestor of `7b3815d7` only through a second parent. The prior round anchored at a first-parent ancestor (`55accd753e`). This lane anchors at `7b3815d7`, the accepted and cosigned candidate and this merge's first parent, so Gate 2 measures exactly what the top-up did to the feature cores.
