# WORKLOG — Continuation Rebase onto v2026.4.14

**Branch:** `flesh_beast_figs/20260414-claude`
**Base:** `v2026.4.14^{}` (`323493fa1b`)
**Agent:** Claude (figs lane)
**Started:** 2026-04-15

---

## Session 1 — Phase 0: Hybrid Audit

**Goal:** Read old branch's agent-runner.ts continuation regions, map to extracted modules.
**Status:** starting

### Findings

Old runner (`feature/context-pressure-squashed`): 2203 lines, 278 continuation-reference lines.
Clean base: 1754 lines, 0 continuation references. Delta: ~449 lines of continuation stuffed in.

**Block 1: Signal parsing + merging** (old lines ~1010-1090)

- Bracket detection: backward scan through payloads for last text, `stripContinuationSignal()`
- Tool-call merge: `continueWorkRequest` from run outcome → `effectiveContinuationSignal`
- Generation reservation at parse time (EXPUNGE — this was for the drift guard)
- Log anchors: `[continuation:trace] payload-scan`, `bracket-parse`, `effective-signal`
- **→ Maps to: `continuation/signal.ts`**

**Block 2: Inbound-noise cleanup** (old lines ~490-580)

- Clears chain metadata, bumps generation on external messages
- THIS IS THE BUG — kills delayed delegates via channel noise
- **→ DROP ENTIRELY. Delayed delegates survive noise. No generation guard.**

**Block 3: Chain state persistence** (old lines ~740-790)

- `persistContinuationChainState()` inline closure — writes count/startedAt/tokens to session
- Has its own try/catch, won't throw
- **→ Maps to: `continuation/state.ts`**

**Block 4: Scheduling block** (old lines ~1638-1900)

- Chain cap check (`allocatedChainHop >= maxChainLength`)
- Cost cap check (`costCapTokens > 0 && accumulated > cap`)
- Token accumulation
- Delegate path: `doSpawn()` for immediate, `setTimeout` + reservation for delayed
- Work path: `setTimeout` + `requestHeartbeatNow` for timer fire
- Generation guard throughout (EXPUNGE)
- **→ Maps to: `continuation/scheduler.ts` + `continuation/delegate-dispatch.ts`**

**Block 5: Tool-delegate consumption** (old lines ~1900-2100)

- `consumePendingDelegates()` then per-delegate for-loop
- Per-turn cap enforcement (`maxDelegatesPerTurn`)
- Mixed bracket+tool accounting
- Same spawn logic as Block 4, duplicated
- **→ Maps to: `continuation/delegate-dispatch.ts` (unified, not duplicated)**

**Old files that have good shape to reference:**

- `continue-work-tool.ts`: clean, 80 lines, good callback pattern
- `continue-delegate-tool.ts`: need to check
- `continuation-delegate-store.ts`: volatile Map + TaskFlow gate, clean separation
- `continuation-state.ts`: HEAVILY generation-guard coupled — needs full rewrite without guard

### CRITICAL FINDING: 10/10 "failures" were silent successes (2026-04-15, Silas)

The main-session tool-delegate consumption path **was NOT broken**. The 10/10
"failures" from Apr 14 file-log evidence were an observability hole:

- `doToolSpawn` in agent-runner.ts only logs on `timerTriggered` spawns.
  Immediate spawns (no delay) take the success path with NO gateway log —
  only `enqueueSystemEvent` which goes to the agent's system prompt, invisible
  to the operator.
- `subagent-announce.ts` ALWAYS logs on success regardless of `timerTriggered`.
  That's the asymmetry that made the subagent path look healthier.
- Silent delegates (`silentAnnounce: true`) produce zero gateway-visible output
  across their entire lifecycle.

**Corrected diagnosis — two separate bugs, not one:**

1. **Observability hole** (immediate tool delegates succeed silently):
   Fix = add logging parity with subagent-announce path. NOT a functional failure.

2. **Timer-killed-by-inbound** (delayed delegates cleared by session-entry cleanup):
   Fix = expunge generation guard / session-entry cleanup of continuation state.
   THIS is the real bug that figs's ruling addressed.

**Impact on this rebuild:** We are NOT fixing a broken consumption path. We are:

- Adding logging/observability parity on the immediate tool-delegate success path
- Removing the noise-kill mechanism (generation guard expunction)
- Building the continuation surface clean with proper instrumentation from the start

### Classification summary

| Old location                                  | Keep/Drop                    | New home                            |
| --------------------------------------------- | ---------------------------- | ----------------------------------- |
| Signal parsing (runner ~1010-1090)            | KEEP (re-home)               | `continuation/signal.ts`            |
| Inbound-noise cleanup (runner ~490-580)       | **DROP**                     | nowhere — bug, not feature          |
| Chain persistence (runner ~740-790)           | KEEP (re-home)               | `continuation/state.ts`             |
| Scheduling block (runner ~1638-1900)          | KEEP (rewrite without guard) | `continuation/scheduler.ts`         |
| Tool-delegate consumption (runner ~1900-2100) | KEEP (unify with scheduling) | `continuation/delegate-dispatch.ts` |
| `continue-work-tool.ts`                       | KEEP as-is                   | same path                           |
| `continue-delegate-tool.ts`                   | KEEP (check)                 | same path                           |
| `continuation-delegate-store.ts`              | KEEP (clean)                 | `continuation/delegate-store.ts`    |
| `continuation-state.ts`                       | REWRITE (remove guard)       | `continuation/state.ts`             |
| `continuation-runtime.ts` (config)            | KEEP (remove guard fields)   | `continuation/config.ts`            |
| `context-pressure.ts`                         | KEEP                         | `continuation/context-pressure.ts`  |

---

## Session 1 — Phases 1-4 Progress

### Phase 1: Foundation (DONE)

- `continuation/types.ts`: ContinuationSignal, PendingDelegate, config types
- `continuation/config.ts`: resolveContinuationRuntimeConfig (no generation guard)
- `continuation/signal.ts`: bracket + tool-call merge → unified signal
- `tokens.ts`: parseContinuationSignal + stripContinuationSignal
- `config/types.agent-defaults.ts`: continuation config block
- 37 tests (config, tokens, context-pressure)

### Phase 2: Core modules (DONE)

- `continuation/state.ts`: timer handles, delegate flags (no generation tracking)
- `continuation/delegate-store.ts`: volatile Map + TaskFlow gate + work request store
- `continuation/scheduler.ts`: chain/cost enforcement, timer scheduling (no drift guard)
- `continuation/context-pressure.ts`: band dedup, post-compaction fire

### Phase 3: Tools (DONE)

- `tools/continue-work-tool.ts`: store-based (setPendingWorkRequest, not callback)
- `tools/continue-delegate-tool.ts`: enqueue to delegate store, mode support
- Registered conditionally in `openclaw-tools.ts` when `continuation.enabled === true`

### Phase 4: Runner integration (IN PROGRESS)

- Signal extraction wired after payloadArray creation
- Empty-payload guard accounts for continuation signals/delegates
- WORK timer scheduling via scheduler module
- Tool-delegate consumption logged (spawn wiring pending)
- Silent continuation finalization
- SessionEntry extended with chain metadata

### Phase 5 (Step 1): TaskFlow delegate backend (DONE)

- `delegate-store-taskflow.ts`: controllerId='core/continuation-delegate', TaskFlow-backed
- `delegate-store.ts`: rewritten — TaskFlow is production path, volatile Map is test-only
- Collect-then-cleanup pattern, cancel preserves audit trail

### Step 9 implementation note (from prince room)

- Current source: `DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH = 1`, leaf = depth >= maxSpawnDepth
- `drainsContinuationDelegateQueue` flag must exempt chain-hop children from leaf deny
- Policy: deny `continue_delegate` on leaf workers; allow `continue_work` + `request_compaction` on all children
- This is a behavior-model change, not just a deny-list edit

### Steps 6-9 completed

- Step 6: Silent/wake announce routing — `silentAnnounce`/`wakeOnReturn` flags threaded through
  spawn → registry → announce. System event delivery + heartbeat wake for silent delegates.
- Step 7: Post-compaction delegate release — after compaction, consume staged delegates and
  dispatch with silentAnnounce+wakeOnReturn. Context-pressure fires post-compaction unconditionally.
- Step 8: request_compaction opts threading — `getContextUsage` and `triggerCompaction` wired
  from execution layer through attempt → pi-tools → openclaw-tools.
- Step 9: Leaf deny — `continue_delegate` added to SUBAGENT_TOOL_DENY_LEAF. Chain-hop exemption
  via `drainsContinuationDelegateQueue` → orchestrator role override.

### RFC fixes applied

- §4.3: Removed stale generation guard reference from guard table
- §5.1: Removed taskFlowDelegates config option (always on)
- §5.4: Updated to reflect unconditional TaskFlow backing
- Tool display metadata added for all 3 tools

### What remains (ordered per approved plan)

**Compaction cluster (Steps 8, 7):**

- request_compaction opts threading through pi-tools → openclaw-tools → attempt
- Post-compaction delegate release in after-compaction lifecycle path
- pendingPostCompactionDelegates on SessionEntry for persistence

**Delegate dispatch + observability (Steps 2, 5):**

- delegate-dispatch.ts: spawnSubagentDirect integration, info-level logging on ALL spawns
- Chain state write-back to session entry after scheduling

**Feature-completing (Steps 3, 4):**

- Context-pressure pre-run injection into runner
- System prompt gating (tool/token teaching)

**Lifecycle + announce (Step 6):**

- Announce-boundary chain-hop consumption in subagent-announce.ts
- Silent/wake routing

**Safety + polish (Steps 9, 10, 11):**

- Leaf subagent tool deny (flag-based, not depth-based)
- /status continuation telemetry
- Full test suite
