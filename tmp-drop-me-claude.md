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
