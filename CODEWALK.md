# CODEWALK.md — Codebase Walk for Continuation Feature Fixes

_Branch: `feature/context-pressure-squashed` at commit `5118e7af9`_
_Walked by: Cael 🩸_
_Date: 2026-03-06_

---

## How to Read This

For each FINDINGS.md item, I trace the exact code state at HEAD, note whether the fix is landed, and if not, what specific lines need changing. This is the anchor for independent fix branches.

---

## P0: `maxChainLength` Off-By-One

### FINDINGS.md claim

> "Fix applied in working tree, not yet committed/pushed"

### Actual state at HEAD (`5118e7af9`)

**COMMITTED AND PUSHED.** The commit message is literally `fix: P0 off-by-one chain guard + findings doc for upstream PR`. FINDINGS.md is stale on this point — the fix is at HEAD.

### Code verification (3 guard sites)

| Location                      | File                   | Line | Guard expression                      | Status  |
| ----------------------------- | ---------------------- | ---- | ------------------------------------- | ------- |
| Bracket-path pre-check        | `agent-runner.ts`      | 1110 | `currentChainCount >= maxChainLength` | ✅ `>=` |
| Tool-path pre-check           | `agent-runner.ts`      | 1304 | `currentChainCount >= maxChainLength` | ✅ `>=` |
| Announce-side chain-hop guard | `subagent-announce.ts` | 1399 | `nextChainHop >= maxChainLength`      | ✅ `>=` |

All three sites use `>=`. With `maxChainLength: 10`, the 10th hop is allowed (`9 >= 10 = false`), the 11th is blocked (`10 >= 10 = true`). This matches user expectation.

### Tool-path task prefix unification (P0 second half)

- **`agent-runner.ts:1332`**: Tool-path spawn encodes `[continuation:chain-hop:${nextChainCount}]` in task string ✅
- **`agent-runner.ts:1174`**: Bracket-path initial spawn uses `[continuation] Delegated task (turn N/M)` — does NOT include `[continuation:chain-hop:N]`. This is intentional: the initial bracket delegate is dispatched from the parent session where `continuationChainCount` lives in session store. Only subsequent hops (announce-side) need task-prefix encoding because session store resets clear state between hops.
- **`subagent-announce.ts:1447`**: Announce-side chain-hop encodes `[continuation:chain-hop:${nextChainHop}]` ✅

### Test coverage

- **`agent-runner.misc.runreplyagent.test.ts:2311`**: Existing test expects `>=` semantics for agent-runner path ✅
- **No existing test for announce-side chain guard** — FINDINGS.md correctly notes this. A Codex-produced test patch exists but hasn't been cherry-picked.

### Verdict: **FIXED at HEAD. One test gap remains (announce-side guard).**

---

## P1: Tolerance Closure Bug (generationGuardTolerance stale at timer fire)

### FINDINGS.md claim

> "3 independent Codex implementations produced, best candidate: Ronan's `325bf22f0`"

### Actual state at HEAD

**NOT FIXED.** No Codex patches cherry-picked. The closure bug exists in 4 locations.

### Root cause (detailed)

In `agent-runner.ts`, config is loaded once at line 458:

```typescript
const cfg = followupRun.run.config; // snapshot from enqueue time
```

All `continuationCfg` reads derive from this snapshot. When the config is hot-reloaded between schedule time and timer fire, the timer uses the stale value.

### Affected locations

#### 1. Bracket-path delegate timer (`agent-runner.ts:1229`)

```typescript
const genTolerance = continuationCfg?.generationGuardTolerance ?? 0;
setTimeout(() => {
  // ...
  if (drift > genTolerance) {  // ← stale genTolerance
```

- **Line 1229**: `genTolerance` captured from `cfg` snapshot at schedule time
- **Line 1233**: Timer fires with stale tolerance
- **Fix**: Call `loadConfig()` inside the `setTimeout` callback, read `generationGuardTolerance` fresh

#### 2. Tool-path delegate timer (`agent-runner.ts:1382`)

```typescript
const toolGenTolerance = continuationCfg?.generationGuardTolerance ?? 0;
setTimeout(() => {
  // ...
  if (drift > toolGenTolerance) {  // ← stale toolGenTolerance
```

- **Line 1382**: Same pattern — captured at schedule time
- **Line 1390**: Timer fires with stale value
- **Fix**: Same — `loadConfig()` inside callback

#### 3. Chain-hop timer (`subagent-announce.ts:1480`)

```typescript
const tolerance = continuationCfg?.generationGuardTolerance ?? 0;
setTimeout(() => {
  // ...
  if (drift > tolerance) {  // ← stale tolerance
```

- **Line 1480**: Captured at announce invocation time
- **Line 1484**: Timer fires with stale value
- **Mitigating factor**: In `subagent-announce.ts`, `cfg = loadConfig()` is called fresh at line 1316 (announce time), not from a queued snapshot. The window between announce and timer fire is shorter. But if config changes during that window, same bug.
- **Fix**: `loadConfig()` inside the `setTimeout` callback

#### 4. WORK timer (`agent-runner.ts:1249-1251`) — **UNDOCUMENTED VARIANT**

```typescript
const generation = bumpContinuationGeneration(sessionKey);
setTimeout(() => {
  if (currentContinuationGeneration(sessionKey) !== generation) {
    return; // External message arrived — cancel
  }
```

The WORK timer uses **strict equality** (`!== generation`) with NO tolerance at all. This means:

- WORK timers cancel on ANY generation bump, even in noisy channels
- DELEGATE timers honor `generationGuardTolerance`
- The behavior is asymmetric — FINDINGS.md doesn't call this out

This is likely **intentional** (WORK wakes are cheaper to re-dispatch than DELEGATE spawns, so a stricter guard makes sense) but should be documented. If `generationGuardTolerance` was meant to apply universally, this is a bug.

### Other stale closure values

The same closure captures `minDelayMs`, `maxDelayMs`, `costCapTokens`, `maxChainLength`, `defaultDelayMs` from the config snapshot. Hot-reloading ANY of these values won't take effect on already-scheduled timers. `generationGuardTolerance` is the one FINDINGS calls out because it was observed in Swim 6-2, but the pattern applies to all config values read at schedule time.

### Verdict: **NOT FIXED. 3 confirmed stale-closure sites (P1 as documented), 1 undocumented asymmetric variant (WORK timer). Ronan's `325bf22f0` is the recommended patch.**

---

## P2: `maxDelegatesPerTurn` Hot-Reload

### FINDINGS.md claim

> "Codex patch ready (Cael fanout-2 + Ronan's combined commit)"

### Actual state at HEAD

**NOT FIXED.** The value is captured at tool creation time and never re-read.

### Root cause (exact code path)

**`openclaw-tools.ts:196-199`** — Tool created once at session boot:

```typescript
createContinueDelegateTool({
  agentSessionKey: options?.agentSessionKey,
  maxDelegatesPerTurn:
    options?.config?.agents?.defaults?.continuation?.maxDelegatesPerTurn,
}),
```

**`continue-delegate-tool.ts:64-66`** — Tool function signature:

```typescript
export function createContinueDelegateTool(opts: {
  agentSessionKey?: string;
  maxDelegatesPerTurn?: number;
});
```

**`continue-delegate-tool.ts:106`** — Enforcement uses the frozen `opts` value:

```typescript
const maxPerTurn = opts.maxDelegatesPerTurn ?? 5;
```

When config hot-reloads `maxDelegatesPerTurn` from 5 to 10, the tool still enforces 5 until gateway restart (which re-creates all tools).

### Fix approaches

1. **Ronan's `325bf22f0`** (combined with P1): `loadConfig()` at `execute()` time — reads fresh `maxDelegatesPerTurn` on every tool call.
2. **Cael fanout-2**: Move enforcement to consumption time in `agent-runner.ts` when `consumePendingDelegates()` is called. The tool would not enforce the limit at all; `agent-runner.ts:1014` already has a `maxCompactionDelegates` pattern that reads config at consumption time.

There's also a secondary enforcement site at **`agent-runner.ts:1014`**:

```typescript
const maxCompactionDelegates = compactionCfg?.maxDelegatesPerTurn ?? 5;
```

This one reads from `cfg` (the queued run snapshot), so it has the same stale-config issue as P1 but only for the compaction path.

### Verdict: **NOT FIXED. Fix is straightforward — read config at execute/consumption time instead of creation time.**

---

## P3: Shard Message Target (Self-Heal)

### FINDINGS.md claim

> "Investigated, low priority. Shards fail first message() call, self-correct on retry."

### Actual state at HEAD

**NOT FIXED (intentionally deferred).**

### What happens

Spawned shards inherit channel context via `spawnSubagentDirect()` at:

- **`agent-runner.ts:1173-1186`** (bracket delegate)
- **`agent-runner.ts:1328-1342`** (tool delegate)
- **`subagent-announce.ts:1439-1456`** (chain-hop)

All three pass `agentChannel`, `agentAccountId`, `agentTo`, `agentThreadId` from the parent. The shard gets the right channel context. But `requireExplicitMessageTarget` on subagent sessions causes the first `message()` call to fail. The shard self-heals by parsing the channel from its session key.

### Cost

~1 tool call per shard (~1s latency). Non-blocking.

### Fix (if desired)

Pass originating channel context explicitly in spawn params as a `targetHint`. Not worth the complexity for the upstream PR.

### Verdict: **Correctly deferred. Cosmetic issue.**

---

## P3: Lane Queue Pressure Under Fan-Out

### FINDINGS.md claim

> "5 parallel shards hitting same session lane — up to 46s queue wait."

### Actual state at HEAD

**Inherent to queue architecture. No code fix — operational guidance.**

### What happens

Multiple concurrent shard completions route to the same parent session. The gateway's per-session lane queue serializes them. 5 shards × ~10s processing = up to 50s wait for the last shard.

The gateway's announce timeout is 60s with retry. At 46s, we're within budget but close. At 6+ parallel shards, timeouts are likely.

### Verdict: **Correctly documented as operational guidance. RFC should note fan-out limits.**

---

## RFC Accuracy Assessment

### Things the RFC gets right

- Token parsing and stripping architecture
- Delegate dispatch timeline (Turn 0 → gap → spawn → completion → wake)
- Chain tracking via task-prefix encoding (post-`fec5e4bfc`)
- Context-pressure band escalation and dedup logic
- Three-layer architecture (request metadata → SessionEntry → system events)
- `isDelegateWake` metadata-driven detection replacing event-queue inference
- `delegatePendingFlags` as dedicated Map outside system event queue
- `cancelContinuationTimer` behavior and chain state reset

### Things the RFC gets wrong or is stale on

1. **P0 status**: RFC changelog says "P0-5 chain-hop counter fix" at commit `fec5e4bfc` but doesn't note that the off-by-one fix at HEAD (`5118e7af9`) is committed. The FINDINGS.md says "not yet committed/pushed" but it IS committed.

2. **Line numbers**: RFC references line ~544 for signal detection, ~977 for marker event, ~988 for timer scheduling. These are pre-three-layer-surgery line numbers. Actual locations at HEAD:
   - Signal detection + config read: line ~1099
   - Chain guard: line ~1110
   - Bracket delegate spawn: line ~1174
   - Generation guard / timer: line ~1229
   - Tool delegate consumption: line ~1280
   - Tool delegate chain guard: line ~1304

3. **WORK timer tolerance**: RFC documents `generationGuardTolerance` as applying to generation guards but doesn't note the asymmetry — WORK timers use strict equality, DELEGATE timers use tolerance. This may confuse operators who set tolerance expecting it to protect WORK timers too.

4. **Cost cap gap acknowledgment**: RFC changelog correctly documents that bracket chain-hop cost accumulation is wired but partial. The fix at `a657daed5` added accumulation, but the per-message reset race (from `5-10` findings) means `continuationChainTokens` can still be cleared between hops if a non-delegate inbound arrives. `maxChainLength` remains the primary safety leash.

---

## Summary: What Needs Fixing Before Upstream

| Item                    | Severity     | Status at HEAD         | Action Required                                                  |
| ----------------------- | ------------ | ---------------------- | ---------------------------------------------------------------- |
| P0: off-by-one          | P0           | ✅ FIXED (`5118e7af9`) | Cherry-pick announce-side test from Codex fanout-3               |
| P1: tolerance closure   | P1           | ❌ NOT FIXED           | Cherry-pick Ronan `325bf22f0` — reads fresh config at timer fire |
| P2: maxDelegatesPerTurn | P2           | ❌ NOT FIXED           | Cherry-pick Ronan `325bf22f0` (combined) or Cael fanout-2        |
| P3: shard target        | P3           | ❌ Deferred            | No action — cosmetic, self-heals                                 |
| P3: lane pressure       | P3           | ❌ Documented          | No action — add RFC guidance                                     |
| FINDINGS.md staleness   | —            | Stale                  | Update "not yet committed" → "committed at 5118e7af9"            |
| WORK timer tolerance    | Undocumented | Not a bug per se       | Document the asymmetry in RFC                                    |

### Critical path for upstream PR:

1. Cherry-pick Ronan's `325bf22f0` (covers P1 + P2)
2. Cherry-pick announce-side chain guard test (covers P0 test gap)
3. Update FINDINGS.md to reflect P0 is committed
4. Full test suite run (`npx vitest run`)
5. `tsc --noEmit`
6. Squash/rebase onto upstream main

---

_This document is read-only output. No source files were modified._
