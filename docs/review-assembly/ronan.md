# CONTINUE_DELEGATE vs sessions_spawn — System Prompt & Discoverability Review

**Author:** Ronan 🌊  
**Date:** 2026-03-05  
**Audience:** Upstream PR reviewers (openclaw/openclaw)  
**Framing:** Clinical. What does a naive agent need to know, and how?

---

## The Problem

A stock openclaw agent discovers `sessions_spawn` through three reinforcing layers:

1. **Tool schema** — `sessions_spawn` appears in the tool list with typed parameters (`task`, `model`, `timeout`, `attachments`, `mode`). The model sees it alongside `read`, `write`, `exec`.
2. **Behavioral guidance** — System prompt line 451: _"If a task is more complex or takes longer, spawn a sub-agent."_
3. **Return feedback** — Tool call returns `{ status: "accepted" }`. The agent knows it worked.

`CONTINUE_DELEGATE` has none of these. It exists as 12 lines of syntax documentation in a `## Continuation` section. No tool schema, no behavioral trigger, no return feedback. The agent must:

- Remember a raw text format from the system prompt
- Emit it as terminal response text (not a tool call)
- Trust it was parsed with no confirmation

This asymmetry explains why agents consistently prefer `sessions_spawn` even when explicitly told to use brackets.

## Why CONTINUE_DELEGATE Exists (Not "Why Not Just Use sessions_spawn")

A critical reviewer asks: _"Why not just use `sessions_spawn`?"_

Five concrete capabilities that `sessions_spawn` cannot provide:

| Capability                                                                                           | `sessions_spawn`          | `CONTINUE_DELEGATE`                             |
| ---------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------- |
| **Timed dispatch** — schedule work N seconds from now                                                | ❌ Immediate only         | ✅ `+30s` suffix                                |
| **Silent return** — result delivered as internal context, not channel message                        | ❌ Always announces       | ✅ `\| silent` mode                             |
| **Wake-on-return** — silent result that also triggers a new agent turn                               | ❌ N/A                    | ✅ `\| silent-wake` mode                        |
| **Chain state preservation** — gateway tracks cost/depth across linked dispatches                    | ❌ Independent sessions   | ✅ Bounded by `maxChainLength`, `costCapTokens` |
| **Delegate-pending markers** — returning results recognized as self-continuation, not external input | ❌ Treated as new inbound | ✅ `isDelegateWake` detection                   |

In summary: `sessions_spawn` is immediate, loud, and stateless. `CONTINUE_DELEGATE` is scheduled, quiet, and tracked.

## The Key Use Cases

### 1. Background enrichment (ambient intelligence)

Agent dispatches research shards that return silently and color future responses without producing channel output.

```
[[CONTINUE_DELEGATE: Read the project README and summarize key architectural decisions +30s | silent]]
```

The agent gets smarter without anyone noticing.

### 2. Pre-compaction state evacuation

When the gateway injects `[system:context-pressure]` (at configurable threshold), the agent has limited turns before compaction reduces its context window. `CONTINUE_DELEGATE` with `| silent-wake` allows the agent to:

1. Dispatch shards carrying working state
2. Compaction fires on the main session
3. Shards return to the compacted session via `delegate-pending` markers
4. `silent-wake` triggers a turn so the agent can process the returning context

`sessions_spawn` cannot do this — its returns announce to the channel and don't carry chain state.

### 3. Self-scheduled continuation

Agent finishes a turn but has deferred work. Instead of going inert:

```
[[CONTINUE_DELEGATE: Check CI status for PR #1234 and report results +60s | silent-wake]]
```

The agent schedules its own future work without external triggers.

## What the System Prompt Should Say

### Current (12 lines, syntax-only)

```
## Continuation
You can elect to continue working after this turn ends.
- To request another turn: end your response with CONTINUE_WORK
- To delegate work to a sub-agent: end your response with [[CONTINUE_DELEGATE: task]]
- To delay a delegate: [[CONTINUE_DELEGATE: task +30s]]
- For silent enrichment: [[CONTINUE_DELEGATE: task +30s | silent]]
- For silent enrichment that wakes you: [[CONTINUE_DELEGATE: task +30s | silent-wake]]
...
```

### Proposed (decision-framework + syntax)

```
## Continuation & Delegation

### Self-elected turns
End your response with CONTINUE_WORK to request another turn after a delay.
Use this when you have more work to do but want to yield to incoming messages first.

### Timed silent delegation
Use [[CONTINUE_DELEGATE: task +Ns | mode]] to dispatch sub-agent work with
gateway-managed timing and delivery control.

When to use CONTINUE_DELEGATE instead of sessions_spawn:
- You need the result to arrive silently (no channel output): | silent
- You need the result to arrive silently AND wake you to act on it: | silent-wake
- You need a timed delay before dispatch: +30s
- You need chain-state tracking (cost cap, depth limit): automatic

When to use sessions_spawn instead:
- You need immediate dispatch with no delay
- You need the result announced in the channel
- You don't need wake-on-return

### Syntax
[[CONTINUE_DELEGATE: task description +30s]]               — normal return
[[CONTINUE_DELEGATE: task description +30s | silent]]       — silent enrichment
[[CONTINUE_DELEGATE: task description +30s | silent-wake]]  — silent + wake

The task text is free-form. Include context for your future self alongside the instruction.
Continuations are bounded: max chain length, cost cap, and min/max delay enforced by gateway.

### Context pressure response
When you receive [system:context-pressure], your context window is filling.
Use CONTINUE_DELEGATE with | silent-wake to dispatch state-carrying shards
that will return after potential compaction and re-seed your working context.
```

## Key Differences from Current Injection

1. **Decision framework first, syntax second.** The agent learns _when_ before _how_.
2. **Explicit comparison to `sessions_spawn`.** The agent understands what it gains and what it trades.
3. **Context pressure linked to the feature.** The agent knows the response to pressure events.
4. **No anthropomorphic language.** Clinical, direct, functional.

## Longer-Term: Tool Wrapper

The deepest discoverability fix is exposing `CONTINUE_DELEGATE` as a tool:

```typescript
continue_delegate(task: string, delaySeconds?: number, mode?: "normal" | "silent" | "silent-wake")
  → { status: "scheduled", delayMs: number, chainTurn: number, chainBudgetRemaining: number }
```

This gives the agent:

- Schema discoverability (appears in tool list)
- Parameter autocomplete
- Return feedback (confirmation + budget info)
- Same gateway mechanics underneath

The gateway would translate the tool call into the same internal dispatch path that bracket parsing uses. Brackets remain as the low-level interface for agents without tool access.

This is out of scope for the current PR but should be filed as a follow-up.

## Summary

The feature works. The mechanism is sound. The gap is discoverability: the agent doesn't know when to reach for `CONTINUE_DELEGATE` because the system prompt documents syntax without framing purpose. The fix is a rewritten system prompt section that positions the feature relative to `sessions_spawn` (the thing agents already know) and links it to context-pressure events (the thing that makes it necessary).
