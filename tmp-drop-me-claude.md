# Lane n8-cure-laneB journal (claude-opus-4-7 /effort ultracode)

Dispatched by frond-scribe via figs's terminal directive 2026-05-29.
Tracking issue: karmaterminal/openclaw#803

## 2026-05-29T20:16:49+00:00: dispatch

- brief at tmp/codeagents/n8-cure-laneB/claude-20260529-131649/brief.md
- workorder at WORKORDER.md (mirror at tmp/codeagents/n8-cure-laneB/claude-20260529-131649/workorder.md)
- branch n8-cure-laneB/20260529-claude-opus-47-ultracode pushed to origin (remote-first canon)
- journal committed + pushed (this commit)
- next: claude harness fire with --effort ultracode

## 2026-05-29T20:21:00+00:00: claude harness landed; §0 starting

- model: claude-opus-4-7
- effort: `/effort ultracode` REJECTED at session-start (needs dynamic-workflows config + xhigh-capable model); fallback to `xhigh`. Dynamic-workflows feature unavailable for this lane — multi-pass savegame-comb will proceed sequentially without the dynamic-workflows substrate. Banked as deviation-from-workorder; lane B comparison vs Lane A still meaningful at the candidate-SHA / decision-table layer.
- substrate-reads complete: WORKORDER.md (full), PRINCE-CODE-AGENT-RUNBOOK.md (full, 1616 lines per figs canon 1507062339), PR-DRIFT-CURE-GATES-RUNBOOK.md (full)
- tools/drift-cure-gate.sh + DRIFT-CURE-GATE.md + DRIFT-CURE-GATE-REPORT.md copied to /tmp/n8-cure-laneB/tools/ from openclaw-bootstrap origin/main HEAD (`79a954f`)
- upstream fetched: upstream/main HEAD = `69c3b56bde` (fix: stabilize codex supervisor session listing)
- savegame-class branches enumerated: 222 refs at /tmp/n8-cure-laneB/savegame-branches-raw.txt
- baseline drift-cure-gate firing in background against upstream/main / fc337f05d6 / 0831fb5e80 → /tmp/n8-cure-laneB/gate-baseline-n7/

## 2026-05-29T20:28:00+00:00: §0 baseline gate complete

Baseline drift-cure-gate output (upstream/main `69c3b56bde` vs `fc337f05d6` vs PRCREATE `0831fb5e80`, HIST_CAP=200):

| class         | count   | workorder-N+7 |
| ------------- | ------- | ------------- |
| FROZEN-STALE  | **123** | 113           |
| MIXED-CLOBBER | 266     | 278           |
| GENUINE       | 84      | 82            |
| SAFE-NEW      | 110     | 110           |
| **total**     | **583** | 583           |

GATE 2.7 = **FAIL** (123 > 0). 10-FROZEN-STALE delta vs workorder is upstream-advancement since v2 was drafted (upstream/main HEAD has evolved from when the dispatcher snapshotted the numbers). Classification.tsv saved at `/tmp/n8-cure-laneB/gate-baseline-n7/classification.tsv`.

Savegame-class branch enumeration: 222 refs on origin. Top clusters by prefix-cluster:

- `frond-scribe-claude/20260509/narrow-surgery-tight*` — 18 refs (THE PR-presentation branch's savegame stack)
- `frond-scribe-claude/20260512/*` — 21 refs (intermediate cycle)
- `frond-scribe/20260504/*` — 16 refs (earlier-cycle bracket)
- `feature/continuation-context-pressure-v2-*-savegame-20260509` — 7 refs (last-known-good for continuation feature surface)
- `savegame/pr85651-shipped-2026-05-27-overnight-protect` — recent ship-savegame

§0 complete. Beginning §1: per-FROZEN-STALE classification.

## 2026-05-29T20:38:00+00:00: §1 FROZEN-STALE classification complete

**Method**:

1. Curated 24 load-bearing savegame branches (PR-presentation savegame stack + continuation-context-pressure-v2 cluster + savegame/pr85651-shipped-2026-05-27-overnight-protect) — fetched into refs/sg/\*.
2. For each of 123 FROZEN-STALE files, grep'd 24 savegame blobs for high-signal feature-overlay keyword regex (20 keywords from workorder §1.1).
3. Result: 112 NO-HIT (= UPSTREAM-EVOLUTION-MISS), 11 KEYWORD-HIT.

**Cross-check** on the 11 hits (the workorder's §1.1 keyword-grep is noisy because several feature mechanisms have been merged upstream over time — `senderIsOwner`, `allowedDecisions`, `agents.defaults`, etc. all appear in current upstream/main):

- For each candidate: grep upstream/main:file for the same keyword → ALL 11 also match upstream/main.
- Compare blob hashes: 2/11 SG==HEAD (savegame blob identical to fc337f05d6), 9/11 DIFFER.
- For the 9 DIFFER: check whether savegame blob exists in upstream history → 9/9 SG-IN-UPSTREAM-HISTORY (savegame is itself a historical upstream blob, just a different one than HEAD).
- Verdict: **0/11 carry non-upstream feature overlay**. All 11 reclassified as UPSTREAM-EVOLUTION-MISS-confirmed-via-blob-check.

**§1 final classification**: 123/123 FROZEN-STALE files → `git checkout upstream/main -- <file>` (mechanical restore, Layer B zero-false-positive guarantee).

The 4 codex named findings:

- `apps/macos/Sources/OpenClaw/NodeMode/MacNodeRuntime.swift` → FROZEN-STALE → upstream/main restore ✓
- `ui/src/ui/controllers/config.ts` → FROZEN-STALE → upstream/main restore ✓
- `ui/src/ui/usage-helpers.ts` → FROZEN-STALE → upstream/main restore ✓
- `docs/gateway/configuration-reference.md` → MIXED-CLOBBER (2 dropped lines, commit e72621e566 `fix(hooks): enforce default hook agent allowlist`) → handled in §2

Classified TSV: `/tmp/n8-cure-laneB/frozen-stale-classified-final.tsv`.

§1 complete. Beginning §2: MIXED-CLOBBER top-down triage.

## 2026-05-29T21:30:00+00:00: §2–§7 complete, candidate emerged

**Candidate SHA**: `90ce9b9b06` on branch `n8-cure-laneB-candidate` (pushed to fork as `n8-cure-laneB/20260529-candidate-90ce9b9b`).

### §2 MIXED-CLOBBER triage results

3-way merge across all 266 MIXED-CLOBBER files (base=`0831fb5e80`, ours=`fc337f05d6`, theirs=`upstream/main`):

| outcome                   | count   | action                                                                                               |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| MERGE-CLEAN               | 71      | 3-way merged content written to working tree                                                         |
| MERGE-UNION-i18n          | 19      | i18n locales re-merged with `--union` (workboard.\* + status/quickSettings non-overlapping additive) |
| MERGE-CONFLICTS-KEEP-OURS | 134     | textual conflicts; reverted to ours; flagged for cohort byte-walk                                    |
| SKIP-NO-BASE              | 42      | file added by our PR after PRCREATE; flagged for cohort byte-walk                                    |
| **total**                 | **266** | —                                                                                                    |

### §3 Decision-table

`cure-decisions.tsv` assembled with 389 rows (123 FROZEN-STALE + 266 MIXED-CLOBBER). Columns per workorder Phase 3.

### §4 Amend commit

- Author: `karmafeast` (preserved)
- Committer: `karmafeast` (reset per workorder Phase 4)
- Message: preserved verbatim from N+7 (Co-authored-by trailers retained)
- Tree: 212 files changed, +6567/-2316

### §5 Drift-cure-gate re-verify

```
tools/drift-cure-gate.sh upstream/main 90ce9b9b06 0831fb5e80 ./gate-output-n8/
```

| class         | N+7          | N+8 candidate      |
| ------------- | ------------ | ------------------ |
| FROZEN-STALE  | 123          | **0** ✓            |
| MIXED-CLOBBER | 266          | 178                |
| GENUINE       | 84           | 107 (+23)          |
| SAFE-NEW      | 110          | 110                |
| SAFE-CURRENT  | (suppressed) | 18 (newly emerged) |

**Gate 2.7 = PASS**.

### §6 Gate 2 feature-byte-identity

- `src/agents/embedded-agent-runner/`: 0 diff ✓
- `src/agents/openclaw-tools.ts`: 0 diff ✓
- `src/commands/continuation*`: 0 diff ✓
- `src/cli/program/preaction.ts`: +1 line (upstream's `skipConfigGuard` config-guard helper adoption — not feature regression)
- `ui/src/ui/usage-helpers.ts`: +6/-2 lines (codex finding #4 — usage filter strictness restoration; this IS the cure target)

Continuation feature TOOL surface byte-identical N+7→N+8. **Gate 2 PASS (semantic)**.

### §7 PROOFS corpus

`PROOFS/candidate-90ce9b9b06/`:

- `gates/gate-2.7-drift-cure-gate.txt` — summary
- `gates/gate-2.7-drift-cure-gate-n8.tsv` — full candidate classification.tsv
- `gates/gate-baseline-n7-classification.tsv` — full baseline classification.tsv
- `gates/gate-2-feature-byte-identity.txt` — feature-surface diff + interpretation
- `cure-decisions.tsv` — 389-row decision-table
- `savegame-walk.md` — savegame enumeration + per-file walk evidence
- `methodology.md` — approach + deviations + verification commands

`STATUS.md` at worktree root: PARTIAL — Gate 2.7 PASS, 176 MIXED files flagged for cohort byte-walk.

### Handoff

Lane B done. Candidate at `90ce9b9b06` ready for cohort comparison vs Lane A + per-file cohort byte-walk on the 176 flagged MIXED files.
