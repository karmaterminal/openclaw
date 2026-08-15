# GATES drift reconnaissance — continuation PR openclaw/openclaw#85651

Bound issue: <https://github.com/openclaw/openclaw/issues/85651>
Lane: **read-only reconnaissance.** No product conflict was resolved, no candidate merge was
committed, no ref was moved, no deploy or live proof was run, no GitHub state was mutated, and no
new upstream freeze was declared. The only authored artifact is this file.

Governing reading completed before any motion: `RUNBOOKS/ENTRYPOINT.md`,
`RUNBOOKS/PR-DRIFT-CURE-GATES-RUNBOOK.md` (all 716 lines, including Gate 2.5, Gate 2.7 and the
N+8 healing playbook), `RUNBOOKS/PROOF-CORPUS-METHOD.md`, root `AGENTS.md`, and the scoped
`docs/AGENTS.md`, `extensions/AGENTS.md`, `scripts/AGENTS.md`, `test/AGENTS.md`,
`src/agents/AGENTS.md`, `src/gateway/AGENTS.md`, `src/plugin-sdk/AGENTS.md` guides for the
touched subtrees. Continuation RFC read at exact 99ce: `docs/design/continue-work-signal-v2.md`
(2193 lines, status Implemented) plus `docs/design/continuation-tools-infographics.md`.

---

## 0. Identity bindings (all byte-verified this lane)

| Item | Value | Verified how |
|---|---|---|
| Assembly + PR-presentation identity | `99ce36658eef9d4a9ad9eca6782ffa0ee7891fd6` | worktree `HEAD` |
| Assembly ref | `scribe/20260709/1172-status-row-assembly` → `99ce366` | `git ls-remote origin` |
| PR-presentation ref | `frond-scribe-claude/20260509/narrow-surgery-tight` → `99ce366` | `git ls-remote origin` |
| Live upstream PR head | `99ce366`, `state=OPEN`, `mergeable=CONFLICTING`, `mergeStateStatus=DIRTY` | `gh pr view 85651` |
| Live PR size | 896 files, +121965 / −7465 | `gh pr view 85651` |
| PR-creation commit | `cad0b99de23822698d477ac7b1618a3e8ce22ae8` | `gh pr view 85651 --json commits` |
| **Upstream `main` (RECONNAISSANCE-ONLY)** | `6b9a6ece48149bcadc92479e5320a6db53b9931b` | `git fetch upstream main` |
| Upstream commit time | 2026-08-15T10:28:05−07:00 (`test(amazon-bedrock-mantle): remove cache resets (#124216)`) | `git log -1` |
| Fetch time | 2026-08-15T17:36:48Z | `date -u` at fetch |
| Merge base (last absorbed upstream tip) | `530b33e4e37264c89ecd5abdd06279dd23d5c867`, 2026-08-14T07:16:58−07:00 | `git merge-base HEAD upstream/main` |
| Deployed runtime composite (OUT OF SCOPE) | `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955` | fleet triage report |

`6b9a6ec` is recorded as reconnaissance state only. **It is not a freeze, not an absorb target,
and not a cohort-agreed baseline.** Any authorized cycle must re-fetch and re-baseline at
dispatch per the runbook's "re-baseline gate inputs at dispatch" discipline; upstream moved
333 commits in the 27 hours preceding this fetch, so a snapshot older than a few hours is stale
by construction.

---

## 1. Executive recommendation

**Do not begin a full GATES cycle now. Absorb only after a specified upstream fix boundary, and
only after two named receipts land. But do begin the two cheap severable repair lanes below
immediately, because they are not drift work and they shrink every future absorb.**

Three findings drive that verdict, in order of weight.

**(a) The drift itself is unusually cheap and is not the blocker.** The merge base is
`530b33e`, only ~27 hours old. Non-mutating `git merge-tree` produces **17 conflicted files**
out of 105 both-sides-touched, with 193 upstream-new files adding cleanly and **zero
modify/delete conflicts**. Critically, **Gate 2.7 exits 0 at exact 99ce against `6b9a6ec`:
FROZEN-STALE = 0.** The frozen-tree reverse-clobber that motivated the whole N+7/N+8
proceeding is *absent* from this head. This is the healthiest drift posture the PR has had.
On drift grounds alone the absorb would be a one-lane, single-session job.

**(b) The blocker is proof state and product state, not merge state.** `PROOFS/INDEX.json`
still names `a7ef03177e0f42831a087521e6eb7720102d6be1` as the current corpus — not 99ce — with
26 PASS / 7 PARTIAL / 0 FAIL, 33 of 38 rows run, 14 pending receipts, and all rows executed on a
single seat (`cael-dgx`) because the workflow ships one shared gateway token. The four boundaries
ClawSweeper actually asked for (child-cap, restart recovery, default-deny targeting,
post-compaction) are **GAP or PARTIAL, not PASS**, per the completed evidence-alignment audit and
re-confirmed here. Absorbing 333 commits invalidates the runtime substrate of every live row and
forces a re-fire of a corpus that does not currently answer the reviewer's question. **Spending
the absorb before the proof gap is closed buys a fresher SHA and a still-unanswered review.**

**(c) Fleet health is an unresolved confound that would contaminate any new live proof.** The
palliative triage found no seat earning a strict speech-health PASS on composite `6b09`: SQLite
`quick_check`/`integrity_check` failures on Cael (overflow-list / page-never-used) and Ronan
(freelist mismatch), 13.3 GiB RSS / 23.5 GiB HWM on Cael, a session-lifecycle admission wedge on
Silas, thousands of provider-401 matches fleet-wide, and no nonce-correlated visible-send receipt
anywhere. Live proof rows fired onto that substrate cannot distinguish a continuation defect from
a seat defect. That is exactly the condition under which the runbook's HONEST-LIMIT taxonomy says
the substrate finding is the proof — but it is not a condition in which to spend a GATES cycle.

### The named boundary

Begin the full absorb when **all three** hold:

1. **Upstream fix boundary.** `ed447135bd4` (Prevent auxiliary owners from resetting shared WAL,
   #123777) and `987c73e7930` (fix(auto-reply): surface empty message-tool-only completions,
   #105765) are both in the absorbed range. Both are already ancestors of `6b9a6ec`, so this
   condition is satisfied by any absorb of current upstream — it is stated so the absorb is not
   cut *below* them. See §5 for why these two specifically.
2. **Receipt 1 — nonce lineage.** At least one seat produces the full
   `inbound nonce → ingress event/run → admitted turn → finalized result → queued payload →
   Discord submission → visible snowflake` chain, per lane 1 of the fleet triage plan. Without
   it, "the fleet is healthy enough to prove continuation on" is an assumption, not a fact.
3. **Receipt 2 — SQLite integrity.** Cael and Ronan report clean `quick_check` +
   `integrity_check` after main-owned repair. Continuation persistence is TaskFlow SQLite
   (`src/tasks/task-flow-registry.store.sqlite.ts`); a corrupt state DB makes every restart and
   post-compaction row unfalsifiable.

If figs wants forward motion before those receipts, the correct spend is **§7 Lane R1 and Lane R2
only** — both are pre-existing-defect repair on 99ce, are independent of upstream drift, and
reduce the diff the maintainer is refusing to review.

---

## 2. Exact current drift metrics

All computed non-mutatingly. Conflict detection used `git merge-tree --write-tree
--name-only --merge-base=<mb> HEAD <upstream>`, which writes objects but touches no ref, no index
and no working tree. No temporary merge was created; none needed aborting.

| Metric | Value |
|---|---|
| Merge base | `530b33e4e37264c89ecd5abdd06279dd23d5c867` (2026-08-14T07:16:58−07:00) |
| Upstream tip (recon) | `6b9a6ece48149bcadc92479e5320a6db53b9931b` (2026-08-15T10:28:05−07:00) |
| Drift window | ~27 hours |
| Upstream commits in `mb..up` | **333** (0 merge commits) |
| Upstream changed files | **2095** (+89574 / −21953) |
| Our commits since merge base | **1105** |
| Our changed files vs merge base | **896** (+121965 / −7465) — matches live PR JSON exactly |
| Merge-tree result tree | `313f889d437bd26a674e7ace3daef1edf576e246` (exit 1 = conflicts) |
| **Conflicted files** | **17** |
| Total conflict hunks | 32 |
| Total conflicted lines (incl. markers, all three sides) | 1456 |
| Both-sides-touched files | **105** |
| Of those, silently auto-merged | **88** ← the Gate 2.5 / Gate 2.7 surface |
| Upstream-new files (clean add) | **193** |
| Files deleted by us that upstream edited | **0** (no modify/delete conflicts) |

### Gate 2.7 at exact 99ce vs `6b9a6ec` (read-only, `HIST_CAP=200`, PRCREATE `cad0b99de23`)

```
tools/drift-cure-gate.sh upstream/main HEAD cad0b99de23822698d477ac7b1618a3e8ce22ae8 <outdir>
→ exit 0
```

| Class | Count |
|---|---|
| **FROZEN-STALE** | **0** ← gate PASSES; no frozen-tree reverse-clobber |
| MIXED-CLOBBER | 338 (ranked triage queue, not a verdict) |
| SAFE-NEW | 282 |
| GENUINE | 276 |
| SAFE-CURRENT | 0 |
| Total classified | 896 |

Interpretation, stated carefully. FROZEN-STALE = 0 is the load-bearing number: per the gate's
Layer-B property, no shipped file is byte-identical to a *historical* upstream blob, so the pure
reverse-clobber class that cost the cohort the N+7 cycle is not present at 99ce. SAFE-CURRENT = 0
is expected, not alarming: the classifier only walks files our branch changed, and the branch is
1105 commits of feature work on a base that upstream has since advanced 333 commits, so almost
nothing can be byte-equal to current upstream.

MIXED-CLOBBER = 338 is high but is **not** 338 defects. Layer C anchors on post-PR-creation
upstream lines absent from HEAD, and PR-creation (`cad0b99de23`) is very old, so a large fraction
is ordinary "upstream evolved a shared file after we forked it" drift that the back-merge itself
absorbs. The actionable subset is the top of the ranked queue, listed in §3.4.

**All 17 conflicted files are also MIXED-CLOBBER rows.** The conflict surface and the
content-drop surface coincide, which is the good case: the drops are where git will already
stop and demand an operator.

---

## 3. Conflict and semantic-overlap matrix

### 3.1 Conflicts grouped by semantic owner

The workorder's eight buckets. Assignment was produced mechanically then **hand-corrected by
inspection** — the mechanical pass mis-filed `openclaw-tools.ts`, `session-updates.ts`,
`server-restart-sentinel.ts`, `server-maintenance.ts` and the heartbeat runners into
"unrelated churn" purely on path shape, when each is in fact a continuation or delivery owner.
The corrected assignment is below.

| # | Semantic owner | Conflicted | Silent auto-merge | Notes |
|---|---|---|---|---|
| 1 | Continuation work / delegate | **4** | 4 | `openclaw-tools.ts` (Gate-2 core), `server-maintenance.ts` (delegate-artifact GC), `heartbeat-runner-execution.ts`, `heartbeat-runner-run.ts`; plus the TaskFlow trio + `heartbeat-runner-config.ts` |
| 2 | Subagents / spawn / yield / admission | **1** | 7 | `subagent-attachments.ts`; `sessions-spawn-tool.{ts,test.ts}`, announce delivery/output, registry run-wait + lifecycle-completion, `docs/tools/subagents.md` |
| 3 | Compaction / transcript / finalization | **4** | 7 | `commands-compact.ts`, `commands-compact.runtime.ts`, `server.sessions.compaction.test.ts`, `user-turn-transcript.ts`; **`compaction-safeguard.ts` auto-merges with upstream +314/−78** |
| 4 | Discord ingress / egress / reply dispatch | **1** | 3 | `server-restart-sentinel.ts`; `agent-runner-result-payloads.ts`, `get-reply.ts`, `server-restart-sentinel-agent-delivery.ts` |
| 5 | SQLite / session / task persistence | **1** | 11 | `session-updates.ts`; **`openclaw-state-schema.sql` (ours +125, upstream +26/−2)**, `-schema-additive.ts`, `.generated.d.ts`, `-contract.ts`, `session-accessor.*` |
| 6 | Provider / auth routing | **1** | 6 | `extensions/codex/.../approval-requester.real-binary.live.test.ts`; `side-question.{ts,test.ts}`, `auth-bridge.test.ts`, `config.test.ts`, `dynamic-tool-build.ts`, `run-attempt-tool-setup.ts` |
| 7 | Tests / harness / config / docs | **5** | 28 | 3 codex prompt snapshots + `plugin-sdk-surface-report.mts` + `plugin-sdk/test-env.ts`; broad test churn |
| 8 | Unrelated upstream churn | **0** | 22 | `google-meet/cli.ts`, `signal/event-handler.ts`, `agent-loop.ts`, cron, plugins, TUI, status |
| | **Total** | **17** | **88** | |

### 3.2 Mechanical vs genuine contract conflicts

**Mechanical — 9 files, 214 conflict lines.** Import/export-block union, cast removal, or two
independent additive blocks landing in the same region. Resolvable by a competent operator with
a typecheck; no product decision.

| File | Lines | Shape |
|---|---|---|
| `src/plugin-sdk/test-env.ts` | 8 | export union; entangled with the §3.5 rename defect |
| `src/infra/heartbeat-runner-run.ts` | 7 | import union (ours +2, upstream +1) |
| `src/auto-reply/reply/commands-compact.runtime.ts` | 16 | upstream drops `resolveSessionFilePathOptions` (#123810 leftover trim); ours aliases `enqueueSystemEventRaw as enqueueSystemEvent` |
| `src/agents/subagents/spawn/subagent-attachments.ts` | 19 | upstream removes chained cast (#124060); ours adds `boundedLimit` helper. Take upstream's typed access, keep our helper, then typecheck against our config surface |
| `src/infra/heartbeat-runner-execution.ts` | 35 | import block; upstream adds `DEFAULT_HEARTBEAT_ACK_MAX_CHARS` |
| `src/gateway/server-maintenance.ts` | 69 | two independent GC blocks (ours: delegate-artifact GC; upstream: device-pair-setup GC) plus our `skillCuratorCleanup`→`curatorCleanup` rename. Additive union |
| 3 × codex prompt snapshots | 60 | `318d82e91a7` working-directory-denial prompt text. **Regenerate, do not hand-merge** |

**Derived-baseline — 1 file, 32 lines.** `scripts/plugin-sdk-surface-report.mts` carries three
numeric surface-count baselines (4341/4324/4329, 2579/2574/2576, 1150/1146/1151). These must be
**regenerated** via `pnpm plugin-sdk:surface:check`, never hand-arithmetic'd. Root `AGENTS.md`
forbids editing baseline files to silence checks; regeneration after a real surface change is the
sanctioned path, and the resolution is meaningless without it.

**Genuine contract — 7 files, 1210 conflict lines (83% of the conflict mass).** Each needs a
three-way semantic union and at least one product judgment.

| File | Lines | Contract at stake |
|---|---|---|
| `src/gateway/server-restart-sentinel.ts` | 403 | **File-split shadow.** We moved `deliverQueuedSessionDelivery`, `isRestartContinuationBusyPayload`, `resolveQueuedRestartContinuationMessageId`, `resolveQueuedSessionDeliveryContext` into `server-restart-sentinel-delivery.ts`. Upstream then edited them in place (`de4104c84d7` preserve targetless media session ownership, #124111). Our conflict side is *empty*; taking "ours" silently drops upstream's fix. The fix must be **hand-ported into our split file**, which no merge tool will do and which Gate 2.7 cannot see (our split file is SAFE-NEW to the classifier) |
| `src/gateway/server.sessions.compaction.test.ts` | 293 | Compaction-without-API-keys test semantics (`f5c46de8ac5`, #120496). Gate 2.5 class |
| `src/agents/openclaw-tools.ts` | 268 | We extracted the inline options literal into `CreateOpenClawToolsOptions` (`openclaw-tools.options.ts`) and wrapped it as `CreateOpenClawToolsRuntimeOptions`; upstream added `registerRunCleanup?` **into the literal we removed** (`079bb341961` cua recording family, #124035). See §6.1 — this one can hard-fail Gate 2 |
| `src/sessions/user-turn-transcript.ts` | 133 | Second file-split shadow: we moved `buildLateResolvedMediaMessage` / `readOpenClawMessageMeta` into `user-turn-transcript-late-media.ts`; upstream rewrote them to `Reflect.get` (`17df3f61025`, #124060). Same hand-port requirement |
| `src/auto-reply/reply/session-updates.ts` | 59 | **Highest-value contract collision.** Upstream added a commit-authority mechanism to session patching — `canApply(current)`, `assertCommitAllowed`, an `authorityRevoked` sentinel, and `expectedSession`-conditional `fallbackEntry` (`8885be47563` refresh session meters after /codex compact, #123640). Our side replaced `projectCanonicalSessionEntryShape` with `mergeSessionEntry(entry, updates, { now })` and set `fallbackEntry: entry` specifically to let a first-write merge detect sessionId rollover. Both are real invariants; neither side subsumes the other |
| `src/auto-reply/reply/commands-compact.ts` | 31 | Upstream **collapsed** the classifier `switch` into a single `if`, dropping `below_threshold` / `already_compacted` messaging; we had *added* a `no_real_conversation_messages` case. Neither "ours" nor "theirs" is correct |
| `extensions/codex/.../approval-requester.real-binary.live.test.ts` | 23 | Upstream changed yolo approval policy and renamed the case (`28f10c00b4e` keep yolo approvals disabled, #124069) + added `createAgentHarnessHostCapabilitiesForTest`. **Codex hard gate applies** — see §8 |

### 3.3 Upstream rewrites requiring a three-way semantic union

Rewrites where taking either side whole is wrong. The first four are *conflicts* (git stops).
The rest **auto-merge silently** and are therefore the more dangerous set.

| Surface | Upstream delta | Merge behaviour | Why a union is required |
|---|---|---|---|
| `commands-compact.ts` classifier | switch → if | CONFLICT | upstream removed branches we extended |
| `session-updates.ts` patch authority | +commit-authority | CONFLICT | orthogonal invariants (authority vs rollover detection) |
| `user-turn-transcript.ts` meta access | cast → `Reflect.get` | CONFLICT | our copy lives in a split file |
| `server-restart-sentinel.ts` delivery | targetless-media ownership | CONFLICT | our copy lives in a split file |
| **`src/agents/agent-hooks/compaction-safeguard.ts`** | **+314 / −78** | **AUTO-MERGE** | our +10/−2 sits inside an upstream rewrite (`2ce443d9a46` preserve generated…, 226 dropped lines — top of the MIXED queue). A clean auto-merge here is a *warning*, not a result |
| `src/config/sessions/session-accessor.conformance.test.ts` | +206 / −210 | AUTO-MERGE | conformance suite rewritten under our +5/−5 |
| `extensions/codex/.../side-question.ts` | +83 / −24 | AUTO-MERGE | Codex-side behaviour change under our +3 |
| `src/gateway/server-maintenance.test.ts` | +38 / −174 | AUTO-MERGE | upstream deleted 174 lines of test we did not touch |
| `src/gateway/server-methods/chat.directive-tags.test.ts` | +207 / −1 | AUTO-MERGE | new upstream assertions land beside our +15 |
| `src/agents/tools/sessions-spawn-tool.test.ts` | +118 / −0 | AUTO-MERGE | 118 new spawn assertions our impl must satisfy (Gate 2.5) |
| `src/state/openclaw-state-schema.sql` | +26 / −2 vs our +125 | AUTO-MERGE | **both sides add SQLite schema.** See §6.3 |

### 3.4 MIXED-CLOBBER triage queue (top 15 by dropped upstream lines)

Per the runbook, this is a ranked queue, not a verdict; each row names the introducing upstream
commit. The high end is where "restore upstream X while preserving feature Y" work lives.

| Dropped | File | Introducing commit |
|---|---|---|
| 226 | `src/agents/agent-hooks/compaction-safeguard.ts` | `2ce443d9a46` fix(compaction): preserve generated… |
| 176 | `src/agents/subagents/announce/subagent-announce.ts` | `1ced7441eb6` refactor(agents): move announce/completion/registry |
| 155 | `src/gateway/server-restart-sentinel.ts` | (unattributed) |
| 150 | `src/agents/embedded-agent-subscribe.handlers.messages.lifecycle.ts` | `87b3c0e5df7` split subscribe leaf ownership |
| 140 | `src/agents/openclaw-tools.ts` | (unattributed) |
| 133 | `src/agents/command/attempt-execution.ts` | (unattributed) |
| 125 | `src/agents/subagents/registry/subagent-registry-restart-recovery.ts` | `1ced7441eb6` |
| 123 | `src/auto-reply/reply/agent-runner-result-complete.ts` | `210aca6de38` prevent restart… |
| 112 | `src/config/sessions/session-accessor.conformance.test.ts` | (unattributed) |
| 110 | `src/agents/tools-effective-inventory.test.ts` | (unattributed) |
| 104 | `src/agents/subagents/registry/subagent-registry.persistence.test.ts` | `1ced7441eb6` |
| 89 | `src/agents/subagents/spawn/subagent-attachments.ts` | `1ced7441eb6` |
| 89 | `src/gateway/server-methods/chat.directive-tags.test.ts` | `79a4d512d41` send follow-ups after background transcript updates |
| 71 | `src/infra/session-delivery-queue-storage.ts` | (unattributed) |
| 70 | `src/infra/heartbeat-wake.ts` | `7dd75d0716f` fix(heartbeat): serialize wake |

The `1ced7441eb6` cluster (announce / completion / registry relocation) accounts for five of the
top twelve. That is a single upstream reorganization our branch has partially absorbed; it is one
coherent work item, not five.

### 3.5 Pre-existing 99ce defect discovered during recon (not drift)

`src/test-utils/temp-dir.ts` exports **`withTestDir`** at 99ce. Upstream exports **`withTempDir`**
there, and has done since `4f7032fbd9f` (2026-02-22) — well before this PR was created
(`cad0b99de23` already had `withTempDir`).

Upstream separately defines a **different** `withTestDir` at `src/test-helpers/temp-dir.ts:116`,
with a different signature:

- upstream `src/test-utils/temp-dir.ts` → `withTempDir(prefix: string, run)` — plain `mkdtemp`
- upstream `src/test-helpers/temp-dir.ts` → `withTestDir({prefix, parentDir?, subdir?}, run)` —
  pooled prefix root with retry-aware cleanup

Merge `a316a17ca0db351708978c0d30497dcd6db7e343` (2026-08-11, *"absorb upstream/main drift and
follow the session-path renames"*) blanket-renamed `withTempDir` → `withTestDir`. At 99ce:

- **67 files** now say `withTestDir` where upstream says `withTempDir` at the same path.
- Two distinct helpers with **different signatures** now share the name `withTestDir` in our tree
  (`src/test-utils/temp-dir.ts` and `src/test-helpers/temp-dir.ts`), plus a third at
  `src/agents/sandbox/fs-bridge.test-helpers.ts:169`.
- The rename leaks into plugin surface: `src/plugin-sdk/test-env.ts` re-exports it, and
  `extensions/codex/.../approval-requester.real-binary.live.test.ts` imports it — which is one of
  the 17 conflicts.

It compiles (definition and callers were renamed together), so this is a **scope and naming
defect, not a runtime defect**. But it violates root `AGENTS.md` ("one spelling per concept
repo-wide"; unique 2-3-word exported symbol names), it adds 67 files of pure rename noise to a
continuation-tools PR — directly feeding ClawSweeper's "not reviewable / mixed history"
objection — and it will re-conflict on every future absorb forever. `a316a17` is the exact SHA
ClawSweeper reviewed, so the reviewer saw this diff.

This lane did **not** repair it. It is Lane R1 in §7.

---

## 4. Upstream continuation / subagent alignment findings

### 4.1 Upstream did not expand the subagent or yield surface in this window

Scanning `530b33e..6b9a6ec` across `src/agents/subagents/**`, `sessions-spawn-tool.ts`,
`sessions-yield-tool.ts`, `child-admission.ts`, `subagent-announce.ts` and
`docs/tools/subagents.md` yields **four commits, all refactor or hygiene class**, totalling
+50 / −54 lines:

- `4f68eee80a0` refactor(test): remove unused testing bag members (#124175)
- `4a6f99c2fca` refactor(agents): route terminal-reason groups through the canonical classifier (#124122)
- `17df3f61025` refactor(types): remove chained type assertions in agents and sessions (#124060)
- `318d82e91a7` fix: visible sessions explain working-directory denials (#123829)

Byte-level checks:

- **`src/agents/tools/sessions-yield-tool.ts` — untouched by upstream in the drift range.**
- **`src/agents/child-admission.ts` — untouched by upstream, and byte-identical between 99ce and
  `6b9a6ec`** (`git diff HEAD 6b9a6ec -- src/agents/child-admission.ts` is empty).
- `sessions-spawn-tool.ts` upstream delta is a **single JSON-schema description string** on
  `cwd` (explaining that `visible=true` paths outside agent workspaces need `operator.admin`).

**Consequence for the RFC.** The completed ClawSweeper evidence-alignment audit concluded that
`sessions_spawn` + `sessions_yield` overlap only part of the RFC and do not implement
self-elected same-session continuation, delayed / post-compaction durable delegates, silent and
silent-wake return, or addressed multi-recipient return. **This drift window changes nothing
about that conclusion.** There is no new upstream convergence to re-argue, no newly reusable
owner, and no upstream primitive that has grown into a continuation contract.

### 4.2 Overlap / reuse / missing-contract / retirement disposition

| Dimension | Finding at `6b9a6ec` |
|---|---|
| **Overlap** | Unchanged from the audit. Child admission is genuinely shared: 99ce's `child-admission.ts` is byte-identical to current upstream, and `continue_delegate` reaches it through `spawnSubagentDirect` → `resolveSubagentSpawnRequest` → `reserveChildAdmissionSlot` → `resolveSpawnAdmission` → `resolveChildAdmission`. That is the strongest "we reuse, we do not fork" claim the PR has, and it is *stronger* now because upstream did not move the file |
| **Reusable owner** | Keep sharing spawn / admission / attachments. RFC §B.3 already documents `continue_delegate` as the delegate-side twin of `sessions_spawn(model)`, sharing the attachment materializer and `tools.sessions_spawn.attachments` policy. Nothing upstream did this window weakens that |
| **Missing continuation contract** | Still absent on upstream: durable same-session `continue_work` election (TaskFlow `continuation_work`), `continue_delegate` modes + return addressing, `request_compaction`, `agents.defaults.continuation.*` incl. default-deny `crossSessionTargeting`, post-compaction staged delegate release, and continuation chain/cost accounting + OTel `continuation.*` spans |
| **Retirement / refactor** | No candidate emerged. `sessions_yield` remains complementary (it parks a turn until an *external* next event); `continue_work` is a durable self-elected successor. Collapsing one into the other still loses delay, modes, targeting and chain accounting. No upstream commit this window makes any continuation surface redundant |

### 4.3 What upstream *did* move that touches continuation-adjacent owners

Not capability expansion, but real churn our absorb must survive:

- **`src/agents/agent-hooks/compaction-safeguard.ts` +314 / −78** — the single largest upstream
  rewrite in our both-touched set, and a former CONVERGE-3 "mechanical adopt" file. It now
  auto-merges. Treat that as a red flag, not a green light.
- **`src/tasks/task-registry.maintenance.ts` +34 / −22, `task-flow-registry.store.sqlite.ts`
  +13** — upstream is actively editing the TaskFlow substrate the RFC persists continuation work
  in (§3.6, §5.4).
- **`src/config/sessions/session-accessor.sqlite-parent-session.ts` +32,
  `-parent-fork.ts` +29 / −6** — parent-session SQLite accessors, adjacent to delegate lineage.
- **`src/agents/tools/sessions-spawn-tool.test.ts` +118** — new spawn assertions our shared-spawn
  claim must satisfy. This is the highest-value Gate 2.5 item in the subagent bucket.

---

## 5. Fleet-health-relevant upstream commits discovered

**Explicit caveat, stated first.** These are *plausibly relevant by owner and description*. This
lane ran no live proof, deployed nothing, and fired no nonce. **None of these is evidence that
`6b09`'s fleet defects are fixed.** The composite `6b09` and its defects are out of scope per the
workorder, and correlating a symptom family to a commit is a hypothesis, not a receipt.

| Upstream commit | Subject | Fleet symptom family it plausibly touches |
|---|---|---|
| `ed447135bd4` | Prevent auxiliary owners from resetting shared WAL (#123777) | **Cael / Ronan SQLite corruption.** Touches `src/state/openclaw-state-db.ts`, `openclaw-state-db-cache.ts`, `src/audit/audit-event-writer.worker.ts`, and **adds `src/state/openclaw-state-db.corruption-recovery.test.ts`**. Directly names shared-WAL reset by a non-owner — a mechanism consistent with overflow-list / freelist-mismatch corruption. Merges cleanly (our branch does not touch those two files) |
| `987c73e7930` | fix(auto-reply): surface empty message-tool-only completions (#105765) | **Zero-payload visible dispatch.** Touches `agent-runner-result-payloads.ts`, `followup-delivery.ts`, `agent-runner-failure-reply.ts`. Ensures an empty message-tool-only completion gets *one marked fallback* while preserving explicit silence. This is the exact doctrine class ("an action that ends with no visible outcome and no recorded reason"). **Our branch also edits `agent-runner-result-payloads.ts` (+143 / −22) and it auto-merges** — so this fix lands into a file we heavily changed, silently |
| `d343ea07ab4` | fix(state): preserve orphaned SQLite sidecars (#123680) | SQLite state-file lifecycle |
| `f7b809933d6` | fix(auto-reply): reject undelivered ask_user prompts (#124148) | Silent-loss / undelivered prompt family |
| `d30c036b68c` | fix(channels): bound errored ingress settlements (#120104) | Silas ingress/admission wedge; large retained `failed` populations |
| `af76425d873` | fix(channels): preserve legacy ingress failure settlement (#124016) | Same family |
| `250b1e68be0` | refactor(channels): centralize ingress lifecycle fan-out (#124096) | Ingress owner consolidation |
| `3ec40893502` | fix(gateway): give prepared chat.send media one abandonment-discard owner (#124100) | Orphaned/abandoned turn family (#1227 class) |
| `79a4d512d41` | fix: send follow-ups after background transcript updates (#121332) | Follow-up delivery — and it is the named introducer for the 89-line MIXED row on `chat.directive-tags.test.ts` |
| `52cf4db8261` | fix(synology-chat): prevent duplicate sends after custody loss (#123953) | Duplicate-delivery family (different channel, same shape) |
| `103e1a4cc9d` | fix(claws): recover lifecycle state safely (#123254) | Lifecycle recovery |
| `fc4d5d744fa` | fix(sessions): prevent cleanup from deleting readable transcripts (#123495) | Transcript loss; RFC §3.6 requires child sessions with live continuation work survive cleanup |
| `30216f52fab` | fix(sessions): scope transcript fuse to reset window (#124126) | Transcript/finalization pressure |
| `26ff3c96071` | fix: report the real session store path in health (#124102) | Diagnosis quality for all of the above |

`ed447135bd4` and `987c73e7930` are the two named in the §1 fix boundary: one is the only commit
in the window that touches an authored SQLite-corruption-recovery path, and the other is the only
one that touches the exact zero-payload owner the fleet triage named
(`hasVisibleChannelTurnDispatch` / `sendFollowupPayloads` neighbourhood).

---

## 6. Required proof and GATES consequences

### 6.1 Gate 2 (cure-bytes) — one hard-fail risk, one benign case

`tools/drift-cure-gate.primitive-cores.txt` names 33 live paths plus 2 tombstones. Upstream
touched **7** of them in the drift range:

| Core file | Upstream delta | Our state | Gate 2 projection |
|---|---|---|---|
| `src/agents/openclaw-tools.ts` | +3 / −0 | **conflicts** | **FAIL risk — see below** |
| `src/agents/embedded-agent-runner/compact.ts` | +141 / −9 | unchanged vs merge base | `PASS-UPSTREAM` (clean projection) |
| `compact.hooks.test.ts` | +187 / −31 | +114 / −17 | needs `--upstream` projection; both sides heavy |
| `compact.hooks.harness.ts` | +15 | +16 | needs projection |
| `compact.types.ts` | +7 | +2 / −1 | needs projection |
| `run/attempt.ts` | +16 | unchanged | `PASS-UPSTREAM` |
| `apps/macos/.../MacNodeRuntime.swift` | +40 / −4 | unchanged | `PASS-UPSTREAM` |

**The `openclaw-tools.ts` hard-fail risk, precisely.** The Gate 2 walker, on a blob mismatch,
computes `merge-base(PR_HEAD, UPSTREAM)` → generates the upstream patch → applies it with
`git apply --cached --3way` onto an index seeded at PR-head → requires a byte-exact projection.
Upstream's patch has two hunks:

- hunk 2 adds `registerRunCleanup: options?.registerRunCleanup,` after
  `contextEpoch: options?.computerContextEpoch,`. That context **exists** at 99ce (line 349), so
  this hunk projects.
- hunk 1 adds `registerRunCleanup?: (cleanup: (reason: string) => Promise<void>) => void;` into
  the **inline options object literal**, which 99ce no longer has — we extracted it to
  `CreateOpenClawToolsOptions` in `src/agents/openclaw-tools.options.ts` and wrapped it as
  `CreateOpenClawToolsRuntimeOptions`. The 3-way apply for that hunk is the same 3-way merge
  `merge-tree` already ran, and it **conflicted**.

So a naive candidate will report `FAIL` on a primitive core and **HALT at Gate 2**. Per the
runbook that is LGTM-substrate-broken and requires cohort decision, not an operator override.
The correct resolution is a cohort-cosigned decision recorded before the cycle starts, not
discovered mid-gate. Two viable shapes:

1. Land the field on `CreateOpenClawToolsOptions` in `openclaw-tools.options.ts` and update the
   cores list (via PR with cohort cosign, as the list header requires) so the invariant tracks
   the file that now owns the type. Cleanest and matches the "list changes in the SAME PR as the
   surface change" rule.
2. Or reconsider the type extraction itself, which is 99ce-local churn on a Gate-2 core.

Blast radius is small and was cross-checked: GitNexus reports `createOpenClawTools` at LOW risk
(3 direct, 6 total, 0 affected processes), and current-source verification finds exactly four
production call sites — `src/skills/runtime/tool-dispatch.ts`, `src/agents/agent-tools.ts`,
`src/gateway/tool-resolution.ts`, and the `openclaw-tools.runtime.ts` re-export.

### 6.2 Gate 2.5 (semantic conflicts) — 88 silent auto-merges, ~29 real candidates

The runbook's mechanic enumerates upstream-changed test files in the delta. Here:

- Upstream changed **2095** files; **105** intersect our branch; **88** auto-merge silently.
- The auto-merged set includes **33 test files**, several with large upstream additions that our
  implementation must now satisfy: `sessions-spawn-tool.test.ts` (+118),
  `chat.directive-tags.test.ts` (+207 / −1), `session-accessor.conformance.test.ts`
  (+206 / −210), `package-mac-app.test.ts` (+136), `compact.hooks.test.ts` (+187 / −31),
  `install.test.ts` (+91), `nodes-camera.test.ts` (+89), `server-maintenance.test.ts` (+38 / −174).

Gate 2.5 must be run as written — enumerate, diff each against our candidate, and **run each
intersecting test file at the candidate**. It cannot be satisfied by reading the merge output.

### 6.3 SQLite — approval-gated, and both sides are adding schema

`src/state/openclaw-state-schema.sql` takes **ours +125 / −0 and upstream +26 / −2**, and
auto-merges. `openclaw-state-db-schema-additive.ts` (+30 / −2 upstream),
`openclaw-state-db-contract.ts`, and the **generated** `openclaw-state-db.generated.d.ts`
(ours +97, upstream +15) move with it.

Root `AGENTS.md`: *"Any SQLite change requiring a schema-version bump needs explicit user
discussion and acceptance before implementation. Agents must not advance SQLite schema versions
autonomously."* Same-version additive surface is permitted only under the narrow bare-nullable-
STRICT-datatype rule.

**Consequence:** before any authorized absorb, someone must determine whether the merged schema
stays same-version-additive or requires a bump, and `openclaw-state-db.generated.d.ts` must be
**regenerated**, never hand-merged. This lane did not evaluate the schema text; it is named as a
gate input, and it is a figs-approval item, not an agent decision.

### 6.4 Proof rows invalidated or newly required

Invalidated by any absorb (runtime substrate changes → every live row must re-fire at the new
CANDIDATE_SHA): all 33 executed rows in `PROOFS/a7ef0317…`. That corpus already carries 7 PARTIAL
and 14 pending receipts, and was executed entirely on `cael-dgx` because the workflow passes one
shared `OPENCLAW_GATEWAY_TOKEN` while each prince's gateway holds its own — so per-owner execution
is blocked by a token-plumbing defect, not by prince availability.

Newly required, driven by this drift specifically:

| New/changed row | Driver |
|---|---|
| Restart-recovery row with queued work + delegate + return, killed and recovered once | `server-restart-sentinel.ts` conflict + the split-file hand-port. Already a live GAP in the audit; the absorb makes it mandatory |
| Compaction row asserting `post_compaction_path_observed=true` | `compaction-safeguard.ts` +314/−78 auto-merge; current `R-RC-2` is PARTIAL with `post_compaction_path_observed=false` |
| Session-entry patch-authority row | upstream's new `canApply` / `assertCommitAllowed` in `session-updates.ts` interacting with our sessionId-rollover `fallbackEntry` |
| Zero-payload / visible-dispatch row | `987c73e7930` lands in `agent-runner-result-payloads.ts`, a file we changed +143/−22, via silent auto-merge |
| Child-cap row (5 active children, 6th `continue_delegate` rejected by `subagents.maxChildrenPerAgent`) | still the audit's live GAP; **cheaper now** because `child-admission.ts` is byte-identical to current upstream |
| Default-deny row (`crossSessionTargeting=disabled` → reject + zero enqueue + zero delivery) | still GAP; the corpus's PASS row observed the seat with targeting **enabled** |
| Prompt-snapshot regeneration receipt | 3 codex snapshots conflict. Per root `AGENTS.md`, **CI truth is Linux Node 24** — regenerate there, not on macOS |
| Plugin-SDK surface baseline regeneration receipt | `plugin-sdk-surface-report.mts`; run `pnpm plugin-sdk:surface:check` |

### 6.5 Gate 3 shape

Full local gates 3a–3g unchanged, via `openclaw-local-ci.yml` with a **full 40-char SHA**.
Note the completion signal on current heads is `node --import tsx scripts/test-projects.mts`
(the historical `.mjs` path no longer exists). Because upstream moved 333 commits, the
3-baseline matrix (current upstream / PR head / merge base) should be assumed necessary for any
red, not optional — merge-base staleness is now a live explanation.

### 6.6 Do the current PARTIALs and fleet uncertainty block starting the absorb?

**Yes — but they block it for a reason that is not about drift.**

- The unresolved PARTIALs (`R-CD-2` silent-wake, `R-CD-4` cross-session return receipts,
  `R-RC-2` post-compaction) and the four live GAPs are the *substance* of the reviewer's ask.
  Absorbing invalidates them, so absorbing first means re-firing an incomplete corpus twice.
- Fleet-health uncertainty is worse: with no seat at strict speech-health PASS, no nonce-
  correlated visible-send receipt anywhere, and SQLite integrity failing on two seats, a fresh
  live row cannot distinguish a continuation defect from a seat defect. Every new PARTIAL would
  be uninterpretable.

The drift itself does **not** block. If figs's goal is purely "keep the branch mergeable," the
absorb is cheap and could be done in one lane. If the goal is "answer the review," proof and
fleet come first.

---

## 7. Severable lane plan for a future authorized absorb

Ordered. Lanes R1 and R2 are **independent of the absorb** and can start now. Lanes A1–A6 are the
absorb proper and should not start before the §1 boundary. Each lane names its own exit.

### Pre-absorb repair (authorizable today; not drift work)

**Lane R1 — `withTempDir` / `withTestDir` un-rename.** Restore `withTempDir` at
`src/test-utils/temp-dir.ts` and `src/agents/sandbox/fs-bridge.test-helpers.ts` and their 67
dependent files; leave `src/test-helpers/temp-dir.ts:withTestDir` alone. Removes 67 files of pure
rename noise from the PR diff, removes a permanent conflict generator, restores upstream naming,
and eliminates the two-different-signatures-one-name collision. Test-only blast radius.
**Exit:** `pnpm tsgo` + `pnpm check:test-types` green; 0 files differ from upstream on this
symbol; PR file count drops.

**Lane R2 — split-file shadow-port audit.** We split `server-restart-sentinel.ts` and
`user-turn-transcript.ts`; upstream is still editing the originals. Enumerate every file our
branch split or heavily relocated where upstream retains the original, and record the mapping.
This is a **new loss class Gate 2.7 structurally cannot see** (our split files classify SAFE-NEW).
**Exit:** a committed mapping table of `upstream-original → our-split-owner` for the whole branch,
usable as a checklist during every future absorb.

### Absorb proper (after the §1 boundary)

**Lane A0 — re-baseline.** Re-fetch upstream, re-run merge-tree and Gate 2.7, and publish the
at-dispatch numbers plus the delta versus this report. Per the runbook, only at-dispatch numbers
are authoritative. If FROZEN-STALE has become non-zero, **stop and re-plan** — the posture in
this report no longer holds.
**Exit:** §0 receipt posted with at-dispatch counts.

**Lane A1 — Gate 1 savegame + mechanical conflicts.** Savegame `99ce366`, then resolve the 9
mechanical files (§3.2) plus the 3 prompt snapshots (regenerate on Linux Node 24) and the
`plugin-sdk-surface-report.mts` baselines (regenerate via `pnpm plugin-sdk:surface:check`).
**Exit:** `git ls-remote` echoes the savegame; those 13 files conflict-free; typecheck green.

**Lane A2 — Gate 2 cure-bytes decision on `openclaw-tools.ts`.** Take the §6.1 decision to cohort
cosign **before** touching the file, apply, then run `feature-cores-byte-check.sh` with
`--upstream`. Land any primitive-cores-list edit in the same change.
**Exit:** every core reports `PASS`, `PASS-UPSTREAM`, or `PASS-TOMBSTONE`.

**Lane A3 — contract unions, one file per sub-lane.** The 6 remaining genuine-contract conflicts
(§3.2), each independently reviewable. `session-updates.ts` and `server-restart-sentinel.ts` are
the two that need a second seat. Uses Lane R2's mapping for the split-file hand-ports.
**Exit:** each file has a `cure-decisions.tsv` row naming class and reasoning; within-hunk
interleaves flagged `MIXED-CLOBBER:interleave` and reviewed by a non-driver seat.

**Lane A4 — silent auto-merge audit (Gate 2.5 + 2.7 heal).** Walk the 88 auto-merged both-touched
files, prioritising `compaction-safeguard.ts` (+314/−78), `session-accessor.conformance.test.ts`
(+206/−210), `side-question.ts` (+83/−24), `server-maintenance.test.ts` (+38/−174),
`chat.directive-tags.test.ts` (+207), `sessions-spawn-tool.test.ts` (+118). Then walk the §3.4
MIXED queue top-down; the `1ced7441eb6` announce/completion/registry cluster is one work item, not
five. Run each intersecting test file at the candidate.
**Exit:** Gate 2.7 FROZEN-STALE = 0 at the candidate; each high-count MIXED row justified or
restored; the Gate 2.5 walk file committed.

**Lane A5 — SQLite schema adjudication (figs approval required).** Determine whether the merged
`openclaw-state-schema.sql` stays same-version-additive under the bare-nullable-STRICT rule or
needs a version bump. Regenerate `openclaw-state-db.generated.d.ts`. **Agents must not advance the
schema version autonomously.**
**Exit:** explicit figs acceptance recorded, or a proven same-version-additive determination with
an older-reader open/use check.

**Lane A6 — Codex gate.** Any verdict on `extensions/codex/**` requires personally inspecting
sibling `../codex` source for the exact protocol/runtime behaviour, cloning
`https://github.com/openai/codex.git` there if absent, and citing the files and lines read. Covers
the `approval-requester` conflict (`28f10c00b4e` yolo approvals) and the `side-question.ts`
+83/−24 auto-merge.
**Exit:** Codex file/line citations in the lane report; no Codex verdict without them.

**Lane A7 — Gate 3 / 4 / 4.5 / 5 / 6.** Unchanged ceremony. Gate 4 live rows should not fire until
the §1 receipts land; until then the honest posture is a HONEST-LIMIT substrate finding naming
the fleet condition, not a manufactured PASS.

Parallelisable: R1 ∥ R2; A1 ∥ A2 ∥ A6; A3 sub-lanes ∥ each other; A4 after A1–A3; A5 anytime after
A0 but gated on figs. A1–A4 together are a one-session job for a competent seat given the small
conflict count — the expense in this cycle is proof and fleet, not merging.

---

## 8. Explicit non-actions and uncertainties

### Non-actions (all deliberate)

- **No ref moved.** `scribe/20260709/1172-status-row-assembly` and
  `frond-scribe-claude/20260509/narrow-surgery-tight` both still resolve to `99ce366`
  (`git ls-remote`, verified at end of lane). No push, force-push, merge, rebase, or edit.
- **No candidate merge committed.** Conflict detection used `git merge-tree --write-tree`, which
  writes objects only — no ref, index, or working-tree mutation. No temporary merge was created,
  so none needed aborting. Working tree is clean apart from this file.
- **No product conflict resolved.** Conflict regions were read and classified, never edited.
- **No deploy, no live proof, no prince-seat contact, no gateway touched.**
- **No GitHub mutation.** Read-only `gh pr view` only. No comment, label, close, or dispatch.
- **No new upstream freeze declared.** `6b9a6ec` is reconnaissance state.
- **No composite `6b09` merge into continuation**, and no claim that any upstream commit fixes
  `6b09`. §5 is a hypothesis list.
- **No Codex verdict.** Sibling `../codex` was not inspected, so per root `AGENTS.md` this lane
  issues no Codex protocol, compatibility, or approval-semantics judgment.
- **No `withTestDir` repair.** Found, measured, documented, deliberately left for Lane R1.
- **Full test suite not run.** Read-only recon; no product change to validate. The sanctioned
  completion signal for a future lane is `node --import tsx scripts/test-projects.mts`.

### Uncertainties

1. **The drift number decays fast.** 333 upstream commits in 27 hours. Every count here is
   as-of `6b9a6ec` / 2026-08-15T17:36Z. Lane A0 must re-derive; do not plan against these
   numbers if more than a few hours have passed.
2. **Conflict counts are `merge-tree`'s, not a real merge's.** They should match a real
   back-merge at the same three SHAs, but `rerere` state, `merge.conflictstyle`, and any
   configured merge drivers on the executing seat can change what an operator sees.
3. **MIXED-CLOBBER = 338 is a queue, not a defect count.** No row was individually adjudicated
   this lane. The proportion that is genuine loss versus ordinary post-fork evolution is unknown
   and requires the Lane A4 walk.
4. **Gate 2.7 ran with `HIST_CAP=200`.** A blob frozen further back than 200 upstream commits on
   its own path would not match. FROZEN-STALE = 0 is therefore "zero within a 200-commit
   history window," which is the runbook's default but is not unbounded.
5. **The `openclaw-tools.ts` Gate 2 failure is a reasoned projection, not an executed gate run.**
   `feature-cores-byte-check.sh` needs a CANDIDATE_SHA, and producing one is out of scope. The
   reasoning is that the walker's `--3way` apply is the same 3-way merge `merge-tree` ran, which
   conflicted. Confirm by running the walker against a real candidate.
6. **SQLite schema text was not evaluated.** Whether the merged schema needs a version bump is
   named as a gate input and a figs-approval item; this lane did not analyse the DDL.
7. **GitNexus index staleness — stated plainly.** The best available index is `openclaw` @
   **`530b33e4e372`** (2026-08-14, 31100 files, 721304 nodes, 1441786 edges, **0 embeddings**),
   which is exactly our merge base. It is therefore **333 commits behind current upstream and
   1105 commits behind 99ce**, and it carries the *upstream* side of the tree, not our
   continuation wiring. Other indexes (`fabc84d31ff6` 2026-06-16; `openclaw-1144` 2026-07-02;
   `openclaw-wo1217-drift-c37ba84`, 133 behind) are staler. **No index exists at 99ce or at
   `6b9a6ec`.** GitNexus was used only for symbol/owner/impact discovery, and every finding was
   re-verified against current source: the `createOpenClawTools` LOW-risk / 3-direct-caller
   result was confirmed by direct grep at 99ce (4 production call sites). No graph result is
   treated as current-behaviour proof.
8. **The `withTestDir` collision is a scope and naming defect, not a proven runtime defect.** It
   compiles because definition and callers were renamed together. Runtime impact was not tested.
9. **Fleet-health correlation is unproven by construction.** §5 rests on commit subjects and
   touched-owner paths. No nonce, no deploy, no seat.
10. **The upstream-health supplement**, if one was still running when this lane started, was not
    waited on or polled. Nothing here depends on it.

---

## 9. Reproduction commands

```bash
# identity
git rev-parse HEAD                                   # 99ce36658eef9d4a9ad9eca6782ffa0ee7891fd6
git ls-remote origin refs/heads/scribe/20260709/1172-status-row-assembly \
                     refs/heads/frond-scribe-claude/20260509/narrow-surgery-tight

# upstream recon state
git fetch upstream main --no-tags && git rev-parse upstream/main
git merge-base HEAD upstream/main                    # 530b33e4e37264c89ecd5abdd06279dd23d5c867

# drift metrics
MB=530b33e4e37264c89ecd5abdd06279dd23d5c867; UP=6b9a6ece48149bcadc92479e5320a6db53b9931b
git rev-list --count $MB..$UP                        # 333
git diff --shortstat $MB $UP                         # 2095 files, +89574 -21953
git rev-list --count $MB..HEAD                       # 1105
git diff --shortstat $MB HEAD                        # 896 files, +121965 -7465

# conflicts (NON-MUTATING: writes objects only; no ref/index/worktree change)
git merge-tree --write-tree --name-only --merge-base=$MB HEAD $UP   # exit 1, 17 files
git show 313f889d437bd26a674e7ace3daef1edf576e246:<path>            # conflict-marked blob

# both-sides-touched intersection
git diff --name-only $MB HEAD | sort > /tmp/ours.txt
git diff --name-only $MB $UP  | sort > /tmp/theirs.txt
comm -12 /tmp/ours.txt /tmp/theirs.txt | wc -l                      # 105

# Gate 2.7 (read-only)
HIST_CAP=200 bash ../openclaw-bootstrap/tools/drift-cure-gate.sh \
  upstream/main HEAD cad0b99de23822698d477ac7b1618a3e8ce22ae8 <outdir>   # exit 0, FROZEN-STALE=0

# Gate 2 core collision surface
git diff --numstat $MB $UP -- $(grep -vE '^\s*#|^\s*$|^!' \
  ../openclaw-bootstrap/tools/drift-cure-gate.primitive-cores.txt | tr '\n' ' ')

# the rename defect
git grep -n 'export async function withTempDir' upstream/main -- src/test-utils/temp-dir.ts
git grep -n 'export async function withTestDir'  upstream/main -- src/test-helpers/temp-dir.ts
git log -1 --format='%H %cI %s' a316a17ca0d
```

---

*Read-only reconnaissance lane, bound to openclaw/openclaw#85651. No PR opened. Gates 1–6 remain
the floor; nothing in this report is authorization to run them.*
