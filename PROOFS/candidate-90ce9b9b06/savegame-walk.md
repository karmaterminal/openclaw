# Savegame Walk — n8-cure-laneB candidate 90ce9b9b06

## Branch enumeration

Total savegame-class branches on `karmaterminal/openclaw:origin` matching workorder prefixes: **222**.

Workorder prefix patterns probed:

- `frond-scribe-claude/*`
- `scribe/cure-rebase-on-*`
- `frond-scribe/*`
- `working/*`
- `*savegame*`, `*save-point*`
- `feature/context-pressure-squashed-recompose-*`
- `cure-*-candidate-*`

## Curated load-bearing subset (24 refs)

Fetched into local `refs/sg/*` namespace and scanned per-file for feature-overlay keywords:

```
feature/continuation-context-pressure-v2-copilot-final-pre-force-savegame-20260509
feature/continuation-context-pressure-v2-copilot-pre-force-savegame-20260509
feature/continuation-context-pressure-v2-copilot-pre-gates-savegame-20260509
feature/continuation-context-pressure-v2-copilot-pre-squash-savegame-20260509
feature/continuation-context-pressure-v2-post-rebase-savegame-20260509
feature/continuation-context-pressure-v2-pre-rebase-savegame-20260509
feature/continuation-context-pressure-v2-wip-frond-scribe-savegame-20260509
frond-scribe-claude/20260509/narrow-surgery-tight
frond-scribe-claude/20260509/narrow-surgery-tight-final-pre-force-20260509
frond-scribe-claude/20260509/narrow-surgery-tight-path-b-savegame-20260509
frond-scribe-claude/20260509/narrow-surgery-tight-phase-ab-savegame-20260509
frond-scribe-claude/20260509/narrow-surgery-tight-pre-0831fb5-savegame
frond-scribe-claude/20260509/narrow-surgery-tight-pre-p1-fix-savegame-20260513
frond-scribe-claude/20260509/narrow-surgery-tight-pre-pr79925-rebase-savegame-20260513
frond-scribe-claude/20260509/narrow-surgery-tight-pre-squash-20260509
frond-scribe-claude/20260509/narrow-surgery-tight-savegame-0831fb5e80
frond-scribe-claude/20260509/narrow-surgery-tight-savegame-6ddb80f
frond-scribe-claude/20260509/narrow-surgery-tight-savegame-72e7c3c
frond-scribe-claude/20260509/narrow-surgery-tight-savegame-89da30d
frond-scribe-claude/20260509/narrow-surgery-tight-savegame-a9ccf59
frond-scribe-claude/20260509/narrow-surgery-tight-savegame-ae71f06
frond-scribe-claude/20260512/outcome1-rebase-narrow-surgery-tight
frond-scribe-claude/20260512/outcome1-rebase-narrow-surgery-tight-savegame-20260512
savegame/pr85651-shipped-2026-05-27-overnight-protect
```

## FROZEN-STALE per-file walk results

For each of 123 FROZEN-STALE files at `fc337f05d6`:

1. **Keyword-grep pass**: 123 × 24 savegame blobs grep'd with feature-vocabulary regex (`continue_work|continue_delegate|request_compaction|crossSessionTargeting|sessionContinuation|senderIsOwner|chainState|runWithDiagnosticTraceparent|allowedDecisions|messages\.queue\.mode|reserveTokensFloor|streaming\.preview\.toolProgress|agents\.defaults|hooks\.isHookAgentAllowed|resolveEffectiveHookTargetAgentId|inter-session-target|cross-session-spawn-routing|continuationTrigger|verboseDefault|intersession\.return`).
   - 112 files: zero keyword hits across all 24 savegames → CANDIDATE-UPSTREAM-EVOLUTION-MISS.
   - 11 files: ≥1 savegame hit → flagged for blob-cross-check.

2. **Blob-cross-check pass** (on the 11 keyword-hits):
   - All 11 also match the same keyword(s) in `upstream/main` (current upstream HEAD has the keyword too — `senderIsOwner`, `allowedDecisions`, `agents.defaults` have leaked upstream-side).
   - Compare savegame blob ↔ fc337f05d6 blob: 2 SAME-BLOB, 9 DIFFER.
   - For the 9 DIFFER: check if savegame blob exists in `upstream/main`'s history → 9/9 SG-IN-UPSTREAM-HISTORY (savegame is itself a historical upstream blob, just a different one than HEAD).
   - **Verdict**: 0/11 carry non-upstream feature overlay. All 11 reclassified as UPSTREAM-EVOLUTION-MISS-confirmed-via-blob-check.

3. **Final FROZEN-STALE remediation**: 123/123 → `git checkout upstream/main -- <file>` (Layer B zero-false-positive guarantee).

## MIXED-CLOBBER per-file walk results

For each of 266 MIXED-CLOBBER files at `fc337f05d6`:

1. **3-way merge** with `git merge-file --diff3`:
   - base = `0831fb5e80` (PRCREATE)
   - ours = `fc337f05d6` (N+7 PR head)
   - theirs = `upstream/main` (current upstream HEAD `69c3b56bde`)
2. Outcomes:
   - **71** MERGE-CLEAN: auto-resolved cleanly → accepted.
   - **19** MERGE-UNION-i18n: i18n locale files; re-merged with `--union` to take both sides of additive translation-key conflicts (workboard.\* from upstream + our PR additions like statusLive/quickSettings) → accepted.
   - **134** MERGE-CONFLICTS-KEEP-OURS: textual conflicts requiring per-hunk discrimination; reverted to ours and **flagged for cohort byte-walk**.
   - **42** SKIP-NO-BASE: file absent at PRCREATE (added by our PR); no common ancestor for 3-way merge; **flagged for cohort byte-walk** per-file (take ours / take theirs / merge).

## Savegame source-refs used

Of the 123 FROZEN-STALE restorations, **0** were sourced from a savegame branch (all UPSTREAM-EVOLUTION-MISS → restored from `upstream/main` per Layer B). The savegame walk is the load-bearing **discrimination evidence**, not a restoration source, for this candidate.

The 19 i18n-union merges and 71 clean 3-way merges integrated upstream/main + fc337f05d6 deltas relative to `0831fb5e80` (PRCREATE) — savegames were not consulted at this layer.

## Why no savegame-restoration source-refs in the final decision-table

The cohort-feature-vocabulary keyword set has bled into current upstream/main over time (multiple feature mechanisms merged at openclaw/openclaw via independent paths since PR-creation). This makes keyword presence in a savegame an unreliable discriminator for "feature overlay vs upstream-historical content." Blob-comparison and upstream-history checking proved decisive: every keyword-hit savegame blob was either identical to HEAD (no information added) or itself a historical upstream blob (no feature overlay).

The savegame walk therefore confirms that for the 123 FROZEN-STALE files, **mechanical restore from upstream/main is the correct remediation** (no lost feature overlay to recover). Savegames remain valuable for §7 design-break inspection if Lane-A or cohort disagrees with this finding.
