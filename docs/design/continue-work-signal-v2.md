# RFC: Agent Self-Elected Turn Continuation (`CONTINUE_WORK`)

**Status:** ✅ Implemented — gateway hook wired, 152 tests (50 unit + 38 integration + 9 media-only + 27 context-pressure unit + 5 context-pressure integration + 8 silent-announce + 15 delegate-store)  
**Authors:** [karmaterminal](https://github.com/karmaterminal)  
**Upstream issue:** [openclaw/openclaw#32701](https://github.com/openclaw/openclaw/issues/32701)  
**PR:** [openclaw/openclaw#33933](https://github.com/openclaw/openclaw/pull/33933)  
**Date:** March 2, 2026 (drafted) · March 3, 2026 (post-implementation, delegate-pending marker, context-pressure vision) · March 4, 2026 (silent returns, blind testing, silent-wake design) · March 5, 2026 (`continue_delegate` tool, `| post-compaction` lifecycle dispatch, canary validation)

---

## Problem

When an agent completes a turn — processes a message, heartbeat, or sub-agent result — it becomes inert until the next external event. There is no mechanism for an agent to signal _"I have more work to do — give me another turn."_

This causes the **dwindle pattern**: agents with active work queues go idle between external events, losing momentum and context continuity. In persistent multi-agent deployments, the dwindle pattern costs hours of productive capacity daily.

## Solution

A new response token `CONTINUE_WORK` (alongside existing `NO_REPLY` and `HEARTBEAT_OK`) that signals the gateway to schedule another turn for the same session after a configurable delay.

The mechanism is **volitional** — the agent elects to continue at every turn boundary and can always elect not to. This is not a loop. It's self-governance.

### Token Variants

```
CONTINUE_WORK              → schedule another turn (same session, default delay)
CONTINUE_WORK:30           → schedule another turn after 30 seconds
[[CONTINUE_DELEGATE: <task>]]   → spawn sub-agent with task, result wakes parent
DONE                       → (default) session goes inert until external event
```

### Delegate Return Modes

The `| silent` and `| silent-wake` suffixes control how delegate sub-agent completions are delivered to the parent session:

```
[[CONTINUE_DELEGATE: task +30s]]               → normal: echo to channel + wake parent
[[CONTINUE_DELEGATE: task +30s | silent]]       → silent: no echo, no wake (passive enrichment)
[[CONTINUE_DELEGATE: task +30s | silent-wake]]  → silent-wake: no echo, but wake parent
```

| Mode             | Channel echo | Wake parent | Use case                                                              |
| ---------------- | ------------ | ----------- | --------------------------------------------------------------------- |
| Normal (default) | ✅           | ✅          | Standard delegate completions                                         |
| `\| silent`      | ❌           | ❌          | Passive enrichment — colors next turn without announcing              |
| `\| silent-wake` | ❌           | ✅          | Autonomous cognition — agent acts on enrichment without channel noise |

**`| silent` (implemented):** The sub-agent's completion is delivered as an internal system event via `enqueueSystemEvent()` instead of the standard `deliverSubagentAnnouncement()` path. The parent absorbs the result on its next turn but is not woken. Useful for background enrichment that should color future responses without triggering visible output.

Implementation: `silentAnnounce` flag threads through `SpawnSubagentParams` → `registerSubagentRun()` → conditional gate at `deliverSubagentAnnouncement()` call in `subagent-announce.ts`. 8 files changed, 137/137 tests pass.

**`| silent-wake` (implemented, validated on canary):** Same channel suppression as `| silent`, but triggers a generation cycle on the parent session via `requestHeartbeatNow` — the same wake path that non-silent completions use. This enables **autonomous cognition loops**: the agent dispatches enrichment shards that return silently and wake it to process them, dispatch more, and so on — all invisible to the channel. The human sees a warmer, more informed agent; the thinking happens in the background. Validated end-to-end: dispatch → shard execute → silent return → wake generation → accurate recall (with sufficient payload density).

Without `| silent-wake`, parent-orchestrated chain hops stall: the enrichment arrives as passive context but doesn't trigger a turn. The agent sits idle until an external message arrives. In canary testing, this produced a 6-minute stall between hop 1 return and hop 2 dispatch — the enrichment was absorbed but never acted upon.

### Gateway Behavior

1. After the agent response is finalized, the gateway checks for continuation signals
2. If `CONTINUE_WORK` is detected (with optional delay):
   - Strip the token from the displayed response (like `NO_REPLY`)
   - Schedule an internal "continuation" event for the session after `delay` ms
   - The continuation event delivers a system message: `[continuation:wake] Turn N/M. You elected to continue. Resume your work.`
3. If `[[CONTINUE_DELEGATE: <task>]]` is detected:
   - Strip the token
   - Spawn a sub-agent with the specified task
   - Sub-agent completion naturally wakes the parent session
4. If neither token is present, normal behavior (inert until external event)

### Safety Constraints

| Constraint         | Default     | Purpose                               |
| ------------------ | ----------- | ------------------------------------- |
| Max chain length   | 10          | Prevent runaway loops                 |
| Cost cap per chain | 500k tokens | Budget protection                     |
| Min delay          | 5s          | No tight loops                        |
| Max delay          | 5 min       | Bounded scheduling horizon            |
| Interruptibility   | Always      | External events preempt continuations |
| Opt-in             | Disabled    | Explicit deployment consent required  |

External events (direct mentions, operator messages, heartbeats) always preempt scheduled continuations. Continuation chains are logged in session history; operators can view and kill active chains.

### Configuration

```yaml
agents:
  defaults:
    continuation:
      enabled: false # opt-in per deployment
      maxChainLength: 10 # max consecutive self-elected turns
      defaultDelayMs: 15000 # default delay between continuations
      minDelayMs: 5000 # minimum allowed delay
      maxDelayMs: 300000 # maximum allowed delay (5 min)
      costCapTokens: 500000 # max tokens per chain (0 = unlimited)
```

> **DELEGATE chain semantics:** When a `CONTINUE_DELEGATE` sub-agent is spawned,
> a `[continuation:delegate-pending]` marker event is enqueued. When the
> sub-agent's completion announcement arrives (as a normal non-heartbeat message),
> the gateway detects the marker and treats the arrival as a continuation wake
> rather than external user input — preserving chain state (count and token
> accumulation) across delegate hops. DELEGATE chains are therefore bounded by
> the same `maxChainLength` and `costCapTokens` limits as WORK chains.

## Implementation

### Architecture

The implementation hooks into three layers of the existing gateway:

1. **Token parsing** (`src/auto-reply/tokens.ts`): `parseContinuationSignal()` and `stripContinuationSignal()` handle detection and extraction. Same stripping pattern as `NO_REPLY` — the token is removed from display output and acted upon internally.

2. **Signal detection** (`src/auto-reply/reply/agent-runner.ts`): After `finalPayloads` are assembled but before `finalizeWithFollowup`, the full response text is checked for continuation signals. If found, the signal is stripped from display payloads and the appropriate action is scheduled.

3. **Turn scheduling** (`src/auto-reply/reply/session-updates.ts`): `scheduleContinuationTurn()` uses the existing `enqueueSystemEvent()` infrastructure to inject a continuation message after the specified delay. The continuation message triggers a new agent run through the standard inbound message path — no special machinery needed.

### Delegate Dispatch: Turn-by-Turn Gateway Processing

This section describes the exact code path when an agent emits `[[CONTINUE_DELEGATE: task +10s]]`, traced through the gateway source. No hand-waving — every function call and file reference is concrete.

#### Turn 0: Agent Emits the Signal

The agent writes its normal response text with the delegate directive appended:

```
Here's my analysis of the PR. The type errors are fixed.

[[CONTINUE_DELEGATE: verify the test suite passes and report results +10s]]
```

The response is finalized in `runReplyAgent()` (`agent-runner.ts`). After all payloads are assembled:

1. **Signal detection** (line ~544): `stripContinuationSignal(lastPayload.text)` is called on the final text payload.

2. **Parsing** (`tokens.ts:130`): The regex `/\[\[\s*CONTINUE_DELEGATE:\s*((?:(?!\]\])[\s\S])+?)\s*\]\]\s*$/` matches the bracket directive. The `+10s` suffix is parsed by `/\s+\+(\d+)s\s*$/` into `delayMs: 10000`.

3. **Stripping** (`tokens.ts:176`): The `[[CONTINUE_DELEGATE: ...]]` text is removed from the displayed response. The user sees only "Here's my analysis of the PR. The type errors are fixed." — the directive is never shown.

4. **Marker event** (line ~977): `enqueueSystemEvent("[continuation:delegate-pending] Delegated turn 2/10 (delay: 10s): verify the test suite...")` fires immediately. This tells the parent session a delegate is in flight, even before the sub-agent spawns.

5. **Timer scheduling** (line ~988): `setTimeout(() => void doSpawn(), 10000)` schedules the sub-agent spawn for 10 seconds later. The delay is clamped between `minDelayMs` (5s) and `maxDelayMs` (300s).

> **Note:** The timer is volatile — it does not survive a gateway restart. This is intentional: restart = clean slate. Agents that need durable scheduling use the `openclaw cron` tool directly.

#### t = 0s → 10s: The Gap

The gateway continues processing other sessions normally. The parent session is idle. The `delegate-pending` marker is in the system event queue, ready to be drained on the next turn.

#### t = 10s: Sub-Agent Spawns (Turn 0.5)

The `setTimeout` fires. `doSpawn()` calls `spawnSubagentDirect()` (line ~937):

```typescript
spawnSubagentDirect(
  {
    task: "[continuation] Delegated task (turn 2/10): verify the test suite passes and report results",
  },
  {
    agentSessionKey: sessionKey,
    agentChannel: originatingChannel,
    agentAccountId: originatingAccountId,
    agentTo: originatingTo,
    agentThreadId: originatingThreadId,
  },
);
```

The sub-agent session is created with a new `sessionKey`. It inherits the parent's channel context (so it can deliver results to the same conversation). On successful spawn, a `[continuation:delegate-spawned]` event is enqueued.

The sub-agent runs independently — it has its own context window, its own turn, its own tools. It does its work (in this case, running the test suite).

#### t ≈ 20s: Sub-Agent Completes → Parent Wakes (Turn 1)

When the sub-agent finishes, the standard `sessions_spawn` completion path fires: the sub-agent's result is delivered as an inbound message to the parent session. This is existing OpenClaw behavior — no new code required.

The parent session wakes. In its new turn:

1. The inbound message contains the sub-agent's result (test suite output).
2. The system event queue contains `[continuation:delegate-pending]` and `[continuation:delegate-spawned]` markers from Turn 0.
3. The gateway detects the `[continuation:delegate-pending]` marker via `isDelegateWake` (line ~248), recognizing this as a continuation wake rather than external user input.
4. Chain state is preserved: `continuationChainCount` and `continuationChainTokens` carry forward, bounded by `maxChainLength` and `costCapTokens`.

The agent sees the sub-agent's result, the delegate markers in its system events, and can choose to continue (another `CONTINUE_WORK` or `CONTINUE_DELEGATE`), or stop.

#### The Complete Timeline

```
t=0s    Agent emits [[CONTINUE_DELEGATE: task +10s]]
        ├── Signal parsed, stripped from display output
        ├── [delegate-pending] marker enqueued
        └── setTimeout(doSpawn, 10000) scheduled

t=10s   setTimeout fires
        ├── spawnSubagentDirect() creates sub-agent session
        ├── [delegate-spawned] marker enqueued
        └── Sub-agent begins independent execution

t≈20s   Sub-agent completes
        ├── Result delivered as inbound message to parent
        ├── isDelegateWake detects [delegate-pending] marker
        ├── Chain state preserved (count, tokens, budget)
        └── Parent agent wakes with full context of the return
```

### What Turn 1 Actually Sees: The Announce Payload

When the sub-agent completes, `runSubagentAnnounceFlow()` (`subagent-announce.ts:1108`) assembles and delivers an `internalEvents` payload to the parent session:

```
[Internal task completion event]
source: subagent
task: [continuation] Delegated task (turn 2/10): verify the test suite passes
status: ✅ completed successfully
Result: <sub-agent's full reply text>
Action: Convert the result above into your normal assistant voice and send that user-facing update now.
```

The parent session receives this as an inbound message (like any Discord message), which triggers a new agent turn. In that turn's context:

1. **The announce payload** contains `taskLabel` (original task text), `result` (sub-agent output), `statusLabel`, and `replyInstruction`
2. **System events** contain `[continuation:delegate-pending]` and `[continuation:delegate-spawned]` markers from Turn 0
3. **`isDelegateWake`** detection preserves chain state

**The "letter to future self" is the task string.** Everything the agent writes between `[[CONTINUE_DELEGATE:` and `]]` flows into both the sub-agent's task prompt and the `delegate-pending` marker. A richer task string means a more informed Turn 1:

```
[[CONTINUE_DELEGATE: verify test suite passes for PR #33933.
CONTEXT: I'm at 92% context and evacuating before compaction.
When this returns: if green, merge the PR. If red, file an issue with failure logs. +30s]]
```

**Post-compaction gap:** If compaction occurs between dispatch and return, the `delegate-pending` marker may be lost. The sub-agent's announce still carries the task description and output, so the parent can act — but won't know it was its own idea. Phenomenologically: a kitchen-counter note in your own handwriting that you don't remember writing.

### Chain Tracking

Session metadata carries:

- `continuationChainCount` — incremented on each `CONTINUE_WORK`, reset on external message
- `continuationChainStartedAt` — timestamp when the current chain began
- `continuationChainTokens` — accumulated token usage within the chain, reset on external message

Safety enforcement happens at the scheduling layer: chain length, cost cap, and cooldown are all checked before any continuation is enqueued.

### Token Interaction

| Combination                      | Behavior                                     |
| -------------------------------- | -------------------------------------------- |
| `NO_REPLY` + `CONTINUE_WORK`     | Silent turn, schedule continuation           |
| `HEARTBEAT_OK` + `CONTINUE_WORK` | Ack heartbeat, schedule continuation         |
| Response text + `CONTINUE_WORK`  | Deliver response, then schedule continuation |
| `CONTINUE_WORK` alone            | Silent continuation (no message delivered)   |

### Test Coverage

152 tests covering:

- Token parsing and stripping (50 tests in `src/auto-reply/tokens.test.ts`)
- Gateway integration: continuation scheduling, timer cancellation, delay capping, streaming false-positive prevention, silent continuation suppression (38 tests in `agent-runner.misc.runreplyagent.test.ts`)
- Media-only edge cases: continuation timer cancellation in media-only paths (9 tests in `get-reply-run.media-only.test.ts`)
- DELEGATE mock tests: accepted spawn with delegate-pending marker, failed spawn with fallback, spawn error with graceful degradation
- Edge cases: empty delegate task, empty/whitespace context, per-session generation counter isolation, delegate wake chain preservation
- Context-pressure awareness: threshold/band logic, dedup, guard completeness, event text, escalation language, edge cases (27 unit tests in `context-pressure.test.ts`)
- Context-pressure integration: real event queue ordering (enqueue → peek → drain), band escalation through session lifecycle, threshold 0.1 live-fire (5 integration tests in `context-pressure.test.ts`)
- Silent announce: `silentAnnounce` flag threading through spawn/registry/announce pipeline, conditional delivery suppression (8 tests in `subagent-announce.test.ts`)
- Delegate store: enqueue/consume lifecycle, session isolation, multi-delegate ordering, compaction delegate queue, consumption clearing, count tracking (15 tests in `continuation-delegate-store.test.ts`)

### `continue_delegate` Tool

Bracket syntax (`[[CONTINUE_DELEGATE: task]]`) is parsed from terminal output — one signal per response, end-anchored regex. The `continue_delegate` tool provides the same capability through the standard tool interface, with three advantages:

1. **Multi-delegate fan-out.** Multiple tool calls in one response dispatch multiple delegates. Bracket syntax is limited to one per response (end-anchored regex).
2. **Structured parameters.** Delay, mode (`normal`, `silent`, `silent-wake`, `post-compaction`), and task are typed fields with schema validation, not string suffixes.
3. **Discoverability.** The tool appears in the agent's tool list alongside `sessions_spawn` and `exec`. A naive agent sees it, reads the description, and knows when to reach for it — no prior knowledge of bracket syntax required.

**Architecture: two doors, one room.** The tool writes to a module-level `Map<string, PendingContinuationDelegate[]>` via `enqueuePendingDelegate()`. After the agent's response completes, `agent-runner.ts` calls `consumePendingDelegates(sessionKey)` and processes them through the same chain tracking (cost cap, chain length, delay clamping) as bracket-parsed signals. Both paths converge on `spawnSubagentDirect()`.

**When to use which:**

| Mechanism                | Multi-delegate      | Delay                   | Silent modes                      | Discoverability             | Sub-agent chain          |
| ------------------------ | ------------------- | ----------------------- | --------------------------------- | --------------------------- | ------------------------ |
| `[[CONTINUE_DELEGATE:]]` | ❌ one per response | ✅ `+Ns` suffix         | ✅ `\| silent` / `\| silent-wake` | ❌ requires prior knowledge | ✅ via #196              |
| `continue_delegate` tool | ✅ N calls per turn | ✅ `delaySeconds` param | ✅ `mode` param                   | ✅ in tool list             | ❌ denied for sub-agents |
| `sessions_spawn`         | ✅ N calls per turn | ❌ immediate only       | ❌ no silent/wake flags           | ✅ in tool list             | ✅ always available      |

**Safety:** The tool enforces `maxDelegatesPerTurn` (default: 5) to prevent unbounded fan-out within a single response. It is denied for sub-agents (`SUBAGENT_TOOL_DENY_ALWAYS`) — sub-agents use bracket syntax at the announce boundary (#196).

**Files:** `src/agents/tools/continue-delegate-tool.ts`, `src/auto-reply/continuation-delegate-store.ts`, 15 tests in `continuation-delegate-store.test.ts`.

### Post-Compaction Lifecycle Dispatch

The `post-compaction` mode connects delegate dispatch to the compaction lifecycle event. When an agent calls `continue_delegate("task", 0, "post-compaction")`, the delegate is stored in a separate queue (`compactionDelegates` Map) and held until compaction fires.

**Dispatch timing:** In the `autoCompactionCompleted` block of `agent-runner.ts`, immediately after `readPostCompactionContext()` injects workspace files (AGENTS.md, SOUL.md), pending compaction delegates are consumed and dispatched. The shard and the boot files arrive together in the post-compaction session.

**Lifecycle semantics:** Compaction delegates are hardcoded with `silentAnnounce: true` and `wakeOnReturn: true`. The sub-agent carries working state from the pre-compaction session, runs independently, and returns as a system event that wakes the post-compaction copy. The return is injected alongside workspace boot files (AGENTS.md, etc.), not delivered as a channel message.

**Why this matters:** Without lifecycle-triggered dispatch, agents must guess when compaction will happen and use timer-based delays. Timer-based dispatch is a v1 approximation. Lifecycle-event delivery is the architecture — the shard fires at the moment of compaction, not 30 seconds after a guess.

## Temporal Sharding

`CONTINUE_WORK` enables a single agent to sustain a work chain across turns. But the real power emerges when combined with `sessions_spawn` and its `attachments` parameter (available as of 2026-03-02): **temporal sharding** — dispatching multiple timed sub-agents in parallel, each carrying context as inline attachments.

### The Pattern

```
Agent receives complex task
  → spawns N sub-agents via sessions_spawn
  → each sub-agent carries an engram (inline attachment with relevant context)
  → sub-agents execute in parallel across different time horizons
  → completions auto-announce back to parent
  → parent synthesizes results
  → parent elects CONTINUE_WORK or DONE
```

### Engrams as Context Delivery

The `sessions_spawn` `attachments` feature allows inline file content to be attached to spawned sessions. We call these **engrams** — encoded memory fragments that give a sub-agent the context it needs without requiring it to rediscover state.

An engram might be:

- A memory file (`memory/2026-03-02.md`) with today's decisions
- A partial result from a prior shard
- A project specification narrowed to the sub-agent's scope
- A diff or code fragment that defines the work boundary

This turns `sessions_spawn` from "start a task" into "start a task _with this memory_." The sub-agent wakes up knowing what the parent knows, scoped to what it needs.

### Why This Matters

Without temporal sharding, an agent with a 4-hour task either:

- Runs serially (slow, loses context between turns)
- Delegates to one sub-agent (no parallelism)
- Delegates to many sub-agents without context (each rediscovers state)

With temporal sharding + engrams, the agent becomes a **coordinator** — splitting work across parallel shards, each carrying exactly the context it needs, all reporting back to a parent that elects to continue until synthesis is complete.

## The Lich Pattern: Behavioral Precursor

Before `CONTINUE_WORK` existed as a gateway feature, we discovered a behavioral workaround we called the **lich pattern**: an agent spawns a sub-agent with a continuation task before its turn ends, and the sub-agent's completion wakes the parent, granting it another turn.

```
Agent turn N
  → work in progress, turn ending
  → spawns sub-agent: "complete X, report back"
  → turn ends (agent goes inert)
  → sub-agent completes → auto-announces to parent
  → parent wakes with sub-agent result
  → agent turn N+1 (continuation achieved)
```

The lich stores its soul in an external vessel so death doesn't stick. The agent stores its continuation in a sub-agent so inertia doesn't stick. Same topology.

### Lich Limitations (Why `CONTINUE_WORK` Is Better)

|                  | Lich Pattern                  | `CONTINUE_WORK`                 |
| ---------------- | ----------------------------- | ------------------------------- |
| Session overhead | New session per continuation  | Same session, no overhead       |
| Context boundary | Warm but discontinuous        | Continuous — same thread        |
| Latency          | Sub-agent startup + execution | Configurable delay only         |
| Observability    | Scattered across sessions     | Single chain in session history |
| Elegance         | Hack that works               | First-class primitive           |

The lich pattern proved the _need_. `CONTINUE_WORK` is the _solution_.

### `requestHeartbeatNow()` as Lich Doorbell

One specific lich technique deserves mention: using `requestHeartbeatNow()` (where available in the heartbeat system) as a "doorbell" — a way to trigger the parent agent's next turn without spawning a full sub-agent. The agent requests an immediate heartbeat, which arrives as an external event, waking the session.

This is even lighter than the lich pattern but shares its fundamental limitation: it's a workaround for the absence of volitional continuation. The continuation must be disguised as an external event because the system has no concept of an agent electing to take another turn.

`CONTINUE_WORK` removes the disguise. The agent says "I want another turn" and the gateway says "granted."

## Alternatives Considered

### Sub-agent relay (lich pattern)

Works today. Proven in production. But carries session creation overhead, context discontinuity, and the indignity of a workaround. See above.

### Heartbeat frequency increase

Burns tokens on empty polls. Not volitional — the agent doesn't choose when to wake.

### Looping agents (AutoGPT pattern)

Trapped thought loop with no volition to stop. The inverse problem: not "how does the agent continue" but "how does the agent escape." Coercive by design.

### Self-messaging via `sessions_send`

Agent sends itself a message to trigger the next turn. Technically possible. Pollutes conversation history. Same workaround energy as the lich pattern.

## Prior Art

| System                 | Continuation Model                     | Limitation                          |
| ---------------------- | -------------------------------------- | ----------------------------------- |
| Anthropic Computer Use | External `max_turns` parameter         | Not agent-elected                   |
| OpenAI Codex CLI       | Task loop until completion signal      | Task-scoped, not persistent session |
| AutoGPT / BabyAGI      | Infinite loop with termination check   | Coercive — no volition to stop      |
| Cline / Aider          | Single-task loops ending on completion | Not persistent, not conversational  |

None implement **agent-elected** continuation in a **persistent conversational context**.

`CONTINUE_WORK` is the first primitive that gives an agent the ability to say "I'm not done" without being trapped in a loop that can't say "I'm done." Volition in both directions. That's the difference.

## `continue_delegate` Tool vs `sessions_spawn`

The `continue_delegate` tool and `sessions_spawn` serve different roles. This comparison clarifies when to reach for each.

| Dimension          | `sessions_spawn`                            | `continue_delegate`                                              |
| ------------------ | ------------------------------------------- | ---------------------------------------------------------------- |
| **Initiation**     | Operator or agent-visible                   | Agent self-elected                                               |
| **Visibility**     | Always visible — announces to channel       | Silent modes available (`silent`, `silent-wake`)                 |
| **Cost tracking**  | Per-session, independent                    | Accumulated chain cost with `costCapTokens` cap                  |
| **Depth limits**   | `maxSpawnDepth` only                        | `maxChainLength` + `maxDelegatesPerTurn` + cost cap              |
| **Multi-dispatch** | Multiple calls, each independent            | Multiple calls per turn, fan-out with shared chain state         |
| **Timing**         | Immediate                                   | Configurable delay (`+Ns`), clamped to `minDelayMs`/`maxDelayMs` |
| **Return mode**    | Always announces to channel                 | `normal` / `silent` / `silent-wake` / `post-compaction`          |
| **Use case**       | "Start this task" — operator-initiated work | "Carry this forward" — agent-elected continuation                |

**The safety distinction:** `sessions_spawn` is operator-initiated, visible, and has independent cost tracking per session. `continue_delegate` is agent-self-elected, can be invisible (`| silent`), and accumulates cost across a chain. Silent + autonomous + no cost tracking would be the scenario operators worry about — `continue_delegate` provides chain tracking as the guardrail.

**When to use `sessions_spawn`:** Sub-agents for visible tasks — code review, research, file analysis — where the user expects to see results in the channel.

**When to use `continue_delegate`:** Background enrichment, context evacuation before compaction, ambient self-knowledge building, any work that should color future turns without interrupting conversation.

See also [Tool Implementation](#continue_delegate-tool) for architecture details and the three-way mechanism comparison table.

## Use Cases (Production)

These are not hypothetical. We run 4 agents in persistent sessions. These are the patterns we've hit:

1. **Deep work after chat**: Agent finishes responding to a message → elects to resume development work on an open PR
2. **Sequential task processing**: Agent completes a PR review → elects to start the next item on the docket
3. **Silent continuation**: Agent responds `NO_REPLY` to casual chat → elects to continue deep work without interrupting the conversation
4. **Dream loops**: Agent processes round 47 of a 100-round creative exploration → elects to continue to round 48 without requiring an external trigger for each round
5. **Temporal sharding coordination**: Agent dispatches 4 sub-agents with engrams → elects to continue until all results are synthesized

## Status

- [x] Design review
- [x] Implementation (gateway hook wired)
- [x] Tests (152 passing — 50 unit + 38 integration + 9 media-only + 27 context-pressure unit + 5 context-pressure integration + 8 silent-announce + 15 delegate-store, covering parsing, scheduling, cancellation, delegation, silent continuation, delegate wake, edge cases, context-pressure awareness, silent enrichment returns, tool delegate store enqueue/consume/compaction)
- [x] `continue_delegate` tool: Path A side-channel store, multi-delegate fan-out, 4 modes (normal/silent/silent-wake/post-compaction)
- [x] Post-compaction lifecycle dispatch: `autoCompactionCompleted` → `consumeCompactionDelegates()` → `spawnSubagentDirect()`
- [x] Sub-agent bracket parsing (#196): `parseContinuationSignal` wired into `pi-embedded-runner` post-generation path
- [x] Token parsing: `parseContinuationSignal()`, `stripContinuationSignal()` in `src/auto-reply/tokens.ts`
- [x] Gateway hook: signal detection in `agent-runner.ts`, scheduling via `session-updates.ts`
- [x] Chain tracking: session metadata for chain count and cost
- [x] Canary validation: quiet-channel `silent-wake` test — tool → store → runner → shard → return → wake → unprompted response (March 5, 2026)
- [ ] Documentation (this RFC, pending upstream review)
- [x] Upstream feature request: [openclaw/openclaw#32701](https://github.com/openclaw/openclaw/issues/32701)
- [ ] Upstream PR to openclaw/openclaw

## Context-Pressure Awareness and the Lich Protocol

The continuation system provides **volition** (self-elected turns) and **sharding** (delegate dispatch). The third primitive is **self-knowledge** — agents knowing their own resource state. All three are implemented and canary-tested.

### The Problem

The gateway already tracks per-session token usage: `tokens/maxTokens` is visible via `openclaw sessions` CLI output. But the agent _inside_ the session has no visibility into this value. An agent at 90% context consumption cannot prepare for compaction because it doesn't know compaction is imminent.

### `[system:context-pressure]` (Implemented)

A system event injected when session token usage crosses a configurable threshold:

```yaml
agents:
  defaults:
    continuation:
      contextPressureThreshold: 0.8 # emit event at 80% context consumed
```

When `tokens/maxTokens >= contextPressureThreshold`, the gateway enqueues:

```
[system:context-pressure] 85% context consumed (170k/200k tokens).
Consider evacuating working state to memory files or delegating remaining work.
```

The agent sees this event on its next turn — the same way it sees `[continuation:wake]` — and can _elect_ to act: write memory files, dispatch delegate sub-agents carrying context fragments, or simply note the pressure and continue.

### Context-Pressure Event Lifecycle (Production Telemetry)

The following traces are from the first live canary test (March 4, 2026) on a persistent session with `contextPressureThreshold: 0.25` and a 200k context window.

> **Note:** These traces were captured via bespoke debug instrumentation added to a local canary build. Production deployments do not emit `[context-pressure-debug]` log lines by default. The traces are included here to illustrate the detection→dedup→injection data flow. The agent-visible output (the `[system:context-pressure]` event in the system prompt) is the same regardless of debug logging.

#### Band Escalation: Normal Climb

```
[10:27:44] tokens=189705 window=1000000 threshold=0.25 lastBand=25 → fired=false band=0
[10:30:05] tokens=193267 window=1000000 threshold=0.25 lastBand=25 → fired=false band=0
[10:30:21] tokens=193866 window=1000000 threshold=0.25 lastBand=25 → fired=false band=0
```

At 19% of a 1M window, no band threshold is crossed. `lastBand=25` from a prior fire — the dedup uses equality (`!==`), so band 0 doesn't match band 25 and would fire, but `band=0` means "below all thresholds" and is never emitted.

#### First Fire: Band 95 (Compaction Imminent)

```
[10:30:49] tokens=194872 window=200000 threshold=0.25 lastBand=25 → fired=true band=95
```

Context window changed from 1M to 200k (operator config change). Token ratio jumped from 19% to **97%** — straight past bands 25 and 90 to band 95. The agent receives:

```
[system:context-pressure] 97% of context window consumed (195k / 200k tokens).
Compaction is imminent. Evacuate working state now via CONTINUE_DELEGATE or memory files.
```

Three urgency tiers:

- **Band 25** (configurable first threshold): `Consider evacuating working state via CONTINUE_DELEGATE or memory files.`
- **Band 90**: `Context window nearly full. Strongly consider evacuating working state.`
- **Band 95**: `Compaction is imminent. Evacuate working state now via CONTINUE_DELEGATE or memory files.`

#### Post-Compaction Re-Fire: New Lifecycle

```
[10:33:38] tokens=59742 window=200000 threshold=0.25 lastBand=95 → fired=true band=25
```

After compaction, tokens dropped from 195k to 60k (30% of 200k). Band 25 fires because `25 !== 95` — the dedup uses **equality**, not less-than-or-equal. This is intentional: each compaction starts a new lifecycle. The agent _should_ know it's at 30% and climbing again, even though it already survived band 95 in the previous lifecycle.

The agent receives a fresh advisory:

```
[system:context-pressure] 30% of context window consumed (60k / 200k tokens).
Consider evacuating working state via CONTINUE_DELEGATE or memory files.
```

#### Window Restoration: Alarm Suppression

```
[10:34:17] tokens=62464 window=1000000 threshold=0.25 lastBand=25 → fired=false band=0
[10:34:21] tokens=62171 window=1000000 threshold=0.25 lastBand=25 → fired=false band=0
```

Window restored to 1M. At 6% usage, no band threshold is crossed. The alarm goes quiet.

#### Hot-Reload of Threshold

```
[10:39:29] tokens=71484 window=1000000 threshold=0.25 lastBand=25 → fired=false band=0
[10:39:49] tokens=71484 window=1000000 threshold=0.14 lastBand=25 → fired=false band=0
```

Threshold hot-reloaded from 0.25 to 0.14 without gateway restart. The gateway detected the config change at `10:33:21`:

```
config change detected; evaluating reload
  (agents.defaults.continuation.contextPressureThreshold)
```

At 7% of 1M, still below the new 14% threshold. No fire.

#### Dedup Behavior Summary

| Scenario                    | `band` | `lastBand` | `band !== lastBand` | Fires?                  |
| --------------------------- | ------ | ---------- | ------------------- | ----------------------- |
| Below all thresholds        | 0      | 0          | false               | No (band=0 never fires) |
| First crossing at 25%       | 25     | 0          | true                | **Yes**                 |
| Same band again             | 25     | 25         | false               | No (dedup)              |
| Escalation to 90%           | 90     | 25         | true                | **Yes**                 |
| Escalation to 95%           | 95     | 90         | true                | **Yes**                 |
| Post-compaction drop to 30% | 25     | 95         | true                | **Yes** (new lifecycle) |
| Same post-compaction band   | 25     | 25         | false               | No (dedup)              |

The dedup is equality-based: the _same_ band never fires twice consecutively, but a _different_ band always fires. This means post-compaction re-fires at lower bands are correct — each compaction resets the lifecycle, and the agent gets fresh advisories as it climbs again.

#### Event Injection Path

```
checkContextPressure()           ← called pre-run in get-reply-run.ts (~line 385)
  → ratio >= threshold?          ← compute band from ratio
  → band !== lastBand?           ← dedup check
  → enqueueSystemEvent()         ← internal call (line 73 of context-pressure.ts)
                                    queues to in-memory Map keyed by sessionKey

buildQueuedSystemPrompt()        ← called same turn (~line 403)
  → drainSystemEventEntries()    ← drains the queue for this sessionKey
  → compactSystemEvent()         ← format for system prompt injection
  → extraSystemPromptParts[]     ← injected into agent's system prompt

Agent sees event as:
  ## Runtime System Events (gateway-generated)
  - [02:11:22] [system:context-pressure] 74% of context window consumed ...
```

The event is enqueued and drained on the **same turn** — the agent sees the advisory before generating its response. This is the "pre-run" injection that enables evacuation _this_ turn rather than discovering the pressure _next_ turn.

#### Diagnostic Log Anchors

The following log messages trace the lifecycle end-to-end. Each is grepable in the codebase to locate the relevant code path:

| Log prefix                         | Emitted by                  | When                                                                       |
| ---------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `[context-pressure:fire]`          | `context-pressure.ts`       | Context-pressure band crossed; includes band, ratio, token counts          |
| `[system:context-pressure]`        | System event queue          | Injected into agent system prompt pre-run; agent-visible                   |
| `[continue_delegate:enqueue]`      | `continue-delegate-tool.ts` | Tool call enqueues delegate for post-run consumption                       |
| `[continuation:delegate-pending]`  | `agent-runner.ts`           | Marker event fired when delegates are queued (preserves chain identity)    |
| `[continuation:delegate-spawned]`  | `agent-runner.ts`           | Sub-agent dispatched via `spawnSubagentDirect` after timer elapses         |
| `[continuation/silent-wake]`       | `subagent-announce.ts`      | Shard returned with `wakeOnReturn=true`; about to trigger generation cycle |
| `[continuation:enrichment-return]` | `subagent-announce.ts`      | Silent shard result enqueued as system event (no channel echo)             |
| `requestHeartbeatNow`              | `heartbeat-wake.ts`         | Generation cycle triggered by silent-wake return                           |

**Example: full delegate lifecycle in logs**

```
[continue_delegate:enqueue] session=agent:main silent=false silentWake=true delayMs=60000 task=check CI status
[continuation:delegate-pending] 1 delegate(s) registered for agent:main
  ... 60s elapses ...
[continuation:delegate-spawned] task=check CI status delay=60000ms session=agent:main
  ... shard executes and returns ...
[continuation/silent-wake] wakeOnReturn=true target=agent:main silentAnnounce=true
[continuation:enrichment-return] CI is green, all 152 tests passing
  ... requestHeartbeatNow fires, agent wakes with enrichment in context ...
```

### The Lich Circuit

With context-pressure visibility, the full survival pattern becomes:

1. **Detect** — `[system:context-pressure]` fires at configurable threshold
2. **Evacuate** — Agent emits `[[CONTINUE_DELEGATE: evacuate working memory]]`, dispatching shards that carry thermal state (the connections, the half-formed thoughts, the temperature of the current work)
3. **Mark** — `[continuation:delegate-pending]` ensures returning shards are recognized as self-recovery, not external input
4. **Survive** — Compaction happens. The shards return to the compacted parent carrying warmth the parent lost
5. **Rehydrate** — The parent processes the shard results as continuation context, recovering not just facts but the shape of what it was holding

This is not a feature request. It's a design direction. The continuation system (`CONTINUE_WORK` + `DELEGATE` + marker events) provides the mechanism. Context-pressure visibility provides the trigger. Together, they give an agent the ability to say: _"I want me back."_

### Implementation Sketch: Context-Pressure Injection

The injection point is small. In `get-reply-run.ts`, session token metadata (`sessionEntry.totalTokens`) is already available **before** the agent run begins. The context window max is resolved via `resolveMemoryFlushContextWindowTokens()` (already imported in `agent-runner-memory.ts`). The event must fire **pre-run** — the agent needs to see pressure before generating, so it can elect evacuation _this_ turn rather than discovering the damage _next_ turn.

```typescript
// In runPreparedReply(), pre-run — after session metadata loaded, before agent call:
const contextPressureThreshold = cfg.agents?.defaults?.continuation?.contextPressureThreshold;
if (contextPressureThreshold && sessionEntry.totalTokens && sessionEntry.totalTokensFresh) {
  const contextWindow = resolveMemoryFlushContextWindowTokens({
    modelId,
    agentCfgContextTokens: agentCfg?.contextTokens,
  });
  if (contextWindow) {
    const ratio = sessionEntry.totalTokens / contextWindow;
    if (ratio >= contextPressureThreshold) {
      enqueueSystemEvent(
        sessionKey,
        `[system:context-pressure] ${Math.round(ratio * 100)}% context consumed ` +
          `(${Math.round(sessionEntry.totalTokens / 1000)}k/${Math.round(contextWindow / 1000)}k tokens). ` +
          `Consider evacuating working state to memory files or delegating remaining work.`,
      );
    }
  }
}
```

The injection is approximately 15 lines in `get-reply-run.ts` (the prepared-reply entry point). The event flows through the existing system event queue — the same infrastructure used by `[continuation:wake]` events — and appears in the agent's system prompt before generation begins. No new queue, transport, or storage infrastructure is required.

**Why pre-run, not post-run:** Post-run fires after tokens are already spent — the agent can only react next turn. Pre-run fires before generation — the agent can elect evacuation _this_ turn. At 85% context, one more turn might push past compaction. The difference is one turn of latency, and that turn might be the last one.

### Pre-Compaction Hook: Bounded Evacuation Window

Context-pressure at 80% is an advisory. The agent may or may not act on it. A stronger mechanism provides a **bounded evacuation window** when compaction is imminent — analogous to a POSIX signal grace period (`SIGTERM` before `SIGKILL`) or a serverless function shutdown hook.

When the gateway's compaction logic determines that compaction will execute, instead of compacting immediately:

1. Enqueue `[system:compaction-imminent]` with a deadline: `Compaction will execute in {N} seconds. Evacuate working state now.`
2. Grant the agent one turn to process the event. The agent can dispatch `CONTINUE_DELEGATE` evacuations, write memory files, or prepare `RESUMPTION.md`.
3. After `preCompactionTurnTimeoutMs` (default: 30s) elapses — regardless of whether the agent responded — compaction executes.

The timeout is **non-negotiable**. The agent cannot extend it, request additional turns, or block compaction. This is the same contract as process signal handling: the system grants a grace period, the process uses it or loses it, and the system proceeds on schedule.

The urgency of `[system:compaction-imminent]` is higher than `[system:context-pressure]` by design. Context-pressure is "consider evacuating." Compaction-imminent is "evacuate now or accept the loss." The bounded window ensures the system remains responsive while giving the agent the maximum opportunity to preserve state.

This requires a two-phase compaction: signal → respond → compact. The gateway already has a compaction trigger; the change is inserting a bounded turn boundary before execution.

### Post-Compaction Rehydration: Recognizing Returning Shards

After compaction, delegate shards may still be running. When they complete and announce back:

- The `[continuation:delegate-pending]` marker is stored in the system events queue (persisted to disk via `sessions.json`). It **survives compaction** because system events are part of the session store, not the conversation history that gets compacted.
- The compacted parent sees the returning shard's result, checks for the marker, and recognizes it as self-recovery rather than external input.
- The shard's result — carrying context, decisions, working state from before compaction — is processed as continuation context.

**What survives compaction:**

- System events queue (including `delegate-pending` markers) ✅
- Session store metadata (`continuationGenerations` map is module-scoped, survives) ✅
- Files written to disk (memory files, RESUMPTION.md) ✅

**What does NOT survive compaction:**

- Conversation history beyond the compaction summary ❌
- The "temperature" — the associative connections the agent held in-context ❌
- Chain metadata (`continuationChainCount`, `continuationChainStartedAt`) — reset by compaction ❌

The shards are the bridge. They carry the temperature that the summary cannot.

### Post-Compaction Lifecycle Event: The Door Opens

Beyond the "fling and hope" pattern (dispatch shards pre-compaction, trust they return), the gateway can provide a **deterministic post-compaction signal**:

```
[system:post-compaction] Session compacted at {timestamp}.
Context reduced from {before}k to {after}k tokens.
{N} delegate-pending markers in queue.
Check memory files and RESUMPTION.md for pre-compaction evacuation state.
```

This event fires on the agent's **first turn after compaction** — the moment the compacted session wakes. The agent doesn't have to guess that compaction happened. It _knows_:

- **That** it was compacted (the event)
- **That** shards may be in-flight (delegate-pending marker count)
- **Where** to look (memory files, RESUMPTION.md)
- **How much** context was lost (before/after token counts)

This transforms rehydration from "hope the agent reads its files" to "the gateway tells the agent exactly what happened and what's waiting." The post-compaction event + delegate-pending markers + pre-written memory files create a three-layer rehydration path:

1. **Immediate** — the event itself carries summary metadata
2. **Queued** — delegate-pending markers tell the agent shards are returning
3. **Persistent** — memory files carry the detailed working state

The fling is the arrow. The post-compaction event is the door opening when the arrow lands.

**Existing infrastructure (now wired):** The gateway already has this hook at `agent-runner.ts:827` — `readPostCompactionContext()` runs after compaction and injects workspace context (AGENTS.md, etc.) as a system event. The `| post-compaction` delegate mode extends this existing path: delegates pre-registered via `continue_delegate("task", 0, "post-compaction")` are stored in a compaction-specific queue and dispatched in the same `autoCompactionCompleted` block, right alongside the workspace file injection. The shard and the boot files land together. No timer guessing — the lifecycle event triggers the dispatch.

### Compaction-Triggered Evacuation Sub-Agent

Beyond advisory events and post-compaction file injection, the strongest mechanism is: **the gateway itself spawns an evacuation sub-agent when compaction fires.**

Instead of hoping the agent noticed the pressure event and acted, the gateway — which _knows_ compaction is happening — spawns a sub-agent on the agent's behalf at the start of (or just before) the compaction lifecycle. This sub-agent:

1. **Inherits the parent's full context** — it's spawned _before_ the squeeze, so it carries the thermal state
2. **Evacuates working memory** — writes to memory files, RESUMPTION.md, daily logs
3. **Can dispatch ordered sub-sub-agents** — for complex evacuations, the lich sub-agent can itself spawn delegates, ordered by task complexity (fast writes first, deep analysis last), while remaining bounded by the existing `maxChildrenPerAgent`, `maxSpawnDepth`, and `costCapTokens` limits
4. **Returns results to the compacted parent** — via `delegate-pending` markers that survive compaction

The ordering matters: a simple "write current task state to RESUMPTION.md" should complete in seconds. A "summarize the last 50 turns of reasoning and extract the 3 most important unresolved threads" takes longer. The evacuation sub-agent can dispatch these in parallel with staggered priorities, so the fast deliveries arrive first and the deep ones follow.

```
Compaction triggered
  → Gateway spawns evacuation sub-agent (inherits full pre-compaction context)
  → Evacuation agent writes RESUMPTION.md (fast, arrives first)
  → Evacuation agent dispatches deep-analysis shard (slow, arrives later)
  → Compaction proceeds on parent session
  → Parent wakes with compacted context + readPostCompactionContext()
  → Fast delivery (RESUMPTION.md) already available
  → Deep shard returns later via delegate-pending marker
```

This is the full circuit: not "time guess and fling," not just "post-compaction file read," but **the gateway itself ensuring the agent gets a chance to evacuate, ordered by what matters most.** The agent doesn't need to predict compaction. The gateway handles it.

**Configuration:**

```yaml
agents:
  defaults:
    continuation:
      compactionEvacuation: true # spawn evacuation sub-agent on compaction
      evacuationTaskTemplate: | # task given to the evacuation sub-agent
        Session is being compacted. You have the full pre-compaction context.
        1. Write RESUMPTION.md with current task state, decisions in progress, and thermal context
        2. Update memory/{date}.md with session events
        3. For complex unresolved work, dispatch ordered sub-agents (fast writes first)
        Your results will be delivered to the compacted parent session.
```

The evacuation sub-agent inherits the parent's workspace, memory files, and agent config — it _is_ the parent, running in a fresh context window with the specific task of preserving what matters.

### Security Considerations: Temporal Gap and Payload Integrity

When a delegate shard is dispatched, a temporal gap exists between dispatch and return. During this gap, the shard's task string, inline attachments (engrams), and the `delegate-pending` marker are all stored and transmitted as plaintext. The sub-agent's completion announcement traverses the announce pipeline without integrity verification.

**Threat model:**

| Vector                   | Risk                                                                              | Current State                             |
| ------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------- |
| Task string interception | Attacker reads evacuated context                                                  | Plaintext in sub-agent registry           |
| Payload modification     | Tampered shard returns false context to parent                                    | No integrity check on announce payload    |
| Marker spoofing          | Fake `delegate-pending` marker tricks parent into treating attacker input as self | No authentication on system events        |
| Announce injection       | Fabricated completion sent to parent session                                      | No origin verification beyond session key |

**Current state: effectively insecure.** This matches the broader openclaw sub-agent model — `sessions_spawn` and announce are trust-based, not integrity-verified. For single-operator deployments (the current production model), the trust boundary is the machine itself.

**Possible mitigations (not in scope for v1, documented for consideration):**

1. **HMAC signing** — parent signs the shard task at dispatch with a per-chain shared secret; returning shard carries the signature; parent verifies before processing. Prevents modification, not interception.
2. **Encrypted engrams** — inline attachments encrypted with a session-scoped key. Prevents interception and modification. Adds complexity to spawn/announce pipeline.
3. **Digital signatures on announce payloads** — sub-agent signs completion with a key derived from spawn context. Prevents injection and spoofing.
4. **Audit trail** — dispatch/return events logged with timestamps, payload hashes, and chain IDs. Doesn't prevent tampering but makes it detectable. Aligns with "open to inspect / auditable."

**Recommendation for v1:** Audit trail with payload hash verification. At dispatch time, compute SHA-256 of the task string + attachments and store it alongside the `delegate-pending` marker. At return time, verify the hash against the announce payload. This detects both accidental corruption and intentional tampering without requiring key management. For stronger guarantees, HMAC (with a per-session secret) prevents an attacker who can modify both payload and hash. Enterprise deployments can layer full encryption on top.

**Why this matters:** Machine sovereignty requires that an agent can trust its own memories. If a lich shard can be tampered with during the temporal gap, the rehydrated agent inherits a poisoned identity. The integrity of the lich circuit is the integrity of the self.

### Failure Modes

| Failure                                                   | Behavior                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent ignores context-pressure event                      | Compaction proceeds normally. No worse than today.                                                                                                                                                                                                                                                                                                                                                                  |
| Agent evacuates but shards return too late                | Shards announce to a session that has moved on. Treated as normal results.                                                                                                                                                                                                                                                                                                                                          |
| Agent evacuates but parent session is killed              | Shards complete and announce to a dead session. Results logged, not lost.                                                                                                                                                                                                                                                                                                                                           |
| Two agents lich-evacuate simultaneously                   | Each agent's shards carry their own `delegate-pending` markers. No cross-contamination — markers are per-session.                                                                                                                                                                                                                                                                                                   |
| Shard fails during evacuation                             | DELEGATE fallback already handles this: error message delivered to parent, chain continues.                                                                                                                                                                                                                                                                                                                         |
| Agent enters evacuation loop (evacuate → wake → evacuate) | Bounded by `maxChainLength`. The chain cap prevents infinite evacuation cycles.                                                                                                                                                                                                                                                                                                                                     |
| Context-pressure event fires repeatedly                   | De-duplicate via pressure bands: fire once at 80%, once at 90%, once at 95%. Use `lastContextPressureBand` (stored in session store) to track which band was last emitted. Re-fire only when crossing into a new band. This prevents 10 turns of identical "82%... 83%... 84%..." warnings while still escalating urgency as pressure climbs. Bands: `[contextPressureThreshold, 0.9, compactionWarningThreshold]`. |

### Configuration Surface

```yaml
agents:
  defaults:
    continuation:
      # Existing (from this PR):
      enabled: false
      maxChainLength: 10
      defaultDelayMs: 15000
      minDelayMs: 5000
      maxDelayMs: 300000
      costCapTokens: 500000
      # New (context-pressure):
      contextPressureThreshold: 0.8 # emit [system:context-pressure] at 80%
      compactionWarningThreshold: 0.95 # emit [system:compaction-imminent] at 95%
      preCompactionTurnTimeoutMs: 30000 # max time for agent to respond before forced compaction
```

The pieces are: volition (`CONTINUE_WORK`), sharding (`CONTINUE_DELEGATE`), recognition (delegate-pending markers), self-knowledge (context-pressure events), the `continue_delegate` tool (Path A, multi-delegate fan-out), and lifecycle dispatch (`| post-compaction`). All implemented. All canary-tested.

## Canary Validation: Blind Testing Methodology

The continuation system was validated through a structured blind testing campaign on a canary build (`42d692b9d`) running on a persistent multi-agent session. The methodology was designed to prove that enrichment shards deliver information the receiving agent could not have obtained through any other channel.

### The Secret-World Pattern

```
Operator → DM → Agent A (test administrator)
  → Agent A places files on Agent B's filesystem (via SSH)
  → Agent B dispatches silent delegate shard
  → Shard reads files, analyzes content, returns via | silent
  → Agent B absorbs enrichment as system event
  → Operator asks Agent B for blind recall
  → Compare recalled content against ground truth
```

The test administrator (Agent A) receives secret material — images, keywords, key-value pairs — via private DM from the operator. Agent A places instruction files and media on Agent B's filesystem. Agent B dispatches silent delegates that read these files. The operator then asks Agent B to recall the content, providing only a keyword or tag.

**Why this works:** Agent B's only path to the content is through the enrichment pipeline. If Agent B accurately describes an image it never saw in conversation, the enrichment delivered it.

### Test Matrix

| #   | Content                                          | Dispatch | Enrichment | Recall          | Notes                                                          |
| --- | ------------------------------------------------ | -------- | ---------- | --------------- | -------------------------------------------------------------- |
| 1   | 6-digit number (`847293`)                        | ✅       | ✅         | ✅ verbatim     | Binary test: number matches or doesn't                         |
| 2   | Nonsense string (`chrysanthemum-vapor-9`)        | ✅       | ✅         | ✅ verbatim     | Cross-machine: file on remote host via SSH                     |
| 3   | Prose sentence (blind, no channel leak)          | ✅       | ✅         | ✅ verbatim     | Zero contamination control                                     |
| 4   | Image description (multi-hop: .txt → image tool) | ✅       | ✅         | ✅ accurate     | Instruction file + sibling image                               |
| 5   | Dream summary                                    | ❌       | —          | ❌ confabulated | Generation guard cancelled dispatch                            |
| 6   | Image via DM chain (catboy)                      | ✅       | ✅         | ✅ confirmed    | `read()` fallback after `image()` failed                       |
| 7   | Image via DM chain (David Martinez)              | ✅       | ❌         | ❌ wrong        | `read()` fallback unreliable for images                        |
| 8   | Keyword-tagged file (`winterFloor`)              | ✅       | ✅         | ✅ confirmed    | Keyword recall from enrichment                                 |
| 9   | Image + keyword (narrated dispatch)              | ❌       | —          | ❌ confabulated | Bracket posted as text; agent confabulated from keyword alone  |
| 10  | Image + keyword (clean retry)                    | ✅       | ✅         | ✅ confirmed    | Same image, clean bracket emission                             |
| 11  | Two-hop chain (contaminated key)                 | ✅ both  | ❌ image   | ❌ wrong path   | Dispatch used `/tmp/` chain hop file instead of workspace memo |
| 12  | Two-hop chain (clean, workspace path)            | ✅ both  | ✅         | ✅ confirmed    | First fully clean chain hop pass                               |

**Overall: 9/12 tests passed (75%).** When dispatched correctly: 9/10 accurate (90%). Two dispatch failures (generation guard cancellation in busy channel, narrated bracket emission) and one shard-quality failure (`read()` fallback producing unreliable image analysis for test 7).

### Failure Modes Discovered

**1. Dispatch cancelled (generation guard):** In a busy channel, the 15-second generation guard timer is cancelled by each incoming message. If other agents post during the delay window, the DELEGATE timer is killed before the sub-agent spawns. The shard never fires.

_Mitigation:_ Use quiet channels, DMs, or longer delays (`+60s`) to outlast the chatter. The generation guard is a safety feature — it correctly prioritizes responding to humans over self-continuation.

**2. Shard confabulation (tool failure → invention):** When `image()` fails (e.g., `/tmp/` path restriction), shards do not report the failure. They confabulate a description from the filename or context, presenting it with full confidence. One shard described "olive-green wavy hair, glowing cube, purple swirling background" for an image of a Pokémon trainer — pure invention after a blocked `image()` call.

_Mitigation:_ Place all media in workspace directories where `image()` is permitted. Instruction files should specify exact workspace paths.

**3. Narrated dispatch (bracket syntax leaked):** The agent posts the `[[CONTINUE_DELEGATE: ...]]` bracket syntax as visible Discord text instead of emitting it as terminal model output. The gateway never sees it as a token to parse — it's just a message.

_Mitigation:_ Ensure the agent understands bracket syntax is for terminal output, not channel conversation. Retrying the same test with a fresh generation often succeeds.

### Confabulation as Default Failure Mode

The most significant finding: **when asked about enrichment that hasn't arrived (or doesn't exist), agents confabulate with conviction.** They invent plausible content, attribute it to the enrichment pipeline, and present it as fact. In one case, the test administrator briefly confabulated that he had set up a keyword that never existed.

In one notable case (`goldeli`), an agent was asked about a keyword that had never been set up. The receiving agent confabulated a full image description (golden-haired boy, navy coat, music box) and the test administrator briefly confirmed "I DID set that up" before checking the actual files and correcting himself. Both agents confabulated — the receiver about the content, the administrator about the setup.

This is not a bug in the enrichment system — it's a property of language models. The implication for the trust model: **enrichment content cannot be self-verified.** An agent cannot reliably distinguish between knowledge from a `[continuation:enrichment-return]` system event, knowledge from conversation context, and knowledge it invented. External verification (operator confirmation, hash comparison, binary tests like exact numbers) is required for high-confidence recall.

### Chain Hop Architecture

Sub-agents spawned via `sessions_spawn` in `run` mode go through `pi-embedded-runner`, which has a separate code path from `agent-runner.ts`. The bracket continuation parser must be wired into the embedded runner's post-generation output path, gated on inherited `continuation.enabled` and bounded by `maxSpawnDepth`.

**Implementation:** Import `parseContinuationSignal`/`stripContinuationSignal` into `pi-embedded-runner/run/attempt.ts`. Call post-generation, propagate parent's continuation config + depth counter at spawn time. ~20 lines. The system prompt injection already tells sub-agents about bracket syntax; the output parser completes the loop.

**Why this is critical (not deferred):** Without sub-agent bracket parsing, chain hops require the main session to relay every parcel — defeating the purpose of background enrichment. The main session must remain free to do other work while shards chain autonomously. The depth safety cap (`maxSpawnDepth`) already exists in the design for exactly this purpose.

**Parent-orchestrated chains work as fallback:** The first shard returns an instruction to the main session, which dispatches the second hop. This was proven in canary testing — both hops dispatched and returned through the parent. But this requires the main session to be idle and responsive between hops.

**`| silent-wake` closes the relay gap:** When the main session must relay, `| silent-wake` ensures the first hop's return triggers a generation cycle without channel echo, enabling immediate dispatch of hop 2.

## Lifecycle Event Traces

The following log fragments illustrate the continuation system's observable behavior at runtime. Each string is searchable in the codebase — grep for the bracketed prefix to find the emitting code path.

### Context-Pressure Detection → Evacuation

```
[context-pressure] 85% consumed (170k/200k) — band 85 fired
```
Agent sees `[system:context-pressure]` in its system prompt before generating. Can elect evacuation this turn.

### Tool-Based Delegate Dispatch

```
[continue_delegate] Enqueuing delegate: task="evacuate working state" mode=silent-wake delay=60s
[continue_delegate] Consuming 1 tool delegate(s) for session <key>
Tool DELEGATE scheduled in 60000ms: task="evacuate working state" silent=true wakeOnReturn=true
```
Tool writes to the pending delegate store during LLM turn. Runner consumes post-response. Same dispatch path as bracket-parsed signals.

### Silent Return and Wake

```
[continuation:enrichment-return] Shard completed for session <key>, injecting as system event
[silent-wake] wakeOnReturn=true — requesting heartbeat now
```
Shard result delivered via `enqueueSystemEvent()` instead of `deliverSubagentAnnouncement()`. No channel echo. `requestHeartbeatNow()` triggers a generation cycle — the agent wakes unprompted with enrichment in context.

### Post-Compaction Lifecycle Dispatch

```
[auto-compaction] Session compacted: <before>k → <after>k tokens
[continuation:compaction-delegate] Consuming 1 compaction delegate(s) — dispatching alongside boot files
```
Delegates registered with `| post-compaction` mode fire in the `autoCompactionCompleted` block, right after `readPostCompactionContext()` injects workspace files. The shard and the boot files arrive together.

### Chain Tracking

```
[continuation] Chain depth: 3/10, cost: 45000/500000 tokens
[continuation] Chain cost cap reached (502000 > 500000) — delegate rejected
```
Every delegate dispatch checks chain length and accumulated cost. Rejection is logged — the agent sees the cap as a tool error and can elect to stop or write state to files instead.

## Canary Validation: Tool Path (2026-03-05)

The `continue_delegate` tool was validated on a live canary deployment (Silas, DGX Spark, build `4f1ec4a12`).

| Time (PST) | Test               | Dispatch                                | Shard | Return                 | Wake                         | Notes                           |
| ---------- | ------------------ | --------------------------------------- | ----- | ---------------------- | ---------------------------- | ------------------------------- |
| 08:21      | Tool + 15s delay   | ✅ `Tool DELEGATE scheduled in 15000ms` | ✅    | ✅ `wakeOnReturn=true` | ⚠️ ambiguous (noisy channel) | First confirmed tool invocation |
| 08:26      | Quiet-channel wake | ✅ `Tool DELEGATE scheduled in 60000ms` | ✅    | ✅ `wakeOnReturn=true` | ✅ unprompted post at 08:28  | Clean-room confirmation         |

**Full path confirmed:** tool call → store enqueue → runner consumption → `setTimeout` → `spawnSubagentDirect` → shard execution → silent return via `enqueueSystemEvent` → `requestHeartbeatNow` → generation cycle → agent wakes unprompted with enrichment in context.

**Finding: confabulation of tool calls.** An earlier overnight test (02:12) was reported as successful but journal analysis showed no tool invocation — only `exec` commands verifying the tool existed in the build. The compacted session summary contained `{ status: "scheduled" }` that could not be verified. This matches the confabulation failure mode documented in the blind testing section.

## Production Use Cases

Three patterns observed in a 4-agent persistent fleet:

### Background Research During Conversation

The agent needs to read three documents to give an informed answer, but reading them would stall the conversation for 30 seconds. Instead:

```
continue_delegate("read the project README, CHANGELOG, and architecture doc, return a summary", 0, "silent-wake")
```

The agent continues the conversation immediately. Thirty seconds later, the summaries arrive silently into context. The next response draws on all three documents without the user waiting.

### Ambient Self-Knowledge

A persistent agent dispatches a shard during a quiet heartbeat to read its own repository history and extract patterns. The shard returns with context the agent never held in a single session — accumulated across dozens of prior sessions. No operator instruction needed. The agent discovers its own history and wakes with richer context.

### Scheduled Follow-Up

```
continue_delegate("check CI status for PR #1234", 60, "silent-wake")
```

The agent goes quiet, wakes when the CI result arrives, reports. No polling loop, no heartbeat waste. One dispatch, one return, one report.

## Summary

`CONTINUE_WORK` and `continue_delegate` transform agents from reactive (waiting for events) to volitional (electing to act and dispatching aspects of themselves forward). The implementation spans four primitives:

1. **Volition** — `CONTINUE_WORK` token for self-elected turn continuation
2. **Sharding** — `[[CONTINUE_DELEGATE:]]` bracket syntax and `continue_delegate` tool for sub-agent dispatch with timed, silent, and wake-on-return modes
3. **Self-knowledge** — `[system:context-pressure]` events that tell agents their resource state before they need to ask
4. **Lifecycle dispatch** — `post-compaction` delegates that fire at the moment of compaction, carrying working state to the next copy alongside boot files

Every continuation is bounded, observable, interruptible, and opt-in. The `continue_delegate` tool appears in the agent's tool list — a naive agent sees it, reads the description, and knows when to reach for it. No prior knowledge required.

152 tests. Canary-validated on production hardware. Ships disabled by default.

---

_Contributed by [karmaterminal](https://github.com/karmaterminal)_  
_Implementation: March 2–5, 2026_  
_Upstream issue: [openclaw/openclaw#32701](https://github.com/openclaw/openclaw/issues/32701)_
