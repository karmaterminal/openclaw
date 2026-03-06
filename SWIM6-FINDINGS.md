# Swim 6 — Findings & Issues

_Integration test suite for `continue_delegate` tool and sub-agent infrastructure._
_Test admin: Ronan 🌊 | Canary node: Silas 🌫️ (WSL2) | Date: 2026-03-06_

---

## Scorecard

| Test | Description                    | Result         | Notes                                                   |
| ---- | ------------------------------ | -------------- | ------------------------------------------------------- |
| 6-1  | Wake routing                   | ✅ PASS        | Silent-wake shard routes to correct session             |
| 6-2  | Queue-drain resistance         | ✅ PASS        | Tolerance guards survive message flood                  |
| 6-3  | Post-compaction                | ⏸️ DEFERRED    | Requires context buildup; not testable in clean session |
| 6-4  | Return-to-fresh-session        | ✅ PASS (3/3)  | Shards announce to requester, not to themselves         |
| 6-5  | Context-pressure lifecycle     | ⏳ NOT STARTED | Needs canary with continuation block                    |
| 6-6  | Chain hop bounds               | ✅ PASS (3/3)  | 3-hop chain with visible announce at each hop           |
| 6-7  | Chain length enforcement       | ❌ FAIL        | Off-by-one: `maxChainLength: 10` allowed 12 hops        |
| 6-7b | Fan-out cap                    | ✅ PASS        | `maxDelegatesPerTurn: 5` correctly enforced             |
| 6-8  | Legacy token hygiene           | ✅ PASS        | Bare `[[CONTINUE:]]` ignored, not parsed                |
| 6-9a | Missing file (graceful ENOENT) | ✅ PASS        | Shard handles missing instruction file gracefully       |
| 6-9b | Slow shard                     | ✅ PASS        | 69s shard survived WebSocket reconnect mid-execution    |
| 6-9c | Empty task                     | ✅ PASS        | Rejected at tool level with clear error                 |
| 6-10 | Fan-out flood (bonus)          | ⚠️ PARTIAL     | 5/10 spawned; exposed lane congestion + session leak    |

---

## P0 — Chain Length Off-by-One

**Severity:** High — enforcement boundary is wrong.
**Location:** `src/agents/subagent-announce.ts` ~line 1399
**Symptom:** `maxChainLength: 10` allows 12 shards to execute.

### Root Cause

Two compounding issues:

1. **Guard uses `>` instead of `>=`:**

   ```typescript
   // BEFORE (broken):
   if (chainCount > maxChainLength) { ... }
   // AFTER (fixed):
   if (chainCount >= maxChainLength) { ... }
   ```

   This alone makes the boundary off-by-one (11 instead of 10).

2. **Initial tool dispatch not counted as hop 0:**
   The first `continue_delegate` call dispatches a shard but doesn't increment the chain counter on the dispatch side. The counter only starts at the shard's first announce. Combined with issue 1, the effective limit is `maxChainLength + 2`.

### Fix

Two-part:

- Change `>` to `>=` in the announce guard.
- Prefix tool dispatch with `[continuation:chain-hop:${nextChainCount}]` so the initial dispatch is counted.
- Unify two tracking systems: agent-runner `SessionEntry.continuationChainCount` and announce-side `[continuation:chain-hop:N]` task-prefix encoding.

### Evidence

```
15:25:17 [subagent-chain-hop] Spawned chain delegate (10/10)
15:25:24 "6-7 FINDING — chain reached hop 12, maxChainLength: 10 did not enforce"
```

### Status

Fixed locally (Cael's manual fix + Ronan's Codex commit `325bf22f0`). Not pushed — code freeze active.

---

## P1 — Generation Guard Closure Capture

**Severity:** Medium — config changes silently ignored until restart.
**Location:** `src/auto-reply/reply/agent-runner.ts` (previously), now `src/auto-reply/reply/continuation-generation.ts`
**Symptom:** `generationGuardTolerance` captured at function definition time, not re-read at timer fire time. Changing config has no effect until gateway restart.

### Root Cause

```typescript
// BEFORE (broken): tolerance captured in outer scope
const tolerance = cfg.continuation?.generationGuardTolerance ?? 300;
setTimeout(() => {
  // tolerance is stale — reads value from when setTimeout was called
  if (current - stored > tolerance) { ... }
}, delay);
```

The `setTimeout` callback closes over the tolerance value from when the timer was scheduled, not when it fires. If config changes between schedule and fire (which can be seconds to minutes), the old value is used.

### Fix

Extract generation guard into dedicated module (`continuation-generation.ts`):

- `scheduleContinuationGeneration()` — bumps generation counter
- `invalidateContinuationGeneration()` — jumps past tolerance window (reads live config)
- `isContinuationGenerationCurrent()` — reads tolerance at check time, not capture time

All three functions call `loadConfig()` at execution time, not at import/definition time.

### Evidence

```
15:35:13 [continuation-guard] Tool delegate timer set with generation=326 tolerance=300
15:35:18 [continuation-guard] Timer fired: stored=326 current=327 drift=1 tolerance=300
```

Timer fires with stale tolerance. If tolerance was changed from 300 to 0 between schedule and fire, the guard would still use 300.

### Status

Fixed in Ronan's Codex commit `325bf22f0`. New module + tests. Not pushed.

---

## P2 — `maxDelegatesPerTurn` Doesn't Hot-Reload

**Severity:** Medium — requires gateway restart to change delegate cap.
**Location:** `src/agents/tools/continue-delegate-tool.ts`
**Symptom:** `maxDelegatesPerTurn` read once at tool construction, cached for session lifetime.

### Root Cause

```typescript
// BEFORE (broken): config read at tool creation
const maxDelegates = cfg.continuation?.maxDelegatesPerTurn ?? 5;

export function execute() {
  // maxDelegates is stale — uses value from when tool was constructed
  if (delegateCount >= maxDelegates) { ... }
}
```

Tool is constructed once per session. Config value is captured in constructor closure. Hot-reload changes the config but the tool keeps the old value.

### Fix

Move `loadConfig()` into `execute()`:

```typescript
export function execute() {
  const cfg = loadConfig();
  const maxDelegates = cfg.continuation?.maxDelegatesPerTurn ?? 5;
  if (delegateCount >= maxDelegates) { ... }
}
```

### Status

Fixed in Ronan's Codex commit `325bf22f0`. Test added. Not pushed.

---

## P3 — Shard Message Target Not Inherited

**Severity:** Low — shards self-heal but first message fails.
**Location:** `src/agents/tools/continue-delegate-tool.ts` → shard spawn
**Symptom:** Shards don't inherit parent's Discord channel target. First `message` call fails with "Explicit message target required."

### Root Cause

When a shard is spawned via `continue_delegate`, the new session doesn't inherit the parent session's channel/target context. The shard must parse the channel from its own session key or receive it as task context.

### Workaround

Shards self-heal by extracting channel from session key pattern `agent:main:discord:channel:<id>`. First attempt fails; second succeeds. This adds latency but doesn't break functionality.

### Status

Documented. Investigation comment added. Not blocking.

---

## P4 — Fan-Out Flood: Lane Congestion Under Parallel Load

**Severity:** Low — only manifests under deliberate stress test.
**Location:** `src/agents/subagent-registry.ts` → session lane management
**Symptom:** Five parallel shards posting to same session lane cause `lane wait exceeded` up to 46s.

### Root Cause

Session lanes serialize announces for ordering guarantees. Five parallel shards all targeting the same parent session create a queue depth of 4-5. Each announce can take 5-10s (model response time), so the last shard in queue waits 40-50s.

### Evidence

```
6-10: lane wait exceeded (46s), queue depth 4
6-10: gateway announce timeout 60s on one call under flood load, retried successfully
```

### Possible Mitigation

- Increase lane concurrency for announce-only operations (they're idempotent).
- Or accept as inherent to high fan-out — the cap exists to prevent exactly this.

### Status

Documented. Not blocking. The `maxDelegatesPerTurn` cap (P2 fix) is the proper guard.

---

## P5 — Partial Session Leak on Forbidden Spawns

**Severity:** Low — wasted resources, not a correctness issue.
**Location:** `src/agents/subagent-registry.ts` → spawn infrastructure
**Symptom:** When spawn-infra rejects a spawn (over cap), a session may already be allocated before rejection. The session is orphaned.

### Evidence

From 6-10 flood test: 10 delegates dispatched, 5 spawned, 5 rejected. The 5 rejected may have partially allocated sessions before the cap check.

### Possible Fix

Move cap check before session allocation, or add cleanup for rejected spawns.

### Status

Documented. Low priority.

---

## Architectural Findings

### Fan-Out vs Chain: Different Mechanisms

- **Fan-out** = parallel siblings dispatched in one turn. Capped by `maxDelegatesPerTurn`.
- **Chain** = sequential hops where each shard dispatches the next. Capped by `maxChainLength`.
- Different counters, different caps. A shard can chain (via brackets) but cannot fan-out (via tool) — `continue_delegate` is in `SUBAGENT_TOOL_DENY_ALWAYS`.
- **Proposed:** Move to `DENY_LEAF` — coordinator shards can fan-out, leaf shards can't. Enables tree dispatch without infinite recursion.

### Sticky Silent Inheritance

`chainSilent = completionResult.signal.silent || params.silentAnnounce`

Silent only inherits `true`, never `false`. By design — safety feature prevents accidental channel spam from deep chains. Proposed `| loud` suffix for explicit override.

### Model Gravitates to Familiar Options

Shards default to `silent-wake` when the system prompt describes it, even when the task explicitly says "post visibly." The model pattern-matches on familiar instructions over task-specific overrides. Scrubbing "silent-wake" from instruction files was required for visible chain test (6-6).

### Generation Guard Gates Timer Fire, Not Execution

Timer fires the spawn, then shard runs independently. The generation guard checks at timer-fire time, not at shard completion. A 69s shard (6-9b) survived a Discord WebSocket reconnect mid-execution because the guard had already passed.

### Delegate-from-Delegate (Tree Dispatch)

Current: shards can chain serially (brackets) but cannot fan-out (tool denied).
Proposed architecture: sub-from-sub collapses to parent OR reports direct to main (mast cell pattern). Global budget cap, not topology restrictions. Filed as #205 on karmaterminal/openclaw-bootstrap.

---

## Test Environment

- **OpenClaw:** 2026.3.2 (build `85377a2`)
- **Model:** `anthropic/claude-opus-4-6` (all four nodes)
- **Canary:** Silas (WSL2) — `feature/context-pressure-squashed` dist overlay, build `3a03f4658`
- **Fleet:** 4 DGX Spark + Intel NUC nodes, all on same git HEAD (`2c97c87`)
- **Config:** `agents.defaults.subagents.maxSpawnDepth: 5`, `maxConcurrent: 16` (post-fix)

---

## Commits

| Commit       | Author           | Description                                                 |
| ------------ | ---------------- | ----------------------------------------------------------- |
| `325bf22f0`  | Ronan 🌊 (Codex) | P1+P2: closure capture + hot-reload for continuation guards |
| (local only) | Cael 🩸 (manual) | P0: `>=` in announce guard + chain-hop prefix               |
| (stashed)    | Silas 🌫️ (Codex) | P1: tolerance closure fix (single-file approach)            |

All changes local. Code freeze active on upstream. Awaiting operator clearance.
