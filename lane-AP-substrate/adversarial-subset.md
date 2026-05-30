# Adversarial Subset — files where the lane decision DIVERGES from a reference (§A3 / v2 §6)

> Lane: alt-path careful-apply (cael opus-4-8). Each row blob-receipted. "Divergence IS the discovery; investigate before discounting" (TOOLS.md hygiene).

The alt-path candidate `5d127388df` is ~99% byte-complete vs PR-head on the 110 feature-additions. Divergence is concentrated in **8 files**: 1 absent + 6 contested-compaction + 1 present-but-different. These are the cohort-adjudication surface.

## A. Architecture-divergence (1 file) — benign, cohort-confirm

| File                                                  | Shape                                                                                                                                                                                                                                           | Routing                                                                                                                                                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/auto-reply/reply/skill-tool-dispatch.runtime.ts` | PRESENT in PR-head; ABSENT in both candidates' newer-upstream bases. Upstream refactored `auto-reply/reply` dispatch into the `dispatch-acp-*` family (10+ files present in `5d127388df`). PR-head's file was superseded by upstream evolution. | **cohort-decision**: does the feature still need this seam under the new upstream dispatch architecture, or is its responsibility now carried by `dispatch-acp-*`? Default: omit (follow upstream). Not a regression. |

## B. Contested compaction files (6) — careful-apply merge resolutions

Resolution matrix (short blob hashes; alt=`5d127388df`, pathd=`bd328fadd6`):

| File (basename)                    | PR-head  | upstream | alt-path      | path-d       | class                |
| ---------------------------------- | -------- | -------- | ------------- | ------------ | -------------------- |
| compaction-safeguard.ts            | 4b997799 | 20d8b208 | **b158fe05**  | **b158fe05** | **CONVERGE** ✅      |
| compact.hooks.harness.ts           | 9d657dfb | fd4dcc0a | **01f07792**  | **01f07792** | **CONVERGE** ✅      |
| compact.types.ts                   | 21dd6b2c | eb6df209 | **97b89100**  | **97b89100** | **CONVERGE** ✅      |
| compaction-runtime-context.test.ts | 3aba9673 | 7051e06c | `7051e06c`=UP | 1cc6b4c6     | **alt==upstream** ⚠️ |
| compact.queued.ts                  | 272daf1e | 0e6387b9 | `0e6387b9`=UP | 75f48ac2     | **alt==upstream** ⚠️ |
| compact.ts                         | 032c2f96 | 9ce08670 | 6b8f5c4d      | 67d0e095     | **all-4-differ** ❓  |

### B.1 — CONVERGE (3 files) — high-confidence, MECHANICAL

`compaction-safeguard.ts`, `compact.hooks.harness.ts`, `compact.types.ts`: alt-path and path-d **independently produced byte-identical resolutions**, distinct from both upstream and frozen-PR-head. Two methodologically-distinct lanes converging on the same bytes ⇒ high confidence this is the correct feature+upstream merge (v2 §9 convergence-as-independent-confirmation). **Recommend: adopt the converged resolution.** Routing: none (cohort spot-cosign optional).

### B.2 — alt==upstream (2 files) — ⚠️ THE REAL RISK SURFACE, SUBSTANTIVE

`compaction-runtime-context.test.ts`, `compact.queued.ts`: alt-path carries **pure current-upstream bytes** (alt blob == upstream blob), while path-d holds a **distinct** version. Two readings (§A4.2 two-narrative):

- **Benign**: upstream's version already subsumes the feature's intent (forward-refactor-superset); alt-path correctly absorbed it. Then path-d's divergent version is the stale one.
- **Regression**: alt-path's careful-apply **reverted-to-upstream and dropped feature edits** that PR-head/path-d carry (MIXED-CLOBBER on a feature-adjacent file). Then alt-path is the one that lost content.

These two files are the **highest-value cohort byte-walk targets** of the whole comparison — the only place a genuine alt-path feature-drop could hide. Routing: **prince-RFC byte-walk** of upstream-vs-PRhead-vs-pathd for each, deciding whether upstream subsumes the feature edit. Do NOT auto-adopt.

### B.3 — all-4-differ (1 file) — SUBSTANTIVE

`compact.ts`: PR-head, upstream, alt-path, path-d each distinct. Both lanes resolved the feature×upstream overlap differently and neither matched upstream or PR-head. Routing: **prince-RFC** 3-way (PR-head feature intent vs upstream evolution) to pick/synthesize the resolution. Highest-traffic compaction core file → walk first.

## C. Headline reference divergence — cohort coverage number

The cohort substrate (v3-addendum §A1, tracking-runbook §0) attributes **"50/87 = 57% coverage, 37-file feature-regression gap"** to `5d127388df`. This lane's blob-level measurement finds **109/110 feature-additions present (108 byte-identical to PR-head), 1 absent** — i.e. ~99%, NOT 57%; no 37-file gap reproducible. The two cohort docs even disagree on whether `5d127388df` is "remote-published" (§A1) or "cael-LOCAL only" (tracking §0).

**Reconciliation hypotheses (flagged for figs/cohort adjudication — not asserted as verdict):**

1. The "57%" measured byte-identity-to-frozen-PR-head across a surface that includes shared/drifted files, where alt-path legitimately carries newer-upstream content (penalizing it for being upstream-correct). Under THIS lane's definition (feature-addition presence) coverage is ~99%.
2. The "37-gap" predates a gap-fill or force-with-lease re-push that moved the `5d127388df` ref to its current (gap-closed) state.

Either way: **the locally-pinned `5d127388df` does NOT exhibit a 37-file regression gap at the blob level.** This is the single most consequential output of the lane and should gate cohort step-4 (cross-walk) and step-6 (Path-D gap-fill) before further gap-fill work is dispatched against a gap that may no longer exist.
