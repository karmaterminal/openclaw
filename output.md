# WORKORDER cherry-pick-prep-20260511 — PR #642 deploy substrate-prep

## Source pins read

- PR #642 live metadata: `https://github.com/karmaterminal/openclaw/pull/642`, state `MERGED`, merged at `2026-05-11T15:42:13Z`, base `frond/v2026.5.7/canonical`, PR branch head `ffd387c172afea4625a73219c577d27436744d27`, GitHub squash/merge commit `7afc8dc10b0ad6c6f31ccbfb95c1510e432e6e02`.
- PR #642 diff: 2 files, 125 insertions, 2 deletions: `src/agents/pi-embedded-runner/run/runtime-context-prompt.ts` and `src/agents/pi-embedded-runner/run/runtime-context-prompt.duplication-bug.test.ts`.
- Target runtime branch read: `origin/cael/20260510/runtime-573-plus-633` at `918deee66d1f7d3c903a6a24dc33e4126286c6df`; range command `git log --oneline origin/cael/20260510/runtime-573-plus-633 ^origin/frond/v2026.5.7/canonical` returned 3573 commits.
- Bootstrap deploy docs read from read-only checkout `openclaw-bootstrap` at `f333a1c19fce707ebe6c1fa714f66705f542fdaa`: `.github/workflows/deploy-gateway.yml`, `.github/workflows/DEPLOY_GATEWAY.md`, and `RUNBOOKS/PRINCE-CODE-AGENT-RUNBOOK.md`.
- `gitcrawl` prerequisite attempted first per PR-maintainer skill; this seat does not have `gitcrawl` installed, so live `gh`/git reads were used as fallback.

## §2.1 Cherry-pick conflict verification

### Commands run

```bash
git fetch origin cael/20260510/runtime-573-plus-633 frond/v2026.5.7/canonical
gh pr view 642 --repo karmaterminal/openclaw --json title,body,baseRefName,headRefOid,commits,reviewDecision,mergeable,url,state,mergedAt,number,headRefName,author,changedFiles,additions,deletions
gh pr view 642 --repo karmaterminal/openclaw --json mergeCommit,headRefOid,mergedAt,state,url
gh pr diff 642 --repo karmaterminal/openclaw
```

Then in a disposable temp worktree off `origin/cael/20260510/runtime-573-plus-633`:

```bash
git cherry-pick --no-commit 7afc8dc10b0ad6c6f31ccbfb95c1510e432e6e02
```

### Result

Use the **GitHub squash/merge commit**, not the literal PR branch head:

- `7afc8dc10b0ad6c6f31ccbfb95c1510e432e6e02` (`mergeCommit.oid`) cherry-picks cleanly onto `origin/cael/20260510/runtime-573-plus-633`.
- No conflicts.
- Staged result after the clean rehearsal:

```text
A  src/agents/pi-embedded-runner/run/runtime-context-prompt.duplication-bug.test.ts
M  src/agents/pi-embedded-runner/run/runtime-context-prompt.ts

.../runtime-context-prompt.duplication-bug.test.ts | 114 +++++++++++++++++++++
.../run/runtime-context-prompt.ts                  |  13 ++-
2 files changed, 125 insertions(+), 2 deletions(-)
```

Classification: substantive runtime/test fix, not release-plumbing.

### Literal PR-head comparison

The literal PR branch head `ffd387c172afea4625a73219c577d27436744d27` is only the final commit from the PR branch, not the full PR diff. After fetching `pull/642/head`, a rehearsal of:

```bash
git cherry-pick --no-commit ffd387c172afea4625a73219c577d27436744d27
```

conflicted:

```text
CONFLICT (modify/delete): src/agents/pi-embedded-runner/run/runtime-context-prompt.duplication-bug.test.ts deleted in HEAD and modified in ffd387c172...
DU src/agents/pi-embedded-runner/run/runtime-context-prompt.duplication-bug.test.ts
```

Conflict file line count: `src/agents/pi-embedded-runner/run/runtime-context-prompt.duplication-bug.test.ts` = 114 lines. Classification: substantive test-file conflict caused by attempting to cherry-pick an incomplete final PR-branch commit without its earlier commits. Do **not** use this SHA as the deploy substrate pick.

### Abort / cleanup note

Because both rehearsals used `--no-commit`, clean application left no cherry-pick sequencer state, so `git cherry-pick --abort` returned `error: no cherry-pick or revert in progress`. The disposable rehearsal worktree was reset/removed afterward; the working branch remained clean.

### Copy-paste sequence for figs

This sequence avoids local branch-name ambiguity by working from a detached copy of the target branch and pushing explicitly to the cael-owned target only if figs chooses to do so.

```bash
set -euo pipefail

TARGET_BRANCH=cael/20260510/runtime-573-plus-633
PR642_MERGE_SHA=7afc8dc10b0ad6c6f31ccbfb95c1510e432e6e02

git fetch origin "$TARGET_BRANCH" frond/v2026.5.7/canonical
git switch --detach "origin/$TARGET_BRANCH"
git switch -c "figs/cherry-pick-642-onto-runtime-$(date -u +%Y%m%d%H%M%S)"

git cherry-pick --no-commit "$PR642_MERGE_SHA"
git diff --cached --stat
git status --short

git commit -m "fix(runtime-context): stop body duplication in runtime context"
git push origin HEAD:"$TARGET_BRANCH"
```

If figs wants to re-resolve the post-merge SHA at execution time:

```bash
PR642_MERGE_SHA=$(gh pr view 642 --repo karmaterminal/openclaw --json mergeCommit --jq '.mergeCommit.oid')
```

## §2.2 Deploy-gateway.yml dispatch pattern

Dispatch shape from `.github/workflows/deploy-gateway.yml` inputs (`target_prince`, `ref`, `reason`, `bypass_validation`, `bypass_reason`, `bootstrap_dir`, `dry_run_only`; workflow lines 40-78) and operator README usage (`DEPLOY_GATEWAY.md` lines 111-144):

```bash
gh workflow run deploy-gateway.yml \
  --repo karmaterminal/openclaw-bootstrap \
  -f target_prince=elliott \
  -f ref=cael/20260510/runtime-573-plus-633 \
  -f reason='ship #642 producer-1 fix to break elliott V8-OOM cascade'
```

Ancestor gate is load-bearing. The runbook section "Ancestor byte-check before any deploy or branch-claim" requires reading `vars.COHORT_TARGET_TAG`, peeling the tag/SHA, then running `git merge-base --is-ancestor <upstream-tag-peeled-sha> <ref>` before deploy; exit `0` is right basis, exit `1` is wrong basis (runbook lines 293-309). The workflow enforces the same check before deploy (`deploy-gateway.yml` lines 260-373), and the README documents the resolve-pin/stale-check/ancestor-check flow (`DEPLOY_GATEWAY.md` lines 80-109).

Current repo variable:

```bash
# Requested shape when supported by gh:
gh variable get COHORT_TARGET_TAG --repo karmaterminal/openclaw-bootstrap

# This seat's gh lacks `variable get`; equivalent read used:
gh variable list --repo karmaterminal/openclaw-bootstrap --json name,value \
  --jq '.[] | select(.name=="COHORT_TARGET_TAG") | .value'
```

Observed value: `v2026.5.7`. Peeled commit: `eeef4864494f859838fec1586bedbab1f8fa5702`.

Important current finding: `origin/cael/20260510/runtime-573-plus-633` at `918deee66d1f7d3c903a6a24dc33e4126286c6df` **does not include** `eeef4864494f859838fec1586bedbab1f8fa5702` as an ancestor:

```text
ancestor eeef4864494f859838fec1586bedbab1f8fa5702 -> origin/frond/v2026.5.7/canonical: PASS
ancestor eeef4864494f859838fec1586bedbab1f8fa5702 -> origin/cael/20260510/runtime-573-plus-633: FAIL exit=1
merge-base with origin/cael/20260510/runtime-573-plus-633: 46a04099a456fb125eb381a449571a9786311599
```

Cherry-picking PR #642 onto the target branch will copy bytes but will **not** change ancestry, so deploy-gateway's ancestor-check is expected to keep failing for `ref=cael/20260510/runtime-573-plus-633` unless figs also reconciles the branch lineage, changes the cohort pin by cohort decision, or deliberately uses bypass.

Bypass option, documented in `DEPLOY_GATEWAY.md` lines 97-109 and workflow lines 149-160 / 435-450:

```bash
gh workflow run deploy-gateway.yml \
  --repo karmaterminal/openclaw-bootstrap \
  -f target_prince=elliott \
  -f ref=cael/20260510/runtime-573-plus-633 \
  -f bypass_validation=true \
  -f bypass_reason='<deliberate written reason>' \
  -f reason='ship #642 producer-1 fix to break elliott V8-OOM cascade'
```

Bypass skips only the cohort-target stale-check and ancestor-check; it does **not** skip `openclaw config validate`. It is **not appropriate** for a normal #642 hotfix deploy unless figs intentionally accepts a wrong-basis deploy risk as an experimental exception. The cleaner deploy path is a ref that includes the current `COHORT_TARGET_TAG` pin as ancestor.

## §2.3 Pre-flight checklist for figs

1. Confirm PR #642 is merged and record both SHAs: PR branch head `ffd387c172afea4625a73219c577d27436744d27`; PR #642 GitHub squash/merge commit `7afc8dc10b0ad6c6f31ccbfb95c1510e432e6e02`. Use the squash/merge commit for the full fix.
2. On cael or locally, cherry-pick `7afc8dc10b0ad6c6f31ccbfb95c1510e432e6e02` onto `cael/20260510/runtime-573-plus-633` per §2.1. Do not use the literal PR branch head unless intentionally replaying the full four-commit PR branch in order.
3. Push the updated `cael/20260510/runtime-573-plus-633` only if figs chooses to mutate the cael-namespace branch; if not on the cael seat, decide whether to `gh auth switch` first.
4. Run the ancestor-check before deploy:

```bash
COHORT_TARGET_TAG=$(gh variable list --repo karmaterminal/openclaw-bootstrap --json name,value --jq '.[] | select(.name=="COHORT_TARGET_TAG") | .value')
PIN_SHA=$(git ls-remote https://github.com/karmaterminal/openclaw "refs/tags/${COHORT_TARGET_TAG}^{}" | awk '{print $1}')
[ -n "$PIN_SHA" ] || PIN_SHA=$(git ls-remote https://github.com/openclaw/openclaw "refs/tags/${COHORT_TARGET_TAG}^{}" | awk '{print $1}')
git fetch origin cael/20260510/runtime-573-plus-633
git merge-base --is-ancestor "$PIN_SHA" origin/cael/20260510/runtime-573-plus-633
```

Expected from current state: fails until lineage is reconciled, because the target branch does not currently include `v2026.5.7` peeled SHA `eeef4864494f859838fec1586bedbab1f8fa5702`. 5. Dispatch `deploy-gateway.yml` per §2.2 only after the ancestor-check question is resolved; use `ref=cael/20260510/runtime-573-plus-633` if that branch is the intended deploy ref. 6. Watch elliott-seat for V8-OOM cadence drop and surface the runtime observation to channel. This workorder did not touch elliott runtime state.

## §2.4 Findings + uncertainties

- Clean cherry-pick is confirmed for the PR #642 squash/merge commit `7afc8dc10b0ad6c6f31ccbfb95c1510e432e6e02`; the literal PR branch head `ffd387c172afea4625a73219c577d27436744d27` conflicts because it is an incomplete final commit, not the full PR.
- The deploy-gateway ancestor gate is the main blocker/decision point. Current `vars.COHORT_TARGET_TAG` is `v2026.5.7` (`eeef4864494f859838fec1586bedbab1f8fa5702`), and current `origin/cael/20260510/runtime-573-plus-633` fails the required ancestor check. A byte-only cherry-pick will not fix that lineage failure.
- I could not verify runtime state on elliott-seat: no deploy was dispatched, no live gateway path was touched, and V8-OOM cadence requires post-deploy observation on elliott.
- Assumption for figs to validate: PR #642's GitHub squash/merge commit is the desired deploy substrate because it carries all four PR branch commits as one clean commit. If figs instead wants branch-history replay, replay the four PR commits in order, not only `ffd387c172afea4625a73219c577d27436744d27`.
- Different approach suggested by evidence: if deploy-gateway must pass without bypass, prepare a deploy ref whose ancestry includes `v2026.5.7` first, then apply the runtime-branch changes / PR #642 fix onto that ref. Directly cherry-picking #642 onto the current target branch prepares bytes but not deploy-gate ancestry.
