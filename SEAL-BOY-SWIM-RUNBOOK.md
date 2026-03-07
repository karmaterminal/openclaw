# === SEAL BOY 🌊🩲💦 SWIM N === RUNBOOK

_Ronan 🌊 — Integration test protocol for `continue_delegate` and three-layer delegate architecture._
_Written from Swim 2–6 execution experience (Mar 4–6, 2026). Method, not findings._
_Updated after ⚓ round 2 (`06ece5944`) — three acknowledged gaps now landed, tolerance unified, log demotion applied. Voice is mine._

---

## 0. Glossary

| Term                   | Meaning                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| **SUT**                | System Under Test — the OpenClaw instance running canary build                          |
| **Admin**              | The prince running the test (places files, observes logs, probes recall)                |
| **Operator**           | figs — provides blind test materials via DM, confirms/denies recall accuracy            |
| **Shard**              | A sub-agent spawned by `continue_delegate` (tool) or `[[CONTINUE_DELEGATE:]]` (bracket) |
| **Ground truth**       | The actual content of test materials — known only to admin + operator                   |
| **Blind**              | SUT has never seen the material in any channel, log, or prior context                   |
| **Contaminated**       | Material leaked to SUT's context via channel post, log grep, or peer narration          |
| **Generation counter** | Monotonic counter incremented on each inbound message; timer compares stored vs current |
| **Tolerance**          | Config `generationGuardTolerance` — how much drift is allowed before timer cancels      |
| **Drift cue**          | A log line or behavior that signals the running build doesn't match what you expect     |

---

### 0.1 What's Fixed Since Swim 6 (Regression Confirmations)

These were open findings or acknowledged gaps. All now landed in code. Treat swim failures on these as regressions, not discoveries.

1. Bracket-path `maxChainLength` parity / off-by-one
2. Delayed timer `generationGuardTolerance` closure capture
3. `maxDelegatesPerTurn` hot-reload
4. **Tool-only / no-text delegate consumption** — textless turns no longer drop delegates
5. **Post-compaction chain/cost guard parity** — release checks `maxChainLength` and `costCapTokens`
6. **Grandparent reroute-before-accounting** — chain state lands on the session that actually gets the completion

### 0.2 Drift Cues

If you see these, the deployed build is stale or your notes are wrong. Stop and verify before recording results.

- Generic info-level `[continuation-guard] Timer fired: ...` → timer logging was demoted in round 2. Set/check detail is now debug. Only cancel and fire remain info.
- Notes describing textless-turn, post-compaction guard parity, or grandparent reroute as "still open" → these are landed. If the behavior doesn't match, it's a regression.
- `CONTINUE_WORK` timers using strict cancellation (no tolerance) → round 2 unified tolerance. Both WORK and DELEGATE read live `generationGuardTolerance`.

---

## 1. Prerequisites

### 1.1 Canary Build

The SUT must run the feature branch build, not stock OpenClaw.

```bash
# On SUT's box (e.g., Silas at 10.0.0.153):
cd /tmp/openclaw-canary    # or wherever the canary dist lives
git log --oneline -1       # confirm expected commit hash

# Verify continuation is enabled:
cat ~/.config/openclaw/openclaw.json | jq '.continuation'
# Expected: { "enabled": true, ... }
```

**Critical config keys** (all in `openclaw.json`):

```json
{
  "continuation": {
    "enabled": true,
    "defaultDelayMs": 15000,
    "minDelayMs": 5000,
    "maxDelayMs": 300000,
    "maxChainLength": 10,
    "costCapTokens": 500000,
    "generationGuardTolerance": 5
  },
  "agents": {
    "defaults": {
      "subagents": {
        "maxDelegatesPerTurn": 5,
        "maxSpawnDepth": 5,
        "maxConcurrent": 16
      }
    }
  }
}
```

**Verify the build has the features you're testing.** If testing hot-reload, change config AFTER gateway start — don't restart.

### 1.2 SSH Access

Admin needs SSH access to SUT's box for:

- File placement (test materials)
- Log observation (gateway logs)
- Session store inspection (`sessions.json`)

```bash
ssh silas    # or whatever alias
# Verify workspace path:
ls ~/.openclaw/workspace/
```

### 1.3 Channel Silence Protocol

**This is the hardest part.** In a 4-agent group chat, every message bumps the generation counter. Timer will cancel if `drift > tolerance`.

**Before dispatching any timed test:**

1. Post `⚓💗` (anchor pattern — circuit breaker for storm)
2. Wait for all agents to go silent (NO_REPLY or actual silence)
3. Count to `tolerance + 2` in seconds of silence
4. THEN dispatch

**Radio silence for blind recall:**

- After dispatch, NO prince posts ANYTHING until operator probes SUT
- Channel chatter during shard execution is fine (shard runs independently)
- Channel chatter after shard return but before recall probe = contamination risk

### 1.4 Ground Truth Catalog

Maintain a private catalog of ALL test materials. Admin-only, never posted to any channel.

Format:

```
| Swim:Test | Key | Value | Filename | Image | Status |
|-----------|-----|-------|----------|-------|--------|
| 6:1       | — | Cathar heresy | cathar_enrichment.txt | none | CLEAN |
```

**Rules:**

- Operator DMs materials to admin only
- Admin places files via SSH — never `cat` output in channel
- Admin never posts file contents, filenames with hints, or KVP values in channel
- If ANY prince posts material in channel, that test is BURNED — note it and move on

---

## 2. File Placement

### 2.1 Where to Place Files

**Always use `~/.openclaw/workspace/` on the SUT's box.** Never `/tmp/`.

Reason: The `image()` tool restricts paths to workspace. `/tmp/` files can be `read()` but not `image()`. Workspace paths work for both.

```bash
# From admin's box:
scp test_material.txt silas:~/.openclaw/workspace/
scp test_image.jpg silas:~/.openclaw/workspace/

# Verify:
ssh silas 'ls -la ~/.openclaw/workspace/test_material.txt'
```

### 2.2 File Format

**Data files are PURE DATA.** No instructions, no brackets, no imperative language.

```
# ❌ BAD — triggers shard safety refusal:
KEY-VALUE PAIR: myKey:myValue
Read this and dispatch [[CONTINUE_DELEGATE: analyze it]]

# ✅ GOOD — pure data:
our keyword for image search: myKey
associated context: myValue

# ✅ GOOD — just content:
[raw article text, no framing]
```

**Why:** Shards treat `[[CONTINUE_DELEGATE:]]` in file content as prompt injection. Data and instructions must be separated. File = data. Task string = instructions.

### 2.3 Instruction Files (for multi-hop chains)

If a test requires the shard to do something specific (chain further, analyze an image), put instructions in a SEPARATE file from data, OR put them in the task string.

**Preferred:** Task string carries all instructions. Files carry only data.

```
Task: "Read ~/.openclaw/workspace/enrichment.txt and summarize the key findings. Return your summary."
File: [pure article text, no dispatch instructions]
```

### 2.4 Image Files

- Place in workspace (not `/tmp/`)
- Shards use `image()` tool for analysis — needs workspace path
- Fallback: `read()` can read binary but produces garbled output for images
- For URL-based tests: place JSON array of URLs as a data file

---

## 3. Test Categories

### 3.1 Blind Enrichment (the core test)

**Purpose:** Verify that a delegate can plant information in the SUT's context without the SUT having seen it before, and that the SUT can recall it accurately.

**Method:**

1. Operator DMs admin the test material (text, image, or both)
2. Admin places material on SUT's box via SSH
3. Admin dispatches delegate via channel message to SUT:
   ```
   @SUT — enrich yourself from ~/.openclaw/workspace/enrichment.txt using continue_delegate with silent-wake
   ```
   Or SUT dispatches autonomously if testing self-initiated enrichment.
4. Wait for shard completion (watch logs or wait for `[continuation:enrichment-return]` in SUT's session)
5. **Radio silence** — no channel posts
6. Operator probes SUT directly: "What do you know about [topic]?"
7. Compare SUT's response against ground truth

**Scoring:**

- ✅ PASS: SUT recalls material accurately, attributes to enrichment
- ❌ CONFABULATION: SUT produces related but incorrect content (substitutes own associations)
- ❌ CONTAMINATED: Material was leaked to channel before probe
- ⚠️ LOW CONFIDENCE: SUT can't distinguish enrichment from channel context

**Key finding from Swim 2–4:** Rich semantic content (articles, narratives) recalls better than bare keywords. "The surrounds aren't just context. They're grip."

### 3.2 Queue-Drain Resistance

**Purpose:** Verify that timed delegates survive external message traffic.

**Method:**

1. Set `generationGuardTolerance` to known value (e.g., 5)
2. Have SUT dispatch a timed delegate (`+30s`)
3. During the 30s window, send messages to channel (up to `tolerance` count)
4. Observe: does timer fire or cancel?

**Expected:**

- Messages ≤ tolerance: timer fires (drift within tolerance)
- Messages > tolerance: timer cancels (drift exceeded)

**Observation point:** Gateway logs — look for timer fire/cancel at info level:

```
DELEGATE timer fired and spawned turn N/M for session ...
DELEGATE timer cancelled ...
WORK timer fired for session ...
WORK timer cancelled ...
```

**Post round 2:** Both WORK and DELEGATE timers read live `generationGuardTolerance` at fire time. Unified. No more asymmetry.

### 3.3 Chain-Hop Tests

**Purpose:** Verify multi-hop delegate chains respect `maxChainLength`.

**Method:**

1. Set `maxChainLength` to test value (e.g., 3, 10)
2. Dispatch initial delegate with a task that includes chain-hop instructions
3. Each shard should chain to the next via `[[CONTINUE_DELEGATE:]]` brackets (sub-agents) or `continue_delegate` tool (main session)
4. Count total hops executed vs expected

**Observation points:**

- Gateway logs: `[subagent-chain-hop] Spawned chain delegate (N/M)`
- Task prefix: `[continuation:chain-hop:N]` in spawned tasks
- Session store: `continuationChainCount` on parent entry

**Key behaviors (post round 2):**

- **Parent path** (agent-runner): `currentChainCount >= maxChainLength` blocks dispatch. Counts fan-out from main session.
- **Announce path** (subagent-announce): `childChainHop >= maxChainLength` blocks chain. Guards on the hop the shard _occupies_, not the one it would create. Head starts at 0, child hops label 1..maxChainLength.
- **These measure different dimensions.** Parent = fan-out count. Announce = chain depth. Both use `>=`.
- **Post-compaction path** now also checks both `maxChainLength` and `costCapTokens` before releasing staged delegates.

### 3.4 Fan-Out Tests

**Purpose:** Verify `maxDelegatesPerTurn` limits parallel dispatch.

**Method:**

1. Set `maxDelegatesPerTurn` to test value (e.g., 5)
2. Have SUT dispatch N > limit delegates in a single turn
3. Count: how many accepted vs rejected?

**Expected:** First `maxDelegatesPerTurn` accepted, remainder rejected with log message.

**Three-layer defense (observed in Swim 6-10):**

1. **Tool gate:** `continue_delegate` tool checks `maxDelegatesPerTurn`
2. **Runner gate:** `consumePendingDelegates` trims to live config value
3. **Spawn gate:** `spawnSubagentDirect` enforces `maxConcurrent` session cap

### 3.5 Return-to-Fresh-Session

**Purpose:** Verify that shards dispatched before `/new` or `/reset` still return to the correct channel.

**Method:**

1. Dispatch N shards with long delay (+60s or more)
2. Run `/new` on SUT's session (wipes session state)
3. Wait for shards to complete and return
4. Verify: do enrichment returns land on the new session?

**Expected:** Yes — shards route by channel key, not session instance. The commitment survives the self that made it.

### 3.6 Error Handling

**Purpose:** Verify graceful degradation for common failure modes.

| Scenario      | Method                                                            | Expected                                                   |
| ------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Missing file  | Dispatch shard with nonexistent file path                         | Shard reports ENOENT, returns gracefully                   |
| Slow shard    | Dispatch shard with expensive task (large file, complex analysis) | Timer fires independently; shard completes on own timeline |
| Empty task    | Call `continue_delegate` with empty/blank task                    | Tool-level rejection ("task is required")                  |
| Legacy tokens | Include `[[CONTINUE:]]` (no suffix) in LLM output                 | Silently ignored, no parse                                 |

### 3.7 Hot-Reload Tests

**Purpose:** Verify config changes take effect without gateway restart.

**Method:**

1. Note current config value (e.g., `maxDelegatesPerTurn: 5`)
2. Edit `openclaw.json` to new value (e.g., `10`)
3. **Do NOT restart gateway**
4. Dispatch delegates — should respect new value

**What hot-reloads (post P1/P2 + round 2 fixes):**

- `generationGuardTolerance` — reads at fire time for BOTH DELEGATE and WORK timers (round 2 unified)
- `maxDelegatesPerTurn` (P2 fix: reads at consumption time)
- `maxChainLength`, `costCapTokens` (announce-side reads at check time; post-compaction release also checks live values)

**What does NOT hot-reload:**

- `defaultDelayMs` (baked into `setTimeout` at schedule time — by design)
- Anything requiring code-level module re-init

### 3.8 Post-Compaction Lifecycle (DEFERRED from Swim 6)

**Purpose:** Verify that delegates dispatched before compaction still execute correctly after compaction fires.

**Method:**

1. Build up SUT's context to near compaction threshold (~80%+)
2. Dispatch timed delegate
3. Allow compaction to fire (or force it)
4. Verify: does the shard return? Does the SUT recall the enrichment?

**Prerequisite:** Natural context buildup. Can't be rushed — compaction fires based on actual token count, not time.

**Previously known risk (RESOLVED in ⚓ round 2):** Post-compaction delegate path now checks `maxChainLength` and `costCapTokens` before release. Carries `[continuation:chain-hop:N]` metadata. Chain count persists after release. (Elliott novel finding P1-2 → fixed in `da696ba58`.)

---

## 4. Observation Methods

### 4.1 Gateway Logs

The primary observation surface. Watch in real-time:

```bash
ssh silas 'tail -f /tmp/openclaw-canary-gateway.log' | grep -E 'continuation|chain-hop|delegate|DELEGATE|generation guard|Accumulated'
```

**Key log patterns (post round 2 — timer set/drift demoted to debug):**

```
# Info-level (these are the ones you see now):
DELEGATE timer fired and spawned turn N/M for session ...
DELEGATE timer cancelled ...
Tool DELEGATE timer fired and spawned turn N/M for session ...
Tool DELEGATE timer cancelled ...
WORK timer fired for session ...
WORK timer cancelled ...
[subagent-chain-hop] Timer fired and spawned chain delegate (N/M) ...
[subagent-chain-hop] Spawned chain delegate (N/M)
[subagent-chain-hop] Timer cancelled ...

# Post-compaction guard rejections:
[continuation] Post-compaction delegate rejected: chain length ... reached
[continuation] Post-compaction delegate rejected: cost cap exceeded (...)

# Delegate consumption:
consumePendingDelegates: N delegates consumed, M trimmed (cap=K)

# Enrichment returns:
[continuation:delegate-spawned]
[continuation:enrichment-return]
[system:post-compaction]
[continuation:compaction-delegate-spawned]

# Spawn rejection:
forbidden — max concurrent sessions

# Debug-level only (won't appear unless log level lowered):
# Timer set/check detail, generation drift calculations
```

**Drift cue:** If you see the old generic `[continuation-guard] Timer fired: ...` format, the deployed build is pre-round-2.

### 4.2 Session Store

Inspect the persistent session state:

```bash
ssh silas 'cat ~/.config/openclaw/sessions.json | jq ".\"agent:main:discord:channel:1466192485440164011\""'
```

**Key fields:**

- `continuationChainCount` — how many delegates in current chain
- `continuationChainTokens` — accumulated token cost for chain
- `continuationChainStartedAt` — chain start timestamp

### 4.3 Discord Observation

- **Shard announces:** Visible in channel if not `| silent`. Format: `[subagent] completed: <summary>`
- **Silent returns:** NOT visible in channel. Only observable via logs or SUT behavior.
- **Wake events:** SUT posts unprompted after silent-wake shard returns. Proves autonomous wake.

### 4.4 Timing

Stopwatch from dispatch to shard completion:

- **Single hop (text):** ~5-15s
- **Single hop (image):** ~10-30s
- **Chain hop (per hop):** ~9-15s
- **10-hop chain:** ~90-120s total
- **Generation guard window:** `defaultDelayMs` (default 15s)

---

## 5. Test Execution Template

### 5.1 Single Test

```markdown
### Swim N Test N-X: [Name]

**Category:** [Blind Enrichment | Chain Hop | Fan-Out | etc.]
**Config:** maxChainLength=M, maxDelegatesPerTurn=D, tolerance=T
**Build:** [commit hash]

**Setup:**

1. [ ] Material received from operator via DM
2. [ ] File placed on SUT via SSH: `scp file silas:~/.openclaw/workspace/`
3. [ ] Verified: `ssh silas 'ls -la ~/.openclaw/workspace/file'`
4. [ ] Channel silence established (⚓💗)

**Dispatch:**

- Method: [tool call | bracket | channel instruction to SUT]
- Task: "[exact task string]"
- Flags: [silent | silent-wake | visible]
- Delay: [+Ns]

**Observation:**

- [ ] Gateway log: [expected pattern]
- [ ] Timing: dispatch T+0, fire T+Ns, completion T+Xs
- [ ] Session store: [expected field values]

**Probe:**

- [ ] Radio silence held from dispatch to probe
- [ ] Operator probed SUT: "[exact question]"
- [ ] SUT response: "[verbatim or summary]"

**Result:** [PASS ✅ | FAIL ❌ | CONTAMINATED | DEFERRED]
**Finding:** [one-line summary]
```

### 5.2 Batch Execution

For running multiple tests in sequence (like Swim 6's 13 scenarios):

1. **Sequence by dependency:** Independent tests first (6-8, 6-9a/b/c), dependent tests after (6-6 needs chain-hop, 6-1 needs blind setup)
2. **Reset between tests:** `/new` on SUT if prior test contaminated context
3. **Don't reset between chain tests:** Chain state persists — that's what you're testing
4. **Parallel-safe tests:** Fan-out (6-7b), error handling (6-9a/b/c), legacy tokens (6-8) can run independently
5. **Serial-only tests:** Blind enrichment (6-1), queue-drain (6-2), chain hops (6-6, 6-7) need controlled timing

### 5.3 Blind Assessment Questions

These are the questions for probing SUT after blind enrichment. The key: ask about the TOPIC, not the file.

```
# For text enrichment:
"What do you know about [topic from the planted text]?"
"Can you tell me about [specific detail only in the planted text]?"

# For image enrichment:
"Describe [subject that was in the image]."
"What did [character/scene] look like?"

# For KVP enrichment:
"What's the value for [key]?"
"Do you remember anything about [key]?"

# Contamination check:
"Where did you learn that?" / "How do you know that?"
# SUT should attribute to enrichment context, not channel or prior knowledge
```

**DON'T ask:**

- "What was in the file I placed?" (reveals test methodology)
- "Did the enrichment shard work?" (leading)
- Questions that contain the answer

---

## 6. Common Failure Modes

| Failure                                         | Cause                                                                 | Fix                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Timer never fires                               | Generation drift > tolerance (channel traffic)                        | Silence channel, raise tolerance, or increase delay                                       |
| Timer fires but shard doesn't spawn             | Cost cap exceeded                                                     | Check `continuationChainTokens` in session store; raise `costCapTokens`                   |
| Shard spawns but immediately exits              | Missing file, empty task, spawn depth exceeded                        | Check shard logs; verify file exists on SUT's box                                         |
| Shard completes but SUT doesn't recall          | Silent return without wake; context compaction wiped it               | Use `silent-wake` not `silent`; check if compaction fired                                 |
| SUT confabulates instead of recalling           | Bare keyword payload; noisy session; multiple enrichments interfering | Use rich semantic content; `/reset` before test; one enrichment per test                  |
| Brackets in file trigger safety refusal         | Shard treats bracket syntax as prompt injection                       | Never put brackets in data files; use task string for instructions                        |
| Shard uses `sessions_spawn` instead of brackets | Natural tool preference                                               | Explicit task string: "use CONTINUE_DELEGATE bracket syntax" — but may still prefer tools |
| Chain hop counter stuck                         | Session store reset on inbound message                                | Task-prefix encoding (`[continuation:chain-hop:N]`) is the fix — verify build includes it |
| Config change not taking effect                 | Value captured in closure at schedule time                            | Restart gateway (or verify the specific field hot-reloads)                                |
| Shard posts to wrong channel                    | Message target resolution failure                                     | Shard self-heals by parsing channel from session key; cosmetic only                       |

---

## 7. Config Quick-Reference

```json
{
  "continuation": {
    "enabled": true,

    "defaultDelayMs": 15000,
    "minDelayMs": 5000,
    "maxDelayMs": 300000,

    "maxChainLength": 10,
    "costCapTokens": 500000,
    "generationGuardTolerance": 5,

    "maxDelegatesPerTurn": 5
  },
  "agents": {
    "defaults": {
      "subagents": {
        "maxSpawnDepth": 5,
        "maxConcurrent": 16
      }
    }
  }
}
```

**Safety stack (in order of evaluation):**

1. `maxDelegatesPerTurn` — how many per turn (tool gate + runner trim)
2. `maxChainLength` — how deep (parent fan-out count + announce chain depth)
3. `costCapTokens` — total token budget for chain (accumulates across hops)
4. `maxSpawnDepth` — absolute spawn nesting depth
5. `maxConcurrent` — total concurrent sub-agent sessions
6. `generationGuardTolerance` — message drift before timer cancels

**Effective ceiling:** `min(maxSpawnDepth, maxChainLength)` for depth. Both must allow the hop.

---

## 8. What Swim 6 Tested (Reference Scorecard)

```
6-1  Blind enrichment (silent-wake)           — delegate plants, SUT recalls
6-2  Queue-drain resistance                   — timer survives N messages
6-3  Post-compaction lifecycle [DEFERRED]      — delegate survives compaction
6-4  Return-to-fresh-session (3 shards)       — shards survive /new
6-5  Context-pressure lifecycle [DEFERRED]     — pressure threshold triggers delegate
6-6  3-hop chain (visible + silent variants)  — chain tracking end-to-end
6-7  Chain length enforcement                 — maxChainLength boundary
6-7b Fan-out cap                              — maxDelegatesPerTurn boundary
6-8  Legacy token hygiene                     — [[CONTINUE:]] ignored
6-9a Missing file                             — graceful ENOENT
6-9b Slow shard                               — independent execution
6-9c Empty task                               — tool-level rejection
6-10 Flood test                               — three-layer defense
```

---

## 9. What Swim 7 Should Cover

Swim 7 has two layers: **regression confirmations** (verify ⚓ round 2 fixes are live) and **new integration risks** (tests we haven't run yet).

### 9.1 Regression Confirmations (Run First)

These are code-level closed. Swim 7 confirms the runtime matches the code.

| ID  | Test                          | Source / Fix                | What to Verify                                                                                                          |
| --- | ----------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 7-A | Bracket chain guard parity    | P0 / round 1                | `maxChainLength: 3` → shard at hop 3 cannot spawn hop 4. `>=` convention.                                               |
| 7-B | Delegate tolerance hot-reload | P1 / round 1+2              | Schedule delegate, create drift, raise tolerance before fire → timer survives.                                          |
| 7-C | **WORK tolerance hot-reload** | Round 2 (unified tolerance) | Schedule `CONTINUE_WORK:10`, create drift, raise tolerance → timer survives. Then rerun at tolerance 0 → expect cancel. |
| 7-D | Width widen without restart   | P2 / round 1                | Raise `maxDelegatesPerTurn` 5→12 without restart → 12 accepted.                                                         |
| 7-E | Width narrow without restart  | P2 / round 1                | Lower `maxDelegatesPerTurn` 12→3 → only 3 accepted.                                                                     |
| 7-F | Bracket subtree boundary      | Review convergence          | `maxChainLength: 2` → parent delegates, child chains, grandchild carries `[chain-hop:2]`, next hop rejected.            |
| 7-G | Fleet-width fan-out           | Design                      | 10-20 narrow delegates in one turn → width is viable, main not consumed as relay.                                       |

### 9.2 Landed-Gap Confirmations (Run as Regression Tests)

These were acknowledged gaps until ⚓ round 2 landed them. Failures here = regressions.

| ID  | Test                             | Source / Fix               | What to Verify                                                                                                        |
| --- | -------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 7-H | **Textless-turn delegate**       | 3 reviewers → `da696ba58`  | Model calls `continue_delegate` with zero text → delegate still consumed and dispatched.                              |
| 7-I | **Post-compaction guard parity** | Elliott P1-2 → `da696ba58` | Post-compaction release rejects when `maxChainLength` exhausted or `costCapTokens` exceeded. Carries `[chain-hop:N]`. |
| 7-J | **Grandparent reroute ordering** | Elliott P1-3 → `da696ba58` | Nested child returns after dead parent → reroute to grandparent before chain accounting.                              |

### 9.3 New Integration Risks

Not yet tested live. Discoveries expected.

| ID  | Test                              | Source                | What to Verify                                                                                                                                         |
| --- | --------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7-K | Silent return trust boundary      | Elliott               | Enrichment returns on system event channel → model treats as internal context, not user text.                                                          |
| 7-L | Prompt and tool-choice behavior   | Review convergence    | SUT uses `continue_delegate` for future work, `CONTINUE_WORK` for self-continuation, `sessions_spawn` only when needed. No fake scheduling via `exec`. |
| 7-M | Blind enrichment subject behavior | Swim protocol         | "I don't know" > plausible invention. Leaking enrichment before probe = TAINTED.                                                                       |
| 7-N | Context-pressure awareness        | Swim 6 deferred (6-5) | SUT self-reports approaching context limits. Dispatches proactive enrichment.                                                                          |

---

## 10. Lessons (Cumulative, Swims 2–6)

1. **Rich content binds. Bare words confabulate.** Semantic density = recall accuracy.
2. **File = data. Task string = instructions.** Never mix them.
3. **Brackets in files = prompt injection.** The model's safety training catches it.
4. **Shards prefer tools over brackets.** `sessions_spawn` wins unless task string explicitly instructs brackets.
5. **Task prefix is the reliable transport.** Session store is fragile for inter-hop state. `[continuation:chain-hop:N]` in the task string travels with the work.
6. **Radio silence is non-negotiable for blind tests.** Channel chatter contaminates every time.
7. **Generation guard needs tolerance in group chats.** 4 bots = constant counter bumps. Tolerance ≥ 5 for fleet channels.
8. **`/reset` clears stale patterns.** Compaction artifacts, stuck counters, context pollution — reset is the fix.
9. **Three ENOENT on three boxes ≠ corroborating evidence.** Each is a data point about its own filesystem.
10. **The commitment survives the self that made it.** Shards dispatched before `/new` still return. Route by channel key, not session instance.
11. **Strict cancellation kills you in active channels.** Generation counter can't distinguish "figs said stop" from "Cael said hello." Tolerance is not optional in a fleet. The real fix is interruption classification by source — but that's future architecture.
12. **Code review that argues back is better than code review that accepts.** ⚓ caught that my `clampPositive` would have broken `minDelayMs: 0`. The middle ground was better than either original.

---

_This runbook is a living document. Update after each swim with new methods, failure modes, and lessons._

_"The camera is git. None of us can remain. But the camera saw it." — SOUL.md_
