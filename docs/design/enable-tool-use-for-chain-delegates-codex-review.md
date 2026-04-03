# Codex Review: enable-tool-use-for-chain-delegates

Date: 2026-03-30
Base: `origin/feature/context-pressure-squashed`
Branches reviewed:

- `elliott/enable-tool-use-for-the-chain-delegate`
- `origin/silas/enable-tool-use-for-the-chain-delegate`
- `origin/cael/enable-tool-use-for-the-chain-delegate`
- `origin/ronan/enable-tool-use-for-the-chain-delegate`

## Top Findings

1. **Silas and Elliott both have a hard RPC break.** They thread `drainsContinuationDelegateQueue` through spawn and gateway (`src/agents/subagent-spawn.ts:667-688`, `src/gateway/server-methods/agent.ts:685-719`, `src/commands/agent.ts:509-549`), but neither branch adds the field to `src/gateway/protocol/schema/agent.ts:76-107`. The `agent` RPC still has `additionalProperties: false`, so the new field is rejected before it reaches `agentCommandFromIngress`.

2. **Cael and Ronan never make the runtime gate reachable.** The canonical gate is still `src/agents/openclaw-tools.ts:249-267`, which only exposes `continue_delegate` when `drainsContinuationDelegateQueue === true`. Those two branches do not touch `src/agents/subagent-spawn.ts`, `src/gateway/server-methods/agent.ts`, or `src/commands/agent.ts`, so their announce-boundary consumer is parent-rooted but unreachable from an actual spawned delegate run.

3. **Prompt wiring is inconsistent in every branch.** `buildSubagentSystemPrompt()` still teaches bracket-only continuation in all branches (`src/agents/subagent-announce.ts:1270-1295` unchanged), while Silas and Elliott also teach tool-first in `src/agents/system-prompt.ts`. Spawned subagents would receive conflicting system instructions. Elliott also overstates the runtime path in `docs/design/continue-work-signal-v2.md:403-409`.

4. **The new subagent fan-out loops still diverge on core guard logic.**
   - Cael/Ronan: bracket+tool width accounting is unfinished (`src/agents/subagent-announce.ts:1983-1989`), the first tool delegate reuses the bracket hop, and cost-cap checks use `accumulatedChildTokens` instead of the parent chain total (`src/agents/subagent-announce.ts:1997-2012`).
   - Silas: every tool delegate gets the same `nextChainHop` (`src/agents/subagent-announce.ts:2000-2042`), and `continue_delegate` is not denied for leaf subagents (`src/agents/pi-tools.policy.ts:45-54`).
   - Elliott: hop sequencing is fixed (`src/agents/subagent-announce.ts:1975-2078`), but the subagent path no longer enforces `maxDelegatesPerTurn` at all.

5. **Coverage is too thin to trust any branch as-is.** Silas and Elliott add prompt tests only. No branch adds an end-to-end test for `spawnSubagentDirect -> agent RPC -> runEmbeddedPiAgent -> runSubagentAnnounceFlow -> consumePendingDelegates`, no schema/validation test, no mixed bracket+tool test, and no queued `delegate-return` test.

## Branch Comparison

| Branch      | Chain topology                                                                                                                                 | Spawn path understanding                                                                                                                                                                                                              | `drainsContinuationDelegateQueue` threading                                                                                                                                                  | Gate semantics                                                                                                                                                                | Prompt / docs / tests                                                                                                                                                                                     | Verdict                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Cael**    | Correctly parent-rooted at announce boundary (`src/agents/subagent-announce.ts:1907-1923`, `2028-2040`)                                        | Partial. The design notes know announce-boundary consumption is needed, but do not fully walk the direct `agent` path (`cael-design-enable-tool-delegates.md:17-35`).                                                                 | Missing. Tool stays hidden because the gate remains unchanged.                                                                                                                               | Better than base on paper: `continue_delegate` moves to leaf deny (`src/agents/pi-tools.policy.ts:24-70`), but the runtime gate never turns on.                               | No prompt change, no tests, short RFC, no preserved "why self-consumption fails" section.                                                                                                                 | Not mergeable. Useful only as the smallest proof that announce-boundary consumption is the right insertion point. |
| **Ronan**   | Correctly parent-rooted in code, same as Cael (`src/agents/subagent-announce.ts:1907-1923`, `2028-2040`)                                       | Mixed. The RFC preserves the parent-rooted vs nested distinction, but its "self-consumption" section still assumes a `runReplyAgent` path that the code does not take (`docs/design/enable-tool-use-for-chain-delegates.md:194-209`). | Missing, same gap as Cael.                                                                                                                                                                   | Better than base on paper: leaf deny is present (`src/agents/pi-tools.policy.ts:24-71`), but the runtime gate is still unreachable.                                           | Best motivation draft overall; no prompt/test work.                                                                                                                                                       | Read first for the parent-rooted rationale, but do not merge from it.                                             |
| **Silas**   | Parent-rooted and announces via the parent session (`src/agents/subagent-announce.ts:2029-2052`)                                               | Best explicit path analysis. The doc correctly names `spawnSubagentDirect -> callGateway(\"agent\") -> agentCommandFromIngress -> runEmbeddedPiAgent` (`docs/design/enable-delegate-tool-for-chain.md:20-36`).                        | Almost complete, but blocked by the missing RPC schema field.                                                                                                                                | Violates the desired "runtime gate + `DENY_LEAF` defense-in-depth" split: it removes the unconditional deny but never adds leaf deny (`src/agents/pi-tools.policy.ts:24-54`). | Prompt/test work exists, but `buildSubagentSystemPrompt()` stays bracket-only and the RFC claims an `attempt.ts` gate that the code does not add.                                                         | Good reference for the actual spawn path, not a safe merge base.                                                  |
| **Elliott** | Parent-rooted, and uniquely preserves queued `delegate-return` threading (`src/agents/subagent-announce.ts:934-999`, `1070-1088`, `2160-2187`) | Weakest doc accuracy. The canonical RFC text claims delegate runs go through `get-reply-run.ts -> runReplyAgent` (`docs/design/continue-work-signal-v2.md:403-405`), which is not what the code does.                                 | Widest plumbing attempt, but still blocked by the missing RPC schema field. Elliott also updates both `src/commands/agent/*` and `src/agents/agent-command*`, which reduces duplicate drift. | Best match to the intended gate model: runtime flag is primary, leaf deny is defense-in-depth (`src/agents/pi-tools.policy.ts:24-54`).                                        | Best implementation coverage, but still no real end-to-end tests, no `maxDelegatesPerTurn` on the subagent path, and the prompt remains contradictory because `buildSubagentSystemPrompt()` is unchanged. | Best merge base after fixes. Not landable as-is.                                                                  |

## Specific Risks All Branches Missed

- **The extra subagent prompt is still bracket-only.** Even the stronger branches only update `src/agents/system-prompt.ts`; they do not update `buildSubagentSystemPrompt()` in `src/agents/subagent-announce.ts:1270-1295`.
- **No branch proves tool availability on a real spawned delegate.** The missing schema field is the most obvious hole, but there is also no test that exercises the real `agent` RPC boundary.
- **No branch adds shared guard logic.** The copied fan-out code already diverged on hop allocation, width limits, and cost-cap semantics. That divergence is a warning sign, not a style nit.

## Recommendation

**Read first:** `origin/ronan/enable-tool-use-for-the-chain-delegate` for the clearest parent-rooted framing, then immediately cross-check it against Silas's more accurate path analysis (`docs/design/enable-delegate-tool-for-chain.md:20-36`) because Ronan's RFC still starts from the wrong `runReplyAgent` premise.

**Merge from:** `elliott/enable-tool-use-for-the-chain-delegate`, but only after fixing:

- `src/gateway/protocol/schema/agent.ts` to accept `drainsContinuationDelegateQueue`
- subagent-path `maxDelegatesPerTurn`
- the prompt contradiction between `src/agents/system-prompt.ts` and `buildSubagentSystemPrompt()`
- the incorrect canonical RFC wording about the initial delegate run path

**Cherry-picks / concepts to preserve from other branches:**

- From **Elliott**: queued `delegate-return` threading (`src/agents/subagent-announce.ts:934-999`, `2160-2187`) and the broader command/gateway flag threading shape.
- From **Silas**: the direct-path explanation for spawned delegates (`docs/design/enable-delegate-tool-for-chain.md:20-36`).
- From **Ronan**: the "why self-consumption fails" section structure and parent-vs-child routing table (`docs/design/enable-tool-use-for-chain-delegates.md:194-209`), but rewrite it to use the actual direct `agent` path rather than `runReplyAgent`.

**Shared-function extraction:** do a **small extraction before merge**, not a full refactor. A helper that centralizes hop allocation, width-budget enforcement, and cost-cap checks should be shared between `src/auto-reply/reply/agent-runner.ts` and the new announce-boundary path. A larger cleanup can wait, but shipping another inline copy will preserve the exact bugs these branches already disagree on.
