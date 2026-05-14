# PR #79925 cure-shape (1) — Claude lane — immaterial-gates audit

Branch: `cael/79925-pr-cure-1-claude-candidate` off `446e285f7d`.

## Audit table

| #   | path                                                                                                                                                                                                                                                                                                                                     | reaches delivery?                                                                                                                             | gated where?                                                                                                                                                                                                                                                    | gate policy-aware?                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | `continue_delegate` tool (normal mode) → `enqueuePendingDelegate` → `dispatchToolDelegates` → `spawnSubagentDirect` → child subagent → `runSubagentAnnounceFlow` → `enqueueContinuationReturnDeliveries`                                                                                                                                 | yes (return-delivery in subagent-announce)                                                                                                    | tool-entry: `src/agents/tools/continue-delegate-tool.ts:200-209` (throws `ToolInputError`); dispatch (agent-runner sibling): `src/auto-reply/reply/agent-runner.ts:2997-3024`; dispatch (extracted): `src/auto-reply/continuation/delegate-dispatch.ts:229-258` | yes — all sites use `hasCrossSessionDelegateTargeting(target, sessionKey)` against the `targeting-pure.ts` helper |
| 2   | `continue_delegate` tool (`mode:"post-compaction"`) → `stagePostCompactionDelegate` → `dispatchPostCompactionDelegates` → `enqueuePostCompactionDelegateDelivery` → durable queue → `drainPostCompactionDelegateDeliveries` → `deliverQueuedPostCompactionDelegate` → `spawnSubagentDirect` → child subagent → `runSubagentAnnounceFlow` | yes (return-delivery in subagent-announce)                                                                                                    | tool-entry: `src/agents/tools/continue-delegate-tool.ts:200-209`; drain-time dispatch (durable queue): `src/auto-reply/reply/post-compaction-delegate-dispatch.ts:507-522`                                                                                      | yes — uses `hasCrossSessionDelegateTargeting(params.entry, params.entry.sessionKey)`                              |
| 3   | bracket signal `[[CONTINUE_DELEGATE: ...                                                                                                                                                                                                                                                                                                 | target=… or fanout=…]]`parsed in agent-runner →`rejectCrossSessionTargeting`→`spawnSubagentDirect`→ child subagent →`runSubagentAnnounceFlow` | yes (return-delivery in subagent-announce)                                                                                                                                                                                                                      | dispatch (bracket-delegate): `src/auto-reply/reply/agent-runner.ts:2484-2511`                                     | yes — uses `hasCrossSessionDelegateTargeting(targeting, sessionKey)` |
| 4   | extracted staged dispatch helper `releasePostCompactionLifecycle` → `dispatchStagedPostCompactionDelegates` → `spawnSubagentDirect`                                                                                                                                                                                                      | test-only — `releasePostCompactionLifecycle` is referenced only from its colocated test, the live agent-runner path is path #2                | dispatch: `src/auto-reply/continuation/delegate-dispatch.ts:425-449`                                                                                                                                                                                            | yes — uses `hasCrossSessionDelegateTargeting(delegate, sessionKey)`                                               |
| 5   | direct subagent return without continuation-targeting (`!hasContinuationTargeting`)                                                                                                                                                                                                                                                      | no — short-circuits into the non-targeted announce branch and returns to the requester session only                                           | n/a (no cross-session reach)                                                                                                                                                                                                                                    | n/a                                                                                                               |
| 6   | subagent return WITH continuation-targeting **after the inner gate is removed**                                                                                                                                                                                                                                                          | yes — delivers via `enqueueContinuationReturnDeliveries`                                                                                      | upstream by paths #1/#2/#3/#4; the delivery boundary is no longer gated                                                                                                                                                                                         | n/a at delivery; policy is enforced upstream                                                                      |

## Sibling delivery functions in `src/agents/subagent-announce.ts`

Single production caller of `enqueueContinuationReturnDeliveries` exists at
`src/agents/subagent-announce.ts:1266` inside `runSubagentAnnounceFlow`. The
file's other delivery paths are:

- `silentAnnounce` system-event injection (~line 1307): runs only when
  `!hasContinuationTargeting`. Delivers to the requester (parent) session, not
  cross-session. Not affected by this cure.
- `deliverSubagentAnnouncement` direct announce: same — runs only when
  `!hasContinuationTargeting`.

No sibling delivery function in the file shares a code path that bypasses the
tool-entry + dispatch gates and reaches cross-session delivery.

## All `crossSessionTargeting` runtime references in `src/**`

| location                                                             | kind                                                                      | notes                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/auto-reply/continuation/config.ts:97`                           | config normalize                                                          | source of truth for the policy default (`"disabled"`)                                                                                    |
| `src/auto-reply/continuation/types.ts:118`                           | type declaration                                                          | `ContinuationCrossSessionTargetingPolicy`                                                                                                |
| `src/config/zod-schema.agent-defaults.ts:306`                        | schema                                                                    | accepts `"disabled"` \| `"enabled"`                                                                                                      |
| `src/auto-reply/reply/agent-runner.ts:2386, 2499`                    | dispatch gate (bracket-delegate)                                          | uses helper                                                                                                                              |
| `src/auto-reply/reply/agent-runner.ts:2943, 3003`                    | dispatch gate (tool-delegate loop)                                        | uses helper                                                                                                                              |
| `src/auto-reply/continuation/delegate-dispatch.ts:208, 231`          | dispatch gate (`dispatchToolDelegates`)                                   | uses helper                                                                                                                              |
| `src/auto-reply/continuation/delegate-dispatch.ts:427`               | dispatch gate (`dispatchStagedPostCompactionDelegates`, test-only helper) | uses helper                                                                                                                              |
| `src/auto-reply/reply/post-compaction-delegate-dispatch.ts:474, 508` | drain-time dispatch gate                                                  | uses helper                                                                                                                              |
| `src/agents/tools/continue-delegate-tool.ts:204`                     | tool-entry gate                                                           | uses helper                                                                                                                              |
| `src/agents/subagent-announce.ts:1229-1246`                          | **inner delivery gate (REMOVED by this cure)**                            | hand-rolled, treated `fanoutMode === "tree"` as cross-session contrary to the helper — this was the bug clawsweeper flagged in PR #79925 |

All other matches are tests / config schema / type declarations.

## Conclusion

After removing the inner delivery gate at `src/agents/subagent-announce.ts:1229-1246`:

- Every code path that can reach `enqueueContinuationReturnDeliveries` is
  gated at the tool entry **and** at the dispatch boundary by gates that share
  the `hasCrossSessionDelegateTargeting` helper.
- `fanoutMode: "tree"` returns the helper says are intra-lineage (the helper
  treats `tree` as same-session-family); they survive every upstream gate and
  must reach delivery. The removed inner gate was the only site that
  contradicted that contract, and it was the source of the bug.
- `fanoutMode: "all"` is treated as cross-session by the helper; every
  upstream gate rejects it under the disabled policy, so the child subagent is
  never spawned and the delivery boundary is never reached.
- Cross-session targeting via explicit `targetSessionKey(s)` is gated
  identically at tool entry, dispatch, and bracket-delegate dispatch.

No delivery path bypasses tool-entry + dispatch under the disabled policy.
The drain-time gate at `post-compaction-delegate-dispatch.ts:507-522` is
retained as a policy-change-resilience defense for delegates that were staged
into the durable queue while the policy was `"enabled"` and then drained
after the policy was flipped to `"disabled"`. That gate uses the shared helper,
is consistent with the cure, and is documented here so the cohort byte-walk can
inspect it explicitly.
