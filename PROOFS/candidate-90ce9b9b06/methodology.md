# Methodology — n8-cure-laneB candidate 90ce9b9b06

## Lane parameters

- **Lane**: n8-cure-laneB (paired with Lane A; cohort-comparison-as-engine)
- **Model**: claude-opus-4-7
- **Effort**: `xhigh` (fallback from `ultracode` — see "Deviation from workorder" below)
- **Worktree**: `/tmp/n8-cure-laneB/openclaw` on `cael.dandelion.cult`
- **Branch**: `n8-cure-laneB-candidate` → pushed as `n8-cure-laneB/20260529-candidate-90ce9b9b`
- **Candidate SHA**: `90ce9b9b06`
- **Base (N+7)**: `fc337f05d6`
- **PRCREATE (N+0)**: `0831fb5e80`
- **Upstream tip at run-time**: `69c3b56bde` (fix: stabilize codex supervisor session listing)

## Phase-by-phase approach

### §0 Substrate inventory

1. Fetched `upstream/main` and ran `tools/drift-cure-gate.sh upstream/main fc337f05d6 0831fb5e80 ./gate-baseline-n7/` from worktree.
2. Baseline counts: 123 FROZEN-STALE / 266 MIXED-CLOBBER / 84 GENUINE / 110 SAFE-NEW = 583 reviewer-visible files (+10 FROZEN-STALE vs workorder snapshot due to upstream advancement).
3. Enumerated 222 savegame-class branches on origin via `git ls-remote`; curated 24 load-bearing refs into `refs/sg/*`.

### §1 Per-FROZEN-STALE classification

1. For each of 123 FROZEN-STALE files, grep'd content of file at each of 24 savegame refs with a 20-keyword feature-overlay regex (workorder §1.1 vocabulary).
2. Hit ≥1 savegame → 11 candidates flagged CANDIDATE-FEATURE-OVERLAY-LOSS.
3. **Refinement step (not in workorder; banked as methodology improvement)**: cross-check each candidate against upstream/main + blob-comparison:
   - All 11 candidates also have the keyword in current upstream/main (keyword set has bled upstream over time).
   - Savegame blob hashes either match HEAD (2/11) or are themselves historical upstream blobs (9/11).
   - **Verdict**: 0/11 carry non-upstream feature overlay. All 11 reclassified UPSTREAM-EVOLUTION-MISS.
4. Final classification: **123/123 FROZEN-STALE → mechanical restore from `upstream/main`** (Layer B zero-false-positive guarantee).

### §2 MIXED-CLOBBER triage

1. For each of 266 MIXED-CLOBBER files (sorted top-down by `dropped_lines`):
   - 3-way merge: base=`0831fb5e80`, ours=`fc337f05d6`, theirs=`upstream/main` via `git merge-file --diff3`.
2. Outcomes:
   - **71 MERGE-CLEAN** (auto-resolved) → accepted.
   - **19 MERGE-UNION-i18n** (locale files; re-merged with `--union` to keep both additive sides) → accepted. Pattern: upstream's "workboard" feature additions + our PR's execApproval status / quickSettings additions are non-overlapping; union is semantically correct for translation tables.
   - **134 MERGE-CONFLICTS-KEEP-OURS** (textual conflicts) → reverted to `fc337f05d6`; **flagged for cohort byte-walk**.
   - **42 SKIP-NO-BASE** (file absent at PRCREATE, added by our PR after fork) → no 3-way merge base; kept ours; **flagged for cohort byte-walk per-file**.

### §3 Decision table

- `cure-decisions.tsv` in this directory: 389 rows (123 FROZEN-STALE + 266 MIXED-CLOBBER), columns per workorder Phase 3.

### §4 Apply remediations

- 123 FROZEN-STALE: `git checkout upstream/main -- <file>` (mechanical).
- 71 + 19 MIXED files: 3-way merged content written to working tree, staged.
- 134 + 42 MIXED files: no change; flagged in decision-table.
- Single amended commit on `n8-cure-laneB-candidate` (off `fc337f05d6`):
  - Author: `karmafeast` (preserved from N+7)
  - Committer: `karmafeast` (per workorder Phase 4)
  - Message: preserved from N+7 verbatim (Co-authored-by trailers including scribe-class + Claude Opus 4.7 retained)
  - SHA: `90ce9b9b06`
  - 212 files changed, +6567/-2316.

### §5 Drift-cure-gate verify

- Re-ran `tools/drift-cure-gate.sh upstream/main HEAD 0831fb5e80 ./gate-output-n8/` against `90ce9b9b06`.
- Result: **FROZEN-STALE = 0 ✓**; MIXED-CLOBBER reduced 266→178; GENUINE +23; SAFE-CURRENT 0→18; Gate 2.7 **PASS**.

### §6 Gate 2 feature-byte-identity

- Continuation feature TOOL surface (`src/agents/embedded-agent-runner/`, `src/agents/openclaw-tools.ts`, `src/commands/continuation*`): **0 diff ✓**.
- `src/cli/program/preaction.ts`: +1 line (3-way merge picked up upstream's `skipConfigGuard` config-guard adoption; not feature regression).
- `ui/src/ui/usage-helpers.ts`: +6/-2 lines (codex review comment 4524413167 finding #4: usage filter strictness regex restored; this IS the cure target, not damage).

### §7 PROOFS corpus + STATUS

- This directory: `gates/`, `cure-decisions.tsv`, `savegame-walk.md`, `methodology.md`.
- STATUS.md at `/tmp/n8-cure-laneB/STATUS.md`.

## Deviation from workorder

### `/effort ultracode` rejected at session-start

The workorder's Lane-B framing leans heavily on the dynamic-workflows feature enabled by `/effort ultracode`. At session-start the harness rejected `/effort ultracode` with:

> Ultracode needs dynamic workflows enabled (see /config) and an xhigh-capable model.

Per dispatcher instruction, fell back to `xhigh`. **Dynamic-workflows substrate is unavailable for this lane**. Multi-pass savegame-comb was implemented as sequential per-file scripts (`classify-frozen-stale.sh`, `merge-mixed-clobber.sh`) rather than dynamic-workflows discovery loops.

Impact: per-file analysis depth on the 134 cohort-byte-walk-flagged conflicts is shallow (single 3-way merge attempt, no per-hunk dynamic exploration). A real dynamic-workflows pass would likely auto-resolve a fraction of these via per-hunk discrimination. Lane-A/Lane-B comparison surface at the decision-table layer remains meaningful; per-file conflict resolution depth is the load-bearing axis where the ultracode capability would have differentiated.

### Methodology refinement: blob-cross-check on keyword candidates

The workorder's §1.1 specifies `git log -S '<feature-mechanism>' -- <file>` as the discriminator. Naive application of this against the 24 curated savegames produced 11 candidates, but blob-comparison + upstream-history-walk showed all 11 were false positives (feature-vocabulary keywords have bled into upstream/main over time; their presence in a savegame is not exclusive feature-overlay evidence).

This refinement is not a §7 design-break — Layer B remains zero-false-positive, and the refinement strengthens rather than contradicts the workorder methodology. Banked as candidate for workorder v3 refinement.

### Workorder Phase 6 surface list interpretation

Phase 6's `git diff` example surface includes `ui/src/ui/usage-helpers.ts`, which is in the FROZEN-STALE class and the codex review explicitly named as a regression-to-restore. Strictly interpreted, Phase 6's "zero diff" cannot be satisfied while Phase 1.3 mandates restoration of FROZEN-STALE files. Pragmatic resolution: Gate 2 verified on the CONTINUATION FEATURE TOOL surface (embedded-agent-runner/, openclaw-tools.ts, commands/continuation\*), where 0-diff holds.

## Items flagged for cohort byte-walk

- **134 MIXED-CLOBBER files** with textual conflicts on 3-way merge: per-hunk discrimination required.
- **42 MIXED-CLOBBER SKIP-NO-BASE files**: file added by our PR; no 3-way merge possible without manual base inference.
- Lane-A divergence points: pending cohort comparison post-Lane-A completion.

Per workorder §7 design-break protocol, these are NOT design-breaks (the workorder explicitly authorizes "Mark for cohort byte-walk (the file's history is too tangled for automated judgment — explicitly flag for human review in your decision-table)").

## Verification commands (reproducibility)

```bash
cd /tmp/n8-cure-laneB/openclaw
git checkout n8-cure-laneB-candidate    # at 90ce9b9b06
git diff fc337f05d6 HEAD --shortstat    # 212 files, +6567/-2316
tools/drift-cure-gate.sh upstream/main HEAD 0831fb5e80 ./reproduce-gate/
awk -F'\t' 'NR>1 && $1=="FROZEN-STALE"' ./reproduce-gate/classification.tsv | wc -l
# expected: 0
```
