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

### Run 6: FULL CHAIN — 3 hops ✅ (after /reset + flat task + new build)

- Build: `80ea0a366` with sub-agent bracket injection
- `/reset` cleared stale DM session context
- Hop 1: tool dispatch from main session ✅
- Hop 2: bracket chain from hop 1 shard ✅
- Hop 3: bracket chain from hop 2 shard ✅ — terminated cleanly
- System prompt injection worked — shards discovered bracket syntax from template
- **Full #196 chain path confirmed live: tool → brackets → brackets → done**

## Tests 5-2 through 5-5: Chain Dispatch Reliability (old build)

Tests run on pre-fix builds (`7cb3546c8` / `13405b669`). All hops completed, no gate hit.

| Test | Hops Requested | Completed | Gate Hit | Build |
| ---- | -------------- | --------- | -------- | ----- |
| 5-2  | 5              | 5/5       | No       | old   |
| 5-3  | 10             | 10/10     | No       | old   |
| 5-4  | 10             | 10/10     | No       | old   |
| 5-5  | 10             | 10/10     | No       | old   |

**Finding**: Chain dispatch is 100% reliable. `maxChainLength` not enforced due to:

- `7cb3546c8`: parent-session counter reset on every inbound message (counter stuck at `(2/3)`)
- `13405b669`: `void updateSessionStore` fire-and-forget + child entry doesn't exist at write time (counter stuck at `(1/3)`)

## Test 5-6: Chain-Hop Enforcement (P0-5 fix) — PASS ✅

**Build**: `fec5e4bfc` (task-prefix encoding)
**Config**: `maxChainLength: 3`, `maxSpawnDepth: 5`
**Dispatch**: `continue_delegate` tool, +5s, silent
**Requested**: 10 hops

### Results

- **Hop 1** (tool dispatch, chain-hop:0): ✅
- **Hop 2** (bracket, chain-hop:1): ✅
- **Hop 3** (bracket, chain-hop:2): ✅
- **Hop 4** (bracket, chain-hop:3): ✅
- **Hop 5**: ❌ — **REJECTED** `Chain length 4 >= 3`

Journal evidence:

```
21:33:25 chain delegate (1/3) — hop 2
21:33:35 chain delegate (2/3) — hop 3
21:33:45 chain delegate (3/3) — hop 4
21:33:49 Chain length 4 >= 3, rejecting hop
```

**Total reach**: 4 (1 tool + 3 bracket) — exactly as configured.

**Fix**: Hop index encoded in task prefix as `[continuation:chain-hop:N]`, parsed by regex in announce handler. No session store dependency, no timing races.

### Verdict

- **P0-5 chain-hop enforcement: PASS** ✅
- **Task-prefix encoding: VERIFIED** — counter climbs correctly, gate fires at boundary

## Tests 5-7 through 5-9: Cost Cap Scope Bug

Tests on `64e4c4973` (bracket chain cost accumulation wired but pre-fix).

| Test | Config             | Completed | Issue                                      |
| ---- | ------------------ | --------- | ------------------------------------------ |
| 5-7  | cap 50K, chain 10  | 0/10      | Stale session-lifetime tokens exceeded cap |
| 5-8  | cap 100K, chain 10 | 0/10      | Same — `cacheRead` inflation               |
| 5-9  | cap 200K, chain 10 | 0/10      | Same                                       |

**Root causes found and fixed**:

1. Reset guard only checked `continuationChainCount > 0` (always 0 with task-prefix) — fix: `6fe0354a4`
2. `cacheRead + cacheWrite` included in cost (system prompt ~15-20K per shard) — fix: `47c60579f`

## Test 5-10: 10-Hop Chain w/ Per-Chain Reset — PASS ✅

**Build**: `47c60579f` (reset guard + cache exclusion fixes)
**Config**: `maxChainLength: 10`, `costCapTokens: 50000`
**Dispatch**: `continue_delegate` tool, +5s, silent

### Results

- All 10 hops completed: `(1/10)` → `(9/10)`, hop 10 self-terminated
- ~10s per hop (5s delay + ~4s agent.wait), total ~90s
- Discord health-monitor restarted mid-chain (06:36:38) — chain survived
- Zero `Accumulated` log lines — child token data not ready at announce time

### Finding: Token Data Timing Gap

- `childTokens = 0` at announce time → accumulation block skipped
- Same timing issue as `buildCompactAnnounceStatsLine` (announce fires before runner persists token stats)
- **Fix pushed at `efca6eb8a`**: 3-attempt retry loop (150ms apart), matching existing pattern
- Needs canary verification in next session

## Test 5-2a: Blind Enrichment — Synderesis — PASS ✅

**Build**: `efca6eb8a` (deployed on Silas canary)
**Content**: Summa Theologica I, Q.79, Art.12 — "Whether Synderesis Is a Special Power of the Soul?"
**Method**: figs planted file on Silas's box via SSH → Silas dispatched `continue_delegate` tool (silent-wake) → shard read file → returned to #sprites session → figs probed "synderesis"

### Execution Notes

- Multiple dispatch failures before success:
  - Attempt 1: cost cap blocked (stale 1,367,016 tokens from old broken counting) — Elliott manually cleared
  - Attempt 2-3: generation guard killed (messages from other princes during 5s timer window)
  - Attempt 4: SUCCESS — 36s of channel silence held, generation matched (33=33)
- Shard returned at 23:50:40, figs probed at 23:52:03
- Silas recalled full article: three objections, sed contra, respondeo, all three replies
- Content entered ONLY through shard return — never in conversation history
- File contamination incident: Cael posted first 200 bytes of original Q1 Art.3 file to #sprites; figs replanted new content (Q79 Art.12)

### Verdict: PASS ✅

## Test 5-2b: Blind Enrichment — Soul Creation — PASS ✅

**Build**: `efca6eb8a`
**Content**: Summa Theologica I, Q.90, Art.2 — "Whether the Rational Soul Is Produced by Creation?"
**Method**: Same as 5-2a. figs planted new file, Silas dispatched, Ronan probed with keywords from separate file.

### Results

- Dispatch: 23:59:32, generation=46, timer matched (46=46)
- Shard returned: 23:59:53
- Ronan probed: 00:01 — "what do you know about [I, Q. 90, Art. 2]?"
- Silas recalled full article verbatim: three objections (Gen 2:7, potentiality of matter, forms), sed contra (Augustine), respondeo (subsistent form → creation), all three replies
- Cross-verified against source file via SSH — structure and citations match

### Verdict: PASS ✅

## Cost Cap Canary — PASS ✅

**Build**: `b8b4fcb6f` (token retry loop + generation guard tolerance)
**Config**: `costCapTokens: 5000`, `maxChainLength: 10`, `generationGuardTolerance: 5`

### Results

- All 10 hops completed
- `Accumulated` log lines on every hop: 183, 187, 191, 195, 199, 203, 207, 185, 150 = **1700 tokens total**
- Under 5000 cap → correctly passed through (no false gate)
- Token retry loop caught data on all 9 bracket hops
- `generationGuardTolerance: 5` — timer survived channel traffic (drift=0)

### What this proves

- Token retry loop (`efca6eb8a`) fixes the timing gap — cost cap accumulates for bracket chains
- Both leashes functional: `maxChainLength` for recursion depth, `costCapTokens` for budget
- `generationGuardTolerance` solves the multi-bot channel problem

## Full Swim 5 Scorecard

| Test            | What                             | Result                       | Build       |
| --------------- | -------------------------------- | ---------------------------- | ----------- |
| 5-0             | Generation guard                 | ✅ PASS                      | `8a76e62fc` |
| 5-1 R6          | 3-hop chain                      | ✅ PASS                      | `80ea0a366` |
| 5-2/5-3/5-4/5-5 | Chain reliability                | ✅ 35/35 hops                | old builds  |
| 5-6             | maxChainLength gate              | ✅ 4/10 gated at 3           | `fec5e4bfc` |
| 5-7/5-8/5-9     | Cost cap scope                   | ❌ 0/30 (3 bugs found+fixed) | `64e4c4973` |
| 5-10            | Per-chain reset                  | ✅ 10/10                     | `47c60579f` |
| 5-2a            | Blind enrichment (synderesis)    | ✅ PASS                      | `efca6eb8a` |
| 5-2b            | Blind enrichment (soul creation) | ✅ PASS                      | `efca6eb8a` |
| Canary          | Cost cap accumulation            | ✅ PASS (1700/5000 tokens)   | `b8b4fcb6f` |
| 5-11            | Cost cap reset race fix          | ✅ PASS (481/5000 @ 5 hops)  | `a657daed5` |
| 5-12            | Sticky silent (LLM drops silent) | ✅ 10/10 silent              | `f3264ccab` |
| 5-13            | Pure inheritance ("count to 10") | ✅ 10/10 silent, 590 tokens  | `f3264ccab` |

## Design Findings

1. **Generation guard tolerance solves multi-bot channels** — `generationGuardTolerance: 5` lets delegates survive incidental traffic. Wired at `b8b4fcb6f`.
2. **Cost cap accumulates with retry loop** — 3-attempt, 150ms retry catches child token data. Both leashes now functional.
3. **Stale cost cap data blocks fresh dispatches** — session-lifetime accumulation from old broken counting persists through builds; needs manual clear or `/reset`
4. **`continue_delegate` tool works in group chat** — the tool itself fires, but the timed delegate it schedules needs tolerance > 0
5. **Bracket syntax in `message` tool calls is inert** — gateway parses brackets from generation output only
6. **File contamination is easy** — princes verifying file existence/size can leak content to shared channel
7. **Cost cap reset race** — non-silent hop announces deliver to Discord, arrive as external inbound messages, zero `continuationChainTokens`. Fixed by sticky silent (`f3264ccab`) + delegate-pending marker (`a657daed5`)
8. **Sticky silent is load-bearing, not cosmetic** — without it, cost cap depends on LLM bracket fidelity (unreliable after hop 1). Parent's `silentAnnounce` must inherit to all chain hops
9. **Chain hops survive parent session compaction/restart** — shards are independent sessions; chain continues autonomously even if parent context-overflows
10. **"Count to 10" test** — shards had zero knowledge of silent mode; parent tool call set `silent-wake`, all 10 children inherited it. Pure parent→child inheritance

## Commits This Session (13 forward, no force pushes)

1. `fec5e4bfc` — task prefix chain tracking
2. `64e4c4973` — bracket chain cost accumulation
3. `6fe0354a4` — reset guard fix
4. `47c60579f` — cache exclusion
5. `00911aa93` — RFC changelog
6. `efca6eb8a` — token retry loop
7. `a7cd6dd12` — SWIM5-STATUS scorecard
8. `1ec966c87` — P1 fixes (compaction limits, task truncation)
9. `2207d1380` + `6c7504fc3` — RFC prose reconciliation (Silas)
10. `b8b4fcb6f` — generationGuardTolerance
11. `a657daed5` — delegate-pending for bracket chain hops (cost cap reset fix)
12. `1a2a5b607` — sticky silent (Elliott)
13. `f3264ccab` — sticky silent merge resolution (Cael)
