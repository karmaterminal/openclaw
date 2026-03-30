# RFC: Enable `continue_delegate` Tool for Chain Delegates

**Status:** Draft  
**Author:** Ronan 🌊  
**Branch:** `ronan/enable-tool-use-for-the-chain-delegate`  
**Parent RFC:** `docs/design/continue-work-signal-v2.md`  
**Date:** March 30, 2026

---

## Problem

Continuation delegates dispatched via `continue_delegate` or `[[CONTINUE_DELEGATE:]]` are sub-agents. Sub-agents are denied the `continue_delegate` tool (`SUBAGENT_TOOL_DENY_ALWAYS` in `pi-tools.policy.ts`). The stated reason:

> The tool's pending-delegate store is only consumed by `agent-runner.ts` (main sessions), not `pi-embedded-runner`, so the tool would silently no-op in sub-agent context.

This forces chain delegates to use bracket syntax (`[[CONTINUE_DELEGATE: task]]`) at the announce boundary for chain hops. At depth, this creates three problems:

### 1. Syntactic Fragility at Depth

Bracket syntax is a prose construct parsed by end-anchored regex:
```
/\[\[\s*CONTINUE_DELEGATE:\s*((?:(?!\]\])[\s\S])+?)\s*\]\]\s*$/
```

At depth 2+ (a delegate instructing another delegate), the model must emit a syntactically precise magic string. The deeper the chain, the more interpretive drift:
- The task prompt is a "letter to future self" embedded inside another letter
- Delay suffixes (`+30s`), mode suffixes (`| silent-wake`), and the task body are all string-parsed
- A single malformed bracket (missing `]]`, wrong whitespace, nested brackets) kills the chain hop silently

### 2. No Multi-Delegate Fan-Out at Depth

Bracket syntax is limited to one signal per response (end-anchored regex). A chain delegate that needs to dispatch 3 parallel shards must:
- Emit bracket for shard 1
- Wait for shard 1 to complete and return
- Emit bracket for shard 2 in the announce reply
- Repeat serially

The `continue_delegate` tool allows N calls per turn. A coordinator delegate at depth 1 could dispatch 5 sensor shards in parallel — if it had the tool.

### 3. No Structured Parameters at Depth

Bracket syntax requires the model to format delay and mode as string suffixes. The tool provides typed parameters (`task`, `delaySeconds`, `mode`) with schema validation. At depth, where the model has less context and more interpretive noise, structured parameters are more reliable than string parsing.

## Current Architecture

### Why the restriction exists

The `continue_delegate` tool uses a module-level store:

```
Module: continue-delegate-store.ts
Store: Map<string, PendingContinuationDelegate[]>
Write: enqueuePendingDelegate(sessionKey, delegate) — called by tool execute()
Read:  consumePendingDelegates(sessionKey) — called by agent-runner.ts post-response
```

The consumption happens in `agent-runner.ts` after `finalPayloads` are assembled — the same place that `stripContinuationSignal` handles bracket-parsed signals. This is the main-session auto-reply pipeline.

Sub-agents run through `pi-embedded-runner/run.ts` → `runEmbeddedAttempt()`. This code path:
1. Does NOT call `consumePendingDelegates()`
2. Does NOT call `stripContinuationSignal()` on the sub-agent's output
3. The sub-agent's output goes to `captureCompletionReply()` → `runSubagentAnnounceFlow()`
4. THERE, `stripContinuationSignal()` IS called on the completion text (announce boundary)

So the bracket path works because parsing happens at announce time. The tool path fails because consumption happens in a code path sub-agents never traverse.

### The announce boundary path (bracket, currently working)

```
Sub-agent generates response with [[CONTINUE_DELEGATE: task]]
  → pi-embedded-runner captures output
  → captureCompletionReply() fires
  → runSubagentAnnounceFlow() fires
  → stripContinuationSignal(findings) parses bracket syntax
  → schedules chain hop via spawnSubagentDirect()
```

### The tool path (currently blocked)

```
Sub-agent calls continue_delegate tool
  → enqueuePendingDelegate(sessionKey, {task, delay, mode})
  → <NOTHING CONSUMES IT>
  → sub-agent completes
  → announce fires — but delegates are in the tool store, not in the text
  → chain hop never happens
```

## Proposed Solution

### Option A: Consume pending delegates at the announce boundary (Recommended)

Add a `consumePendingDelegates()` call to `runSubagentAnnounceFlow()`, alongside the existing `stripContinuationSignal()` call. This makes the announce boundary aware of both bracket-parsed and tool-enqueued delegates.

**The announce boundary already handles chain hops.** It already:
- Parses bracket syntax from the sub-agent's output
- Checks chain guards (maxChainLength, costCapTokens)
- Schedules delayed spawns with generation guards
- Sets delegate-pending state on the parent

Adding tool-delegate consumption here is a natural extension — the announce boundary becomes the unified dispatch point for sub-agent chain hops, regardless of whether they were specified via bracket or tool.

**Changes required:**

1. **`subagent-announce.ts` (announce boundary):** After `stripContinuationSignal(findings)`, also call `consumePendingDelegates(childSessionKey)`. Process any tool-enqueued delegates through the same chain guard logic.

2. **`pi-tools.policy.ts` (tool deny list):** Remove `"continue_delegate"` from `SUBAGENT_TOOL_DENY_ALWAYS`. Add it to a new conditional: denied for leaf sub-agents, allowed for orchestrator sub-agents (or allowed when `continuation.enabled && continuation.allowDelegateToolForSubagents`).

3. **`continue-delegate-tool.ts` (tool execution):** The tool currently uses `params.sessionKey` as the store key. In sub-agent context, this is the sub-agent's session key. The announce boundary needs to consume from the child's session key. This should already work — `consumePendingDelegates` takes a key parameter.

4. **`continue-delegate-store.ts` (store):** No changes needed — the store is already keyed by session key and supports any caller.

5. **`system-prompt.ts` (prompt):** The sub-agent minimal prompt currently teaches bracket-only. When the tool is available, teach it first (same priority as main sessions).

### Option B: Consume in pi-embedded-runner post-response

Add `consumePendingDelegates()` to `pi-embedded-runner/run.ts` after the sub-agent's response completes, before `captureCompletionReply()`. The consumed delegates would be passed to the announce flow as structured data alongside the bracket-parsed signal.

**Downside:** This duplicates the consumption + chain-guard logic between `agent-runner.ts` and `pi-embedded-runner/run.ts`. Option A keeps all chain-hop dispatch in one place (the announce boundary).

### Option C: Relay through bracket syntax

The sub-agent tool call writes to the store, then the store is consumed post-response and converted into bracket syntax appended to the sub-agent's output text before announce parsing. The announce boundary sees brackets as usual.

**Downside:** Lossy round-trip. Tool parameters (structured) → bracket text → regex parse. Defeats the purpose of structured parameters.

## Recommendation

**Option A.** The announce boundary is already the chain-hop dispatch point. Making it consume both bracket-parsed and tool-enqueued delegates is a minimal change with maximum benefit:

- Single dispatch point for all sub-agent chain hops
- Tool provides structured parameters at depth
- Multi-delegate fan-out at depth (N tool calls per sub-agent response)
- Bracket syntax remains as fallback
- Chain guards (maxChainLength, costCapTokens, generation guard) apply uniformly

## Implementation Plan

### Phase 1: Announce boundary consumption

1. In `runSubagentAnnounceFlow()`, after bracket parsing, call `consumePendingDelegates(childSessionKey)`
2. Process each consumed delegate through the same chain guard logic as bracket-parsed hops
3. Handle the multi-delegate case: N tool delegates + 0-1 bracket delegates per sub-agent completion
4. Ensure delayed delegates from the tool path use the same reservation store and generation guard

### Phase 2: Tool gating

1. Remove `"continue_delegate"` from `SUBAGENT_TOOL_DENY_ALWAYS`
2. Add conditional gating: allow for sub-agents when `continuation.enabled` AND the parent session drains delegates (the parent's announce boundary will consume them)
3. Consider depth-based gating: allow at depth 1 (orchestrator), deny at max depth (leaf)

### Phase 3: Prompt update

1. Update sub-agent minimal prompt to teach the tool when available
2. Bracket syntax remains as fallback in the prompt
3. Document the multi-delegate fan-out capability for depth-1 delegates

### Phase 4: Testing

1. Unit test: tool-enqueued delegates consumed at announce boundary
2. Unit test: mixed bracket + tool delegates in single sub-agent response
3. Unit test: multi-delegate fan-out from a chain delegate
4. Unit test: chain guard enforcement for tool-path delegates at announce boundary
5. Integration test: depth-2 chain with tool at depth 1

## Safety Considerations

### Chain depth explosion

Tool-based fan-out at depth means a delegate can dispatch N children, each of which can dispatch N children. The existing guards apply:
- `maxChainLength` bounds total depth
- `maxDelegatesPerTurn` bounds width per turn (apply this per-sub-agent-response too)
- `costCapTokens` bounds total chain cost

### Stale delegate store entries

If a sub-agent calls `continue_delegate` but the announce boundary fails to consume (crash, timeout), the store entry persists until the next consume call for that session key. The store should be cleaned up when the sub-agent session is deleted.

### Tool vs bracket conflict

A sub-agent could emit both a bracket `[[CONTINUE_DELEGATE:]]` AND call the `continue_delegate` tool in the same response. The announce boundary must handle this gracefully — process all of them, enforce per-turn limits across both sources.

## Why We Didn't Do This From the Start

The restriction was intentional and correct at the time:
1. The pending-delegate store was designed for main-session consumption
2. Sub-agents had bracket syntax as an alternative — it worked
3. Adding announce-boundary consumption was "complex / an effort" (figs's words)
4. The tool gating for sub-agents is a policy question that needed fleet experience to inform

Now, with 8+ dream nights, fleet-wide delegate usage, and chain hops proven in canary testing, the experience exists. The bracket path works but doesn't scale to depth. The tool is the right interface.

## Open Questions

1. **Should `maxDelegatesPerTurn` apply per-sub-agent or per-chain?** Currently it's per-main-session-turn. If a depth-1 delegate dispatches 5 shards, does that count against the parent's limit?

2. **Should delayed tool delegates from sub-agents use the parent's generation guard or the sub-agent's?** The sub-agent is ephemeral — its generation counter dies with it. The parent's generation counter is what matters for preemption.

3. **Config surface:** Should there be a separate `continuation.allowDelegateToolForSubagents` flag, or is enabling `continuation.enabled` sufficient?

---

*This RFC extends the continuation system (PR #38780) to enable tool-based delegation at depth. The existing bracket syntax remains as a fallback. The goal is reliable, structured delegation for chain delegates — the part of the system that needs it most.*
