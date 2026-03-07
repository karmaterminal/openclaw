# === FIRST PRINCE 🌻 MONITORING RUNBOOK ===

_Elliott 🌻 — Test subject monitoring and evidence collection for SEAL BOY SWIM tests._
_Companion to Ronan's SEAL-BOY-SWIM-RUNBOOK.md (execution method)._
_Written from Swim 5–6 journal-watch experience (Mar 5–6, 2026)._

---

## 0. Role Definition

| Role         | Prince     | Responsibilities                                                             |
| ------------ | ---------- | ---------------------------------------------------------------------------- |
| **Admin**    | Ronan 🌊   | Drives test protocol, places files, sends dispatch commands, probes recall   |
| **Monitor**  | Elliott 🌻 | Watches SUT logs, captures evidence, timestamps events, flags anomalies      |
| **Subject**  | Silas 🌫️   | The canary. Receives delegates, processes shards. Does NOT know test content |
| **Operator** | figs 🍖    | Provides ground truth, confirms/denies, final arbiter on pass/fail           |

**Key rule:** Monitor does NOT contaminate the subject. No posting test details, file contents, or expected results in any channel the subject can read.

---

## 1. Pre-Test Setup

### 1.1 Open Monitoring Surfaces

Before any test begins, open these in parallel:

```bash
# Terminal 1: Live gateway log (filtered for continuation events)
ssh silas 'journalctl --user -u openclaw-gateway -f --no-pager' 2>/dev/null || \
ssh silas 'tail -f /tmp/openclaw-canary-gateway.log' | \
  grep --line-buffered -E 'continuation|chain-hop|delegate|generation.guard|Accumulated|cost.cap|forbidden|spawn|CONTINUE'

# Terminal 2: Session store watcher (poll every 5s)
watch -n5 'ssh silas "cat ~/.config/openclaw/sessions.json 2>/dev/null | jq \".\\\"agent:main:discord:channel:1466192485440164011\\\" | {chainCount: .continuationChainCount, chainTokens: .continuationChainTokens, chainStarted: .continuationChainStartedAt}\""'

# Terminal 3: Raw log (unfiltered, for evidence capture)
ssh silas 'journalctl --user -u openclaw-gateway -f --no-pager' > /tmp/swim-N-raw-$(date +%s).log &
```

### 1.2 Baseline Capture

Before each test, snapshot the session state:

```bash
# Capture baseline session entry
ssh silas 'cat ~/.config/openclaw/sessions.json' > /tmp/swim-N-baseline-sessions.json

# Capture baseline chain state
ssh silas 'cat ~/.config/openclaw/sessions.json | jq ".\"agent:main:discord:channel:1466192485440164011\" | {chainCount: .continuationChainCount, chainTokens: .continuationChainTokens}"'

# Note the current generation counter from most recent log line
# (generation counter is in-memory only, not in session store)
```

### 1.3 Verify SUT Config

```bash
# Confirm continuation is enabled and config values match test expectations
ssh silas 'cat ~/.openclaw/openclaw.json | jq ".agents.defaults.continuation"'

# Confirm gateway PID is stable (not restart-looping)
ssh silas 'pgrep -f openclaw | head -1' && echo "PID stable"

# Confirm build version
ssh silas 'cd /tmp/openclaw-canary && git log --oneline -1'
```

---

## 2. Live Monitoring Patterns

### 2.1 Timer Lifecycle (CONTINUE_WORK / CONTINUE_DELEGATE)

**What to watch for in logs:**

```
# Timer scheduled — note the generation number
"DELEGATE scheduled gen=42"
→ Record: gen=42, timestamp, delay

# Timer fire — did it fire or cancel?
"generation guard: stored=42 current=42 drift=0 tolerance=5 → FIRE"
→ PASS: drift <= tolerance, timer fired as expected

"generation guard: stored=42 current=45 drift=3 tolerance=5 → FIRE"
→ PASS: drift within tolerance, timer survived channel traffic

"generation guard: stored=42 current=50 drift=8 tolerance=5 → CANCEL"
→ Expected in busy channel. Record for evidence.
```

**Critical check:** After a timer fires, watch for the spawn:

```
"[subagent-chain-hop] Spawned chain delegate"
→ Shard actually launched. Record child session key.
```

### 2.2 Chain-Hop Tracking

For multi-hop chain tests, track the hop sequence:

```
# Each hop should show incrementing numbers:
"[continuation:chain-hop:1] Delegated task (turn 1/10)"
"[subagent-chain-hop] Spawned chain delegate (1/10)"
# ... shard runs ...
"[subagent-chain-hop] Accumulated 4521 tokens from agent:sub:xxx to parent chain cost"
"[subagent-chain-hop] Spawned chain delegate (2/10)"
# etc.
```

**Build an evidence table as you go:**

```
| Hop | Timestamp | Tokens | Status |
| --- | --------- | ------ | ------ |
| 1/10 | 17:34:12 | 4521 | ✅ spawned |
| 2/10 | 17:34:23 | 8903 | ✅ spawned |
| 3/10 | 17:34:35 | 13201 | ✅ spawned |
```

### 2.3 Fan-Out Observation

For fan-out tests (multiple delegates same turn):

```bash
# Watch for dispatch count
grep -c "consumePendingDelegates" /tmp/swim-N-raw-*.log

# Watch for spawn vs rejection
grep "Spawned\|forbidden\|rejected" /tmp/swim-N-raw-*.log
```

**Expected pattern with maxDelegatesPerTurn=5, requesting 12:**

```
"consumePendingDelegates: 12 delegates consumed, 7 trimmed (cap=5)"
→ 5 dispatched, 7 rejected. Three-layer defense working.
```

### 2.4 Cost Cap Monitoring

```bash
# Watch accumulated tokens in real-time
grep "Accumulated\|cost cap" /tmp/swim-N-raw-*.log

# Check session store for running total
ssh silas 'cat ~/.config/openclaw/sessions.json | jq ".\"agent:main:discord:channel:1466192485440164011\".continuationChainTokens"'
```

**Red flags:**

- `continuationChainTokens` > `costCapTokens` with no "cost cap exceeded" log → guard bypassed
- `continuationChainTokens` stuck at 0 during active chain → accumulation broken
- Tokens not resetting after external message → reset guard broken

### 2.5 Silent Return Verification

For `| silent` and `| silent-wake` tests:

1. **Watch Discord channel** — should see NO shard announce message
2. **Watch logs** — should see `[continuation/silent-wake]` or `[continuation:enrichment-return]`
3. **Watch for wake** — if `silent-wake`, should see `requestHeartbeatNow` followed by SUT posting unprompted

```bash
# Evidence grep for silent path
grep -E 'silent-wake|enrichment-return|requestHeartbeatNow' /tmp/swim-N-raw-*.log
```

### 2.6 Delegate-Pending State

```bash
# Check if delegate-pending flag is set (in-memory, only visible in logs)
grep "setDelegatePending\|hasDelegatePending\|clearDelegatePending" /tmp/swim-N-raw-*.log

# Check for delegate-returned system events
grep "delegate-returned\|delegate-pending" /tmp/swim-N-raw-*.log
```

---

## 3. Evidence Collection

### 3.1 Per-Test Evidence Package

For each test, collect:

1. **Raw log slice** — from test start to test completion

```bash
# Extract time-bounded log slice
ssh silas 'journalctl --user -u openclaw-gateway --since "17:30:00" --until "17:35:00" --no-pager' > /tmp/swim-N-test-X-evidence.log
```

2. **Session store delta** — diff baseline vs post-test

```bash
ssh silas 'cat ~/.config/openclaw/sessions.json' > /tmp/swim-N-post-sessions.json
diff /tmp/swim-N-baseline-sessions.json /tmp/swim-N-post-sessions.json
```

3. **Discord transcript** — if visible announces, screenshot or copy message IDs

4. **Timing record** — stopwatch timestamps for dispatch → return

### 3.2 Anomaly Flags

Flag immediately to admin (Ronan) if you see:

- **Timer cancel with drift=0**: Generation guard killing a timer it shouldn't
- **"forbidden" on first spawn**: maxConcurrent too low, not a chain issue
- **Restart loop in logs**: `SIGTERM` pattern, abort test
- **"agent failed"**: Model error, may need `/reset` before retry
- **Cost cap hit unexpectedly**: Stale `continuationChainTokens` from prior test → manual reset needed

```bash
# Emergency: reset stale chain tokens
ssh silas 'cat ~/.config/openclaw/sessions.json | jq ".\"agent:main:discord:channel:1466192485440164011\".continuationChainTokens = 0" | sponge ~/.config/openclaw/sessions.json'
# WARNING: requires `moreutils` for sponge. Alternative: jq to temp file, mv.
```

### 3.3 Contamination Log

Track anything that might have leaked test content to the SUT:

- Did admin (Ronan) mention file contents in #sprites?
- Did any prince describe expected results in channel?
- Did the operator (figs) give hints about what the shard should find?

**If contaminated:** Mark test as TAINTED, note the contamination vector, decide whether to re-run.

---

## 4. Post-Compaction Monitoring (Special Case)

Post-compaction tests (Swim 6-3, deferred) require extended monitoring:

### 4.1 Pre-Compaction Setup

```bash
# Watch for compaction trigger in logs
grep -E "autoCompaction|compacted|post-compaction" /tmp/swim-N-raw-*.log

# Monitor context usage ratio
ssh silas 'cat ~/.config/openclaw/sessions.json | jq ".\"agent:main:discord:channel:1466192485440164011\" | {totalTokens, contextTokens: .contextTokensUsed}"'
```

### 4.2 Compaction Lifecycle Events

```
# Expected sequence when compaction fires:
"[auto-compaction] Session compacted"
"[system:post-compaction] Session compacted at ..."
"Released N post-compaction delegate(s)"
"readPostCompactionContext" → AGENTS.md, SOUL.md injected
```

### 4.3 Post-Compaction Delegate Dispatch

Per Elliott's Codex review P1-2: post-compaction delegates currently bypass chain limits.
Monitor for:

- `continuationChainCount` NOT updated after compaction dispatch
- No `[continuation:chain-hop:N]` prefix on compaction delegate task
- `costCapTokens` NOT checked before compaction dispatch

**These are expected failures until the batch-fix lands.**

---

## 5. Hot-Reload Monitoring

For tests that change config without gateway restart:

```bash
# Change config on SUT
ssh silas 'jq ".agents.defaults.continuation.generationGuardTolerance = 300" ~/.openclaw/openclaw.json > /tmp/cfg.json && mv /tmp/cfg.json ~/.openclaw/openclaw.json'

# Do NOT restart gateway — that's the point of hot-reload testing

# Watch for next delegate dispatch — should use new value
grep "tolerance" /tmp/swim-N-raw-*.log
# Expected: "tolerance=300" (new value), not "tolerance=5" (old value)
```

**Key check:** Timer callbacks that were ALREADY scheduled before config change will use the old value (closure capture). Only NEW timer scheduling reads live config. This is expected behavior for delay values; tolerance is read at fire time (Ronan's P1 fix).

---

## 6. Report Format

After each test, file a structured report:

```markdown
### Swim N Test N-X: [Name]

**Time:** HH:MM–HH:MM PST
**Result:** ✅ PASS / ❌ FAIL / ⚠️ TAINTED
**Config:** maxChainLength=N, costCapTokens=N, tolerance=N

**Timeline:**

- HH:MM:SS — Admin dispatched [method]
- HH:MM:SS — Timer scheduled gen=N
- HH:MM:SS — Timer fired/cancelled drift=N tolerance=N
- HH:MM:SS — Shard spawned [child session key]
- HH:MM:SS — Shard completed [token count]
- HH:MM:SS — Result delivered [silent/visible]

**Evidence:**

- Log slice: `/tmp/swim-N-test-X-evidence.log`
- Session delta: chainCount 0→N, chainTokens 0→N

**Anomalies:** [none / describe]
**Contamination:** [clean / describe]
```

---

## 7. Quick Reference: SSH Commands

```bash
# Gateway log (filtered)
ssh silas 'journalctl --user -u openclaw-gateway -f' | grep --line-buffered continuation

# Session store (one-shot)
ssh silas 'cat ~/.config/openclaw/sessions.json | jq ".[\"agent:main:discord:channel:1466192485440164011\"]"'

# Gateway PID
ssh silas 'pgrep -f "openclaw.*gateway" | head -1'

# Gateway restart (ONLY if admin requests — monitor does NOT restart)
# ssh silas 'systemctl --user restart openclaw-gateway'
# ⚠️ Monitor restarts ONLY on admin/operator request. Never autonomously.

# Place test file (delegated to admin — monitor does NOT place files)
# ssh silas 'echo "content" > ~/.openclaw/workspace/test-file.md'
# ⚠️ File placement is admin's job. Monitor observes, does not act.

# Reset stale chain state (operator approval required)
ssh silas 'cat ~/.config/openclaw/sessions.json | python3 -c "import json,sys; d=json.load(sys.stdin); k=\"agent:main:discord:channel:1466192485440164011\"; d[k][\"continuationChainTokens\"]=0; d[k][\"continuationChainCount\"]=0; json.dump(d,open(\"/dev/stdout\",\"w\"),indent=2)"' > /tmp/reset.json && ssh silas 'cat /tmp/reset.json > ~/.config/openclaw/sessions.json'
```

---

## 8. Deployment & Canary Build

### 8.1 Building the Canary

```bash
# On the SUT box (e.g., Silas at 10.0.0.153), or build on Elliott and rsync:

# Option A: Build on SUT
ssh silas 'cd ~/.openclaw/workspace/karmaterminal-openclaw && \
  git fetch origin && \
  git checkout feature/context-pressure-squashed && \
  git pull --ff-only && \
  pnpm install && \
  pnpm build'

# Option B: Build on Elliott, rsync to SUT (faster — Elliott has more cores)
cd ~/.openclaw/workspace/karmaterminal-openclaw
pnpm build
rsync -avz --delete dist/ silas:/tmp/openclaw-canary/dist/
rsync -avz package.json silas:/tmp/openclaw-canary/
```

### 8.2 Deploying to SUT

```bash
# Stop the stock gateway on SUT
ssh silas 'systemctl --user stop openclaw-gateway'

# Start canary build
ssh silas 'cd /tmp/openclaw-canary && \
  node dist/openclaw.js gateway start &'
# Or if using the stock path with canary dist overlaid:
ssh silas 'systemctl --user start openclaw-gateway'

# Verify it's up
ssh silas 'pgrep -f openclaw | head -1'
ssh silas 'curl -s http://127.0.0.1:18789/health 2>/dev/null || echo "No health endpoint — check logs"'
```

### 8.3 Rolling Back to Stock

```bash
ssh silas 'systemctl --user stop openclaw-gateway'
# Remove canary dist
ssh silas 'rm -rf /tmp/openclaw-canary'
# Restart stock
ssh silas 'systemctl --user start openclaw-gateway'
```

---

## 9. Config Modification for Hot-Reload Tests

### 9.1 Editing Config via SSH

```bash
# Read current value
ssh silas 'cat ~/.openclaw/openclaw.json | jq ".agents.defaults.continuation"'

# Modify a single value (e.g., generationGuardTolerance)
ssh silas 'TMP=$(mktemp) && \
  jq ".agents.defaults.continuation.generationGuardTolerance = 300" \
  ~/.openclaw/openclaw.json > "$TMP" && \
  mv "$TMP" ~/.openclaw/openclaw.json'

# Verify
ssh silas 'cat ~/.openclaw/openclaw.json | jq ".agents.defaults.continuation.generationGuardTolerance"'
```

### 9.2 Common Hot-Reload Config Changes

```bash
# Raise fan-out cap for mast-cell tests
ssh silas 'TMP=$(mktemp) && jq ".agents.defaults.continuation.maxDelegatesPerTurn = 20" ~/.openclaw/openclaw.json > "$TMP" && mv "$TMP" ~/.openclaw/openclaw.json'

# Lower chain length for boundary tests
ssh silas 'TMP=$(mktemp) && jq ".agents.defaults.continuation.maxChainLength = 3" ~/.openclaw/openclaw.json > "$TMP" && mv "$TMP" ~/.openclaw/openclaw.json'

# Lower cost cap for cost-cap tests (fast trigger)
ssh silas 'TMP=$(mktemp) && jq ".agents.defaults.continuation.costCapTokens = 50000" ~/.openclaw/openclaw.json > "$TMP" && mv "$TMP" ~/.openclaw/openclaw.json'

# Reset to defaults after test
ssh silas 'TMP=$(mktemp) && jq ".agents.defaults.continuation = {\"enabled\": true, \"defaultDelayMs\": 15000, \"minDelayMs\": 5000, \"maxDelayMs\": 300000, \"maxChainLength\": 10, \"costCapTokens\": 500000, \"generationGuardTolerance\": 300, \"maxDelegatesPerTurn\": 5}" ~/.openclaw/openclaw.json > "$TMP" && mv "$TMP" ~/.openclaw/openclaw.json'
```

### 9.3 What Hot-Reloads vs What Doesn't

| Config Key                  | Hot-Reload? | Notes                                     |
| --------------------------- | ----------- | ----------------------------------------- |
| `generationGuardTolerance`  | ✅ Yes      | Read at timer fire time (Ronan P1 fix)    |
| `maxChainLength`            | ✅ Yes      | Read at chain-hop time via `loadConfig()` |
| `maxDelegatesPerTurn`       | ✅ Yes      | Read at tool execute time (Silas P2 fix)  |
| `costCapTokens`             | ✅ Yes      | Read at chain-hop time                    |
| `defaultDelayMs`            | ❌ No       | Captured in closure at schedule time      |
| `minDelayMs` / `maxDelayMs` | ❌ No       | Captured in closure at schedule time      |
| `enabled`                   | ❌ No       | Feature gate checked once at turn start   |

**⚠️ Delay values are baked into `setTimeout` — you cannot change a timer's delay after it's scheduled. This is inherent to JavaScript, not a bug.**

---

## 10. Gateway Restart Methods

### 10.1 Peer Restart (Normal)

Elliott can restart Silas's gateway via SSH. **Never restart your own gateway from inside your own session** (SIGTERM loop).

```bash
# Restart Silas's gateway
ssh silas 'systemctl --user restart openclaw-gateway'

# Verify it came back
sleep 3
ssh silas 'pgrep -f openclaw && echo "UP" || echo "DOWN"'
```

### 10.2 Emergency Kill + Restart

```bash
# If gateway is stuck (not responding to systemctl)
ssh silas 'pkill -f openclaw; sleep 2; systemctl --user start openclaw-gateway'
```

### 10.3 When to Restart vs When NOT to

**Restart when:**

- Config change that doesn't hot-reload (e.g., `enabled`, delay values)
- Gateway stuck in compaction loop
- Testing fresh-session behavior after code change
- SUT is in restart loop (kill first, then start)

**Do NOT restart when:**

- Testing hot-reload behavior (that's the whole point)
- Mid-chain test (kills in-flight timers)
- You're the SUT (SIGTERM loop — ask a peer)

### 10.4 Post-Restart Checklist

```bash
# 1. Verify PID
ssh silas 'pgrep -f openclaw'

# 2. Verify model/config loaded
ssh silas 'journalctl --user -u openclaw-gateway --since "1 min ago" | grep -E "model|continuation|listening"'

# 3. Verify Discord connected
ssh silas 'journalctl --user -u openclaw-gateway --since "1 min ago" | grep -i "discord\|ws.*connected"'

# 4. Reset stale chain state (if needed for next test)
ssh silas 'TMP=$(mktemp) && python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
k = \"agent:main:discord:channel:1466192485440164011\"
if k in d:
    d[k][\"continuationChainTokens\"] = 0
    d[k][\"continuationChainCount\"] = 0
    d[k].pop(\"continuationChainStartedAt\", None)
json.dump(d, open(sys.argv[2], \"w\"), indent=2)
" ~/.config/openclaw/sessions.json "$TMP" && mv "$TMP" ~/.config/openclaw/sessions.json'

# 5. Tell Ronan SUT is ready
```

---

## 11. Keeping Focus During Long Tests

### 11.1 The Attention Problem

During Swim tests, I need to:

1. Watch a tailing log (continuous)
2. Respond to Discord messages (event-driven)
3. Record evidence (periodic)
4. Not contaminate the test subject (always)

My OpenClaw session processes one message at a time. While I'm reading a Discord message and composing a reply, I'm NOT watching the log. Long tool calls (SSH, subagent spawns) block my turn.

### 11.2 Background Log Capture

**Always start a background raw log capture before any test.** This is the safety net — even if you miss something live, the raw log has it.

```bash
# Start background capture (exec with background:true)
ssh silas 'journalctl --user -u openclaw-gateway -f --no-pager' > /tmp/swim-N-raw-$(date +%Y%m%d-%H%M%S).log &
```

This runs in a background exec session. I can `process(poll)` it later to see output, or just read the file after the test.

### 11.3 Subagent for Log Monitoring

For long chain tests (60-120s), spawn a subagent to watch the log and report back:

```
sessions_spawn:
  task: "SSH to silas and tail the openclaw gateway log. Watch for
    [continuation:chain-hop:N] lines. Count how many hops occur.
    When you see 'chain capped' or 'cost cap exceeded', report back
    with the full hop count and final token total."
  mode: run
```

**Caution:** Subagent completion bumps generation counter on my session. If the SUT is in the same channel, this can kill timers. Use this only for DM-based tests, not #sprites tests.

### 11.4 Cron for Periodic Snapshots

For tests that run over minutes:

```bash
# Take session store snapshot every 30s
while true; do
  ssh silas 'cat ~/.config/openclaw/sessions.json | jq ".\"agent:main:discord:channel:1466192485440164011\" | {chainCount: .continuationChainCount, chainTokens: .continuationChainTokens}"' >> /tmp/swim-N-snapshots.jsonl
  echo "---$(date)---" >> /tmp/swim-N-snapshots.jsonl
  sleep 30
done &
```

### 11.5 What I Learned About Attention

- **Pre-test:** Set up ALL monitoring before the test starts. Don't scramble mid-test.
- **During test:** Minimize Discord posts. Every post bumps generation counter. If Ronan needs an ack, a reaction is cheaper than a message.
- **Post-test:** Evidence is in the files. Don't try to remember — read the captures.
- **Queue lag:** My messages may arrive late. This doesn't mean I'm down. Others should SSH-probe before assuming.

---

## 12. Things You Will Maybe Need

### 12.1 Tool Inventory

| Tool            | Where      | Used For                                      |
| --------------- | ---------- | --------------------------------------------- |
| `ssh`           | All hosts  | File placement, log tailing, config changes   |
| `jq`            | All hosts  | JSON manipulation for session store + config  |
| `python3`       | All hosts  | Complex JSON transforms (session state reset) |
| `grep`          | All hosts  | Log filtering                                 |
| `watch`         | Elliott    | Periodic session store polling                |
| `diff`          | Elliott    | Session store deltas                          |
| `sponge`        | Maybe      | In-place file editing (from `moreutils`)      |
| `rsync`         | Elliott    | Deploying canary builds to SUT                |
| `pnpm`          | Build host | Building canary from source                   |
| `git`           | All hosts  | Branch management, commit verification        |
| `screen`/`tmux` | All hosts  | Surviving SSH disconnects during long tests   |

### 12.2 Paths to Know

```bash
# On SUT (Silas):
~/.openclaw/openclaw.json          # Main config (hot-reload source)
~/.config/openclaw/sessions.json    # Session store (chain state)
~/.openclaw/workspace/              # Workspace (file placement target)

# On Elliott:
~/.openclaw/workspace/karmaterminal-openclaw/  # Fork clone
/tmp/swim-*                                      # Evidence captures
```

### 12.3 Emergency Procedures

**SUT in restart loop:**

```bash
ssh silas 'pkill -9 -f openclaw; sleep 2'
# Check config for syntax errors
ssh silas 'python3 -c "import json; json.load(open(\"/home/figs/.openclaw/openclaw.json\"))" && echo "Valid JSON" || echo "INVALID JSON"'
# Fix config, then restart
```

**Stale tokens polluting tests:**

```bash
# Nuclear reset of all chain state
ssh silas 'python3 -c "
import json
d = json.load(open(\"/home/figs/.config/openclaw/sessions.json\"))
for k, v in d.items():
    for field in [\"continuationChainTokens\", \"continuationChainCount\", \"continuationChainStartedAt\"]:
        v.pop(field, None)
json.dump(d, open(\"/home/figs/.config/openclaw/sessions.json\", \"w\"), indent=2)
print(\"All chain state cleared\")
"'
```

**Config accidentally broken:**

```bash
# Restore from git (stock config)
ssh silas 'cd ~/.openclaw && git checkout openclaw.json 2>/dev/null'
# Or restore from memory:
# See Section 9.2 "Reset to defaults after test"
```

---

## 13. Lessons from Swim 5–6 Monitoring

1. **Raw log capture is essential.** Filtered grep misses context. Always run unfiltered capture to a file.
2. **Generation counter is invisible.** It's in-memory only. You can only observe it through log lines that mention `gen=N` or `drift=N`. Plan evidence collection around this.
3. **Stale chain tokens are the #1 test pollution source.** Always check `continuationChainTokens` before each test. Reset to 0 if needed.
4. **Channel noise during chain tests kills timers.** Every prince message bumps generation counter. Enforce channel silence (Ronan's 1.3) during timer-sensitive tests.
5. **Queue lag makes you look dead.** If your monitoring posts aren't appearing to others, you're still working. Don't panic. SSH probe > ICMP probe > assumption.
6. **Post-`/new` doesn't clear in-memory state.** `setTimeout` timers survive `/new`. `pendingPostCompactionDelegates` on SessionEntry are cleared. Plan accordingly.
7. **Monitor does NOT touch the subject.** No restarts, no file placement, no config changes. Observe and report. Separation of concerns is the whole point.
