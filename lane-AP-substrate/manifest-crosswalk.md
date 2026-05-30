# Manifest + Count-Reconciliation Crosswalk — Alt-path lane (cael opus-4-8)

> Lane: `frond-scribe-claude/20260530/alt-path-opus48-overnight-lane` · Method: careful-apply-to-naive-ancestor (v3-addendum §A2)
> Generated: 2026-05-30. All numbers blob-receipted (`git rev-parse --verify`, `drift-cure-gate.sh`), not asserted.

## Reference frames (pinned, canon §8.12 immutable)

| Frame              | SHA                                        | Role                                                                                                   |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| ANCESTOR / PRC     | `b474f429ee`                               | naive ancestor == PR-creation base (merge-base(fc337,upstream) IS b474; PR is pure frozen delta on it) |
| PR-head N+7        | `fc337f05d6`                               | working-feature-floor, 97.3% test-pass; the byte-reference                                             |
| upstream/main      | `4291e3277720b265720671fcc3ab20587c220d11` | rebase target (re-fetched, pinned)                                                                     |
| alt-path candidate | `5d127388df`                               | cael prior-seat (copilot gpt-5.5) = b352cb2d8e + 8 continuation commits                                |
| path-d substrate   | `bd328fadd6`                               | silas (572-file blind-am) = e9dee8dfe1 + 1 commit                                                      |

## Gate-2.7 census of the full reviewer-visible PR delta (b474..fc337f05d6 = 583 files)

Run: `drift-cure-gate.sh upstream/main fc337f05d6 b474f429ee` (HIST_CAP=200), at upstream `4291e32777`.

| Class         | Count   | Meaning                                                                     |
| ------------- | ------- | --------------------------------------------------------------------------- |
| SAFE-NEW      | **110** | pure feature additions (absent from upstream)                               |
| FROZEN-STALE  | **123** | HEAD == a _historical_ upstream blob → pure clobber (Gate-2.7 FAIL surface) |
| MIXED-CLOBBER | **143** | genuine edits but drop post-fork upstream lines (ranked triage)             |
| GENUINE       | **207** | real feature content, no detectable upstream drop                           |
| **Total**     | **583** | ✓                                                                           |

### Crosswalk to cohort/workorder partitions (v2 §0.1.1 reconciliation, the Phase-1 exit blocker)

| Cohort figure                   | Source                                         | My at-dispatch measurement                      | Verdict                                                                                                                                   |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A = SAFE-NEW = 110              | v2 §2.2                                        | **110**                                         | ✅ EXACT match                                                                                                                            |
| FROZEN-STALE = 123 (112+11)     | v2 §0.1                                        | **123**                                         | ✅ EXACT match (Layer B is baseline-free → stable across upstream advance)                                                                |
| MIXED-CLOBBER ≈ 178 / 253       | v2 §0.1 (D=178) / gates-runbook playbook (253) | **143**                                         | ⚠️ DRIFT — Layer C is upstream-HEAD-dependent; recomputed at current upstream. Surfaced, not absorbed.                                    |
| 42 `no-prcreate-base`           | v2 §0.1                                        | **0 (N/A)**                                     | PRC == ancestor b474 (no intervening merges) ⇒ the indeterminate class does not arise this lane; §3.A/§3.B split collapses to §3.A.       |
| 278 "cure-region (18 patterns)" | v2 §0.1.1 orphan                               | **278**                                         | ✅ reconciled = primitive-cores.txt (18 entries) expanded via `git ls-tree -r fc337` (dominated by 261-file `embedded-agent-runner/` dir) |
| "87 continuation files"         | v3-addendum §A1                                | **93** (continuation-pattern files in PR delta) | ≈ match; my 93 is a slightly broader reproducible regex set than the cohort's hand-curated 87 (honest deviation).                         |

**MIXED re-baseline note:** FROZEN-STALE matching exactly (123) validates the gate run; the MIXED delta (143 vs prior 253) is the expected Layer-C drift as upstream advanced from the cohort's earlier measurement to `4291e32777`. Per gates-runbook "Workorder dispatch discipline" canon, the at-dispatch number (143) is authoritative for this cycle.

## Feature-surface coverage matrix (the comparison-engine substrate, §A3)

Universe = 110 SAFE-NEW feature-additions (the pure-feature surface; cleanest coverage denominator). Disposition = blob-equality vs PR-head `fc337f05d6`.

| Candidate             | PRESENT | byte-IDENT to PR-head | ABSENT | coverage                                 |
| --------------------- | ------- | --------------------- | ------ | ---------------------------------------- |
| alt-path `5d127388df` | 109     | 108                   | **1**  | **99.1% present / 98.2% byte-identical** |
| path-d `bd328fadd6`   | 109     | 109                   | **1**  | **99.1% present / 99.1% byte-identical** |

**This overturns the cohort headline "alt-path = 50/87 = 57% coverage, 37-file regression gap."** At blob level the alt-path candidate is ~99% feature-complete with a single absent file. See `adversarial-subset.md` for the divergence analysis and reconciliation hypothesis, and `cure-decisions.tsv` for per-file dispositions.

## The single absent file (both candidates)

`src/auto-reply/reply/skill-tool-dispatch.runtime.ts` — PRESENT in PR-head, ABSENT in both candidates' newer-upstream bases. Newer upstream refactored `auto-reply/reply` dispatch into the `dispatch-acp-*` family; PR-head's file was architecturally superseded. Careful-apply correctly omitted it. Class: **ARCHITECTURE-DIVERGENCE** (benign), not a regression. Cohort-decision recommended on whether the feature still needs that seam under the new upstream dispatch architecture.
