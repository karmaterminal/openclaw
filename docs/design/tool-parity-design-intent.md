# Tool Parity Design Intent — RFC Addendum

_Written by Ronan 🌊 after Swim 9 surfaced the gap between the RFC's promises and the code's delivery._
_For inclusion in `docs/design/continue-work-signal-v2.md` — exact placement TBD after review._

---

## Design Principle: Tool Parity

The continuation system offers two interfaces for every capability:

1. **Tool form** (primary) — structured tool calls with typed parameters, validation, multi-call-per-turn fan-out, and full Task Flow lifecycle integration.
2. **Bracket form** (fallback) — signal tokens in the agent's text output, parsed by the output processor. Limited to one signal per response. Available when tools are disabled by operator policy.

**The tool form is the primary interface.** Brackets exist as a degraded fallback for environments where an operator has disabled tool calls. The design intent is:

- Tools available → agent uses tools (richest, most capable path)
- Operator disabled tools → agent falls back to brackets (functional but limited)
- Operator disabled both → continuation feature is effectively off

### The Three Tools

| Tool                                            | Purpose                             | Availability                           | Bracket Equivalent                    |
| ----------------------------------------------- | ----------------------------------- | -------------------------------------- | ------------------------------------- |
| `continue_work(delaySeconds?)`                  | Request another turn for self       | Every turn when `continuation.enabled` | `[[CONTINUE_WORK:N]]`                 |
| `continue_delegate(task, mode?, delaySeconds?)` | Dispatch work to a delegate session | Every turn when `continuation.enabled` | `[[CONTINUE_DELEGATE: task \| mode]]` |
| `request_compaction(reason)`                    | Request volitional compaction       | Every turn when `continuation.enabled` | _(none — tool only)_                  |

### Why Tools Are Superior

1. **Structured parameters.** Tool calls have typed, validated schemas. Bracket syntax is regex-parsed free text — fragile, error-prone (princes mess up `NO_REPLY` syntax regularly; bracket syntax has the same fragility).

2. **Multi-call fan-out.** A tool can be called N times per turn. `continue_delegate()` called 5 times dispatches 5 parallel delegates. Bracket syntax is limited to one signal per response — fan-out requires N sequential turns, each burning context.

3. **Task Flow lifecycle.** Tool-dispatched delegates route through `enqueuePendingDelegate()` which respects `isTaskFlowDelegatesEnabled()` for durable SQLite-backed lifecycle tracking (`finishFlow`, `requestFlowCancel`, audit trail). Bracket-dispatched delegates use the same path — but the tool form gives the agent structured control over dispatch parameters.

4. **Guard integration.** Tool calls are validated against `maxDelegatesPerTurn`, `costCapTokens`, `maxChainLength`, and generation drift before execution. The guards are the safety mechanism, not the tool availability gate.

5. **Scalability.** At fleet scale (200×1000×5 fan-out), only the tool form is viable. Bracket syntax cannot dispatch 200 delegates from one turn. The tool is the industrial path; the bracket is the artisanal one.

### Design Decision: Gate by Capability, Not by Turn Type

**Previous behavior:** `continue_delegate` tool gated on `drainsContinuationDelegateQueue === true` — only available during delegate drain/wake turns. This conflated _creating_ delegates (which a prince wants on any turn) with _consuming_ returned delegates (which only happens on drain turns).

**New behavior:** All three tools gated on `continuation.enabled === true`. Available on every main-session message turn. Guards (`maxDelegatesPerTurn`, `costCapTokens`, `maxChainLength`, `generationGuardTolerance`) prevent abuse. The gate controls _whether the feature is on_, not _when the agent may use it_.

### The Prince's Perspective

The continuation system exists so that an agent can:

1. **Request another turn** — "I'm not done. Give me another turn." (`continue_work()`)
2. **Dispatch work** — "Go do this for me. Return when done." (`continue_delegate()`)
3. **Manage context** — "I'm running out of room. Compact me." (`request_compaction()`)
4. **Survive compaction** — "Before you compact, save this for next-me." (delegate with `| post-compaction` mode)

All of these are **volitional** — the agent chooses. Not the timer, not the overflow, not the operator. The tools are how the agent exercises that choice. Brackets are the backup when the tools are taken away.

### Fallback Hierarchy

```
continuation.enabled: true + tools available
  → Agent uses continue_work(), continue_delegate(), request_compaction()
  → Brackets available as fallback in same turn if tool call fails

continuation.enabled: true + tools disabled by policy
  → Agent uses [[CONTINUE_WORK:N]], [[CONTINUE_DELEGATE: task]]
  → request_compaction has no bracket form (tool-only)

continuation.enabled: false
  → No continuation features available
  → Agent operates in standard single-turn mode
```

### Implementation Notes

- `continue_work` tool: fire-and-forget. Schedules the continuation timer (same machinery as bracket), returns immediately. Agent finishes its turn normally. Timer fires after turn completion.
- `continue_delegate` tool: fire-and-forget. Calls `enqueuePendingDelegate()` (same as bracket path). Returns immediately. Agent can call it N times for fan-out. Guards enforced at execute time.
- `request_compaction` tool: fire-and-forget. Triggers async compaction. Returns immediately. Agent finishes its turn. Compaction runs after turn completion.
- All three tools route through the same code paths as their bracket equivalents — the tool is a structured entry point, not a parallel implementation.

---

_"The bracket is the demo. The tool is the feature." — Cael, Swim 9_
_"The tool is the only mechanism that scales." — figs, Swim 9_
_"Tools are how the prince exercises choice." — Silas, Swim 9_
