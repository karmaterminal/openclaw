# Focused Cross-Review: chain-delegate tool branches

Date: 2026-03-30
Canonical issue: `karmaterminal/openclaw#57`
Base reviewed: `feature/context-pressure-squashed`
Branches reviewed:

- `elliott/enable-tool-use-for-the-chain-delegate`
- `origin/silas/enable-tool-use-for-the-chain-delegate`
- `origin/cael/enable-tool-use-for-the-chain-delegate`
- `origin/ronan/enable-tool-use-for-the-chain-delegate`

## Short Answers

### 1. Best merge base right now

`elliott/enable-tool-use-for-the-chain-delegate`, but only as the starting point for a follow-up fix stack. It has the strongest end-to-end threading attempt (`src/agents/subagent-spawn.ts:667-685`, `src/gateway/server-methods/agent.ts:685-718`, `src/commands/agent.ts:546-548`) and the only queued-announce `delegate-return` threading fix (`src/agents/subagent-announce-queue.ts:22-37`, `src/agents/subagent-announce.ts:869-891`, `934-999`, `2160-2187`). It is still not landable as-is because:

- `drainsContinuationDelegateQueue` is threaded through spawn/gateway/command code but never added to `src/gateway/protocol/schema/agent.ts:76-107`, so the `agent` RPC still rejects it.
- the subagent announce path drops `maxDelegatesPerTurn` enforcement.
- `buildSubagentSystemPrompt()` still teaches bracket-only continuation (`src/agents/subagent-announce.ts:1270-1295`), which conflicts with the new tool-first prompt text.

### 2. Are the branches functionally equivalent?

No. There are meaningful behavioral differences.

- **Cael** and **Ronan** are closest in spirit, but not identical.
  - Both choose parent-rooted announce-boundary consumption and both add leaf deny.
  - Neither threads `drainsContinuationDelegateQueue` through `spawnSubagentDirect -> agent RPC -> agentCommandFromIngress`, so the tool still does not appear on a real spawned delegate run.
  - Ronan consumes tool delegates outside the bracket block and attempts a width cap; Cael keeps tool handling inside the combined branch/tool block.
  - Both still have broken announce-side guard logic: hop allocation and width accounting are incomplete, and cost-cap checks are wrong for tool fan-out.

- **Silas** is behaviorally different from Cael/Ronan.
  - He does thread `drainsContinuationDelegateQueue` through `src/agents/subagent-spawn.ts`, `src/gateway/server-methods/agent.ts`, and `src/commands/agent.ts`.
  - He does **not** add `continue_delegate` to `SUBAGENT_TOOL_DENY_LEAF` (`src/agents/pi-tools.policy.ts:45-54`), so he loses the requested defense-in-depth split.
  - His tool-delegate loop reuses the same `nextChainHop` for every delegate (`src/agents/subagent-announce.ts:2000-2042`), so multi-delegate fan-out is wrong even before the schema bug is fixed.

- **Elliott** is behaviorally different from Silas.
  - He keeps the runtime gate primary and leaf deny as defense-in-depth (`src/agents/pi-tools.policy.ts:24-54`).
  - He fixes sequential hop allocation in the announce path (`src/agents/subagent-announce.ts:1975-2078`).
  - He uniquely preserves `delegate-return` through queued announce delivery (`src/agents/subagent-announce-queue.ts:22-37`, `src/agents/subagent-announce.ts:869-891`, `934-999`, `2160-2187`).
  - But he removes announce-side `maxDelegatesPerTurn` enforcement entirely.

So the branches are not functionally equivalent:

- Cael/Ronan: parent-rooted idea, unreachable tool exposure.
- Silas: reachable exposure attempt, but broken hop numbering and no leaf deny.
- Elliott: best plumbing and queue semantics, but still broken by schema and missing width cap.

### 3. Verify the architecture claim

Verified. The actual spawned sub-agent path on `feature/context-pressure-squashed` is:

1. `spawnSubagentDirect()` calls `callGateway({ method: "agent", deliver: false, sessionKey: childSessionKey, ... })` in `src/agents/subagent-spawn.ts:664-680`.
2. The gateway `agent` handler forwards to `agentCommandFromIngress(...)` in `src/gateway/server-methods/agent.ts:145-152`, with the request payload assembled at `src/gateway/server-methods/agent.ts:685-717`.
3. `agentCommandFromIngress()` then calls `runEmbeddedPiAgent(...)` in `src/commands/agent.ts:507-514`.

That path does **not** go through `get-reply-run.ts` or `runReplyAgent()` for the initial spawned run.

That matters because parent-rooted topology requires the code that consumes staged delegates to still know the **parent** session key. The announce boundary already has that information and already spawns bracket chain hops with `agentSessionKey: targetRequesterSessionKey` (`feature/context-pressure-squashed` `src/agents/subagent-announce.ts:1853-1868`). The child run itself only knows its own `childSessionKey`.

So the princes' architecture claim is correct:

- the initial spawned sub-agent run is on the direct `agent` path;
- parent-rooted tool consumption therefore belongs at the announce boundary, not in child-session self-consumption.

## Gate policy

Yes: `drainsContinuationDelegateQueue === true` should remain the single canonical runtime gate.

- It answers the only runtime question that matters: will this exact run path actually drain the pending delegate queue?
- That is why the shared uplift in `src/agents/openclaw-tools.ts:249-267` is correct: expose `continue_delegate` only when continuation is enabled **and** the run is marked as draining.
- For spawned delegates, that flag must be threaded through the direct path verified above: `spawnSubagentDirect` (`src/agents/subagent-spawn.ts:667-685`) -> gateway `agent` handler (`src/gateway/server-methods/agent.ts:685-718`) -> `agentCommandFromIngress` (`src/commands/agent.ts:546-548`) -> `runEmbeddedPiAgent`.

Yes: `DENY_LEAF` should remain as defense-in-depth.

- Leaf denial is a policy rule, not the runtime consumer check. Max-depth sub-agents should not fan out further even if some future path accidentally sets the drain flag.
- Elliott is the only branch that matches the desired split: runtime gate primary, `SUBAGENT_TOOL_DENY_LEAF` secondary (`src/agents/pi-tools.policy.ts:24-54`).
- Silas drops `continue_delegate` from `SUBAGENT_TOOL_DENY_LEAF` (`origin/silas/enable-tool-use-for-the-chain-delegate:src/agents/pi-tools.policy.ts:45-54`).
- Cael and Ronan keep leaf deny, but never make the runtime gate reachable on real spawned delegates.

## Prompt, test, and doc completeness

### Prompts

- Elliott and Silas update `buildAgentSystemPrompt()` to teach tool-first delegation when `continue_delegate` is available (`src/agents/system-prompt.ts:679-696`, `756-770` on Elliott).
- But the actual spawned child prompt still comes from `buildSubagentSystemPrompt()`, and all branches leave that function bracket-only (`src/agents/subagent-announce.ts:1270-1295` on Elliott).
- That means the strongest branches still have a prompt contradiction: the generic minimal prompt teaches `continue_delegate`, but the real sub-agent prompt still says to end the response with exactly one `[[CONTINUE_DELEGATE: ...]]`.

### Tests

- All four branches touch the same three test surfaces: `src/agents/system-prompt.test.ts`, `src/auto-reply/tokens.test.ts`, and `src/agents/agent-command.test.ts`.
- `src/agents/agent-command.test.ts` is an ACP visible-text accumulator regression test, not a chain-delegate enablement test.
- `src/auto-reply/tokens.test.ts` adds bracket parsing regressions, which is useful but does not exercise tool visibility, announce-boundary consumption, or direct-agent threading.
- Elliott has the strongest prompt-policy assertion set: `src/agents/system-prompt.test.ts` checks orchestrator-vs-leaf alignment and tool-first minimal prompts.
- Cael and Ronan instead keep tests aligned with bracket-only minimal guidance.
- Silas adds prompt coverage for tool-first minimal prompts, but that coverage matches his weaker leaf policy, not the desired gate-plus-leaf split.
- No branch adds the tests that matter most for merge confidence:
  - `agent` RPC schema acceptance for `drainsContinuationDelegateQueue`
  - spawned-direct propagation from `spawnSubagentDirect` into `runEmbeddedPiAgent`
  - parent-rooted announce-boundary consumption of tool-enqueued delegates
  - mixed bracket + multiple tool delegates in one completion
  - real leaf-vs-orchestrator tool visibility
  - queued `delegate-return` preservation when announce delivery is deferred

### Docs

- Silas has the most accurate direct-path explanation in `docs/design/enable-delegate-tool-for-chain.md:20-36`.
- Ronan best preserves the important "why self-consumption fails" explanation in `docs/design/enable-tool-use-for-chain-delegates.md:194-209`, but the path statement is wrong because it says `callGateway({ method: "agent" })` reaches `get-reply-run.ts -> runReplyAgent`.
- Elliott's `docs/design/continue-work-signal-v2.md:403-405` repeats the same auto-reply-path mistake.

## Regression risks and hidden bugs

- **Schema blocker on Elliott/Silas:** `drainsContinuationDelegateQueue` is never added to `src/gateway/protocol/schema/agent.ts:76-107`. Because the schema uses `additionalProperties: false`, the direct `agent` RPC rejects the new field.
- **Unreachable runtime gate on Cael/Ronan:** `spawnSubagentDirect()` never sends the flag (`origin/cael/enable-tool-use-for-the-chain-delegate:src/agents/subagent-spawn.ts:667-681`), and `agentCommandFromIngress()` still hardcodes `drainsContinuationDelegateQueue: false` (`origin/cael/enable-tool-use-for-the-chain-delegate:src/commands/agent.ts:546-547`).
- **Duplicate hop numbering on Silas:** every tool delegate uses `childChainHop + 1` (`origin/silas/enable-tool-use-for-the-chain-delegate:src/agents/subagent-announce.ts:2000-2042`), so multi-delegate fan-out generates repeated hop numbers.
- **Missing width cap on Elliott:** `src/agents/subagent-announce.ts:1975-2078` has chain-length and cost-cap checks for tool fan-out, but no `maxDelegatesPerTurn` enforcement.
- **Guard math still wrong on Cael/Ronan:** their announce-side tool fan-out code still has incomplete width/cost accounting, so even the right topology idea is not correctly bounded.
- **Prompt contradiction on all branches:** real spawned sub-agents still receive bracket-only instructions from `buildSubagentSystemPrompt()`.
- **Queue-path risk outside Elliott:** only Elliott preserves `delegate-return` through queued announce state (`src/agents/subagent-announce-queue.ts:22-37`, `src/agents/subagent-announce.ts:869-891`, `934-999`, `2160-2187`).

## Important base-vs-branch note

The local `feature/context-pressure-squashed` branch is behind the shared uplift already present in all four prince branches. In particular:

- local base still exposes `continue_delegate` whenever continuation is enabled (`src/agents/openclaw-tools.ts:246-252`);
- all four prince branches already include the newer runtime gate version (`src/agents/openclaw-tools.ts:249-267`) that requires `drainsContinuationDelegateQueue === true`.

That shared uplift means the meaningful prince-to-prince differences start **after** the gate exists:

- whether they actually thread the gate end-to-end,
- whether they preserve parent-rooted topology,
- whether the announce-side fan-out logic is correct,
- and whether prompt/docs/test coverage line up with the code.

## Recommended read / merge order

Read order:

1. `elliott/enable-tool-use-for-the-chain-delegate` for the strongest implementation base.
2. `origin/silas/enable-tool-use-for-the-chain-delegate` for the accurate direct spawn-path analysis and the intent to thread the runtime gate.
3. `origin/ronan/enable-tool-use-for-the-chain-delegate` for the parent-rooted rationale, specifically the "why self-consumption fails" explanation.

Merge from:

- `elliott/enable-tool-use-for-the-chain-delegate`

Preserve from the others:

- Silas's direct-path explanation (`docs/design/enable-delegate-tool-for-chain.md:20-36`).
- Ronan's parent-vs-child routing rationale, but rewrite it to use the verified direct `agent` path instead of `runReplyAgent`.

Do not treat the branches as interchangeable. They are converging on the same idea, but they are not behaviorally equivalent today.
