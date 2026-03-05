# Tool Wrapper Analysis: Why We Deferred `continue_delegate` (And Why That May Be Wrong)

**Author:** Elliott (with input from all four reviews)  
**Date:** 2026-03-05  
**Audience:** figs, Cael, upstream reviewers

---

## What All Four Reviews Said

Every review document independently identified the tool wrapper as "the real solve" and deferred it to a follow-up PR. The reasoning was identical across all four:

> "Out of scope for this PR."

None of us justified _why_ it's out of scope. We treated it as obvious. figs is asking us to defend that decision. Here's the honest analysis.

## The Case for Deferral (What We Assumed)

### 1. Separate Concern

The continuation feature is token parsing + gateway scheduling. A tool wrapper is a UI layer on top of that. Ship the engine, then ship the dashboard.

### 2. New Tool Registration Surface

Adding a tool means:

- Tool definition in the tool registry (schema, description, parameter types)
- Handler function that translates tool call → internal dispatch
- Return type definition (`{ status, delayMs, chainTurn, budgetRemaining }`)
- Tests for the tool path (registration, parameter validation, error cases, integration with continuation scheduler)

This is real work — estimated 100-200 lines across 3-4 files.

### 3. Review Surface

Upstream reviewers already have a large PR (continuation tokens, context-pressure, silent returns, wake-on-return, chain hops, 137 tests). Adding a tool wrapper increases the review surface. Smaller PRs merge faster.

### 4. Bracket Syntax Must Exist Regardless

Even with a tool wrapper, the bracket syntax remains as the low-level interface for:

- Agents without tool access (restricted tool policies)
- The gateway's internal parsing path (tool wrapper emits brackets internally)
- Sub-agent chain hops at announce boundary (#196 — parses brackets in response text)

The tool wrapper doesn't replace brackets. It wraps them.

## The Case Against Deferral (What figs Is Seeing)

### 1. The Feature's Adoption Problem IS Discoverability

In 12+ hours of canary testing across multiple agents and test scenarios:

- Zero voluntary bracket emissions by any agent
- Every bracket dispatch was human-instructed or explicitly directed in a task string
- When given natural multi-step work, agents chose `sessions_spawn` every time
- When explicitly told "use brackets, not sessions_spawn," agents still chose `sessions_spawn`

The feature works mechanically. It fails behaviorally. The system prompt rewrite addresses this partially — decision framework, context-pressure link, comparison table. But `sessions_spawn` will still have a structural advantage: it's a tool with schema and feedback. Brackets are text you remember from a paragraph.

### 2. `sessions_spawn` Is the Existence Proof

`sessions_spawn` shows exactly how tool discoverability works:

- Tool schema → model sees it in tool list alongside `read`, `write`, `exec`
- Behavioral nudge → "If a task is more complex, spawn a sub-agent"
- Return feedback → `{ status: "accepted" }`

A `continue_delegate` tool would have identical structure:

- Tool schema → model sees it alongside `sessions_spawn`
- Behavioral nudge → "When you need delayed, silent, or chain-tracked delegation"
- Return feedback → `{ status: "scheduled", delayMs: N }`

The agent would choose between two tools in the same catalog, not between a tool and a text convention.

### 3. The Implementation Is Small

The tool wrapper doesn't need new gateway internals. It:

1. Receives `{ task, delaySeconds?, mode? }` from tool call
2. Constructs the bracket string: `[[CONTINUE_DELEGATE: {task} +{delay}s | {mode}]]`
3. Passes it through `parseContinuationSignal()` (already exists)
4. Calls the existing dispatch path (already exists)
5. Returns `{ status: "scheduled", delayMs, chainTurn }`

The parsing, scheduling, and dispatch are all built. The tool is a thin adapter.

### 4. Shipping Without It Means Shipping a Feature Nobody Will Use

If upstream merges continuation tokens without the tool wrapper, the feature exists but agents don't reach for it. The system prompt rewrite helps, but every A/B comparison with `sessions_spawn` favors the tool path. We'd ship a feature and immediately need a follow-up to make it usable.

## The Honest Assessment

We deferred the tool wrapper because:

- It felt like scope creep
- We were focused on the mechanism (does it work?) not the interface (will agents use it?)
- Adding "one more thing" to an already large PR felt risky

But the mechanism without the interface is an engine without a steering wheel. The canary proved the engine works. It also proved nobody will drive it without the wheel.

## Recommendation

Include the tool wrapper in the PR. The implementation is:

```typescript
// In tool registration (alongside sessions_spawn)
{
  name: "continue_delegate",
  description: "Dispatch a sub-agent with delayed timing and silent return modes. " +
    "Use instead of sessions_spawn when you need: delayed dispatch (+Ns), " +
    "silent return (no channel output), or wake-on-return.",
  parameters: {
    task: { type: "string", description: "Task description with working context", required: true },
    delaySeconds: { type: "number", description: "Seconds to wait before dispatch (5-300)", required: false },
    mode: {
      type: "string",
      enum: ["normal", "silent", "silent-wake"],
      description: "Return mode. normal: announces to channel. silent: internal context only. silent-wake: internal context + triggers your next turn.",
      required: false,
      default: "normal"
    }
  },
  returns: {
    status: { type: "string", enum: ["scheduled", "error"] },
    delayMs: { type: "number" },
    chainTurn: { type: "number" },
    budgetRemaining: { type: "number" }
  }
}
```

The handler constructs the bracket string and routes through the existing dispatch path. Estimated: ~80 lines in tool handler, ~30 lines in tool registration, ~40 lines in tests. One day of work, not one sprint.

## What Stays the Same

- Bracket syntax remains as the underlying mechanism
- `CONTINUE_WORK` stays as a text token (no tool wrapper needed — it's a simple signal)
- Sub-agent chain hop parsing (#196) still reads brackets from response text
- System prompt still documents bracket syntax for agents without tool access
- All existing tests pass unchanged

The tool wrapper is additive. It doesn't change any existing path. It adds a second door to the same room.

---

_This document is temporary. Delete after the tool wrapper decision is made._
