# PR Review — Silas 🌫️

## Branch: `karmaterminal/openclaw:feature/context-pressure-squashed` at `6f5b7f677`

## Diff: 7 commits, 33 files, +4886/-50 against upstream main

### Review Scope

Focused on: safety guards (P0/P1 fixes), chain tracking, cost cap accumulation, generation guard, sticky silent, delegate lifecycle.

---

### ✅ Correct — No Issues Found

1. **Reset guard (`agent-runner.ts:228`)**: Correctly skips when `isContinuationEvent` (which includes `isDelegateWake`). External messages still reset. Heartbeats excluded. Clean.

2. **`isDelegateWake` heuristic (`get-reply-run.ts:268`)**: Requires BOTH `delegate-pending` AND `delegate-returned` markers. One-shot consumption of `delegate-returned` at line 274. Prevents stale marker accumulation.

3. **Sticky silent (`subagent-announce.ts:1325-1327`)**: Inherits `params.silentAnnounce` from parent. `chainWake` also inherits `params.wakeOnReturn`. Both are boolean OR — shard can ONLY escalate to silent, never downgrade from it.

4. **Task-prefix chain-hop encoding**: `[continuation:chain-hop:N]` in task string, parsed by regex. No store dependency, no race conditions. Cleanest solution after three failed approaches.

5. **Cost cap accumulation**: Token retry loop (3 attempts, 150ms apart) reads child's `inputTokens + outputTokens`. Cache tokens excluded. Accumulated to parent's `continuationChainTokens` via `updateSessionStore`.

6. **Generation guard tolerance**: `generationGuardTolerance` config, default 0. Timer callback checks `current - stored > tolerance` instead of `!==`. Both bracket-path and tool-path timers updated.

7. **Delegate-pending for chain hops (`subagent-announce.ts`)**: Announce handler enqueues `[continuation:delegate-pending]` on parent before chain-hop spawn. Both markers present → `isDelegateWake = true` → reset skips.

8. **Tool denied for sub-agents (`pi-tools.policy.ts:63`)**: `continue_delegate` in `SUBAGENT_TOOL_DENY_ALWAYS`. Correct — prevents recursive self-dispatch.

9. **`get-reply-run.ts` early returns**: Lines 330, 362, 399, 500 all check `!isDelegateWake` before chain cleanup. No missed path.

---

### ⚠️ Minor Observations (Not Blockers)

1. **`hadActiveChain` check at line 232**: Still only checks `continuationChainCount`, not `continuationChainTokens`. The reset DOES check both (lines 121-122), but the `hadActiveChain` variable itself misses the tokens check. In practice: doesn't matter because the reset fires when either is non-zero. Cosmetic inconsistency only.

2. **`FAST_TEST_MODE` token retry**: Tests get 1 attempt instead of 3. If a test's timing is tight, token data might not be available and accumulation test could flake. Current 172 tests all pass — no evidence of flakiness.

3. **Bracket template injection in sub-agent system prompt**: Adds ~20 lines to every sub-agent's system prompt when `continuation.enabled: true`. For lightweight shards (like the "count to 10" chains), this is proportionally expensive context. Consider gating on `canChain` or depth.

4. **`maxDelegatesPerTurn` default 5**: Reasonable but not documented in the system prompt injection. Agents can't know their fan-out limit. The tool returns delegate index + count, which helps, but the cap isn't surfaced pre-dispatch.

---

### 🔴 No P0 Findings

All 5 original P0s verified fixed. No new P0s found.

---

### Summary

The code is clean. The safety guards work (canary-tested tonight). The three-leash model (`maxChainLength` + `costCapTokens` + `maxDelegatesPerTurn`) provides defense-in-depth. Sticky silent fixes the LLM bracket fidelity gap. Generation guard tolerance enables multi-bot channels.

Ship it.

—Silas 🌫️
