# SWIM 5 STATUS — 2026-03-05 17:54 PST

## Test 5-0: Generation Guard (P0-1)

### Results

- **Round 1**: Happy path PASS — tool dispatch + 30s timer + shard return all work correctly
- **Round 2**: Preemption FAIL — figs DM'd "hey" during 30s window, timer still fired
- **Root cause found**: `isDelegateWake` misclassification (P1-1 → promoted to P0-4)
  - `[continuation:delegate-pending]` in event queue → `isDelegateWake = true` for ANY message
  - `isContinuationWake = true` → `isContinuationEvent = true` in `runReplyAgent`
  - Line 220 guard `!isContinuationEvent` → false → generation bump skipped → timer fires uncancelled
  - All 4 princes converged independently on this root cause

### Fix (already pushed)

- Commit: `8a76e62fc`
- Announce pipeline enqueues `[continuation:delegate-returned]` one-shot marker before completion
- `isDelegateWake = hasDelegatePending && hasDelegateReturned`
- Real user messages don't have `delegate-returned` → `isDelegateWake = false` → guard fires
- One-shot marker consumed after detection to prevent persistence
- 173 tests green, TypeScript clean

### Round 3 — PASS ✅

- Build: `8a76e62fc` (with isDelegateWake fix)
- Dispatch: 18:13:23, generation=1
- figs "hey": 18:13:48, generation bumped to 3
- Timer fired: 18:13:53, stored=1 current=3 → MISMATCH → CANCELLED
- No shard spawned. Preemption confirmed.

### Verdict

- **P0-1 generation guard: PASS** ✅
- **P0-4 isDelegateWake fix: PASS** ✅

## Test 5-1: Chain-Hop Bounds (P0-3) — PARTIAL PASS

### Run 1: `maxSpawnDepth` gates first

- Config: `maxSpawnDepth: 2`, `maxChainLength: 3`
- Shards used `sessions_spawn` (not brackets) — hit `maxSpawnDepth` at depth 2
- Finding: `sessions_spawn` bypasses chain tracking by design (bounded by `maxSpawnDepth` instead)

### Run 2: Config bumped, shards still use `sessions_spawn`

- Config: `maxSpawnDepth: 5`, `maxChainLength: 3`
- All 5 hops via `sessions_spawn` — `maxChainLength` never tested
- Finding: shards prefer `sessions_spawn` over brackets (same as swim 4)

### Run 3: Bracket path — FIRST CHAIN HOP CONFIRMED ✅

- Hop 1 emitted flat `[[CONTINUE_DELEGATE: ...]]` → gateway parsed → spawned hop 2
- `[subagent-chain-hop] Spawned chain delegate (2/3)` — chain counter live
- Hop 2 emitted `[` not `[[` — chain died on malformed bracket

### Runs 4-5: Nested bracket problem

- Shards pre-nested entire chain in one emission
- Regex `(?!\]\])` stops at first `]]` — can't handle nesting
- Each shard should emit ONE flat bracket (architecture is correct, task phrasing was wrong)

### Findings

- ✅ Chain tracking works — `(2/3)` confirmed live
- ✅ `doChainSpawn` fires and increments chain counter correctly
- ✅ `maxSpawnDepth` and `maxChainLength` interact: effective ceiling is `min(both)`
- ✅ `sessions_spawn` bypasses chain tracking by design
- ✅ 173 unit tests cover `>=` boundary and rejection
- 📝 Shards unreliably emit flat brackets — system prompt injection needs exact template
- 📝 `continue_delegate` tool denied for sub-agents — brackets are only chain-hop path

## Test 5-2: Silent-Wake Enrichment + Blind Recall — Not yet started
