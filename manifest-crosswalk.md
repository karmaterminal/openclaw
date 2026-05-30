# Manifest Crosswalk — 4-SHA comparison-engine substrate (§A3)

All numbers below are reproducible with `git` from this worktree against the canonical
feature manifest (the 583 files changed by `fc337f05d6` vs ancestor `b474f429ee`).

## Reference SHAs (provenance verified via `git log -1`)

| Ref | SHA | Subject | Author | Parent | Commits since anc | Files vs anc |
|---|---|---|---|---|---|---|
| PR-head (floor) | `fc337f05d6` | feat(continuation): context-pressure-aware continuation | karmafeast | `b474f429ee` (anc) | 1 | 583 (+44140/−9280) |
| Alt-path (cael) | `5d127388df` | chore(continuation): update build/package metadata | cael 🩸 | `d5d8c5113…` | 548 | 2136 (+139536/−25858) |
| Path-D (silas) | `bd328fadd6` | PATH-D-STASHED-SUBSTRATE… | Silas | `e9dee8df…` | 508 | 2180 (+135300/−26265) |
| Rebase target | `origin/main` | (current fork main) | — | — | 557 ahead of anc | — |

> Note: the alt-path and path-d diffstats-vs-ancestor are dominated by ~500 upstream commits
> folded in via rebase, NOT by feature size. The feature-specific delta is the 583-file manifest.

## Coverage of the 583-file feature manifest

| Candidate | present | byte-identical to PR-head | diverged | absent |
|---|---|---|---|---|
| `5d127388df` alt-path | 582 | 312 | 270 | 1 |
| `bd328fadd6` path-d | 582 | 422 | 160 | 1 |

## Coverage of the 91-file continuation subset (`continu|compact` path match)

| Candidate | present | byte-identical | diverged |
|---|---|---|---|
| `5d127388df` | 91 | 85 | 6 |
| `bd328fadd6` | 91 | 85 | 6 |

**Reading**: `bd328fadd6` (path-d) is materially closer to the PR-head across the full manifest
(422 vs 312 identical) — consistent with it being a regression-prevention reference. On the
continuation core, the two candidates are equivalent (85/91 each) and diverge on the *same 6 files*.

## Layer map of the manifest (for §7 Layer 0→6 reconstruction)

| Layer | files | (path heuristic) |
|---|---|---|
| L0-schema | 4 | `*schema*`, `*.sql`, `*.generated.ts` |
| L1-core | 31 | `src/*continu*`, `src/*compact*` |
| L2-plumbing | 215 | other `src/**`, `extensions/**` |
| L3-observability | 30 | `ui/**`, `apps/**` |
| L4-tests | 258 | `*.test.ts`, `*.e2e.test.ts` |
| L5-docs | 10 | `docs/**` |
| L6-config | 35 | manifests, lockfiles, `scripts/**` |

Per-file dispositions in `cure-decisions.tsv`.
