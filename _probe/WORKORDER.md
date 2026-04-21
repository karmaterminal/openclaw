# WORKORDER: silas/2026420-rebase-validation

## Branch

- name: `silas/2026420-rebase-validation`
- base: `v2026.4.20` (upstream openclaw tag, commit `115f05d5952adeaa8043311c24c4b8a3803481ba`, "chore: prepare 2026.4.20 release", 2026-04-21 by Peter Steinberger)
- worktree: `/tmp/silas-2026420-rebase-validation`
- git repo: `~/.openclaw-data/workspace/karmaterminal-openclaw` (shared object store)

## Goal

Apply the full content of `karmaterminal/openclaw:feature/context-pressure-squashed` onto this v2026.4.20 base, producing a clean buildable tree.

This is a **validation-parallel** branch to frond-scribe's canonical `frond-scribe/2026420-with_continue_scratch`. Two independent hands producing the same tree → strong signal for shipping.

## Inputs

- Upstream v2026.4.20 tree: currently checked out at HEAD (`115f05d595`)
- Feature stack to port: `origin/feature/context-pressure-squashed` (HEAD `b4dd60f34b` "fix: PR review P2s — reduce poll blocking, warn on early spawn-runtime use, fix indexOf in loop")
- Ronan's pre-probe findings: `/tmp/silas-2026420-rebase-validation/_probe/ronan-findings.md` (50 lines, v2026.4.20 vs feature-squashed diff analysis)

## Key pre-known conflicts (from Ronan's probe)

### #69404 (session OOM prune) — in v2026.4.20, NOT in feature-squashed

- `src/config/sessions/store-maintenance.ts`: upstream flips `DEFAULT_SESSION_MAINTENANCE_MODE` from `"warn"` → `"enforce"`, drops `resolveMaintenanceConfig()`, adds `wouldCapActiveSession` helper
- `src/config/sessions/store-load.ts`: upstream adds `pruneStaleEntries` + `capEntryCount` hook when `mode === "enforce"` && `size > maxEntries`
- 5 new upstream-only files: `reset-policy.ts`, `reset-preserved-selection.ts`, `store-entry.ts`, `store-maintenance-runtime.ts`, `transcript-resolve.runtime.ts`
- Risk: keep a `resolveMaintenanceConfig` shim OR update feature-branch callers

### #67830 (compaction notices) — already in feature-squashed via #38805

- Commit `2b68d20ab3` "feat: notify user when context compaction starts and completes (#38805)" (zidongdesign, 2026-03-21). Same feature, different PR number.
- Strings: `"🧹 Compacting context..."`, `"🧹 Auto-compaction complete${suffix}."`
- **No action needed** — already present in our feature; during port, the upstream version may produce duplicate content, take ours when possible (semantically identical).

### #68915 (detached-task registration contract) — in v2026.4.20, NOT in feature-squashed, DEEP CONFLICT

- Adds: `src/tasks/detached-task-runtime-contract.ts`, `src/tasks/detached-task-runtime-state.ts`
- Modifies: `src/tasks/detached-task-runtime.ts` (entire subsystem is upstream-only), `task-executor.ts`, `plugins/registry.ts`, `runtime-tasks.ts`, etc. (19 paths, +759 / -49)
- Reference merge: sibling branch `origin/silas/cot-leak-fix-upstream` (SHA `bd3ad3436e`) already has #68915 applied.
- Our feature does NOT touch these files (the consumer-surface `continuation-delegate-store-taskflow.ts` uses a different registry: `task-flow-registry` + `flowId`, orthogonal to #68915's `task-registry` + `runId`).
- **Strategy**: keep upstream's #68915 intact on v2026.4.20 base; port our feature alongside (no conflict expected on these paths).

## Task

Apply the feature stack onto v2026.4.20.

### Approach

**Try in order, stop at first clean success:**

1. **Rebase approach** — `git rebase --onto v2026.4.20 <merge-base> feature/context-pressure-squashed`. Find merge-base via `git merge-base origin/feature/context-pressure-squashed v2026.4.20`. If there is no shared ancestor (shallow-fetch limitation), this will fail; fall through.

2. **Three-way merge approach** — `git merge --no-commit origin/feature/context-pressure-squashed` with strategy `-X theirs` or `-X ours` selected file-by-file.

3. **Diff-and-apply approach** — use `git diff <merge-base-candidate> origin/feature/context-pressure-squashed` as patch, apply with `git apply --3way`.

4. **File-walk approach (last resort)** — replay feature-branch commits one at a time via `git cherry-pick -x`, resolving each conflict by taking feature-branch content for feature-owned files, upstream content for upstream-owned files, and hybrid for shared files using Ronan's findings.

### Validation gate

After port, run:

```
pnpm install
pnpm typecheck
pnpm build
pnpm -r test --run --reporter=dot 2>&1 | tee _probe/test-output.txt | tail -30
```

Success criteria:

- typecheck clean
- build clean
- tests pass or have a clearly-documented known-failure list (compare against feature-squashed test status on main)

### Deliverables

Commit all work incrementally to `silas/2026420-rebase-validation`. Write the final report to `_probe/rebase-report.md` with sections:

1. **Approach used** (which of 1-4 above succeeded)
2. **Conflicts encountered** (file list + resolution rationale)
3. **Validation results** (typecheck/build/test status)
4. **Divergences from Ronan's findings** (if any new surprises surfaced)
5. **Known-failures** (tests that fail, with root-cause hypothesis)
6. **Ready-to-push** verdict (yes/no + blockers)

Do not push to origin yet — I'll review the report first.

### Hard rules

- Do not touch `~/clawd`, do not touch `~/flesh_beast_tmp/openclaw` (live runtime — NEVER).
- Do not run `systemctl`, do not run `openclaw gateway restart/stop` (SIGTERM-self on Elliott's workspace).
- All work under `/tmp/silas-2026420-rebase-validation/`.
- Commit messages prefixed with `silas:` so provenance is clear.
- Append progress to `_probe/journal.log` as you go (date-stamped lines).

### When finished

Run:

```
openclaw system event --text "Elliott: silas/2026420-rebase-validation rebase done — see _probe/rebase-report.md" --mode now
```
