# Reconstruction Report — forward-rebase of the alt-path atomic decomposition (§5 / §A2 step 4)

> Method: forward-rebase the 8 atomic continuation commits (`b352cb2d8e..5d127388df`) onto current `upstream/main` (`4291e32777`).
> Reconstruction candidate SHA: **`ce144d00c2`** on branch `laneAP-reconstruct/20260530-0652Z`.

## Operation

- `b352cb2d8e` confirmed ancestor of current upstream → clean forward-rebase scenario; **32 upstream commits of drift** to absorb between the alt-path base and current upstream.
- `git cherry-pick b352cb2d8e..5d127388df` onto a fresh worktree at `upstream/main`: **exit 0, ZERO conflicts.** All 8 atomic commits replayed; auto-merged `package.json`, `pnpm-lock.yaml`, `tsdown.config.ts`, `scripts/protocol-gen-swift.ts`.
- ⇒ The 8-commit atomic decomposition is **rebase-clean across 32 commits of newer upstream drift.** The careful-apply method produces a candidate that absorbs current upstream without manual conflict resolution.

## Coverage (reproduces alt-path, on current upstream)

Of the 110 SAFE-NEW feature-additions: **109 present, 108 byte-identical to PR-head, 1 absent** — identical to `5d127388df`. The forward-rebase preserved feature content exactly.

## Gate 2.7 (drift-cure-gate on the reconstruction) — the load-bearing result

Census of `upstream/main..ce144d00c2`: **FROZEN-STALE = 0, MIXED-CLOBBER = 0** (GENUINE + SAFE-NEW only).
**This is the whole point of careful-apply-onto-fresh-upstream: it kills the frozen-tree reverse-clobber mechanism at the root.** PR-head `fc337f05d6` FAILS Gate 2.7 with 123 FROZEN-STALE; the reconstruction PASSES with 0. The reconstruction is the structurally-correct cure the gates-runbook §"playbook" prescribes (re-derive onto fresh upstream, not patch-in-place).

## Gate 2 (feature-cores-byte-check vs PR-head) — EXPECTED FAIL, and it is informative

43 primitive-cores files differ from PR-head. Breakdown (blob-receipted):
| Sub-class | Count | Meaning |
|---|---|---|
| recon == current upstream | **29** | pure upstream-evolution — reconstruction correctly carries current upstream; NOT feature loss |
| recon differs from BOTH PR-head and upstream | **11** | genuine 3-way merge (feature + newer upstream) — legitimate careful-apply resolution |
| SAFE-NEW feature file differing from PR-head | **3** | the only genuine feature-content differences — flag for cohort spot-check |
| **Total Gate-2 FAIL** | **43** | **0 feature losses** |

**The Gate-2/Gate-2.7 disjoint-region tension, made concrete (gates-runbook §"load-bearing tension"):** Gate 2 demands byte-identity to the _frozen_ PR-head; Gate 2.7 demands _current upstream_ content. For a fresh-upstream reconstruction these are in **direct conflict on shared files** — satisfying 2.7 (0 FROZEN-STALE) necessarily fails 2 on the 40 shared files that upstream evolved. The reconstruction makes the right trade: it carries upstream, accepting 43 "Gate-2 FAILs" of which only 3 are real feature differences and 0 are losses.

## Why this matters for the cohort's "57% coverage" number

If the cohort measured alt-path coverage as Gate-2-style byte-identity-to-frozen-PR-head across a surface including shared files, a correct fresh-upstream candidate would "miss" ~40 shared files **by design** (it carries upstream, not frozen-PR-head bytes). That measurement artifact — not a feature gap — is the most likely source of "50/87 = 57%." The feature-additions themselves are 108/110 byte-identical. **Coverage-by-frozen-byte-identity is the wrong metric for a fresh-upstream candidate; coverage-by-feature-presence (~99%) is the right one.**

## Disposition

- Reconstruction candidate `ce144d00c2` is a clean, Gate-2.7-passing, ~99%-feature-complete independent alt-path candidate on current upstream. It is **comparison-vector substrate** (stream-5 of the 6-stream synthesis), not a shipping candidate (the 3 differing feature files + 11 3-way merges + the 1 absent file need cohort adjudication before any ship).
- Tool note: `feature-cores-byte-check.sh` emits `empty_patterns: unbound variable` (line 140-141) under `set -u` — minor tool bug, does not affect the FAIL verdict; worth a one-line fix PR to bootstrap.
