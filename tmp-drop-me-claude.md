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
