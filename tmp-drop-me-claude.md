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
