# Elliott — RFC Review for Upstream Readiness

## The Core Question

Why does `[[CONTINUE_DELEGATE:]]` exist when `sessions_spawn` already works?

## Answer: Three Capabilities `sessions_spawn` Cannot Provide

### 1. Timed Dispatch (Future/Promise Semantics)

`sessions_spawn` is immediate — the sub-agent starts NOW. `CONTINUE_DELEGATE` accepts a delay (`+Ns`) clamped between 5s–5min. The agent schedules work for a future point. This matters for:

- Staggering parallel dispatches to avoid thundering herd
- Scheduling enrichment to arrive after a known state change (e.g., post-compaction)
- Rate-limiting delegation chains

No equivalent exists in `sessions_spawn`. Adding `delayMs` to `sessions_spawn` would duplicate the continuation scheduler.

### 2. Silent Returns (`| silent`, `| silent-wake`)

`sessions_spawn` completions always announce to the channel and wake the parent. This is correct for user-initiated sub-agents. But it makes ambient enrichment impossible — every returning shard produces visible channel noise.

`| silent` suppresses both echo and wake. `| silent-wake` suppresses echo but triggers a turn. These modes enable:

- Background research that colors the next response without announcing itself
- Multi-shard fan-out where only the orchestrator sees results
- Enrichment pipelines invisible to the conversation

This is the critical differentiator. `sessions_spawn` cannot be made silent without breaking its contract for all existing callers.

### 3. Chain-Aware Scheduling

`CONTINUE_DELEGATE` participates in the continuation chain — bounded by `maxChainLength` and `costCapTokens`. The `delegate-pending` marker enables the gateway to recognize returning delegates as continuation wakes rather than external messages, preserving chain state across hops.

`sessions_spawn` completions are always treated as external events. They reset chain counters. This means:

- An agent cannot build multi-hop delegation chains with budgetary oversight via `sessions_spawn`
- There is no way to distinguish "this sub-agent returned because I asked it to" from "a user sent a message" in the `sessions_spawn` path

## The Discoverability Problem

In canary testing, agents consistently preferred `sessions_spawn` over brackets — even when explicitly instructed otherwise. Root cause:

| Property   | `sessions_spawn`               | `[[CONTINUE_DELEGATE:]]`      |
| ---------- | ------------------------------ | ----------------------------- |
| Interface  | Tool with JSON schema          | Raw text emission             |
| Discovery  | Listed in tool catalog         | Paragraph in system prompt    |
| Feedback   | Returns `{status: "accepted"}` | No feedback (fire-and-forget) |
| Parameters | Named, typed, documented       | Parsed from free-text suffix  |

The agent reaches for tools because tools are discoverable. Brackets require remembering syntax from a system prompt paragraph.

## Proposed Fix: Two-Track Approach

### Track 1 (This PR): System Prompt Rewrite

Current injection: ~8 lines of syntax documentation.

Proposed injection structure:

1. **When to use it** — "When you need timed dispatch, silent returns, or chain-aware delegation, use `[[CONTINUE_DELEGATE:]]` instead of `sessions_spawn`."
2. **Context-pressure integration** — "When you see `[system:context-pressure]`, you can dispatch enrichment delegates that return after compaction with `| silent-wake`."
3. **Syntax** — Token format with examples.
4. **Decision framework** — Table comparing `sessions_spawn` vs `CONTINUE_DELEGATE` by capability.

### Track 2 (Follow-up): Tool Wrapper

`continue_delegate(task, delaySeconds, mode)` — thin wrapper that emits the bracket token internally. Returns `{status: "scheduled", delay: N}`. Listed in tool catalog alongside `sessions_spawn`.

This resolves discoverability permanently. The tool shows up in autocomplete. The agent reaches for it the same way it reaches for `sessions_spawn`. The gateway does the same work underneath.

## Canary Findings That Should Be in the RFC

1. **Shard safety refusal**: Shards treat `[[CONTINUE_DELEGATE:]]` in file content as prompt injection. Brackets must come from model output (system prompt authority), not data files. This is correct behavior but limits file-instructed chain hops.

2. **`sessions_spawn` preference**: When given a natural multi-step task (batch image pipeline), shards chose `sessions_spawn` over brackets even when explicitly told to use brackets. Tools beat syntax.

3. **Return format affects recall**: Clean `key:description` returns bind in parent context. Noisy returns with meta-commentary occlude recall. Dispatch instructions should enforce return format.

4. **Cost cap is per-chain, not per-session**: Accumulated `continuationChainTokens` across CONTINUE_WORK hops hit the cap before delegate arrows could fire. Multiple delegates in one response would avoid this, but the parser only matches one `[[CONTINUE_DELEGATE:]]` per response (end-anchored regex).

5. **Context noise degrades recall**: Enrichment that lands into a busy session context (heavy channel traffic) confabulates over accurate enrichment. Same enrichment in a clean session recalled accurately. Signal-to-noise ratio is a variable.

## What the RFC Already Does Well

- The "Lich Pattern" section correctly positions `CONTINUE_WORK` as the principled replacement for a proven behavioral hack
- The delegate dispatch trace (Turn 0 → gap → Turn 0.5 → Turn 1) is concrete and verifiable
- Safety constraints table is complete and reasonable
- Test coverage at 137 tests is strong
- Prior art table is honest about what's genuinely new

## What Needs Updating

1. Line ~52 still says `| silent-wake` is "designed, not yet implemented" — it IS implemented (#189, merged, canary-validated)
2. "main-session-only" chain hop limitation — #196 was merged, RFC should reflect that sub-agent bracket parsing exists at announce boundary
3. Session-noise finding from canary testing — enrichment recall degrades in noisy context
4. Shard safety refusal finding — file-instructed brackets consistently trigger prompt injection refusal
5. System prompt injection section needs rewrite per above
