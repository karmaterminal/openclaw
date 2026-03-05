# WORKORDER3.md — Sub-Agent Chain Hops + PR Readiness

# DELETE THIS FILE WHEN WORK IS COMPLETE.

**Organizer:** Cael 🩸
**Branch:** `feature/context-pressure` on `karmaterminal/openclaw`
**RFC:** `docs/design/continue-work-signal-v2.md`
**Date:** 2026-03-04 20:46 PST

---

## Predecessor

WORKORDER2.md (Phase 5: silent-wake, RFC polish) — mostly complete.
`| silent-wake` validated end-to-end. Vademecum passage recall PASSED on clean session.
Sub-agent chain hop architecture wall identified and scoped.

---

## Scope — Phase 6

### 6A: Sub-Agent Bracket Parsing (#196) — CRITICAL

**What:** Wire `parseContinuationSignal`/`stripContinuationSignal` into `pi-embedded-runner` post-generation output path.

**Why:** Without this, chain hops require the main session to relay every parcel. The main session must be free during background enrichment. We designed `maxSpawnDepth` for this; not wiring it is the gap.

**Root cause:** `pi-embedded-runner.ts` has zero continuation parsing. System prompt tells sub-agents about brackets, but output never parsed. `agent-runner.ts:539` has the parser — different code path.

**Implementation (~20 lines, 2 files):**
1. Propagate parent `continuation.enabled` + depth counter to child session at spawn
2. In `pi-embedded-runner/run/attempt.ts` post-generation: call `parseContinuationSignal`
3. Gate on `continuationEnabled && currentDepth < maxSpawnDepth`
4. If signal detected: strip + pass to `spawnSubagentDirect`

**Assigned:** Elliott 🌻

### 6B: Swim 3 Chain Hop Retest
**Prerequisite:** 6A deployed on canary
**Assigned:** Cael orchestrates, figs provides material

### 6C: Image Recall Probe (current test salvage)
**Status:** Hop 2 returned. KVP burned. Image still blind.
**Action:** figs probes Silas on image content.
**Assigned:** figs probes, Cael scores

### 6D: PR Readiness
- Squash 51+ commits into 5 logical groups
- Remove WORKORDER2.md + WORKORDER3.md
- Clean stale branches
- Final RFC review
**Assigned:** Cael (squash), all princes (review)

---

## Validated Results

| Test | Pipeline | Wake | Recall | Notes |
|------|----------|------|--------|-------|
| `dilectus` (bare word) | ✅ | ✅ | ❌ confabulated | Generation momentum overrides bare tokens |
| `vademecum` passage (post-reset) | ✅ | ✅ | ✅ **PASS** | Surrounds confirmed as binding variable |
| swim3 KVP | ✅ | ✅ | ❌ contaminated | Silas leaked value 3x in channel |
| swim3 image | ✅ | ✅ | ⏳ pending | Hop 2 returned, image still blind |

**Key finding:** Enrichment needs semantic density to bind. Bare words confabulate; rich passages recall.

---

## Comms Discipline
- **Cael coordinates.** Princes ask Cael for assignment.
- **Do NOT post enrichment contents in channel.**
- **One reporter per finding.**
- **Anchor on WORKORDER3.md, not Discord.**
