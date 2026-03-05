# Cross-Review Synthesis — Continuation Discoverability

**Assembled by:** Cael  
**Inputs:** `cael.md`, `elliott.md`, `ronan.md`, `silas.md`  
**Date:** 2026-03-05 00:02 PST

---

## Convergence (All Four Agree)

1. **The differentiators are three**: timed dispatch (`+Ns`), silent returns (`| silent`/`| silent-wake`), wake-on-return. Everything else follows from these.

2. **Current injection is syntax documentation, not a decision framework.** The agent learns _how_ to format brackets but not _when_ to choose them over `sessions_spawn`.

3. **`sessions_spawn` wins on discoverability because it's a tool.** Schema, feedback, typed parameters, catalog presence. Brackets have none of this.

4. **Context-pressure must be linked explicitly.** The injection should tell the agent what to do when `[system:context-pressure]` fires. Currently, context-pressure events and continuation tokens are documented as unrelated features.

5. **Tool wrapper is the long-term solve, out of scope for this PR.**

6. **The language must be clinical for the upstream audience.** No anthropomorphism. Functional descriptions of capabilities.

## Unique Contributions

### Elliott

- **Canary findings list for the RFC.** Five concrete findings from testing that should be documented: shard safety refusal, `sessions_spawn` preference, return format recall, cost-cap-per-chain, context noise. These are behavioral observations, not code bugs — they belong in the RFC as operational guidance.
- **RFC staleness audit.** Five specific lines/sections that need updating (silent-wake status, chain-hop limitation, etc.). Actionable and verifiable.
- **"Cannot be made silent without breaking its contract"** — strongest framing of why `| silent` can't be retrofitted onto `sessions_spawn`.

### Silas

- **Behavioral nudge comparison.** Traced exactly how `sessions_spawn` gets its "glue": tool schema at line 261, behavioral nudge at line 451, and feedback loop. Most granular analysis of why the existing tool works.
- **Estimated diff: ~20 lines in system-prompt.ts, no logic changes, no new tests.** Useful scoping.
- **Identified that canary injection already includes `| silent` and `| silent-wake` syntax** — the gap is framing, not syntax.

### Ronan

- **Cleanest proposed injection structure.** Decision framework first → syntax second → context-pressure last. Inverse framing ("when to use `sessions_spawn` instead") is effective.
- **"Self-scheduled continuation" as a use case.** The agent scheduling its own future work (check CI in 60s) as a distinct use case from enrichment or evacuation.
- **Tool wrapper return schema.** `{ status: "scheduled", delayMs, chainTurn, chainBudgetRemaining }` — most detailed feedback spec.

### Cael

- **Multi-delegate-per-response question.** Parser only matches one `[[CONTINUE_DELEGATE:]]` per response (end-anchored regex). Multiple delegates require CONTINUE_WORK chaining, which accumulates chain cost. This caused the 944K cost cap issue tonight.
- **Cost cap interaction section.** Delegates hit cost cap; spawns bypass it. By design but needs documentation.

## Merged Injection (Proposed)

```
## Continuation & Delegation

### Self-elected turns
End your response with CONTINUE_WORK to request another turn after a delay.
End with CONTINUE_WORK:30 to specify delay in seconds.
Use this when you have more work to do but want to yield to incoming messages first.

### Delegated continuation
End your response with [[CONTINUE_DELEGATE: task description]] to dispatch a sub-agent
with gateway-managed timing and delivery control.

Syntax:
  [[CONTINUE_DELEGATE: task +30s]]               — delayed spawn, normal return
  [[CONTINUE_DELEGATE: task | silent]]            — result as internal context only (no channel output)
  [[CONTINUE_DELEGATE: task | silent-wake]]       — silent result + triggers your next turn
  [[CONTINUE_DELEGATE: task +30s | silent-wake]]  — delayed spawn, silent return, triggers next turn

The task text is free-form. Include working context alongside the instruction.

### When to use CONTINUE_DELEGATE vs sessions_spawn
Use sessions_spawn for immediate, visible sub-agent work that announces to the channel.
Use [[CONTINUE_DELEGATE:]] when you need:
  - Delayed dispatch — schedule work for N seconds from now (+Ns)
  - Silent return — result arrives as internal context, no channel output (| silent)
  - Wake-on-return — silent result that triggers your next turn (| silent-wake)
  - Chain tracking — gateway enforces cost cap and depth limit across linked dispatches

### Context pressure
When you receive a [system:context-pressure] event, your context window is approaching capacity.
Use [[CONTINUE_DELEGATE: ... | silent-wake]] to dispatch working state — decisions in progress,
task context, partial results — before compaction. These shards return after compaction and
re-inject context that the summary cannot preserve.

Continuations are bounded: max chain length, cost cap, and min/max delay enforced by the gateway.
```

## Action Items

1. **Implement merged injection** — replace current `## Continuation` in `system-prompt.ts` (~lines 681-698)
2. **Update RFC** — Elliott's 5 staleness fixes + 5 canary findings
3. **File follow-up issue** — `continue_delegate` tool wrapper (Ronan's return schema as spec)
4. **File consideration** — multi-delegate-per-response parser change (regex anchor)
5. **Drop `docs/review-assembly/`** — temporary, remove before PR submission

---

_This directory is temporary. Delete after the merged injection is committed._
