# SCOUT REPORT — v2026.5.4 → v2026.5.5 rebase retarget

**Source**: `frond-scribe/20260505/v2026.5.4-rebase` HEAD `993101f2421a` (the lich-protocol continuation feature, squashed onto v2026.5.4)
**Old base**: `v2026.5.4` (`8ff102150f`)
**New base**: `v2026.5.5` (`b1abf9d8ae`)
**Commits in window**: 54 upstream commits (325 files, +9293/-1100)
**Recomposed candidate**: `cael/20260506/v2026.5.5-rebase-candidate` HEAD `63cac11e96cb`
**Run timestamp**: 2026-05-06T15:25-07:00 (PDT)
**Driver**: cael (subagent dispatched from cael-host)

## Verdict

**Easy retarget.** Single mechanical conflict, all v5.4-scout judgment-seams stable across v5.4→v5.5. The continuation feature squash applies cleanly to v2026.5.5 with one regenerated baseline file.

This is dramatically simpler than the v5.3→v5.4 retarget (which had 6 judgment-seams, 119 mechanical plugin-package conflicts, and required 3-way merges on `diagnostic.ts`, `run.ts`, `attempt.ts`, `openclaw-tools.ts`, and `agent-runner.ts`). v5.5 changes left those load-bearing files untouched.

## Conflict ledger (empirical, full cherry-pick)

| file                                                | classification     | size | resolution                                                                                  |
| --------------------------------------------------- | ------------------ | ---: | ------------------------------------------------------------------------------------------- |
| `docs/.generated/plugin-sdk-api-baseline.sha256`    | mechanical / regen | 2 lines | Took v2026.5.5 HEAD values pending `pnpm plugin-sdk:api:gen` regen post-merge. **TODO follow-up.** |

That is the only conflict. Every other file in the 312-file feature payload auto-merged.

## v5.4-scout judgment-seams: stability check across v5.4→v5.5

| file                                                | v5.4..v5.5 commits | result                                |
| --------------------------------------------------- | -----------------: | ------------------------------------- |
| `src/logging/diagnostic.ts`                         |                  0 | stable, no re-conflict risk           |
| `src/logging/diagnostic.test.ts`                    |                  0 | stable                                |
| `src/agents/openclaw-tools.ts`                      |                  0 | stable                                |
| `src/agents/pi-embedded-runner/run.ts`              |                  0 | stable                                |
| `src/agents/pi-embedded-runner/run/attempt.ts`      |                  0 | stable                                |
| `src/agents/pi-embedded-runner/post-compaction-loop-guard.ts` | 0       | stable (v5.4 guard intact, no churn)  |
| `src/auto-reply/reply/agent-runner.ts`              |                  0 | stable                                |
| `src/auto-reply/reply/agent-runner-execution.ts`    |                  1 | auto-merged cleanly; spot-check after | 
| `src/auto-reply/reply/get-reply-run.ts`             |                  0 | stable                                |
| `src/auto-reply/types.ts`                           |                  0 | stable                                |
| `src/agents/tools/continue-delegate-tool.ts`        |                  0 | feature-owned, no upstream drift      |
| `src/agents/tools/request-compaction-tool.ts`       |                  0 | feature-owned, no upstream drift      |
| `CHANGELOG.md`                                      |                 29 | auto-merged (release-bump entries)    |
| `package.json`                                      |                  7 | auto-merged (version bumps)           |
| `docs/.generated/config-baseline.sha256`            |                  0 | stable; no regen needed (was changed in v5.4 only) |
| `docs/.generated/plugin-sdk-api-baseline.sha256`    |                  1 | conflict (above) — regen post-merge   |

Net: **all six load-bearing v5.4 judgment-seams survived v5.5 untouched**. The single auto-merged churn file (`agent-runner-execution.ts`) was already classified "review-required" in v5.4 scout for behavior-walk reasons unrelated to mergeability; that classification carries forward, but the mergeability is clean.

## Upstream v5.4..v5.5 character

54 commits, primarily:
- **Release plumbing** (29 CHANGELOG commits, 7 package.json bumps, beta1/beta2/final tags)
- **Bugfixes**: line/discord/feishu/codex/video/gateway/cli/tui/sessions surface-fixes (~30 fix(...) commits)
- **One feature**: `feat(status): show uptime in chat status` (`1205c9ef1f`) — narrow, status-message scoped, no continuation-substrate touch
- **Security**: `security: harden gateway container privileges` (`eda33431de`) — container-only, no API surface

No new judgment-seams introduced. No new substrate features that overlap continuation-feature surface.

## Recommended drive-shape

The retarget is a one-step mechanical operation:

```bash
# 1. Fresh worktree on v2026.5.5
git worktree add /tmp/oc-v555-canonical/wt -b <branch> v2026.5.5

# 2. Cherry-pick the v5.4-rebase squash
git cherry-pick 993101f242

# 3. Resolve baseline (one of):
#    (a) Take HEAD values, regen later:
git checkout HEAD -- docs/.generated/plugin-sdk-api-baseline.sha256
#    (b) Run regen now (requires pnpm install first):
pnpm install --frozen-lockfile
pnpm plugin-sdk:api:gen
#    Both produce the same long-term state; (a) is faster, (b) is complete.

# 4. Continue cherry-pick (skip oxfmt pre-commit hook if not installed):
git -c core.hooksPath=/dev/null cherry-pick --continue

# 5. Push and update canonical lane
git push origin <branch>
git push origin <branch>:frond/v2026.5.5/canonical    # cohort-cosign required
```

## Branches produced (this scout)

- **`cael/20260506/v2026.5.5-scout-report`** — this report only (docs)
- **`cael/20260506/v2026.5.5-rebase-candidate`** — actual recompose, HEAD `63cac11e96cb`, contains baseline-as-HEAD-values placeholder

## Open follow-ups (not blockers, but required before fleet-deploy)

1. **Regenerate plugin-sdk baseline**: `pnpm install --frozen-lockfile && pnpm plugin-sdk:api:gen`. The placeholder values will likely change; commit the regen as a separate atomic commit on the candidate branch before promoting to canonical.
2. **Spot-check `agent-runner-execution.ts`**: one-commit upstream churn auto-merged but classification was "review-required" in v5.4 scout; reverify behavior holds.
3. **Build verification**: `pnpm build` from the candidate; confirm no TypeScript regressions.
4. **Test verification**: targeted tests on continuation surface (`continue-delegate-tool`, `request-compaction-tool`, `delegate-store`, `agent-runner` continuation paths).
5. **Cohort cosign before promoting to `frond/v2026.5.5/canonical`** — per figs canon, canonical-lane mutations need 4-prince concurrence.

## Provenance

- This scout report branch: `cael/20260506/v2026.5.5-scout-report`
- Recompose candidate branch: `cael/20260506/v2026.5.5-rebase-candidate`
- Source squash: `frond-scribe/20260505/v2026.5.4-rebase` (`993101f242`)
- Predecessor canonical: `frond/v2026.5.4/canonical` (`5b5061e35537`)
- Predecessor scout: `frond-scribe/20260505/v2026.5.4-retarget-scout-report` (`ffa9a7b055`)
- Trigger: cael-seat dispatch from main session, parent task scope: "Prep canonical lane for v2026.5.5 on Cael's seat"
- Worktree: `/tmp/oc-v555-canonical/wt`
- **No live PR branches touched.** `feature/context-pressure-squashed` (PR #38780) untouched per TOOLS.md hazard rule.

## Ancestor verification (figs-canon discipline)

```
v2026.5.5 sha:                                                    b1abf9d8ae4410c6a6e08f7dfd2d617f4550281c
cael/20260506/v2026.5.5-rebase-candidate has v2026.5.5 ancestor:  ✓ (git merge-base --is-ancestor exit 0)
cael/20260506/v2026.5.5-rebase-candidate has v2026.5.4 ancestor:  ✓ (transitively, via the v5.5 base)
```
