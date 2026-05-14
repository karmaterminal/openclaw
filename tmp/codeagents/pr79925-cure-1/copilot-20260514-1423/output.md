# PR #79925 cure-(1) copilot/gpt-5.5 lane output

## Summary

- Tracking issue: https://github.com/karmaterminal/openclaw/issues/684
- Candidate branch: `silas/79925-pr-cure-1-copilot-candidate`
- Refactor commits:
  - `5a2e135f921965d99f4036b72b9c237a9c83d6c9` removed the delivery-time `crossSessionTargeting === "disabled"` gate from `src/agents/subagent-announce.ts` and routed tree/all targeted returns through `resolveContinuationReturnTargetSessionKeys` + `enqueueContinuationReturnDeliveries`.
  - `a7413ee844c4e110675db7af3e859de88ae9f0b1` closed the audit-found child chain-hop dispatch gap with a policy-aware dispatch gate that uses `hasCrossSessionDelegateTargeting` before spawning the next subagent.

The resulting shape keeps delivery routing centralized in the shared resolver while preserving policy enforcement before dispatch/spawn boundaries. `fanoutMode: "tree"` is treated as same-tree targeting and remains deliverable under default `crossSessionTargeting: "disabled"`; `fanoutMode: "all"` and explicit cross-session targets are rejected by shared-helper gates.

## Immaterial-gates audit

| path | reaches delivery? | gated where? | gate policy-aware? |
| --- | --- | --- | --- |
| Main-session `continue_delegate` tool call, normal mode -> `enqueuePendingDelegate` -> `dispatchToolDelegates` -> `spawnSubagentDirect` -> child return in `runSubagentAnnounceFlow` -> `enqueueContinuationReturnDeliveries` | Yes | `src/agents/tools/continue-delegate-tool.ts` rejects at tool entry; `src/auto-reply/continuation/delegate-dispatch.ts` rejects again before spawn | Yes. Both use `hasCrossSessionDelegateTargeting`, so `all` and explicit cross-session targets are cross-session; `tree` is allowed. |
| Main-session `continue_delegate` tool call, post-compaction mode -> staged/released via `dispatchStagedPostCompactionDelegates` -> `spawnSubagentDirect` -> child return -> `enqueueContinuationReturnDeliveries` | Yes | Tool entry in `continue-delegate-tool.ts`; staged dispatch in `src/auto-reply/continuation/delegate-dispatch.ts` | Yes. Both use `hasCrossSessionDelegateTargeting`. |
| Queued post-compaction delivery entries -> `src/auto-reply/reply/post-compaction-delegate-dispatch.ts` -> `spawnSubagentDirect` -> child return -> `enqueueContinuationReturnDeliveries` | Yes | Delivery/release guard at `post-compaction-delegate-dispatch.ts` lines around 508 | Yes. Existing persisted-entry safety gate uses `hasCrossSessionDelegateTargeting`; it rejects stale `all`/explicit cross-session entries while allowing `tree`. |
| Bracket `[[CONTINUE_DELEGATE: ...]]` emitted by a main/session turn -> `agent-runner.ts` -> `spawnSubagentDirect` -> child return -> `enqueueContinuationReturnDeliveries` | Yes | `src/auto-reply/reply/agent-runner.ts` bracket delegate guard before spawn | Yes. Uses `hasCrossSessionDelegateTargeting`. |
| Tool delegates consumed in `agent-runner.ts` legacy/runner path -> `spawnSubagentDirect` -> child return -> `enqueueContinuationReturnDeliveries` | Yes | `src/auto-reply/reply/agent-runner.ts` tool delegate guard before spawn | Yes. Uses `hasCrossSessionDelegateTargeting`. |
| Child subagent emits bracket `[[CONTINUE_DELEGATE: ...]]` during a continuation chain-hop -> `subagent-announce.ts` spawns the next child -> final child return -> `enqueueContinuationReturnDeliveries` | Yes | Audit found this sibling dispatch path was not covered by the removed delivery-time gate or by main-session tool/dispatch entry. Added `rejectCrossSessionTargetingForSubagentDispatch` before `spawnSubagentDirect`. | Yes. New gate uses `hasCrossSessionDelegateTargeting` with the emitting child session as dispatching session; tests cover disabled `all` rejection and disabled `tree` allow. |
| Child subagent enqueues tool delegates consumed by `subagent-announce.ts` during a continuation chain-hop -> next child spawn -> final child return -> `enqueueContinuationReturnDeliveries` | Yes | Audit found same sibling dispatch gap for child tool delegates. Added the same `rejectCrossSessionTargetingForSubagentDispatch` before child-spawn dispatch. | Yes. New gate uses `hasCrossSessionDelegateTargeting`; tests cover disabled `all` rejection and disabled `tree` allow. |
| Targeted return delivery in `subagent-announce.ts` with `continuationTargetSessionKey(s)` or `continuationFanoutMode` | Yes | No delivery-time policy gate remains. Delivery is only the resolver/enqueue boundary after upstream dispatch gates admit the work. | Yes by upstream gates above; delivery uses `resolveContinuationReturnTargetSessionKeys` for target resolution, not policy classification. |
| `silentAnnounce` sibling path in `subagent-announce.ts` without continuation targeting | No, not via `enqueueContinuationReturnDeliveries` | Sends an in-memory system event only to `targetRequesterSessionKey` | Not a cross-session continuation return path. |
| Direct announcement sibling path in `subagent-announce.ts` without continuation targeting | No, not via `enqueueContinuationReturnDeliveries` | Calls `deliverSubagentAnnouncement` for the requester origin | Not a cross-session continuation return path. |

Production grep results after the refactor:

- `enqueueContinuationReturnDeliveries(` has one production caller: `src/agents/subagent-announce.ts`.
- Policy gates using `hasCrossSessionDelegateTargeting` remain in:
  - `src/agents/tools/continue-delegate-tool.ts`
  - `src/auto-reply/continuation/delegate-dispatch.ts`
  - `src/auto-reply/reply/agent-runner.ts`
  - `src/auto-reply/reply/post-compaction-delegate-dispatch.ts`
  - `src/agents/subagent-announce.ts` child chain-hop dispatch helper
- Config/schema/type references are passive contract surfaces, not enforcement points.

## Validation

- `pnpm test src/agents/subagent-announce.chain-guard.test.ts` -> 17 tests passed.
- `pnpm test src/agents/subagent-announce` -> 76 Vitest shards passed.
- `pnpm test src/auto-reply/continuation` -> 11 files / 130 tests passed.
- `pnpm test src/agents/subagent-announce.targeted-return.integration.test.ts src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts src/auto-reply/continuation/delegate-dispatch-post-compaction.test.ts src/auto-reply/reply/post-compaction-delegate-dispatch.test.ts` -> 3 shards passed.
- `pnpm tsgo` -> passed.
- `pnpm check:changed` -> passed after fixing the new targeted-return test mock type.
- `pnpm build` -> passed.

## Proof gaps

- Discord archive receipt reads for messages `1504484335468937408` and `1504486610715283467` could not be locally verified because `discrawl`, `$HOME/.discrawl/discrawl.db`, and the relay helper checkout were unavailable in this lane. The workorder itself includes the load-bearing quote and message IDs, and no forbidden runtime/parallel worktree paths were read.
- No PR was opened or modified; this is a pushed candidate branch for cohort byte-walk only.
