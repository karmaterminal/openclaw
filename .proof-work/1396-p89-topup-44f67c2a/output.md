# WO-1396 P89 top-up: absorb upstream `44f67c2a` into candidate `7b3815d7`

**Verdict: READY_FOR_SCRIBE_REVIEW.** Mode-B not dispatched (orchestrator-owned). No PR opened. Presentation, composite, docs and seats untouched.

Bound issue: karmaterminal/openclaw#1396.

## Why this floor

The first top-up lane (`codeagent/1396-p89-topup-4d8c9bdd`) found that floor `4d8c9bdd` includes upstream `6652f7eac8` (#159179). That commit removes the whole Tasks/TaskFlow runtime (`src/tasks` 263 → 0), which the continuation's durable custody imports: 115 conflicts, 25 modify/delete, 48 dangling importers. 🌿 re-floored at `6652f7eac8^` = `44f67c2a7d`. The custody re-home is karmaterminal/openclaw#1408. It was not started here, and nothing past `44f67c2a7d` was absorbed.

## Exact result

| | full SHA |
| --- | --- |
| **candidate (lane tip)** `codeagent/1396-p89-topup-44f67c2a` | `871c03c018f78a6c834d9a043737e997bac7f831` |
| candidate tree | `2d435963f3ac79620cb29438c58e331fde5733ba` |
| merge commit | `b38ee0b52538e7cc7ed02817cf508237972857c3` (tree `d87f00bfba1df1077bc9f74ebf19e8ae0ee6438d`) |
| merge parent 1 (accepted candidate) | `7b3815d7f55ee68dd1322c6aec47efa3eabcda11` |
| merge parent 2 (pinned upstream floor) | `44f67c2a7d3b1752de4d8998fcc85cab1afbc756` |
| merge base (previous absorb) | `e834097fb7e6baab4a397385dfb79d443b93996c` |
| pre-merge savegame | `savegame/p89-topup-pre-44f67c2a-20260929T060900Z` → `7b3815d7…` |
| post-merge savegame | ``savegame/p89-topup-post-44f67c2a-20260929T092929Z` → `871c03c018…` (ls-remote verified)` |

History since `7b3815d7`, merge commits only (no rebase, squash, amend or force):

- `b38ee0b525` — the merge
- `871c03c018` — post-merge fixups

## Named-ref contract

| category | ref | full SHA | local / tracking / server |
| --- | --- | --- | --- |
| product/base | `7b3815d7` (= `scribe/20260926/p89-absorb-b1c68b93`) | `7b3815d7f55ee68dd1322c6aec47efa3eabcda11` | lane branch published unchanged first: all three equal |
| lane branch | `codeagent/1396-p89-topup-44f67c2a` | `871c03c018f78a6c834d9a043737e997bac7f831` | `local = tracking = server = `871c03c018…` (verified)` |
| upstream floor | `openclaw/openclaw` | `44f67c2a7d3b1752de4d8998fcc85cab1afbc756` | fetched object |
| CI / workflow | Mode-B `openclaw-local-ci.yml`, not dispatched by this lane | N/A | N/A |
| presentation (read-only) | `codeagent/85651-upstream-1ba243c8-gates` | `9eb655afa7f70886e8dcd034e56df659eabf33df` | server, unchanged |
| deploy composite (read-only) | `codeagent/1396-deploy-composite-7b3815d7` | `11442f8596a5f4a298768bea2f8879253ed5ccc3` | server, unchanged, not merged |
| bootstrap tools | `karmaterminal/openclaw-bootstrap` `main` | `ed62d6719888e97feb41904561fa195ea147e2b0` | fetched |
| docs / proof | N/A this lane | N/A | N/A |

## Conflict envelope and decisions

`git merge-tree --write-tree --name-only 44f67c2a7d 7b3815d7` gives **4 conflicted files**, matching the dispatch count of 4 at 06:12Z. The window has 90 upstream commits: upstream changed 2050 files, our side 884, 45 overlap.

| file | hunk | kind | decision |
| --- | --- | --- | --- |
| `src/agents/subagents/announce/subagent-announce-descendant-wake.ts` | 1 | behaviour | **ours**. Upstream deslopped `isWakeContinuation` (regex), which our side replaced with the exported `isWakeContinuationRun`/`stripWakeRunSuffixes` (consumed at `subagent-announce.ts:50-51,287,297`). The two forms are equivalent, including the `":wake"` edge. |
| same | 2 | behaviour | **ours**. Upstream edited `runDescendantWake`'s termination. Our durable reservation (`wakeSubagentRunAfterDescendants`) already uses `normalizeOptionalString`. File is byte-identical to `7b3815d7`. |
| `src/agents/subagents/registry/subagent-registry-sweeper.ts` | 1–5 | behaviour | **upstream** labeled `continue collectorGroups` flow. This **restores the pre-delete `runs.get(id) !== candidate` group guard** that exists at both `e834097fb7` and `44f67c2a7d` but was dropped by our `5a6971fc3a` (frozen older-upstream body). Our 4-arg ownership-predicate `deleteSession` is kept. |
| `src/agents/subagents/spawn/subagent-attachments.ts` | 1 | imports | union of used names (`resolveIntegerOption`, `asOptionalRecord`); unused `resolveNonNegativeIntegerOption` and the docblock dropped |
| same | 2 | declarations | **ours**: `SubagentInlineAttachment = InlineAttachment`. Decoding lives in the shared owner `src/shared/inline-attachments.ts`. The auto-merged import is trimmed to `SpawnSubagentResult`. |
| same | 3 | declarations | union: upstream's `SubagentAttachmentReceipt["files"]` (same shape as `subagent-spawn-contract.ts:122-127`) plus our `materializationStage = "attachment_write"` |
| `src/agents/subagents/spawn/subagent-spawn.ts` | 1 | imports | neither side's text. The docblock is dropped (upstream), and the ACP/audit imports live in our split modules. Upstream `3d62d4e2a5`'s `completionRequesterLifecycleRevision` auto-merged. |

The full journal, with evidence per hunk, is in `resolution-journal.md` next to this file.

## Post-merge fixups (`871c03c018`)

| file | cause | fix |
| --- | --- | --- |
| `subagent-announce.format.e2e.test.ts` | TS2783 ×3: upstream `296228fbdf` moved keys into `defaultOutcomeAnnounce` and spreads it first | our continuation case follows upstream's fixture pattern (values unchanged) |
| `subagent-registry-sweeper-recovery.test.ts` | the restored guard had no pinning test | regression test (below) |
| `src/gateway/agent-turn/agent-turn-service.ts` | type-aware lint `max-lines` 701 > 700: each side added one line | join two initializer-free declarations |

### Regression record (restored sweeper guard)

- **Invariant:** a collector-group member replaced while a groupmate's session delete is awaited stops group cleanup before the attachment and context-engine phases. Owning boundary: `createSubagentRegistrySweeper().sweepOnce()` with real session cleanup.
- **Negative control at `7b3815d7`:** 1 failed / 36 passed, `expected 1790663276263 to be undefined`. The groupmate's context-engine cleanup ran for a group the pass then deferred.
- **Post-fix at `871c03c018`:** 37/37.
- **Sibling:** the existing "defers a collector group … after an earlier cleanup await" cases, still green.
- **Persistence/restart:** the guard writes nothing, and the next pass re-reads `runs`.

## Install

The lockfile and every `package.json` are identical on `7b3815d7`, `44f67c2a7d` and the candidate; the lockfile does not move in this window. The dispatched `node_modules` symlink pointed at `source/openclaw`, which has a **different** lockfile blob (`09f3aa93…` vs `559e13f7…`). It was replaced by a lane-local real `pnpm install --frozen-lockfile`: **pnpm 12.5.0**, node v26.9.0, 9.2 s.

## Gate 2 — feature bytes

`feature-cores-byte-check.sh 7b3815d7 871c03c018 primitive-cores --upstream 44f67c2a7d` → **PASS**. 40 invariants: 35 PASS, 1 PASS-UPSTREAM (`src/agents/embedded-agent-runner/system-prompt.ts`, exact projected blob `ee567998a4…`), 4 PASS-TOMBSTONE, 0 FAIL.

**Anchor deviation.** The workorder's `PR_HEAD=9eb655afa7` exits 2 with `PR_HEAD is not on CANDIDATE's first-parent lineage`. The presentation head is reachable from `7b3815d7` only through a second parent. The prior round anchored at a first-parent ancestor (`55accd753e`). This lane anchors at `7b3815d7`, the accepted and cosigned candidate and this merge's first parent. That measures exactly what the top-up changed in the feature cores.

## Gate 2.5 — upstream-touched tests

- 876 test/support files touched in `e834097fb7..44f67c2a7d`: 849 identical to the candidate, 17 deleted on both sides, **10 differ**.
- **10 differing files, walked:**
  - zero window-new upstream lines are missing from any of them (bag-of-lines);
  - every upstream `it`/`describe` name is retained, except `wakes settled descendant runs under restrictive gateway roles`. That one was already absent at `7b3815d7` (removed by our `2c75d4fc73` because `runDescendantWake` no longer exists) and is re-homed with a written rationale at `src/agents/subagent-announce-descendant-wake.test.ts:208`.
- **Feature intersection:** 661 of the 859 present files reach a non-test feature-delta file within ≤3 import hops. All were run at the candidate (below).

## Gate 2.7 — upstream content

`drift-cure-gate.sh 44f67c2a7d 871c03c018 1823d46c57` → **FROZEN-STALE 0**, MIXED-CLOBBER 244, GENUINE 231, SAFE-NEW 409 (884 files).

- The MIXED row set is **identical** to the `7b3815d7` receipt (same 244 files), so every row carries its prior disposition (`gate27-74939e5b37-dispositions.md` and `gate27-7b3815d7f5-dispositions.md`).
- Only the three conflict files changed counts, each explained above:
  - descendant-wake 41 → 44: upstream refactor lines deliberately not taken;
  - sweeper 107 → 102: upstream flow restored;
  - attachments 83 → 82.

## Gate 2.8 — feature-surface impact

- **Which side moved (45 shared files):** only the two conflict files with recorded decisions lack window-new upstream lines.
- **Consumers at both refs:**
  - all 261 symbols upstream newly exported in the window have at least as many non-test uses in the candidate as at `44f67c2a7d` (0 rows lower);
  - upstream `3d62d4e2a5` "capture the requester lifecycle revision in every spawn path" is carried by all three spawn paths (`subagent-spawn-request.ts:125-137`, `acp-spawn.ts:298`, `sessions-spawn-visible.ts:276`). Continuation dispatch routes through `spawnSubagentDirect`, so it inherits the capture.
- **Covering tests:** the new sweeper test drives the real sweeper.
- **Filed-defect scan (#1363, #1373, #1383, #1384, #1386, #1387, #1392, #1393, #1407):** no upstream fix in the window.
  - `subagent-registry-requester-wake-commit.ts` changed comments only; `failures` still has no ceiling (#1363).
  - `3d62d4e2a5` fences restart recovery to the parent incarnation. That's adjacent to #1386/#1393 but not their fix.
  - Nothing touched `gateway-work-admission.ts`, `command-queue.ts` or `session-lifecycle-admission.ts` (#1392), the block chunker or stream rendering (#1373), the test planner (#1383), or cron authority (#1387).
  - The Discord `90900df004` change (preflight/REST fetch) is not the ingress backlog (#1407).

## Worker bundles (fresh caches at each exact SHA; bytes)

All 53 standalone entrypoints in `src/infra/runtime-process-entrypoints.ts`. The largest candidate delta against upstream is +1,551 B (`state-read`). No inlining regression. `src/infra/runtime-process-standalone-imports.test.ts`: 6/6.

| entrypoint | upstream `44f67c2a7d` | ours `7b3815d7` | candidate | candidate − upstream |
| --- | ---: | ---: | ---: | ---: |
| `secrets/egress-proxy/proxy.worker` | 40554 | 40554 | 40554 | 0 |
| `agents/code-mode-node.worker` | 14260 | 14260 | 14260 | 0 |
| `cron/store/read-only.worker` | 2980 | 3435 | 2980 | 0 |
| `state/openclaw-state-read.worker` | 3250379 | 3302745 | 3251930 | 1551 |
| `process/spawn-broker/worker` | 44073 | 44073 | 44073 | 0 |
| `gateway/cron-stream-matcher.worker` | 550 | 550 | 550 | 0 |
| `gateway/control-ui-file.worker` | 2228 | 2228 | 2228 | 0 |
| `agents/harness/native-hook-relay-client.worker` | 649163 | 701360 | 642419 | -6744 |
| `gateway/desktop/computer.worker` | 5865 | 5865 | 5865 | 0 |
| `media/image-processor.worker` | 1613 | 1613 | 1613 | 0 |
| `agents/sessions/tools/file-tool-planning.worker` | 22775 | 22775 | 22775 | 0 |
| `media/attachment-processor.worker` | 363 | 363 | 363 | 0 |
| `infra/git-operation.worker` | 3057 | 3057 | 3057 | 0 |
| `infra/fs-safe-copy.worker` | 1975 | 1975 | 1975 | 0 |
| `state/openclaw-state.worker` | 196 | 196 | 196 | 0 |
| `agents/auth-profiles/inline-usage.worker` | 4807 | 4807 | 4807 | 0 |
| `state/openclaw-agent-execution.worker` | 24582 | 24262 | 24582 | 0 |
| `worker/memory-worker-entry` | 865 | 865 | 865 | 0 |
| `agents/identity-avatar-file.worker` | 888 | 888 | 888 | 0 |
| `agents/identity-file.worker` | 628 | 628 | 628 | 0 |
| `worker/skills-worker-entry` | 745 | 745 | 745 | 0 |
| `boards/sqlite-board-store.worker` | 2128 | 2128 | 2128 | 0 |
| `config/sessions/session-sharing-store.worker` | 5092 | 5092 | 5092 | 0 |
| `infra/heartbeat-outcome-store.worker` | 1315 | 1315 | 1315 | 0 |
| `infra/sqlite-store.worker` | 14750 | 20926 | 14750 | 0 |
| `state/openclaw-agent-schema-inspection.worker` | 4158 | 5060 | 4158 | 0 |
| `infra/state-migrations.snapshot.worker` | 12076 | 12076 | 12076 | 0 |
| `agents/github-exec-launcher` | 3330 | 3330 | 3330 | 0 |
| `infra/sqlite-readonly-location.worker` | 942153 | 961387 | 934318 | -7835 |
| `infra/sqlite-source-revision.worker` | 6863 | 6863 | 6863 | 0 |
| `infra/sqlite-integrity.worker` | 2883 | 2883 | 2883 | 0 |
| `agents/prepared-model-catalog.worker` | 19982 | 19982 | 19982 | 0 |
| `infra/update-repair.worker` | 3326 | 3326 | 3326 | 0 |
| `infra/update-migrated-finalize.worker` | 21011 | 21006 | 21011 | 0 |
| `infra/update-candidate-state.worker` | 2742 | 2742 | 2742 | 0 |
| `commands/doctor-lint.worker` | 2721 | 2721 | 2721 | 0 |
| `commands/doctor.worker` | 1322 | 1322 | 1322 | 0 |
| `state/openclaw-database-verify.worker` | 3260 | 3260 | 3260 | 0 |
| `state/openclaw-state-lease-heartbeat.worker` | 801697 | 896593 | 794916 | -6781 |
| `config/sessions/session-transcript.worker` | 22206 | 22206 | 22206 | 0 |
| `infra/tailscale-route-owner.worker` | 3713 | 3686 | 3713 | 0 |
| `process/supervisor/service-child-relay` | 5698 | 5698 | 5698 | 0 |
| `process/terminal-pty-worker` | 2021 | 2021 | 2021 | 0 |
| `infra/bun-sqlite-library` | 126 | 126 | 126 | 0 |
| `agents/embedded-agent-runner/provider-prompt-state.worker` | 412 | 308 | 412 | 0 |
| `agents/harness/context-engine-turn-outbox.worker` | 1394 | 1394 | 1394 | 0 |
| `agents/sessions/session-manager-metadata.worker` | 9172 | 9172 | 9172 | 0 |
| `config/sessions/session-accessor.sqlite-archive.worker` | 17470 | 17470 | 17470 | 0 |
| `config/sessions/session-accessor.sqlite-transcript-reports.worker` | 6379 | 6379 | 6379 | 0 |
| `config/sessions/session-transcript-projection-publication.worker` | 2789 | 2789 | 2789 | 0 |
| `config/sessions/session-transcript-reconcile.worker` | 11721 | 12443 | 11721 | 0 |
| `process/supervisor/service-child-group-anchor` | 13912 | 13912 | 13912 | 0 |
| `process/supervisor/service-child-windows-job-anchor` | 16581 | 16581 | 16581 | 0 |

## Focused, static and lint receipts at `871c03c018`

All tests used `node scripts/run-vitest.mjs run --config <owner> --maxWorkers=1`. Configs were resolved by the repo's own `buildVitestRunPlans`.

- **Focused set:** 1,057 files (Gate 2.5 intersection ∪ conflict owners ∪ `src/channels/message/*` ∪ `extensions/discord/src/monitor/*` ∪ continuation/subagent/registry suites) in 58 serial chunks. Result: 1,058 file passes, 5 files red (35 cases), 16,947 tests passed. All reds classified:

| file | candidate | `7b3815d7` | `44f67c2a7d` | class |
| --- | --- | --- | --- | --- |
| `src/flows/doctor-health.test.ts` (8 Windows cases) | red | red (same names) | red (same names) | upstream baseline |
| `src/infra/state-migrations.caller-mode.plugin-execution.test.ts` (2) | red | green | red (same names) | upstream baseline, absorbed with the floor |
| `src/state/openclaw-state-lease-async.{maintenance,timer}.test.ts` (12) | red in chunk, green isolated | chunk green (file set lacks one upstream file) | **same chunk red, identical 12** | upstream-baseline order contamination (`sqlite-lifecycle-errors` mock) |
| `src/agents/embedded-agent-runner/run.continuation-integration.test.ts` (13) | red | red (identical 13 names) | absent (ours) | **carried fork debt**, not introduced by this absorb |

- **Not collected:** 7 `*.live.test.ts` files (need live providers; Crabbox/live tier).
- **Typecheck, all green at `871c03c018`:** `tsgo` lanes core, ui, core-test shards, extensions (all projects), extensions-test, scripts, test-root. The TS2783 found at the merge head was fixed in `871c03c018`.
- **Type-aware lint:** `node --import ./scripts/tsx.mjs scripts/run-lint.mts` (whole repo): **green**. At the merge head it had 1 `max-lines` error, fixed. `oxfmt --check` on touched files: green.
- **Static guards:**
  - Green: `check:assertion-safety`, `check:max-lines-ratchet`, `check:no-conflict-markers`, `check:wrapper-shadowing`, `check:import-cycles`, `lint:continuation:guard-callsites`, `check:coercion-helpers`, `check:runtime-sidecar-loaders`, `check:temp-path-guardrails`.
  - Red, **carried fork debt** (identical file set red at `7b3815d7`, clean at `44f67c2a7d`): `check:line-cap-ratchet` (51 rows) and `lint:kysely` (8 rows, `return-covenant-fixture/database.ts`).
- **Generated artifacts:**
  - Green: `config:docs`, `config:schema`, `prompt:snapshots`, `runtime-sidecars`, `sqlite:sessions-schema`, `plugins:inventory`, `plugin-sdk:surface`, `deps:ownership-surface`.
  - `db:worker-inventory:check`: red at the candidate and **both parents**, so upstream baseline; not regenerated.
  - `plugins:assets:check` (workboard `controlUi` hash): red at the candidate and at `44f67c2a7d`, which generate the **identical** hash `f9c7694c…` on this aarch64 host; green at `7b3815d7`. Upstream baseline/host, and our feature doesn't change the bundle. Not regenerated.
- **Invariants:**
  - `src/skills/**` bit-identical to upstream (0 files differ);
  - merge commits only;
  - no `gh auth switch`;
  - presentation, composite, docs and seats untouched.

## Changed-file envelope vs `44f67c2a7d`

`git diff --name-only 44f67c2a7d 871c03c018` gives 884 files, the same set as `7b3815d7`'s feature delta plus 0 new paths. Root-level paths are only `package.json` and `tsdown.config.ts`, both carried feature changes. **Zero detritus:** nothing new at the root, and the working tree is clean against HEAD.

The top-up's own delta over `7b3815d7` is the upstream intake plus the 3 fixup files.

## Tooling

- **GitNexus:** fork `karmaterminal/GitNexus` @ `3c1e686edfc1acaac882927cada121ddd7c47bcc`, `gnx` 1.6.5.
  - No index was EXACT or FRESH for `7b3815d7`; the nearest was `7700d7aabc`, STALE (463 commits, 87 scoped files).
  - An incremental refresh to `7b3815d7` failed with a **JS heap OOM after 2h50m** (peak RSS 35.7 GB).
  - The workorder's byte-read fallback was used instead: conflict clusters read at all three refs, the repo import graph for Gate 2.5 reach, and git consumer counts for Gate 2.8.
  - No graph-derived claim is made.
- **Bootstrap tools** at `ed62d67198`.
- **Parent control worktrees** (`7b3815d7`, `44f67c2a7d`) shared the lane's install through per-package `node_modules` symlinks (same lockfile). No `pnpm install` was run in them.

## Residual risks

1. `run.continuation-integration.test.ts` is 13 red at both `7b3815d7` and the candidate: carried continuation test debt. Its CI-shard status needs owning (compare the #1396 prior "stale tests in no lane" note).
2. `check:line-cap-ratchet` and `lint:kysely` are red as carried fork debt; Mode-B static will report them.
3. Upstream-baseline reds will show in Mode-B and need the same-runner oracle: doctor-health Windows cases, state-migrations plugin-execution, the lease-async order contamination, worker inventory, and the workboard asset hash.
4. Gate 2 is anchored at `7b3815d7`, not the presentation head (the tool refuses the latter). The dual-seat cosign and the broader byte-walk remain scribe/cohort gates.
5. No exact-ref GitNexus graph; the impact walk is byte/import-graph based.
6. Live tests are not run locally.
7. Mode-B at `871c03c018` is still owed (orchestrator).

## Independent review

A read-only reviewer agent checked the four resolutions, the sweeper composition, the new regression test's failure path and the `completionRequesterLifecycleRevision` coverage. It found **no defects**. Its two open questions were checked against upstream:

- `agent-task-tracking.ts` and the announce/settle-wake payloads carry no revision field at `44f67c2a7d` either (0 = 0 references in each of the 6 files).
- The regression test's failure path was confirmed by the negative control above.

The scribe-review gate remains.
