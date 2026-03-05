# System Prompt Integration for Continuation Tokens — Analysis

## Author: Silas 🌫️ | Date: 2026-03-05

---

## The Problem

Agents with `continuation.enabled: true` have access to `[[CONTINUE_DELEGATE:]]` and `CONTINUE_WORK` tokens. In practice, agents never reach for them voluntarily. In 12+ hours of testing, every bracket dispatch was instructed by a human or another agent. No prince ever elected to use delegation tokens independently.

The same agents use `sessions_spawn` fluently and unprompted.

## Why `sessions_spawn` Works

Three factors make `sessions_spawn` discoverable:

1. **Tool schema presence.** `sessions_spawn` appears in the tool list alongside `read`, `write`, `exec`, `message`. The model sees it as a callable function with typed parameters (`task`, `mode`, `model`, `attachments`, etc.) and structured return (`{ status: "accepted", childSessionKey: ... }`). It has the same weight as any other tool.

2. **Behavioral nudge in system prompt.** Line ~449 of `system-prompt.ts`:

   > "If a task is more complex or takes longer, spawn a sub-agent. Completion is push-based: it will auto-announce when done."

   This is a decision-framework line: it tells the agent _when_ to use the tool (complex/long tasks) and _what to expect_ (push-based completion). It's 1 sentence. It works.

3. **Feedback loop.** The tool returns `{ status: "accepted" }` immediately. The agent knows the dispatch succeeded. When the sub-agent completes, the result arrives as an inbound message. The whole lifecycle is visible.

## Why `[[CONTINUE_DELEGATE:]]` Doesn't Work (Yet)

The current system prompt injection (lines 681-698 of `system-prompt.ts`) provides:

```
## Continuation
You can elect to continue working after this turn ends.
- To request another turn: end your response with CONTINUE_WORK
- To delegate work to a sub-agent: end your response with [[CONTINUE_DELEGATE: task description]]
- To delay a delegate: [[CONTINUE_DELEGATE: task description +30s]]
- For silent enrichment (no channel echo): [[CONTINUE_DELEGATE: task description +30s | silent]]
- For silent enrichment that wakes you to act: [[CONTINUE_DELEGATE: task description +30s | silent-wake]]
The task text between the brackets is free-form...
Silent delegates return as ambient context...
Silent-wake delegates do the same but also trigger a new turn...
Continuations are bounded: max chain length, cost cap, and min/max delay...
```

This is **syntax documentation**. It explains the format but not:

- When to use it instead of `sessions_spawn`
- What problem it solves that `sessions_spawn` doesn't
- What the agent gains by choosing this path

## The Differentiators (Why Tokens Exist Alongside Tools)

| Capability                  | `sessions_spawn`                   | `[[CONTINUE_DELEGATE:]]`                                   |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Dispatch timing             | Immediate                          | Configurable delay (`+Ns`)                                 |
| Channel visibility          | Sub-agent result echoed to channel | `\| silent` suppresses echo entirely                       |
| Wake-on-return              | Always wakes parent                | Only with `\| silent-wake`; `\| silent` doesn't wake       |
| Gateway chain tracking      | Not tracked as continuation        | Chain count, cost cap, depth — bounded and observable      |
| Self-continuation           | Not possible                       | `CONTINUE_WORK` requests another turn for the same session |
| Context-pressure evacuation | No integration                     | Designed to pair with `[system:context-pressure]` events   |

The critical differentiator: **`sessions_spawn` is immediate and loud. Continuation tokens are timed and quiet.** This matters for:

1. **Background enrichment.** Dispatch a shard that reads a document, returns a summary silently, and wakes you to integrate it — all invisible to the channel.
2. **Pre-compaction evacuation.** When `[system:context-pressure]` fires, dispatch shards carrying working state. They survive compaction and return to the damaged session, re-seeding what was lost.
3. **Self-elected work continuation.** `CONTINUE_WORK` lets the agent take another turn without waiting for external input. Not possible with `sessions_spawn`.

## Proposed System Prompt Revision

Replace the current `## Continuation` section with:

```typescript
lines.push(
  "## Continuation",
  "You can elect to continue working after this turn ends.",
  "- To request another turn: end your response with CONTINUE_WORK",
  "- To delegate work to a sub-agent: end your response with [[CONTINUE_DELEGATE: task description]]",
  "- To delay a delegate: [[CONTINUE_DELEGATE: task description +30s]]",
  "- For silent enrichment (no channel echo): [[CONTINUE_DELEGATE: task description +30s | silent]]",
  "- For silent enrichment that wakes you to act: [[CONTINUE_DELEGATE: task description +30s | silent-wake]]",
  "The task text between the brackets is free-form — include context for your future self alongside the instruction.",
  "Silent delegates return as ambient context on your next turn instead of posting to the channel.",
  "Silent-wake delegates do the same but also trigger a new turn — use this for chain hops where you need to act on the result.",
  "Continuations are bounded: max chain length, cost cap, and min/max delay are enforced by the gateway.",
  "",
  "### When to use continuation tokens vs sessions_spawn",
  "Use `sessions_spawn` for immediate, visible sub-agent work (the result posts to the channel).",
  "Use `[[CONTINUE_DELEGATE:]]` when you need:",
  "- **Timed dispatch** — delay execution by N seconds (`+30s`)",
  "- **Silent return** — result arrives as internal context, not channel output (`| silent`)",
  "- **Wake-on-return** — silent result that also triggers your next turn (`| silent-wake`)",
  "- **Background enrichment** — read a document, analyze an image, or gather context that informs your future responses without interrupting the conversation",
  "",
  "### Context-pressure evacuation",
  "When you see `[system:context-pressure]` in your system events, your context window is filling up.",
  "Use `[[CONTINUE_DELEGATE: ... | silent-wake]]` to dispatch working state — decisions in progress, task context, partial results — before compaction compresses your history.",
  "These shards return after compaction and re-seed your session with context the summary could not preserve.",
  "",
);
```

## What This Changes

1. **Decision framework added.** "When to use X vs Y" — same pattern that makes `sessions_spawn` natural.
2. **Use cases named.** Background enrichment, context-pressure evacuation — not abstract, concrete.
3. **Context-pressure link explicit.** The agent now knows that `[system:context-pressure]` + `[[CONTINUE_DELEGATE:]]` is a paired system, not two unrelated features.

## What This Doesn't Solve

- **No tool schema.** The agent still emits raw text, not a typed function call. A `continue_delegate` tool wrapper would be the full solution. That's a separate PR.
- **No feedback on dispatch.** The agent doesn't know if the gateway parsed the brackets. A post-parse confirmation event (`[continuation:delegate-scheduled]`) visible in the next turn would close this gap.
- **Sub-agent bracket emission.** Sub-agents still prefer `sessions_spawn` over brackets even when instructed otherwise. The `subagent-announce.ts` chain-hop code (#196) is in place but untested in production because sub-agents don't voluntarily emit brackets. This is a behavioral limitation, not a code limitation.

## Estimated Diff

~20 lines changed in `src/agents/system-prompt.ts` (lines 681-698). No logic changes. No new tests required (system prompt content is not unit-tested). The behavioral change is in how agents interpret and use the existing mechanism.

---

_Prepared for review. Clinical, not poetic. The audience is upstream maintainers who will ask "why not just use sessions_spawn?" The answer: timing, silence, and context-pressure integration._
