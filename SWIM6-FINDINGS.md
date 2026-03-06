# SWIM 6 Findings — Code Fixes Required

## P0: `maxChainLength` off-by-one

- **Status**: Fix applied locally (not pushed)
- **Files**: `src/agents/subagent-announce.ts:1399`, `src/auto-reply/reply/agent-runner.ts:1335`
- **Fix 1**: `>` → `>=` in announce-side chain guard
- **Fix 2**: Tool dispatch task prefix includes `[continuation:chain-hop:${nextChainCount}]` — unifies counter across tool and bracket paths
- **Result**: `maxChainLength: 10` = 10 total shards, period
- **Evidence**: Swim 6-7b journal — 12 shards executed with limit 10

## P1: Tolerance closure bug

- **Status**: Jotted, not fixed
- **File**: `src/agents/subagent-registry.ts` (lines ~87077, ~87162 in dist)
- **Bug**: `genTolerance` captured in closure at timer schedule time, not re-read at fire time
- **Fix**: Move config read inside `setTimeout` callback
- **Evidence**: Swim 6-2 — config said 300, timer used 5 (stale from pre-restart)

## P2: `maxDelegatesPerTurn` doesn't hot-reload

- **Status**: Jotted, not fixed
- **Bug**: Config change not picked up without gateway restart
- **Fix**: Read from config at consumption time, not at module init
- **Evidence**: Swim 6-7b — set to 10, still enforced at 5 until restart

## P2: `forbidden` spawn rejection layer

- **Status**: Investigate
- **Bug**: Not a bug — `spawnSubagentDirect` has its own concurrent session cap (likely `maxConcurrentSubagents: 5`)
- **Note**: Three-layer defense is good but should be documented: tool gate → runner gate → spawn gate
- **Evidence**: Swim 6-10 — 10 consumed, 5 spawned, 5 `forbidden`

## P3: Shard message target resolution

- **Status**: Cosmetic / investigate
- **Bug**: Shards fail first `message` call with "Explicit message target required for this run", then self-correct by parsing channel from session key
- **Evidence**: 6-10 journal — every shard hit the error then retried successfully
- **Impact**: Extra latency (~1s per shard), noisy logs, but functional

## P3: Lane queue pressure under fan-out

- **Status**: Document
- **Finding**: 5 parallel shards hitting same session lane = up to 46s queue wait, 4 deep
- **Finding**: Gateway announce timeout (60s) with retry 2/4 — transient under load
- **Evidence**: 6-10 journal — `lane wait exceeded` warnings, announce retry

## Follow-up: Shard fan-out via tool (#205)

- **Status**: Filed on openclaw-bootstrap
- **Design**: Remove `continue_delegate` from `SUBAGENT_TOOL_DENY_ALWAYS`
- **Patterns**: A) collapse to parent sub, B) direct to main (mast cell pattern)
- **Guards**: `maxChainLength` + `maxDelegatesPerTurn` + `costCapTokens` + `maxSpawnDepth`

## Swim 6 Scorecard

```
6-1  ✅ Blind enrichment
6-2  ✅ Queue-drain resistance
6-3  ⏸️ Post-compaction (deferred — needs context buildup)
6-4  ✅ Return-to-fresh-session (3/3)
6-5  ⏳ Context-pressure lifecycle
6-6  ✅ 3-hop chain + visible announce
6-7  ❌ Chain length enforcement (off-by-one) — FIX APPLIED
6-7b ✅ Fan-out cap (maxDelegatesPerTurn)
6-8  ✅ Legacy token hygiene
6-9a ✅ Missing file (graceful ENOENT)
6-9b ✅ Slow shard (69s, completes independently)
6-9c ✅ Empty task (tool-level rejection)
6-10 ✅ Flood test (5 spawned, 5 forbidden — three-layer defense)
```

11 passed, 1 failed (fix applied), 2 deferred
