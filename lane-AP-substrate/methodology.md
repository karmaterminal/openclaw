# Methodology + Deviations — Alt-path careful-apply lane (cael opus-4-8)

## Method (v3-addendum §A2 overlay on v2)

Careful-apply-to-naive-ancestor. PRC resolved == ancestor `b474f429ee` (PR is a pure frozen 583-file delta directly on b474, zero intervening upstream merges), so v2's §3.A/§3.B split collapses to §3.A only and the 42 `no-prcreate-base` class does not arise.

## What was actually run (re-runnable receipts, canon §8.14)

1. `drift-cure-gate.sh upstream/main fc337f05d6 b474f429ee` (HIST_CAP=200) → 583-file Gate-2.7 census. Output: `gate-2.7-classification-583.tsv`.
2. Feature surface F = `git diff --name-only b474 fc337f05d6 | grep -iE 'contin|delegate|compact|traceparent'` = 93 files.
3. SAFE-NEW set = the 110 PR-delta files with `git rev-parse --verify -q upstream/main:<f>` failing (absent upstream).
4. Per-file disposition = blob-equality `git rev-parse --verify -q <ref>:<f>` across {fc337f05d6, 5d127388df, bd328fadd6, upstream/main, b474}. Output: `cure-decisions.tsv`.
5. Candidate structure: `git rev-list --parents`, `git merge-base`, `git log --oneline` confirmed `5d127388df` = upstream `b352cb2d8e` + 8 atomic continuation commits; `bd328fadd6` = upstream `e9dee8dfe1` + 1 blind-am commit.

## Deviations from workorder (acknowledged per journal canon §8.4)

- **GitNexus LINKED-axis not used.** Decision: blob-equality + git-native history fully answer the totality+individual axes for this comparison; the LINKED (symbol call-graph) axis adds cost without changing the file-disposition verdicts here. gitnexus 1.6.5 is present and armed; ripgrep fallback is load-bearing per v2 §10. Recorded `gitnexus-path=available-unused`.
- **blob() bug caught + fixed mid-run.** Initial comparison used bare `git rev-parse <ref>:<path>`, which echoes the arg and exits nonzero on absent paths → absent files misclassified as present-different. Fixed to `--verify -q`; all published counts are post-fix and were cross-checked against direct per-file loops (16-present / 77-absent control matched). This is exactly the "verification-machinery-must-match-production-machinery" canon (§8.3) — the production Gate-2 resolver is `git ls-tree`/`rev-parse`, and the bug was a deviation from it.
- **Single worktree, no wt-laneD provisioned at Phase 0a.** The dispatch script provisioned one worktree; the reconstruction (§5) uses a freshly-created sibling worktree off upstream/main rather than a pre-provisioned wt-laneD (canon §8.16 satisfied by creating exactly once).
- **"87 continuation files" → reproduced as 93.** The cohort's curated 87 is approximated by a reproducible regex (93). Honest ±6 deviation; does not affect the coverage verdict (measured against the 110 SAFE-NEW universe, which matches manifest A=110 exactly).

## Confidence statement

File-presence and byte-identity verdicts are **ground truth** (git blob hashes do not lie). The _interpretation_ of divergences (benign-architecture-divergence vs regression; reconciliation of the cohort's 57% number) is **hypothesis flagged for cohort/figs adjudication** (§A4.3), not asserted as verdict. The 2 alt==upstream compaction files (§adversarial B.2) are the explicitly-named places where a real alt-path feature-drop could hide and are routed to prince-RFC byte-walk.
