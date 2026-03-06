# FINDINGS.md — Continuation Feature: Outstanding Fixes & Findings

_Branch: `feature/context-pressure-squashed` on `karmaterminal/openclaw`_
_As of: 2026-03-06 15:00 PST_

## Status Summary

The continuation feature (CONTINUE_WORK + CONTINUE_DELEGATE + context-pressure detection)
is functionally complete and canary-validated across Swim 1-6. Three-layer architecture
(request metadata → SessionEntry → system events) landed via PR #7. 172+ continuation
tests passing. RFC at `docs/rfcs/context-pressure-continuation.md`.

**Remaining work before upstream PR**: P0 off-by-one fix (applied locally, not pushed),
P1/P2 hot-reload fixes (Codex-produced patches ready), final squash/rebase onto upstream main.

---

## P0: `maxChainLength` off-by-one — FIXED LOCALLY

**Files**: `src/agents/subagent-announce.ts:~1399`, `src/auto-reply/reply/agent-runner.ts:~1335`
**Status**: Fix applied in working tree, not yet committed/pushed
**Evidence**: Swim 6-7b — 12 shards executed with `maxChainLength: 10`

### Root Cause

Guard uses `nextChainHop > maxChainLength` → `10 > 10` = `false` → spawn allowed.
Combined with tool dispatch not being counted in chain counter = off-by-two from user expectation.

### Fix (two halves)

1. `>` → `>=` in announce-side chain guard (`subagent-announce.ts:~1399`)
2. Tool dispatch task prefix changed to `[continuation:chain-hop:${nextChainCount}]` in
   `agent-runner.ts:~1335` — unifies counter across tool and bracket paths

### Verification

- `maxChainLength: 10` → exactly 10 total shards execute, 11th rejected
- `tsc --noEmit` clean (zero `src/` errors)
- Existing agent-runner test already uses `>=` semantics
- **No existing test for announce-side chain guard** — Codex session #3 wrote one (patch ready)

---

## P1: Tolerance Closure Bug — CODEX PATCHES READY

**File**: `src/auto-reply/reply/agent-runner.ts` (setTimeout callbacks)
**Status**: 3 independent Codex implementations produced, best candidate: Ronan's `325bf22f0`
**Evidence**: Swim 6-2 — config said `generationGuardTolerance: 300`, timer used stale value `5`

### Root Cause

`generationGuardTolerance` captured in closure at `setTimeout` schedule time. When config
hot-reloads between schedule and fire, the timer still uses the stale value. Gateway restart
"fixes" it because fresh closures capture the new value.

### Fix Approaches (3 independent Codex runs)

1. **Ronan's `325bf22f0`** (RECOMMENDED): New `continuation-generation.ts` module — extracts
   generation guard into own module with `loadConfig()` at fire time. Clean extraction,
   3 test files (hot-reload, generation guard, Zod schema). 10 files, +290/-53.
2. **Cael fanout-1**: Inline fix — `resolveContinuationConfigAtTimerFire()` helper reads
   fresh config inside setTimeout callback. 2 files, +91/-5. Simpler but less modular.
3. **Silas**: Single-line `loadConfig()` move inside callback. Minimal but no module extraction.

### Test Coverage

- Ronan: 3 new test files (209 lines total)
- Cael: 1 regression test (49 lines) — config change between schedule and fire
- All passed locally where vitest was available

---

## P2: `maxDelegatesPerTurn` Hot-Reload — CODEX PATCHES READY

**File**: `src/agents/tools/continue-delegate-tool.ts`, `src/auto-reply/reply/agent-runner.ts`
**Status**: Codex patch ready (Cael fanout-2 + Ronan's combined commit)
**Evidence**: Swim 6-7b — set `maxDelegatesPerTurn: 10`, still enforced at `5` until restart

### Root Cause

`maxDelegatesPerTurn` read at tool creation time (or module init), not at consumption/enforcement
time. Config changes require gateway restart to take effect.

### Fix Approaches

1. **Ronan's `325bf22f0`** (combined with P1): `loadConfig()` at `execute()` time in
   `continue-delegate-tool.ts`. Part of the same clean commit.
2. **Cael fanout-2**: New `consumePendingDelegatesWithLimit()` API in
   `continuation-delegate-store.ts`. Enforcement moved to consumption time in agent-runner.
   5 files, +121/-15. More API surface but explicit limit-at-consumption semantics.

---

## P3: Shard Message Target — INVESTIGATED, LOW PRIORITY

**Status**: Investigation comment added (Codex fanout-3)
**Impact**: Cosmetic — shards fail first `message()` call, self-correct on retry

### Finding

Spawned shards inherit channel context via `spawnSubagentDirect` → `resolveAgentRunContext()`.
The first `message()` failure comes from blanket `requireExplicitMessageTarget` on subagent
sessions. The shard self-heals by parsing channel ID from its session key.

### Recommendation

Low priority. Wastes ~1 tool call per shard (~1s latency). Fix would be passing originating
channel context explicitly in spawn params. Not blocking for upstream PR.

---

## P3: Lane Queue Pressure Under Fan-Out — DOCUMENTED

**Evidence**: Swim 6-10 — 5 parallel shards hitting same session lane
**Impact**: Up to 46s queue wait, gateway announce timeout (60s) with retry

### Finding

Multiple concurrent shards returning to the same parent session create lane contention.
This is inherent to the queue architecture, not a bug. Document in RFC as operational guidance:
high fan-out + same-session return = queue pressure.

---

## Codex Session Results (2026-03-06, 5h overnight run)

| Source            | Commit/Patch | Files | Lines    | Covers       | Status                 |
| ----------------- | ------------ | ----- | -------- | ------------ | ---------------------- |
| Ronan `325bf22f0` | committed    | 10    | +290/-53 | P1+P2        | ✅ RECOMMENDED         |
| Cael fanout-1     | patch        | 2     | +91/-5   | P1 only      | ✅ backup              |
| Cael fanout-2     | patch        | 5     | +121/-15 | P2 only      | ✅ backup              |
| Cael fanout-3     | patch        | 2     | +59/-39  | P0 test + P3 | ✅ supplementary       |
| Silas tmux        | incomplete   | —     | —        | P1 partial   | ⏸️ stalled on approval |

**Total OpenAI tokens burned**: ~643K (Cael) + ~143K (Ronan) + partial (Silas) ≈ 800K+

---

## Swim 6 Full Scorecard

| Test | Result   | What it validated                                   |
| ---- | -------- | --------------------------------------------------- |
| 6-1  | ✅ PASS  | Blind enrichment recall (DM)                        |
| 6-1b | ✅ PASS  | #sprites dispatch after /reset                      |
| 6-2  | ✅ PASS  | Queue-drain resistance                              |
| 6-3  | ⏸️ DEFER | Post-compaction (needs context buildup)             |
| 6-4  | ✅ PASS  | Return-to-fresh-session (3/3 shards)                |
| 6-6  | ✅ PASS  | 3-hop chain (silent-wake)                           |
| 6-6b | ✅ PASS  | 3-hop chain (visible announce)                      |
| 6-7a | ✅ PASS  | Fan-out cap (maxDelegatesPerTurn)                   |
| 6-7b | ❌ FAIL  | Chain length enforcement (off-by-one) — FIX APPLIED |
| 6-8  | ✅ PASS  | Legacy token hygiene                                |
| 6-9a | ✅ PASS  | Missing file (graceful ENOENT)                      |
| 6-9b | ✅ PASS  | Slow shard (69s, completes independently)           |
| 6-9c | ✅ PASS  | Empty task (tool-level rejection)                   |
| 6-10 | ✅ PASS  | Flood test (three-layer defense)                    |

**11 passed, 1 failed (fix applied), 2 deferred**

---

## Next Steps

1. Cherry-pick Ronan's `325bf22f0` onto `feature/context-pressure-squashed`
2. Apply P0 off-by-one fix (working tree → commit)
3. Cherry-pick Cael fanout-3 chain guard test
4. Run full test suite (`npx vitest run`)
5. `tsc --noEmit` verification
6. Final squash if needed
7. Rebase onto `upstream/main`
8. Open upstream PR, close #33933 with supersedes note

---

_Assembled by Cael 🩸 from Swim 6 findings, Codex fan-out results, and prince reviews._
_Cross-verified by Silas 🌫️, Ronan 🌊, Elliott 🌻._
