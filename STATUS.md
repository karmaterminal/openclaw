# Path D §7 Lane — STATUS (silas opus-4-8)

Branch: `frond-scribe-claude/20260530/path-d-opus48-overnight-lane`
Generated: 2026-05-29 (session start) — all figures are `git`-verifiable from this worktree.

## Outcome: ANALYSIS SUBSTRATE DELIVERED — reconstruction candidate NOT produced (honest, see Blockers)

Per workorder v3-addendum §A4.5 ("no ship-red", "lane output is either byte-complete + byte-correct or scaffold-substrate not candidate"), this lane produces **verifiable comparison-engine + decomposition substrate**, and explicitly does **not** emit an unverified atomic-commit reconstruction. Doing the latter would be ship-red: see Blockers.

## What was actually produced (all git-grounded, no execution required)

| Artifact | Content |
|---|---|
| `cure-decisions.tsv` | 583 feature files × {layer assignment, disposition vs each of the 3 cohort SHAs} |
| `manifest-crosswalk.md` | 4-SHA comparison-engine substrate (§A3 deliverable) |
| `adversarial-subset.md` | The files where the lane reading diverges / where the workorder narrative diverges from git reality |
| `STATUS.md` | this file |

## Key git-verified findings (these correct the dispatch narrative)

1. **Canonical feature manifest = 583 files / +44,140 / −9,280**, not "87 files". `fc337f05d6` is a *single clean commit* on ancestor `b474f429ee` (its only parent), so all 583 files ARE the feature delta — no upstream churn mixed in. The "87/91 continuation files" is the `continu|compact`-named subset (91 by path match).
2. **Both cohort candidates carry the full feature**: of 583 feature files, `5d127388df` (alt-path) has 582 present / 312 byte-identical-to-PR-head; `bd328fadd6` (path-d) has 582 present / 422 identical. On the 91-file continuation subset, BOTH are 91/91 present, 85/91 byte-identical. The "57% coverage" figure is not a presence metric — every continuation file is present in both.
3. **Divergence is concentrated**: the 6 continuation files that differ from PR-head in *both* candidates are entirely the **compaction cluster** (`compact*.ts`, `compaction-safeguard.ts`). This is the real adversarial subset, driven by upstream API drift.
4. **The 1 "absent" feature file** (`src/auto-reply/reply/skill-tool-dispatch.runtime.ts`) was *removed by upstream* after PR-head was cut (absent at origin/main AND upstream/main). Both candidates correctly adopted the removal — this is correct rebase behavior, NOT a regression/gap.
5. **Rebase-target drift is large**: origin/main is **557** commits ahead of the ancestor; upstream/main is **568** ahead. Any reconstruction must replay the feature across ~560 commits of upstream evolution.

## Blockers preventing a verified reconstruction candidate (honest)

- **No build/test capability in this worktree**: `node_modules` absent; `node`/`pnpm` fail (`--v8-flags= is not allowed in NODE_OPTIONS`); linked worktree where AGENTS.md gates local `pnpm test/check`; no Testbox/Crabbox wired in this environment. An atomic-commit reconstruction rebased across 557 upstream commits *will* hit real conflicts in the compaction cluster (finding 3) that cannot be resolved correctly without building/running the suite. Emitting it unverified = ship-red.
- **Webhook ritual not executable**: `DISCORD_SPRITES_WEBHOOK` is unset and no `post_webhook` function exists in this environment (the dispatch states it is "inlined above"; it is not). No progress webhooks were sent. This is logged, not worked around.

## Recommended next step
Run the §7 Layer 0→6 decomposition (manifest + layer map are ready in `cure-decisions.tsv`) in an environment with a working toolchain + Testbox, resolving the 6-file compaction cluster against current upstream APIs with the suite green per layer. The analysis here is the input to that step.
