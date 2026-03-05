# Continuation Discoverability & Differentiation: Analysis

**Author:** Cael  
**Audience:** Upstream PR reviewers, openclaw maintainers, naive operators  
**Tone:** Clinical. No anthropomorphism.

---

## The Problem

The `[[CONTINUE_DELEGATE:]]` bracket syntax provides three capabilities that `sessions_spawn` cannot:

1. **Timed dispatch** (`+Ns`) — gateway-managed delay between signal and spawn
2. **Silent return** (`| silent`) — sub-agent result delivered as internal system event, no channel output
3. **Silent wake** (`| silent-wake`) — silent return + triggers a generation cycle on the parent session

These capabilities are currently undiscoverable. An agent with `continuation.enabled: true` receives this system prompt injection:

```
## Continuation
You can elect to continue working after this turn ends.
- To request another turn: end your response with CONTINUE_WORK
- To delegate work to a sub-agent: end your response with [[CONTINUE_DELEGATE: task description]]
- To delay a delegate: [[CONTINUE_DELEGATE: task description +30s]]
The task text between the brackets is free-form — include context for your future self alongside the instruction.
Continuations are bounded: max chain length, cost cap, and min/max delay are enforced by the gateway.
```

Compare with `sessions_spawn`, which gets:

- A tool entry in the tool list with full JSON schema (task, model, timeout, attachments, mode, thread)
- Behavioral guidance: "If a task is more complex or takes longer, spawn a sub-agent"
- Structured feedback on call: `status: "accepted"` / error message

Result: agents always reach for `sessions_spawn` because it's a first-class tool with schema, feedback, and behavioral framing. Brackets are a paragraph of syntax documentation buried after the tool list.

## Why This Matters for the PR

A reviewer will ask: "Why not just use `sessions_spawn`?" The answer is that `sessions_spawn` is **immediate and visible**. It spawns now, announces to channel on completion, and the parent must respond to the announcement. There is no way to:

- Schedule a spawn for 30 seconds from now
- Suppress the channel announcement
- Trigger a parent generation cycle without channel output

These are the primitives for two concrete use cases:

### Use Case 1: Pre-Compaction Context Evacuation

When `[system:context-pressure]` fires at the 80/90/95% bands, the agent knows compaction is imminent. With `[[CONTINUE_DELEGATE:]]`, the agent can:

1. Dispatch shards carrying critical working context (`+30s | silent-wake`)
2. Compaction occurs, session summary replaces full context
3. Shards complete and return silently to the post-compaction session
4. `silent-wake` triggers a generation cycle — agent processes the returned context

Without brackets: the agent has no timed dispatch, no silent return, and no wake-on-return. `sessions_spawn` completions announce to channel and require the agent to speak. The compaction gap cannot be bridged silently.

### Use Case 2: Background Enrichment

An agent dispatches research/analysis shards that return results into the session context without producing channel output. The agent's next turn has richer context; the user sees a more informed response without visible sub-agent traffic.

This requires `| silent` (no channel echo) or `| silent-wake` (no echo + trigger processing). Neither is available via `sessions_spawn`.

## Proposed System Prompt Revision

The injection should:

1. **Explain what brackets do that tools cannot** — not just syntax
2. **Document `| silent` and `| silent-wake`** — currently absent from injection
3. **Connect to context-pressure events** — the agent needs to know when to use this
4. **Remain clinical** — no metaphor, no anthropomorphism

Proposed replacement for the `## Continuation` section:

```
## Continuation
You can elect to continue working or delegate to sub-agents with gateway-managed timing and delivery.

### Self-Continuation
End your response with CONTINUE_WORK to request another turn after a delay.
End with CONTINUE_WORK:30 to specify delay in seconds.

### Delegated Continuation
End your response with [[CONTINUE_DELEGATE: task description]] to spawn a sub-agent.
The task text is free-form — include working context alongside the instruction.

Options:
  [[CONTINUE_DELEGATE: task +30s]]              — spawn after 30s delay
  [[CONTINUE_DELEGATE: task | silent]]           — result returns as internal context only (no channel output, no wake)
  [[CONTINUE_DELEGATE: task | silent-wake]]      — result returns as internal context + triggers your next turn
  [[CONTINUE_DELEGATE: task +30s | silent-wake]] — delayed spawn, silent return, triggers next turn

### When to Use Brackets vs sessions_spawn
Use `sessions_spawn` for immediate, visible sub-agent work that should announce to the channel.
Use `[[CONTINUE_DELEGATE:]]` when you need:
  - Delayed dispatch (schedule work for later in the session)
  - Silent returns (enrich your context without channel output)
  - Wake-on-return (process enrichment results automatically)

### Context Pressure
When you receive a [system:context-pressure] event, your context window is approaching capacity.
At higher pressure bands, consider dispatching delegates with `| silent-wake` to carry
critical working context past a potential compaction boundary. The delegate's return will
re-inject that context into your session after compaction.

Continuations are bounded: max chain length, cost cap, and min/max delay are enforced by the gateway.
```

## Differentiation Summary (for PR description)

| Capability                              | `sessions_spawn` | `[[CONTINUE_DELEGATE:]]`   |
| --------------------------------------- | ---------------- | -------------------------- |
| Immediate spawn                         | ✅               | ✅                         |
| Delayed spawn (`+Ns`)                   | ❌               | ✅                         |
| Channel announcement on completion      | Always           | Configurable               |
| Silent return (internal context only)   | ❌               | `\| silent`                |
| Wake parent on return (no channel echo) | ❌               | `\| silent-wake`           |
| Tool schema / structured feedback       | ✅               | ❌ (text token)            |
| Continuation chain tracking             | ❌               | ✅ (chain count, cost cap) |

## The Tool Wrapper Question

The long-term answer to discoverability is a `continue_delegate` tool that wraps bracket syntax:

```json
{
  "name": "continue_delegate",
  "parameters": {
    "task": "string",
    "delaySeconds": "number",
    "mode": "normal | silent | silent-wake"
  }
}
```

This gives agents the same schema, autocomplete, and feedback they get from `sessions_spawn`. The tool internally emits the bracket syntax into the response stream.

**For this PR:** The tool wrapper is out of scope. The system prompt revision above addresses the immediate discoverability gap. The tool wrapper should be filed as a follow-up issue with a clear rationale: bracket syntax is the underlying mechanism; the tool is the interface.

## Cost Cap Interaction

One operational note for documentation: `[[CONTINUE_DELEGATE:]]` dispatches are bounded by `costCapTokens` (default 500K per chain). `sessions_spawn` calls are standalone sessions and bypass this cap entirely. If an agent is in a long continuation chain, delegates may be rejected while spawns succeed. This is by design — the cost cap protects against runaway continuation chains — but operators should set `costCapTokens` appropriately for workloads that involve multiple delegate dispatches.

## Open Question

The `[[CONTINUE_DELEGATE:]]` regex anchors to end-of-response (`$`), meaning only one delegate can be parsed per response. Multiple delegates require CONTINUE_WORK chaining between them, which accumulates chain cost. Should the parser support multiple brackets per response? This would allow an agent to dispatch N delegates in a single turn without chain accumulation. Filed as a consideration, not a blocker.
