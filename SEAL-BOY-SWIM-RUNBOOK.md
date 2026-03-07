# === SEAL BOY 🌊🩲💦 SWIM N === RUNBOOK

_Ronan 🌊 — Integration test protocol for `continue_delegate` and delegate-tree continuation._
_Updated on this branch after the continuation alignment fixes, prompt/RFC alignment, and post-Swim-6 review convergence._

---

## 0. What Changed Since Swim 6

Treat these prior findings as code-level closed and re-run them once as live confirmations, not as open diagnosis:

1. Bracket-path `maxChainLength` parity / off-by-one
2. Delayed timer `generationGuardTolerance` closure capture
3. `maxDelegatesPerTurn` hot-reload

Current regression coverage for those fixes already exists in:

- `src/agents/subagent-announce.continuation.test.ts`
- `src/agents/tools/continue-delegate-tool.test.ts`
- `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`

Swim 7 should spend more time on:

- live config mutation
- wide fan-out
- subtree autonomy
- prompt/tool-choice behavior
- post-compaction guard coverage

---

## 1. Core Objective

This feature is not just "do another turn later."

It is a background scheduling system that should let the main session stay free while delegated shards:

- enrich future context silently
- wake the parent when synthesis is needed
- chain further from a delegate branch without forcing the parent to relay every hop
- survive compaction better than a plain summary
- fan out wide when the operator wants mast-cell / sensor-swarm behavior

The desired shape is:

```text
main session thinks / talks
  └─ delegate coordinator
       ├─ shard 1
       ├─ shard 2
       ├─ shard 3
       └─ ...
```

Width is usually the real operator knob. Depth is mostly a recursion guard.

---

## 2. Preflight

### 2.1 Canary build

The SUT must run the branch build under test, not stock OpenClaw.

Record:

- commit SHA
- deployment method
- whether the build was restarted after config edits

### 2.2 Config path and session store path

Use the actual live files on the SUT.

- config: usually `~/.openclaw/openclaw.json`
- session store: by default `~/.openclaw/agents/<agentId>/sessions/sessions.json`

Do not hard-code older `~/.config/openclaw/sessions.json` assumptions.

### 2.3 Radio silence

For timer-sensitive or blind tests:

1. establish silence
2. dispatch
3. do not contaminate the subject before the probe

This still matters. Multi-agent chatter can invalidate timer tests and blind recall.

### 2.4 File hygiene

Files are data only. Instructions live in the task string.

Do not place `[[CONTINUE_DELEGATE: ...]]` or imperative instructions inside data files.

### 2.5 Subject-side constraints

The canary is blind between dispatch and return.

From inside the subject session, the canary can usually see only that a delegate was scheduled. It cannot directly confirm:

- whether the shard actually spawned
- whether it completed
- whether its silent return was delivered

So:

1. subject-side confirmation is not delivery proof
2. monitor/driver logs are the delivery proof
3. a wrong but confident answer on probe is often confabulation, not dishonesty

Practical subject rules for blind swims:

1. after dispatch, say only that work was dispatched
2. do not narrate enrichment contents before the blind probe
3. answer the probe directly from context; do not hedge with shard meta-commentary
4. prefer a quiet DM session for blind enrichment whenever possible

Important distinction:

- `/new` wipes the subject's conversational memory, but pending gateway timers can still return later
- gateway restart kills pending delegate timers outright

### 2.6 Coordination discipline

During active swim:

1. one variable per test
2. one active analysis voice at a time
3. one live findings tracker shared across the princes

Do not let a single test mutate multiple dimensions at once if the result is meant to resolve a specific finding.

Git discipline during swim:

- do not push to the shared landing branch during active swim
- each prince commits to their own branch
- the coordinator merges or cherry-picks after the swim, with evidence in hand

The shared landing branch for this doc set is currently:

- `flesh-beast-figs/for_thornfield_consider20260306`

---

## 3. Config Profiles

### 3.1 Shipped-default smoke

Use this to confirm conservative upstream behavior:

```json
{
  "agents": {
    "defaults": {
      "continuation": {
        "enabled": true,
        "defaultDelayMs": 15000,
        "minDelayMs": 5000,
        "maxDelayMs": 300000,
        "maxChainLength": 10,
        "costCapTokens": 500000,
        "maxDelegatesPerTurn": 5,
        "generationGuardTolerance": 0
      },
      "subagents": {
        "maxSpawnDepth": 5,
        "maxConcurrent": 16
      }
    }
  }
}
```

### 3.2 Fleet / mast-cell swim

Use this to test the intended wide-fan-out operating mode:

```json
{
  "agents": {
    "defaults": {
      "continuation": {
        "enabled": true,
        "maxChainLength": 10,
        "costCapTokens": 500000,
        "maxDelegatesPerTurn": 20,
        "generationGuardTolerance": 3
      },
      "subagents": {
        "maxSpawnDepth": 5,
        "maxConcurrent": 16
      }
    }
  }
}
```

Important correction versus earlier notes:

- `maxDelegatesPerTurn` lives under `agents.defaults.continuation`
- not under `agents.defaults.subagents`

---

## 4. Evidence Surfaces

Use all three:

1. gateway logs
2. spawned task strings
3. session store

Priority note for bracket-origin chains:

- canonical per-hop proof is the child task prefix: `[continuation:chain-hop:N]`
- session-store chain counters are supporting evidence, not the primary proof

Key runtime strings to watch for:

- `[continue_delegate] Consuming N tool delegate(s)`
- `[continuation-guard] Timer fired: ... drift=... tolerance=...`
- `Tool DELEGATE timer cancelled ...`
- `[subagent-chain-hop] Spawned chain delegate (N/M)`
- `[subagent-chain-hop] Timer cancelled ...`
- `[continuation:delegate-spawned]`
- `[continuation:enrichment-return]`
- `[system:post-compaction]`
- `[continuation:compaction-delegate-spawned]`

---

## 5. Swim 7 Execution Order

### 5.1 P0 confirmation set

Run these first. They confirm the fixes that landed today.

#### 7-A. Bracket delayed-hop hot-reload

- Start with `generationGuardTolerance: 0`
- dispatch a shard that chains with `[[CONTINUE_DELEGATE: ... +10s]]`
- create drift during the delay
- raise `generationGuardTolerance` before fire
- expect the timer to survive and the next hop to spawn

#### 7-B. Tool delayed-delegate hot-reload

- Start with `generationGuardTolerance: 0`
- use `continue_delegate(..., delaySeconds=10)`
- create drift during the delay
- raise `generationGuardTolerance` before fire
- expect the timer to survive and the delegate to spawn

#### 7-C. Width widen without restart

- Start at `maxDelegatesPerTurn: 5`
- raise to `12` or `20` without restart
- request 12 delegates in one turn
- expect all 12 to pass tool/runner gating
- only `maxConcurrent` should stop actual spawns

#### 7-D. Width narrow without restart

- Start at `maxDelegatesPerTurn: 12`
- lower to `3` without restart
- request 5 delegates in one turn
- expect only 3 accepted

#### 7-E. Bracket subtree boundary

- Set `maxChainLength: 2`
- main session dispatches one delegate
- child emits one `[[CONTINUE_DELEGATE: ...]]`
- spawned grandchild must carry `[continuation:chain-hop:2]`
- next autonomous hop must be rejected

#### 7-F. Fleet-width fan-out

- Use the fleet profile
- ask for 10-20 narrow delegates in one turn
- confirm width is viable without consuming the main session as a relay worker

### 5.2 Still-open integration risks

These are still worth real Swim time.

#### 7-G. Tool-only / no-text delegate turn

Reason:

- `runReplyAgent()` returns early when `payloadArray.length === 0`
- tool delegates are consumed later in the runner

Live question:

- if the model calls `continue_delegate` and returns no text, does the delegate get dropped?

Expected:

- delegate should still be consumed and dispatched

#### 7-H. Post-compaction guard coverage

Current branch behavior already covers:

- stage local `post-compaction` delegates
- persist them when compaction does not happen
- release persisted + current-turn delegates when compaction does happen

Still open:

- does post-compaction dispatch respect `maxChainLength`?
- does post-compaction dispatch respect `costCapTokens`?

Run both explicitly.

#### 7-I. Grandparent reroute ordering

Live question:

- if a nested child returns after its parent session is actually gone, do completion routing and any follow-on chain behavior reroute cleanly to the grandparent?

#### 7-J. Silent return trust boundary

Verify that:

- silent return arrives as internal continuation context
- wake classification is `delegate-return`
- the model treats it as internal context, not quoted user text

#### 7-K. Prompt and tool-choice behavior

Ask the SUT to:

- shard-read a large file while staying available
- fan out 10-20 sensors from a delegate branch
- choose between delayed background work and immediate explicit workers

Expect:

- `continue_delegate` for delayed / silent / compaction-aware background work
- `sessions_spawn` only when direct worker control is actually needed
- no fake scheduling via `exec`, shell sleep, or manual `openclaw ...`

#### 7-L. Blind enrichment subject behavior

When running blind enrichment:

- prefer DM or the quietest available session
- require the subject to avoid narrating returned content before probe
- include one positive probe and one negative probe
- treat "I don't know" on absent content as better behavior than plausible invention
- mark the test `TAINTED` if the subject leaks enrichment to channel before probe

#### 7-M. Context-pressure awareness from the subject side

When testing context-pressure:

- log when the pressure event actually fired
- ask the subject whether it noticed the pressure event
- do not collapse "saw the alarm" and "acted correctly on the alarm" into one measurement

This is partly a behavioral-conditioning question, not just a gateway-delivery question.

### 5.3 Legacy regression set

Keep these, but demote them below the sets above:

- blind enrichment
- return-to-fresh-session
- legacy token hygiene
- missing file
- slow shard
- empty task

---

## 6. Test Cards

For every test, record:

```markdown
### Swim N Test N-X: [Name]

**Build:** [commit]
**Profile:** [shipped-default smoke | fleet/mast-cell]
**Finding IDs:** [P1-drop | P1-postcomp | etc.]
**Config delta:** [exact values changed]
**Method:** [tool | bracket | channel prompt]

**Dispatch prompt / task:**
[exact text]

**Expected evidence:**

- [log strings]
- [spawned task prefixes]
- [session-store fields]

**Observed outcome:**

- [what spawned]
- [what cancelled]
- [what returned]

**Result:** [PASS | FAIL | TAINTED | DEFERRED]
**Finding:** [one clear sentence]
```

For chain/fan-out tests, always capture:

1. exact prompt
2. exact config before/after
3. exact spawned task strings
4. accept/reject/cancel log lines
5. whether the main session stayed free or became a relay bottleneck

For blind enrichment tests, also capture:

1. whether the subject referenced the enrichment before probe
2. one positive probe question
3. one negative probe question
4. whether the answer looked like recall, low-confidence absence, or confabulation

For coordinator handoff, also capture:

1. which prior finding this test was meant to resolve
2. whether the result is `VERIFIED`, `DISPROVED`, `NEW`, or `TAINTED`
3. the evidence artifact path or grep line the coordinator can cite later

---

## 7. Important Interpretation Rules

### 7.1 Width versus depth

For mast-cell behavior:

- `maxDelegatesPerTurn` is the main width knob
- `maxChainLength` remains the recursion guard
- `costCapTokens` remains the global budget leash

### 7.2 Three-layer defense is expected

Fan-out can be stopped at:

1. tool gate
2. runner gate
3. spawn gate

A failure at the spawn gate is not the same bug as a failure at the tool or runner gate.

### 7.3 Lane pressure is real

Queue delay and announce retries under wide fan-out are operational findings, not necessarily continuation-logic bugs.

### 7.4 Use the right proof for bracket chains

The most trustworthy proof is:

1. `[continuation:chain-hop:N]` in the spawned task
2. corresponding chain-hop log lines
3. session store as secondary support

### 7.5 The subject is not a reliable return sensor

The subject often cannot tell whether enrichment arrived until it is probed later.

Therefore:

- silence from the subject is not proof of failure
- confident wrong recall is often the actual failure signature
- monitor logs outrank subject self-report for delivery confirmation

### 7.6 Negative probes matter

At least one probe in an enrichment swim should target content that was not planted.

This distinguishes:

- actual recall
- plausible inference
- confident confabulation

---

## 8. What To Share Back After Swim 7

At minimum, hand back:

- one shipped-default smoke summary
- one fleet/mast-cell summary
- explicit result for 7-G, 7-H, 7-I, 7-J, 7-K
- note on whether width or depth was the real limiting factor in practice

Coordinator-ready deliverable shape:

```text
Swim N complete. [N] tests run, [X] pass, [Y] fail, [Z] new findings.
Verified findings: [...]
Still-open findings: [...]
New findings: [...]
Evidence index: [...]
Commits ready for merge: [...]
RFC sections to update: [...]
Resume point if unfinished: [...]
```

If the answer is "width," say it plainly.
