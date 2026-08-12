# WO-1217 — post-8318 drift phase against live upstream — lane journal

Lane: `wo1217-post8318-drift-37b4-gates`
Candidate branch: `codeagent/wo1217-post8318-drift-37b4-gates`
Base (canonical assembly): `8318e58bd22186ffd4bd317ccb05b8592570ad57`
Worktree: `source/WORKTREES/openclaw-wo1217-post8318-drift-37b4-gates`

Governing runbooks read in full before any mutation:
`RUNBOOKS/ENTRYPOINT.md`, `RUNBOOKS/PR-DRIFT-CURE-GATES-RUNBOOK.md`,
`RUNBOOKS/PROOF-CORPUS-METHOD.md`, `RUNBOOKS/PRINCE-CODE-AGENT-RUNBOOK.md`,
plus `RUNBOOKS/GITNEXUS-RUNBOOK.md` Gate 0 (seat-class precondition).

Methodology in force (GATES runbook §METHODOLOGY CORRECTION 2026-06-06 + 2026-06-20 addendum):
back-merge never rebase; never squash; never force-push; keep verbose history;
future movement fast-forward only; Gate 2.7 after resolution; local CI on the
candidate before presentation sees anything.

---

## §0 — Rebaseline before any merge — 2026-08-12T15:3xZ

### §0.1 Worktree / identity verification

| Item                     | Value                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| branch                   | `codeagent/wo1217-post8318-drift-37b4-gates`                                                                                   |
| HEAD at entry            | `8318e58bd22186ffd4bd317ccb05b8592570ad57` (== canonical assembly)                                                             |
| `git status --porcelain` | 0 lines (clean)                                                                                                                |
| origin                   | `https://github.com/karmaterminal/openclaw.git`                                                                                |
| upstream                 | `https://github.com/openclaw/openclaw.git`                                                                                     |
| seat RAM                 | 121 GB total / 88 GB available → prince-class, GitNexus Gate 0 **recommended-class** for openclaw-source (large, 10–20k files) |
| node_modules             | symlink → `source/openclaw/node_modules` (shared clone install)                                                                |

No existing assembly worktree was reused. The three known-dirty copies
(`oc-backmerge-20260809`, `oc-ci-shards`, nested `openclaw-1172-status-row-assembly`)
were not touched, cleaned, reset, or stashed.

### §0.2 Refs re-resolved at dispatch (NOT the workorder snapshot)

Per the GATES runbook "Workorder dispatch discipline — re-baseline gate inputs at
dispatch" canon, only the at-dispatch numbers are authoritative.

| Ref                              | Workorder snapshot (2026-08-12 15:15Z)     | At-dispatch (live)                                               | Delta          |
| -------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- | -------------- |
| upstream/main                    | `37b4fc8621d98a3debbd2202d27f40aa039f386f` | `282e6a47ae6f9fa45251960d52382ba1cd65dbcd`                       | **+6 commits** |
| presentation / PR #85651 head    | `2b07ba509564bd8a8f1031bf58dd107c1a24c78f` | unchanged                                                        | 0              |
| canonical assembly               | `8318e58bd22186ffd4bd317ccb05b8592570ad57` | unchanged (== `origin/scribe/20260709/1172-status-row-assembly`) | 0              |
| PR-creation SHA (Gate 2.7 input) | `79d68e2c115e11683e1d08039e6b48a3143d2abe` | unchanged                                                        | 0              |

`git merge-base --is-ancestor 37b4fc8621d 282e6a47ae6` → exit 0, so the live tip is a
clean descendant of the workorder snapshot; no divergence, purely 6 commits of forward drift.

**Merge target decision:** the workorder body says "Merge exact freshly fetched
`upstream/main`", and the runbook re-baseline canon makes the at-dispatch ref
authoritative. Therefore the back-merge takes `282e6a47ae6`, not the `37b4fc86`
snapshot in the lane name. Recorded as an intentional, runbook-sanctioned
deviation from the lane's literal slug.

### §0.3 Behind / ahead counts (live upstream)

| Axis                    | Behind live upstream | Behind 37b4 snapshot |
| ----------------------- | -------------------: | -------------------: |
| presentation ↔ upstream |                  258 |                  252 |
| assembly ↔ upstream     |                  192 |                  186 |

Assembly is ahead of live upstream by 1285 commits; presentation by 1280.

### §0.4 Reviewer-visible file counts (three-dot, `git diff --name-only A...B`)

| Axis                    | Live upstream | 37b4 snapshot | Workorder snapshot |
| ----------------------- | ------------: | ------------: | -----------------: |
| presentation ↔ upstream |           946 |           946 |                946 |
| assembly ↔ upstream     |       **899** |           899 |                899 |

Both unchanged by the 6-commit upstream advance. **899 is the assembly shape
baseline** the fluff gate defends.

### §0.5 Conflict census, assembly ↔ live upstream

Probed non-destructively with `git merge-tree --write-tree --name-only HEAD upstream/main`
(exit 1 = conflicts present; no worktree or ref mutation).

| Class                                                      |  Count | Workorder snapshot | Delta |
| ---------------------------------------------------------- | -----: | -----------------: | ----: |
| total conflicted files                                     | **70** |                 70 | **0** |
| generated `docs/.generated/plugin-sdk-api-baseline/*.json` |     65 |                 65 |     0 |
| semantic / manual                                          |      5 |                  5 |     0 |

The five semantic conflict owners are exactly the predicted set:

1. `src/audit/audit-event-writer.test.ts`
2. `src/auto-reply/reply/get-reply.ts`
3. `src/config/sessions/types.ts`
4. `src/plugins/git-install.ts`
5. `src/state/openclaw-state-db-contract.ts`

Conflict count did **not** increase (delta 0, far under the +10 pause threshold).

### §0.6 Gate 2.7 preflight on the UNMODIFIED assembly (`.gate-before`)

```
tools/drift-cure-gate.sh upstream/main HEAD 79d68e2c115e11683e1d08039e6b48a3143d2abe .gate-before
```

run from the candidate worktree with the tool sourced read-only from
`source/openclaw-bootstrap` (`tools/drift-cure-gate.sh` blob verified identical to
`origin/main` before use; the bootstrap checkout itself was not modified, reset, or
branch-switched). Runtime 3m47s. **Exit 0.**

| Class            | At-dispatch (vs live upstream) | Dispatcher preflight (vs 37b4) |  Delta |
| ---------------- | -----------------------------: | -----------------------------: | -----: |
| files examined   |                            899 |                            899 |      0 |
| GENUINE          |                            257 |                            259 |     −2 |
| MIXED-CLOBBER    |                            366 |                            364 | **+2** |
| SAFE-NEW         |                            276 |                            276 |      0 |
| **FROZEN-STALE** |                          **0** |                          **0** |  **0** |

FROZEN-STALE is 0 and total conflicts did not rise, so the §0.5 pause condition
(FROZEN-STALE present, or conflicts +10) is **not** met. Proceeding without pause.
The +2 MIXED drift is exactly the 6 new upstream commits touching two files that
had previously classified GENUINE — routine forward drift, not a clobber.

MIXED-CLOBBER is a ranked review queue, not a waiver. Top of queue at dispatch:

| dropped lines | file                                                                  |
| ------------: | --------------------------------------------------------------------- |
|           198 | `src/audit/audit-event-writer.test.ts`                                |
|           159 | `src/gateway/server-restart-sentinel.ts`                              |
|           137 | `src/agents/openclaw-tools.ts`                                        |
|           133 | `src/agents/command/attempt-execution.ts`                             |
|           131 | `src/agents/subagents/announce/subagent-announce.ts`                  |
|           125 | `src/auto-reply/reply/agent-runner-result-complete.ts`                |
|           125 | `src/agents/subagents/registry/subagent-registry-restart-recovery.ts` |
|           110 | `src/agents/tools-effective-inventory.test.ts`                        |
|           104 | `src/agents/subagents/registry/subagent-registry.persistence.test.ts` |
|           104 | `scripts/lib/ci-node-test-plan.mts`                                   |

Note that #1 in that queue (`audit-event-writer.test.ts`) is simultaneously one of
the five textual conflict owners, so the merge will force a hand-resolution there
anyway — the MIXED signal and the conflict signal agree.

### §0.7 Presentation → assembly provenance (why the 71 commits are not fluff)

`git rev-list 2b07ba50..8318e58b` = 71 commits. Classified each by
`git merge-base --is-ancestor <c> upstream/main`:

- **66 are ancestors of current upstream** — upstream content the assembly already absorbed.
- **5 are local-only**, all intentional and self-documenting:

| SHA           | Date       | Kind                   | Justification (from its own commit body)                                                                                                                                                                                                                                                                                             |
| ------------- | ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `09f47132f64` | 2026-08-11 | back-merge             | Absorbs upstream `67262b70dc7`. Upstream `87b3c0e5df7` split `embedded-agent-subscribe.handlers.messages.ts` into leaves; verified the split was a pure re-extraction of merge-base content, so the fork's 21-hunk delta was **transposed** onto the new structure rather than re-derived.                                           |
| `6f34847c57f` | 2026-08-11 | back-merge             | Second incremental absorb, 38 conflicts. 33 generated plugin-sdk baselines taken wholesale from upstream; 5 hand-resolved. Explicitly rejected `checkout --ours` on `config/sessions/types.ts` because it would have silently dropped upstream's new `projectId` field + preservation guard.                                         |
| `1552b01d046` | 2026-08-11 | back-merge             | Third absorb across upstream `22b3c2530f1` (agent/chat orchestration ownership split). Upstream's four extracted modules arrived as pure adds, so the fork's changes were **ported into** them.                                                                                                                                      |
| `b2cb4e7c9de` | 2026-08-11 | repair (test-only)     | Follows upstream's `readSessionEntry` → `readSubagentSessionEntry` rename in six announce `vi.mock` factories. Import-time throw was collecting zero tests and surfacing as six bare file-level shard failures. 6 files, +6/−6, no production code.                                                                                  |
| `8318e58bd22` | 2026-08-11 | repair (Gate 2.7 cure) | Restores upstream `a5420dfd91c` Windows npm-installed native-session-CLI fix that had been reverse-clobbered in `extensions/acpx/src/pi-session-catalog.test.ts` (32 dropped post-fork upstream lines). Restored upstream's file then re-applied the fork hunk with `git apply --3way`; disjoint regions, no within-hunk interleave. |

Three back-merges + two repairs. Both repairs are _upstream-preserving_, i.e. they
move the assembly toward upstream, which is why assembly (899 files) is closer to
upstream than presentation (946) despite being +71 commits ahead of it.

### §0 verdict

Rebaseline clean. FROZEN-STALE 0, conflicts flat at 70, shape baseline 899.
No pause condition triggered. Cleared to Gate 1 (savegames).

---

## §1 — Gate 1 savegames — 2026-08-12T15:30Z

Both current heads preserved on origin before any motion, pushed as `karmafeast`
and verified with `git ls-remote` (the runbook's mandatory verification step):

| Ref | Resolves to |
|---|---|
| `savegame/20260812-1530Z/wo1217-assembly-8318e58b-pre-drift` | `8318e58bd22186ffd4bd317ccb05b8592570ad57` |
| `savegame/20260812-1530Z/wo1217-presentation-2b07ba50-pre-drift` | `2b07ba509564bd8a8f1031bf58dd107c1a24c78f` |

Neither canonical branch was moved. Gate 1 GREEN.

---

## §2 — Back-merge and semantic resolution — 2026-08-12T15:5xZ

Merge commit `7076c7716ad06072fa236381d41f2ef2e08067e9`, two parents
(`5b43d94eeaf` journal-tip of assembly lineage, `282e6a47ae6` upstream).
`git merge --no-ff` under `-c merge.conflictstyle=zdiff3`. No rebase, no squash,
no force. 70 conflicts, exactly the predicted split.

**Deviation recorded:** `rerere` was already enabled in the shared user config and
recorded pre-images/resolutions during the merge. I did not enable or disable it
— mutating shared git config from a worktree that sibling agents share would be
unsafe. `zdiff3` was passed per-invocation with `-c` for the same reason rather
than written to the shared `.git/config`.

### The five semantic resolutions

Full byte-level rationale is in the merge commit body; the decision-critical
reasoning is preserved here.

**1. `src/state/openclaw-state-db-contract.ts` — union.**
Base had `FIRST_USE_STATE_INDEXES` as a single-line array; both sides expanded it
to multi-line, which is why it conflicted at all. Kept our five
`delegate_artifact_*` tables + five `idx_delegate_artifact_*` indexes and added
upstream's `execution_decision_facts` + its two indexes. Checked every consumer
before deciding order was safe to choose freely: `openclaw-state-db.test.ts`
(`for..of`), `openclaw-state-db-maintenance.ts` (spread), and
`openclaw-state-schema-compatibility.ts` (`allowedMissingTables`) all treat these
as membership sets. Schema version stays 6 / strict 3 — no autonomous bump, per
both the workorder and root AGENTS.md. Verified the canonical
`openclaw-state-schema.sql` auto-merged carrying both table families.

**2. `src/config/sessions/types.ts` — relocation-aware, and the one that could
have silently reverted upstream.**
Our local `4018b96af02` moved the merge-helper cluster into fork-owned
`session-entry-runtime.ts`. Upstream's conflicting block is therefore stale here,
and re-adding it would have produced duplicate helpers — the exact
"do not duplicate stale merge functions" trap. Took our side.

The subtle part: upstream's real delta in the window was two commits, and a plain
"take ours" would have kept one and destroyed the other.
- `77d89b2fa84` (#121278) `laneId` `@deprecated` doc — auto-merged, retained (verified present).
- `b080dd1e765` (#122458) "consolidate coercion contracts" rewrote
  `resolveSessionTotalTokens` to call `asNonNegativeFiniteNumber`. That function
  no longer lives in `types.ts`, so taking our side alone **would have silently
  reverted upstream's refactor**. Ported it into `session-entry-runtime.ts`
  instead, with the import.
  Semantics checked at the source, not assumed: `asNonNegativeFiniteNumber` is
  `asFiniteNumber(v)` then `number && number < 0 ? undefined : number`, so 0
  survives and negative/non-finite become undefined — identical to the
  hand-rolled guard it replaces.
Also verified the other five relocated bodies (`resolveMergedUpdatedAt`,
`normalizeMergedUpdatedAt`, `mergeSessionEntryWithPolicy`,
`stripRetiredSessionEntryLocators`, `resolveFreshSessionTotalTokens`) are still
byte-identical to upstream's copies, so the relocation carries no other drift.

**3. `src/plugins/git-install.ts` — highest semantic risk, both sides real.**
Upstream `5a643e35431` (#121174) added deferred package-install transaction
ownership. Our `b53f0db43c9` added `stagedRepoIsTargetLocal`: when the staging
dir falls back off the target filesystem, copy target-local first so
`replaceDirectoryAtomic`'s rename stays atomic.

Read `src/infra/install-package-dir.ts` directly rather than trusting the diff.
`installPackageDir` does
`stageDir = await fs.mkdtemp(path.join(installBaseRealPath, ".openclaw-install-stage-"))`
where `installBaseRealPath` is the realpath of the target's own parent — it
**already** re-stages target-local unconditionally. So the deferred branch needs
no second target-local copy; adding one would be the duplicated replacement path
the workorder forbids. Result: one replacement mechanism per branch — deferred
goes through `installPackageDir`, immediate keeps our guard. Two inline comments
record that cross-path invariant at the code site.
Caller wiring (`deferCommit`, `transaction`, `attachPluginInstallTransaction`)
auto-merged correctly and `emitPluginInstallSecurityEvent` is intact.

*Named follow-up (Pathfinder rule, deliberately NOT done here):* the immediate
branch could arguably be collapsed onto `installPackageDir` too, deleting our
`stagedRepoIsTargetLocal` threading entirely and yielding one canonical flow with
negative production LOC. Not done in the drift phase because upstream
deliberately keeps `replaceDirectoryAtomic` for the non-deferred case; unifying
would be a product change to a security-sensitive install path and would create
fresh fork divergence, which is the opposite of drift-phase intent. Recorded for
the trace-root/proof lane.

**4. `src/auto-reply/reply/get-reply.ts` — import adjacency only.**
Union of our `isContinuationHeartbeatEquivalent` and upstream's
`resolveRuntimePolicySessionKey`, alphabetical. Both verified used (lines 431 and
212). Upstream's 144-line media local-path self-serve composition auto-merged and
is retained.

**5. `src/audit/audit-event-writer.test.ts` — took upstream wholesale, on byte evidence.**
Our *entire* fork delta on this file since the merge base was a retry wrapper
around the standalone "returns immediately under SQLite contention" test.
Upstream `b5292178780` (#122369) deleted that test by consolidating four tests
into two. A retry guarding a deleted test is dead code, and repo canon is to
delete tests for removed paths rather than update them. The nonblocking-under-
held-lock property it protected still has coverage inside upstream's consolidated
test. The file is now **byte-identical to upstream** — the ideal SAFE-CURRENT
outcome for a shared test file, and it consequently leaves the reviewer-visible
diff set entirely.
Both ownership families remain covered elsewhere: 10 delegate-artifact test files
plus upstream's newly absorbed `src/audit/execution-decision-facts.test.ts`.
*Watch item:* our retry existed for a real transient flake. The consolidated
upstream test asserts the same property with different setup, so if it flakes it
is now upstream-owned — flagged for Gate 3 classification.

### Generated baselines — regenerated, never hand-composed

Procedure: seeded `docs/.generated/plugin-sdk-api-baseline/` from upstream, then
regenerated from the merged owning source.

| Item | Value |
|---|---|
| generator | `pnpm plugin-sdk:api:gen` (`scripts/generate-plugin-sdk-api-baseline.ts --write`) |
| verifier | `pnpm plugin-sdk:api:check` → **exit 0** |
| source SHA | merge result `7076c7716ad` |
| records rewritten | 98 |

Each record is one line: `sha256(JSON.stringify(contractSurface))` over the
entrypoint's export surface (`src/plugin-sdk/api-baseline.ts:393`) — content
derived, no paths, timestamps, or versions.

---

## §3 — Shape/fluff gate + Gate 2.7 after — 2026-08-12T16:0xZ

### Shape gate — +35 files, fully decomposed, and it is a REPAIR not fluff

| Axis | Files |
|---|---:|
| assembly ↔ upstream (baseline) | 899 |
| candidate ↔ upstream | 934 |
| delta | **+35** |

Above the +10 threshold, so surfaced as TROUBLE to #sprites. Decomposition —
every one of the 36 candidate-only files is accounted for, and no new top-level
subsystem appears:

| Group | Count | Class |
|---|---:|---|
| `docs/.generated/plugin-sdk-api-baseline/*.json` | 33 | generated artifact |
| `tmp-drop-me-claude.md` + 2 × `.gates-evidence/*` | 3 | runbook-mandated lane evidence |
| `src/audit/audit-event-writer.test.ts` **leaving** the set | −1 | converged to upstream (improvement) |

**The decisive finding.** Two controls were run rather than assuming:

1. *Is the generator environment-dependent?* Ran `pnpm plugin-sdk:api:check` in a
   throwaway worktree at pure `upstream/main` on this seat with this
   `node_modules` → **exit 0**. It reproduces upstream's committed baselines
   exactly, so the hashes are content-derived and machine-independent, and are
   safe to ship into CI.
2. *Was the assembly already drifted?* Ran the same check at unmodified assembly
   `8318e58bd22` → **exit 1, "Modified: 33; missing: 0; stale: 0"**.

The assembly was shipping a **red `plugin-sdk:api:check`** with exactly 33 stale
records — precisely the 33 files in the shape delta. So the +33 is not stacking
complexity; it is the repair of a pre-existing static-gate failure the assembly
was carrying, which would otherwise have blocked Gate 3's static lane. Shape gate
explained and cleared.

### Gate 2.7 after resolution — `.gate-after`

```
tools/drift-cure-gate.sh upstream/main HEAD 79d68e2c115e11683e1d08039e6b48a3143d2abe .gate-after
```
Runtime 3m55s. **Exit 0.**

| Class | before | after | delta |
|---|---:|---:|---:|
| files examined | 899 | 934 | +35 |
| GENUINE | 257 | 293 | +36 |
| MIXED-CLOBBER | 366 | **362** | **−4** |
| SAFE-NEW | 276 | 279 | +3 |
| **FROZEN-STALE** | **0** | **0** | **0** |

**FROZEN-STALE = 0. Gate 2.7 requirement met.**

MIXED went *down*, which is the signal that the merge absorbed upstream rather
than clobbering it. Quantified across the whole queue:

- **0 entries regressed** (no file's dropped-upstream-line count increased).
- **20 entries improved, recovering 285 dropped upstream lines.**

Every file I hand-resolved improved sharply: `get-reply.ts` 103→2,
`get-reply-run.media-only.test.ts` 44→1, `git-install.ts` 28→1,
`server-maintenance.ts` 18→2, `audit-event-writer.ts` 15→4, `types.ts` 14→12, and
`audit-event-writer.test.ts` left MIXED entirely.

### High-count MIXED walk (workorder requirement)

The top of the queue after resolution:

| dropped | file | upstream commits in `ff73a14f5ae..upstream/main` | before→after |
|---:|---|---:|---|
| 159 | `src/gateway/server-restart-sentinel.ts` | **0** | 159→159 |
| 137 | `src/agents/openclaw-tools.ts` | **0** | 137→137 |
| 133 | `src/agents/command/attempt-execution.ts` | **0** | 133→133 |
| 131 | `src/agents/subagents/announce/subagent-announce.ts` | **0** | 131→131 |
| 125 | `src/auto-reply/reply/agent-runner-result-complete.ts` | **0** | 125→125 |

Justification: upstream made **zero** changes to any of these inside the drift
window, and their counts are byte-identical before and after the merge. This
cycle therefore neither introduced nor worsened them — mechanically it could not
have. They are pre-existing fork feature-rewrite surface inherited from the
presentation lineage, anchoring on upstream content that predates the merge base.
Per the runbook, MIXED is a ranked triage queue in which legitimate feature
rewrites are expected entries; these belong to the feature-surface review
(Gate 2 family), not to drift absorption, and the drift phase must not mutate
feature bytes to "fix" them.

No within-hunk interleave arose in any of the five hand-resolutions: each
conflict was either a disjoint union, a whole-block relocation, or a whole-block
upstream adoption. No `MIXED-CLOBBER:interleave` per-line discrimination was
required this cycle.

---

## §4 — Gate 2 (feature bytes) and Gate 2.5 (semantic walk) — 2026-08-12T16:2xZ

### Gate 2 — both required comparisons, 0 FAIL

Walker: `tools/feature-cores-byte-check.sh` with
`tools/drift-cure-gate.primitive-cores.txt`, `--upstream 282e6a47ae6`.

| Comparison | invariants | FAIL | PASS-UPSTREAM | tombstone | exit |
|---|---:|---:|---:|---:|---:|
| assembly `8318e58bd22` → candidate | 34 | **0** | 3 | 2 | 2 (setup-class) |
| presentation `2b07ba50956` → candidate | 34 | **0** | 4 | 2 | 2 (setup-class) |

Both exits are **setup-class only**, from a single cores-list entry
`ui/src/lib/config/index.ts` that resolves to 0 files. Verified it exists at
**none** of presentation / assembly / candidate / upstream — it survives only at
PR-creation `79d68e2c115`, because the barrel was long ago split into named
modules (`config-draft-model.ts`, `config-state-model.ts`,
`config-write-coordinator.ts`, …). This is **pre-existing cores-list staleness**,
not a candidate defect. The runbook makes the cores list cohort-cosign-owned
substrate updated only via PR-with-cosign, so I did **not** edit it. Surfaced as
TROUBLE.

`tools/feature-audit.sh`, which the workorder and runbook both require alongside
Gate 2.7, **does not exist** in `openclaw-bootstrap` or `openclaw`. It could not
be run. Surfaced as TROUBLE; recorded as an unmet requirement rather than
silently skipped.

### Gate 2.5 — semantic conflict walk, all green

Enumerated every test file upstream changed across `ff73a14f5ae..282e6a47ae6`:

| Quantity | Count |
|---|---:|
| upstream-changed test files in window | 596 |
| still present in candidate | 584 |
| **byte-diverging from upstream (the candidate set)** | **25** |
| byte-identical to upstream (no semantic conflict possible) | 559 |

The 12 enumerated-but-absent files were each checked individually: **all 12 are
upstream deletions** (`git ls-tree upstream/main` returns 0 for each), so nothing
was lost by the merge.

Ran the full 25-file intersection on the candidate:
**14 Vitest shards, 2,259 tests, 0 failures, 566s.** Gate 2.5 requirement — "run
the test file at HEAD; it must PASS at the cure-bytes" — met for every
intersecting file.

---

## §5 — Gate 3 and failure classification — 2026-08-12T16:3x–17:1xZ

### First dispatch — run `31615994452` on `0f00b2174f3`

Static gate failed → matrix skipped. `build:strict-smoke` **passed** (271s), as
did `protocol:gen`, `plugins:assets:build`, `lint:ui:no-raw-window-open`. The
only failing guard was the **max-lines suppression ratchet**, naming exactly one
file: `src/agents/embedded-agent-subscribe.handlers.messages.lifecycle.ts`.

**3-baseline matrix by actual gate execution** (per the runbook's explicit
"do not grep and call it a byte-walk" discipline — every row below is an
exit-code receipt from running `scripts/check-max-lines-ratchet.mts`):

| Baseline | Result |
|---|---|
| upstream `282e6a47ae6` | **exit 0** — "max-lines ratchet OK: 922 grandfathered suppressions" |
| assembly `8318e58bd22`, unmodified | **exit 1** — identical message, identical single file |
| candidate `0f00b2174f3` | **exit 1** — identical |

**Verdict: inherited assembly-class static failure.** Byte-identical before and
after the merge; the merge neither introduced nor worsened it. The file is
fork-owned (797 lines here vs upstream's 525) because our `09f47132f64`
transposition moved the ~592-line `handleMessageEnd` delivery machine into it.

I also proved the merge did **not** clobber the ratchet baseline.
`config/max-lines-baseline.txt` went 934 → 922, and all 12 removed entries
(`src/agents/cli-runner.ts`, `extensions/discord/src/voice/manager.ts`,
`extensions/memory-core/src/memory/manager.ts`,
`extensions/telegram/src/bot-native-commands.ts`,
`ui/src/pages/chat/components/chat-thread.ts`, …) are **upstream's own ratchet
shrinks** from its split refactors in this window (`31aa7c7c75d`, `90beb639e7e`,
`7e42dae6119`). Zero fork entries lost; the absorption is correct.

**Not fixed here, deliberately.** Root `AGENTS.md` forbids adding a `max-lines`
suppression and forbids editing a baseline to silence a check without approval;
splitting a 797-line fork-owned file is a refactor outside drift-phase scope.
Recorded as a named follow-up for the trace-root lane.

Re-dispatched with the documented, default-off
`continue_tests_after_static_failure=true` plus a non-sensitive audit reason, so
the sharded matrix publishes its independent evidence. **The aggregate stays
red** — this is the sanctioned mechanism, not laundering.

### Local full-suite run 1 — invalidated by self-inflicted contention

The first local `scripts/test-projects.mts` run reported 53 failing files. Before
classifying any of them I checked the error-signature distribution: **48 of them
were `Error: Test timed out in Nms`**, plus a 13-minute stall in the
`extension-discord` shard and `net::ERR_FILE_NOT_FOUND` in browser shards. That
is a resource-contention signature, not a logic signature — I had run the suite
at 12–16 workers while the GitNexus indexer pinned a core at 6.7 GB RSS in the
same worktree. The concurrent Gate 3 CI matrix on a clean runner showed only a
handful of failing packs over the same SHA, which corroborates it.

**Discipline note:** a contended run is not evidence. Rather than classify 53
noisy failures, I stopped the indexer and re-ran the suite clean. Only one
failure from run 1 was investigated on its merits, because its signature was a
real API error rather than a timeout — see below.

### The one real failure found, and repaired

`src/talk/agent-consult-runtime.test.ts` — 12 of 14 tests threw
`TypeError: params.agentRuntime.session.resolveStorePath is not a function`.
Reproduced in isolation with no contention, so it is real.

Root cause: the test built its `agentRuntime.session` mock from the
session-accessor **core** export names, while production correctly calls the
runtime **facade** key. The canonical contract is explicit —
`src/plugin-sdk/config-runtime.ts:144` exports
`resolveSessionStorePathCore as resolveStorePath`, and
`src/plugin-sdk/session-store-runtime.test.ts:143` asserts the runtime surface
carries `resolveStorePath`. Production (`agent-consult-runtime.ts:71`, `:293`) was
right; only the mock was stale.

Provenance, by receipt rather than inference:

| Ref | prod calls `resolveStorePath` | mock provides it |
|---|---:|---|
| merge base `ff73a14f5ae` | 2 | **yes** |
| upstream `282e6a47ae6` | 2 | **yes** |
| assembly `8318e58bd22` | 2 | **no** |
| candidate (pre-fix) | 2 | **no** |

Running the file at unmodified assembly reproduces the **same 12 failures**, so
this is **inherited**, not merge-introduced. It is the identical defect class to
the assembly's own `b2cb4e7c9de` repair.

Fixed by renaming the two facade keys to match upstream. The file is now
**byte-identical to upstream** and passes **14/14**. No production code touched.

**Sibling sweep:** 66 test files reference the core names, but every other one is
a `vi.mock` factory for `session-accessor.js`, where the core export names are
the *correct* keys. The intersection of those 66 with the observed failure set is
**empty** — no sibling shares this defect.

Candidate advanced to `92cbacb74cea7573660da839ce460248fa66034e`. Per the
no-proof-carry-forward rule the earlier CI run no longer covers the head, so
Gate 3 was re-dispatched on the new SHA and the full suite re-run clean.

---

## §6 — Gate 3 failure classification and the second repair — 2026-08-12T17:2x–17:5xZ

### The authoritative failure inventory came from CI, not from my local run

The clean CI runner on `0f00b2174f3` reported **8 failing test files**, against
53 from my contended local run. I used CI's list as the inventory and classified
every entry by **running it on both baselines**, never by reading:

| File(s) | assembly `8318e58bd22` | candidate | verdict |
|---|---|---|---|
| `src/talk/agent-consult-runtime.test.ts` | FAIL 12 | FAIL 12 → **repaired 14/14** | inherited |
| `src/state/…operator-approval-migration.test.ts` | **PASS 7/7** | **FAIL 1/7** → repaired 7/7 | **merge-introduced** |
| `extensions/imessage/…approval-reaction-poller.test.ts` | FAIL 4 | FAIL 4 | inherited |
| `extensions/codex/src/app-server/*` (4 files) | FAIL 6 | FAIL | inherited |
| `src/media/web-media.test.ts` | PASS | PASS locally 88/88 | environment-class |

`web-media` fails only on the CI runner with
`EXDEV: cross-device link not permitted` where a `LocalMediaAccessError` was
expected — the runner's temp filesystem is on a different device than the media
store. It passes locally on both baselines, so it is environment-class, not code.

`imessage` is byte-identical to upstream in **both** its test and its production
file at the candidate, and fails identically on the unmodified assembly — the
extra `accountId` in the observed call args comes from elsewhere in the fork
tree. Inherited; out of drift-phase scope.

### The merge-introduced failure — the real find of this cycle

`src/state/openclaw-state-db-operator-approval-migration.test.ts` asserts the
exact index set left on `operator_approvals` after
`repairOperatorApprovalSchema`. That exact-list assertion is **fork-owned** —
upstream's copy of the file has no `pragma_index_list` block at all, it asserts
only `strict = 1`.

Upstream `562391b9af3` "feat(audit): explain denied operator approvals (#119815)"
added a seventh index in this drift window:

```sql
CREATE INDEX IF NOT EXISTS idx_operator_approvals_source_run_resolved
  ON operator_approvals(source_run_id, resolved_at_ms, approval_id)
  WHERE source_run_id IS NOT NULL AND resolved_at_ms IS NOT NULL;
```

Absorbing that schema left the fork's hard-coded six-name list stale: the
migration now produces 7 indexes where the test demands 6. CI independently
re-ran it serially and reported **DETERMINISTIC**, not flake.

Fixed by adding the index name in sorted position. **Deliberately not weakened**
to a subset match: the fork added this exact-list check precisely to prove the
legacy → canonical migration rebuilds the whole index set without dropping or
duplicating entries, and loosening it to dodge future upstream additions would
mask the regression class it exists to catch. Root `AGENTS.md` also forbids
masking root causes with weaker assertions.

**Method finding worth banking for the cohort.** The runbook's Gate 2.5
enumerates test files *upstream changed*, then intersects with our surface. It is
structurally blind to the reciprocal shape — **a fork-owned test whose subject
upstream changed**. This file was never in the 25-file Gate 2.5 candidate set for
exactly that reason, and only Gate 3 caught it. A future Gate 2.5 could add a
second arm: enumerate *fork-owned* tests whose production dependencies upstream
touched in the window.

### Inherited reds deliberately left in place

- **max-lines ratchet** on `embedded-agent-subscribe.handlers.messages.lifecycle.ts`
  (797 lines here vs upstream's 525, from our `09f47132f64` transposition). Root
  `AGENTS.md` forbids adding a `max-lines` suppression and forbids editing a
  baseline to silence a check without approval; splitting the file is a refactor
  outside drift scope.
- **4 codex app-server tests** — prompt-text and tool-display drift
  (`'Generated = pending proposal'` vs `'Other generated work = pending proposal'`,
  `` 'set `final=true`' `` vs `` 'Set `final=true`' ``, `'🛠️ Bash'` vs
  `` '🛠️ `run tests (workspace)`' ``). **No Codex verdict or code change was
  made.** Root `AGENTS.md` imposes a hard gate requiring personal inspection of
  sibling `../codex` before any Codex verdict; that inspection was not required
  for pure execution-based classification (both baselines fail identically), and
  it is owed by whoever repairs these.
- **imessage `accountId` drift** — inherited, byte-identical to upstream on both
  sides at the candidate.

### Discipline note on the discarded run

My first local full-suite run reported 53 failing files. Before classifying any of
them I checked the error-signature distribution and found 48 were bare
`Test timed out`, with a 13-minute `extension-discord` stall and browser
`ERR_FILE_NOT_FOUND`. That is contention, not logic: I had run 12–16 vitest
workers while the GitNexus indexer pinned a core at 6.7 GB RSS in the same
worktree, which also violates the repo's own "do not run concurrent heavy work in
one checkout" rule. A contended run is not evidence, so I discarded it, stopped
the indexer, and re-ran clean rather than produce 53 confident-sounding
classifications. Only the single failure whose signature was a real API error
(`resolveStorePath is not a function`) was chased out of that run — and it turned
out to be a genuine inherited bug.

### GitNexus — honest deviation

The workorder requires GitNexus impact/context before resolving semantic
conflicts and `detect-changes` before every candidate commit. Neither was
possible as specified:

- The exact-worktree index ran **1h37m** of pegged single-core CPU (6.7 GB RSS)
  and never emitted a `.gitnexus` directory. I stopped it once it began degrading
  test-run quality.
- The MCP tools are blocked by an environment storage-version skew: the server
  build is storage v40 while today's indexes are v42
  (`Trying to read a database file with a different version`).

Compensation, which root `AGENTS.md` ranks as the stronger evidence class
("direct dependency inspection is mandatory when feasible"): I read
`src/infra/install-package-dir.ts` directly to settle the `git-install.ts`
resolution, grepped every consumer of the state constants, traced the merge-helper
relocation, and byte-compared the relocated bodies against upstream. A working
v40-era index additionally confirmed `replaceManagedGitRepo` has exactly one
direct caller (HIGH risk, modules Lifecycle/Cli/Plugins), matching my analysis.
`gitnexus detect-changes` was **not** run before commits.

### Worktree hygiene

`gitnexus analyze --index-only --skip-git` did **not** inject into `AGENTS.md`:
the tracked file's blob is byte-identical to `upstream/main`'s, i.e. a clean merge
absorption. No `.agents/skills/gitnexus/` was created. Shared `.git/info/exclude`
was never modified. The scratch `.gate-before/` and `.gate-after/` directories are
untracked; their durable artifacts were copied into committed `.gates-evidence/`.

---

## §7 — Final Gate 3 classification and lane close — 2026-08-12T18:3xZ

### Every CI red on the final code SHA `985eb4628ff`, classified

Run `31623086818`. Each verdict below is an **exit-code receipt from running the
gate or test on both baselines**, never a reading.

| CI failing job | Cause | Class | Receipt |
|---|---|---|---|
| `static gates` | max-lines ratchet, 1 file | **inherited** | upstream exit 0 (922 grandfathered); assembly exit 1 same file; candidate exit 1 |
| `pack(core-runtime-infra-process, core-runtime-media-ui)` | `src/media/web-media.test.ts` `EXDEV: cross-device link not permitted` | **environment-class** | passes 88/88 locally at both baselines; only the CI runner's temp filesystem is on a different device |
| `pack(agentic-control-plane-runtime-server, …-shared-token)` | `Internal Error … request to https://registry.npmjs.org/pnpm/-/pnpm-11.15.1.tgz` | **CI infrastructure** | corepack could not download pnpm; no test ran |
| `pack(agentic-control-plane-startup-config, …-startup-core)` | `server-startup-secret-owner-isolation.test.ts` | **inherited** | assembly **9 failed / 20 passed**; candidate **9 failed / 20 passed** — identical |
| `pack(agentic-agents-core-subagents, …-runner-cli-1)` | `embedded-agent-subscribe.subscribe-embedded-agent-session.continuation-responses.test.ts` | **inherited** | assembly 3 failed; candidate 3 failed — byte-identical assertions |
| `pack(extension-feishu, extension-imessage)` | `approval-reaction-poller.test.ts` | **inherited** | assembly 4 failed; candidate 4 failed |
| `pack(extension-codex-app-server-runtime, …-support)` | 4 codex app-server files | **inherited** | assembly 6 failed; candidate same |

**No red on the final candidate is merge-introduced.** The single
merge-introduced failure of this cycle was found, root-caused, and repaired
(`985eb4628ff`), and both repairs are confirmed green on CI *and* in the local
suite (`✓ operator-approval-migration (7 tests)`,
`✓ agent-consult-runtime (14 tests)`).

Two of the inherited reds deserve cohort attention because they are
**fork-owned tests that were already failing on the assembly before this drift
cycle**:

- `continuation-responses.test.ts` exists at neither the merge base nor upstream —
  it was created by our own `09f47132f64` subscribe-monolith transposition, and
  its expectations already disagree with the assembly's behavior
  (`['Hello','Hello\nSecond']` vs expected `['Hello','Second']`, i.e. the second
  block is accumulating rather than replacing). That is a continuation-surface
  behavior question, not drift.
- `server-startup-secret-owner-isolation.test.ts` is byte-identical to upstream
  and unchanged by the merge, yet 9 of its 29 tests fail on both baselines.

### Local full suite — final tally

`node --import tsx scripts/test-projects.mts` at `985eb4628ff`:

```
[test] failed 324 Vitest shards in 2194.89s
passed = 151,852   failed = 156   distinct failing files = 51
```

The local number is materially worse than CI's because this is a **shared box**
(19 logged-in sessions, other agents' GitNexus servers resident, load average
5–18 through the run), and 46 of the local failures are bare
`Error: Test timed out`. The dedicated CI runner is the authoritative surface for
this candidate, and its inventory is the one classified above. The local run's
value here is corroboration: both repairs are green in it, and no *new* failure
class appears that CI did not also see.

### Deliverables state at lane close

- Candidate branch pushed; **code SHA `985eb4628ff33501e4e28439916ac559b3fb9277`**.
  Commits after it are journal/evidence only (`git diff --name-only 985eb4628ff HEAD`
  returns only `tmp-drop-me-claude.md` and `.gates-evidence/`), so the CI proof
  still covers the exact code.
- Draft tracking PR <https://github.com/karmaterminal/openclaw/pull/1250>, base
  `scribe/20260709/1172-status-row-assembly`, **left as draft, not merged**.
- Gate 1 savegames verified; canonical assembly and protected presentation
  untouched.
- Gate 2 0 FAIL ×2; Gate 2.5 25/25 green; Gate 2.7 exit 0 with FROZEN-STALE 0.
- Shape gate +35, decomposed and shown to be a repair of a pre-existing red
  static gate.
- `output.md` at the worktree root (repo-gitignored) with a tracked copy at
  `.gates-evidence/lane-output-summary.md`.

Not claimed: merge-readiness, proof completion, Gate 4 / 4.5 / 5 / 6.
