# n8-cure-laneB STATUS

**Status**: PARTIAL — Gate 2.7 PASS achieved (FROZEN-STALE=0); 176 MIXED-CLOBBER files flagged for cohort byte-walk.

**Candidate SHA**: `90ce9b9b06`
**Branch**: `n8-cure-laneB/20260529-candidate-90ce9b9b` (pushed to `karmaterminal/openclaw`)
**Base**: `fc337f05d6` (N+7 PR head)
**Author/Committer**: `karmafeast <karmafeast@gmail.com>` (per workorder Phase 4)
**Commit message**: preserved verbatim from N+7 (Co-authored-by trailers retained)

## Gate results

| Gate                                     | Status          | Detail                                                                                                                                                                                                            |
| ---------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gate 2.7** (drift-cure-gate)           | **PASS** ✓      | FROZEN-STALE: 123→0; MIXED-CLOBBER: 266→178; GENUINE: 84→107; SAFE-NEW: 110→110; SAFE-CURRENT: 0→18                                                                                                               |
| **Gate 2** (feature-byte-identity)       | PASS (semantic) | Continuation TOOL surface (embedded-agent-runner/, openclaw-tools.ts, commands/continuation\*) = 0 diff. preaction.ts +1 (upstream config-guard adoption). usage-helpers.ts +6/-2 (codex finding #4 restoration). |
| **Gate 3** (FULL local gates)            | NOT RUN         | Out of scope for candidate-producer lane; ship driver runs install/tsgo/check/test/prepush.                                                                                                                       |
| **Gate 4** (cohort cosign + readiness)   | NOT RUN         | Out of scope; Lane-A/Lane-B comparison + cohort review precedes this.                                                                                                                                             |
| **Gate 5/6** (figs-sanction, force-push) | OUT OF SCOPE    | READ-ONLY-ABSOLUTE on PR-presentation branch; lane B never advances past Gate 4.                                                                                                                                  |

## Key findings

1. **All 123 FROZEN-STALE files are safe mechanical restores from upstream/main.** Layer B's zero-false-positive guarantee borne out under blob-comparison; keyword-grep produced 11 false positives but blob-checking proved them all to be upstream-historical content (feature-vocabulary keywords have bled into upstream/main over time). The 4 codex-named regressions are within this set; all 3 in FROZEN-STALE class are restored (MacNodeRuntime.swift / controllers/config.ts / usage-helpers.ts), and the 4th (`docs/gateway/configuration-reference.md`) is in MIXED-CLOBBER and was 3-way-merged cleanly.
2. **71 MIXED-CLOBBER files auto-resolved via 3-way merge** with no textual conflicts; accepted.
3. **19 MIXED-CLOBBER i18n locales merged with `--union`** (upstream's workboard.\* keys + our PR's status / quickSettings keys are non-overlapping additive); accepted.
4. **134 MIXED-CLOBBER files** produced textual conflicts on 3-way merge → reverted to ours and flagged for cohort byte-walk (per workorder authorization "Mark for cohort byte-walk").
5. **42 MIXED-CLOBBER files** absent at PRCREATE (added by our PR after fork) → no 3-way base; flagged for cohort byte-walk per file.

## Comparison points for peer-lane (Lane A)

- Lane B candidate-SHA: `90ce9b9b06`. Diff vs `fc337f05d6`: +6567 / -2316 across 212 files.
- Lane B did **not** source any restoration from savegame branches (all 123 FROZEN-STALE remediations came from `upstream/main`). If Lane A sourced some from savegames, that's a divergence point — investigate via the blob-cross-check methodology to determine whose source is correct.
- Lane B handled MIXED-CLOBBER i18n locales via `--union` merge (semantically clean for translation files). If Lane A took a different approach (e.g., per-key manual review or upstream-takeover), compare resulting translation key sets.
- Lane B's 134 "cohort-byte-walk-needed" list is the primary handoff surface — if Lane A resolved fewer/more conflicts, the divergent set is the high-value cohort inspection target.
- Lane B did **not** have `/effort ultracode` available (rejected at session-start; fallback to `xhigh`) — sequential per-file scripts replaced dynamic-workflows. If Lane A had ultracode available, expect Lane A's conflict-resolution depth to exceed Lane B's; if Lane A also fell back to xhigh, the comparison is methodology-symmetric.

## Deviations from workorder

1. **`/effort ultracode` unavailable**: harness rejected `Ultracode needs dynamic workflows enabled (see /config) and an xhigh-capable model`; fell back to xhigh per dispatcher instruction. Banked as load-bearing methodology deviation.
2. **Blob-cross-check refinement on §1.1 keyword candidates**: workorder's naive keyword-grep produced 11 false positives; refined methodology (blob compare + upstream-history walk) showed all 11 are upstream-historical. This is methodology _strengthening_, not a §7 design-break.
3. **Phase 6 surface list interpretation**: usage-helpers.ts and similar files in the example list were independently identified as cure targets (codex finding #4); Gate 2 verified on the continuation TOOL surface where 0-diff holds.

## Artifacts

- **Candidate branch**: `karmaterminal/openclaw:n8-cure-laneB/20260529-candidate-90ce9b9b` at SHA `90ce9b9b06`
- **Journal branch**: `karmaterminal/openclaw:n8-cure-laneB/20260529-claude-opus-47-ultracode` (lane journal + PROOFS to be pushed alongside this STATUS commit)
- **PROOFS corpus** (local at `/tmp/n8-cure-laneB/PROOFS/candidate-90ce9b9b06/`, to be pushed to journal branch under `PROOFS/`):
  - `gates/gate-2.7-drift-cure-gate.txt` — summary
  - `gates/gate-2.7-drift-cure-gate-n8.tsv` — full classification.tsv at candidate
  - `gates/gate-baseline-n7-classification.tsv` — full classification.tsv at baseline
  - `gates/gate-2-feature-byte-identity.txt` — feature-surface diff + interpretation note
  - `cure-decisions.tsv` — 389-row per-file decision-table
  - `savegame-walk.md` — savegame enumeration + per-file walk evidence
  - `methodology.md` — full approach + deviations + verification commands
- **Anchoring issue**: [karmaterminal/openclaw#803](https://github.com/karmaterminal/openclaw/issues/803) — §-checkpoint comments
- **Webhook heartbeats**: `DISCORD_SPRITES_WEBHOOK` (username `n8-cure-laneB-hook`)

## Handoff to frond-scribe

1. Compare candidate `90ce9b9b06` decision-table vs Lane A's.
2. Convergent decisions (both lanes auto-merge cleanly OR both flag for cohort byte-walk) = high-confidence remediation.
3. Divergent decisions = primary cohort byte-walk targets.
4. The 134 + 42 = 176 cohort-byte-walk-flagged files are the workorder's "tangled history" class; deeper triage requires ultracode dynamic-workflows OR direct prince byte-walk.
