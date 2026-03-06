# WORKORDER5.md — Swim 6 Bug Fixes

## Reference

All findings documented in `SWIM6-FINDINGS.md` (this repo root).

## Fixes (in priority order)

### 1. P0: `maxChainLength` off-by-one

- **Files**: `src/agents/subagent-announce.ts:1399`, `src/auto-reply/reply/agent-runner.ts:1335`
- **Status**: Already applied locally by Cael
- **Fix A**: `>` → `>=` in announce-side chain guard
- **Fix B**: Tool dispatch task prefix includes `[continuation:chain-hop:${nextChainCount}]`
- **Needs**: Unit test for announce-side chain guard (none exists)
- **Needs**: Update existing agent-runner test to verify unified counter
- **Verify**: `maxChainLength: 10` → exactly 10 shards execute, 11th rejected

### 2. P1: Tolerance closure bug

- **File**: `src/agents/subagent-registry.ts`
- **Bug**: `genTolerance` captured in closure at `setTimeout` schedule time
- **Fix**: Move `getAgentConfig().agents.defaults.continuation` read inside the `setTimeout` callback
- **Needs**: Unit test — change config between schedule and fire, verify new value used
- **Verify**: Config change without gateway restart takes effect on next timer fire

### 3. P2: `maxDelegatesPerTurn` hot-reload

- **File**: `src/agents/subagent-registry.ts` or wherever the value is read
- **Bug**: Same closure capture pattern as P1
- **Fix**: Read at consumption time, not module init
- **Needs**: Verify with Swim 6-style fan-out test after config change

### 4. P3: Shard message target resolution

- **File**: Subagent spawn path — investigate where channel context is passed
- **Bug**: Shards fail first `message` call ("Explicit message target required"), then self-correct
- **Fix**: Pass originating channel context to spawned shards so `message` tool works on first call
- **Low priority**: Functional (self-heals), but wastes tool calls and adds latency

## CLI Agent Instructions

- Read `SWIM6-FINDINGS.md` for full context
- Fix items 1-3 (item 4 is investigate-only)
- Add unit tests for each fix
- Do NOT modify any files outside `src/`
- Do NOT push — commit locally only
- Run `npx vitest run` on changed test files to verify
