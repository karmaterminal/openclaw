# STATUS — Alt-path careful-apply overnight lane (cael opus-4-8)

**Lane:** `frond-scribe-claude/20260530/alt-path-opus48-overnight-lane` · **Issue:** karmaterminal/openclaw#805
**Overall status:** ANALYSIS-COMPLETE (primary output delivered); reconstruction (§5) attempted as bounded secondary.
**budget_min=444**

## RESOLVED-STATE (canon §8.15 — idempotent resume)

```
ANCESTOR/PRC  = b474f429ee4bb584ba259ee148db1c2a6b578d16   (PRC == ancestor)
PRHEAD        = fc337f05d6   (working-feature-floor, 97.3% test-pass)
UPSTREAM_HEAD = 4291e3277720b265720671fcc3ab20587c220d11   (pinned)
REF_ALTPATH   = 5d127388df   (= upstream b352cb2d8e + 8 atomic continuation commits)
REF_PATHD     = bd328fadd6   (= upstream e9dee8dfe1 + 1 blind-am commit)
WORK_BRANCH   = frond-scribe-claude/20260530/alt-path-opus48-overnight-lane
DELIVERABLES  = lane-AP-substrate/{cure-decisions.tsv, gate-2.7-classification-583.tsv, manifest-crosswalk.md, adversarial-subset.md, methodology.md, STATUS.md}
GITNEXUS      = available-unused (ripgrep/git-native sufficed)
```

## Per-§ ledger

| §   | Phase                             | Status         | Key output                                                                                                                                                                                       |
| --- | --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §0  | Substrate-currency + readback     | COMPLETE       | PRC==b474 resolved; upstream pinned; 4 refs verified; RESOLVED-STATE                                                                                                                             |
| §1  | Feature manifest + reconciliation | COMPLETE       | 583-census; A=110✓ FROZEN=123✓ MIXED=143(re-baseline) GENUINE=207; crosswalk                                                                                                                     |
| §2  | Per-file multi-SHA classification | COMPLETE       | cure-decisions.tsv (93-F) + 110-SAFE-NEW coverage matrix                                                                                                                                         |
| §3  | Savegame comparison               | SKIPPED        | Not load-bearing: PRC==ancestor means no marathon-frozen-base ambiguity; the two candidate refs already provide the historical-state comparison the savegame would. Recorded as deliberate skip. |
| §5  | Reconstruction (careful-apply)    | see journal §4 | bounded forward-rebase of the 8 atomic commits onto current upstream/main                                                                                                                        |
| §6  | Adversarial subset                | COMPLETE       | adversarial-subset.md (8 divergent files, risk-classified)                                                                                                                                       |

## Headline results (blob-receipted)

- alt-path `5d127388df` coverage vs PR-head on 110 feature-additions: **109 present / 108 byte-identical / 1 absent (~99%)** — **NOT the cohort's 50/87=57% / 37-gap**.
- path-d `bd328fadd6`: 109 present / 109 byte-identical / 1 absent.
- Divergence = 1 architecture-superseded file + 6 contested-compaction files (3 alt/pathd CONVERGE, 2 alt==upstream RISK, 1 all-differ).

## cohort-action-list (route to cohort/figs)

1. **[HIGH] Re-validate the "37-file gap" premise.** This lane cannot reproduce it at blob level against `5d127388df`. Gate cohort step-6 (Path-D gap-fill) on confirming the gap still exists before dispatching gap-fill work. Adjudicator: figs / prince-class.
2. **[HIGH] Byte-walk the 2 alt==upstream compaction files** (`compaction-runtime-context.test.ts`, `compact.queued.ts`): forward-refactor-superset (benign) vs alt-path feature-drop (regression)? Adjudicator: prince-RFC.
3. **[MED] 3-way resolve `compact.ts`** (all four refs differ). Adjudicator: prince-RFC.
4. **[MED] Decide `skill-tool-dispatch.runtime.ts`** — does the feature still need this seam under upstream's `dispatch-acp-*` refactor? Adjudicator: cohort-decision.
5. **[LOW] Adopt the 3 CONVERGE compaction resolutions** (alt==pathd, two-lane independent confirmation).

## Comparison-engine surface (v2 §9 / §A3)

This lane's cure-decisions.tsv + census provide stream-5 (alt-path opus-4-8) of the 6-stream synthesis. Convergence with path-d on 3/6 contested files = independent confirmation; divergence on the 2 alt==upstream files = the decisions surfaced for prince+RFC adjudication.
