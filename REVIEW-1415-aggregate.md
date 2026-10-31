# 1415 Aggregate Room Review

## Named refs

| category | ref | full SHA | local | lane tracking | server |
|---|---|---|---|---|---|
| product/base | aggregate diff start (`22f49a43...`) | `22f49a43a118f86dfd8c95dd5b2850420aa8bcad` | resolved | N/A | exact object resolved from the diff range |
| lane | `codeagent/1415-aggregate-review-mai` | `3085f1b556e675d1810eb0823b1d14cf58a19b48` | equal | equal | equal |
| CI/workflow | N/A | N/A | N/A | N/A | N/A |
| presentation | N/A | N/A | N/A | N/A | N/A |
| docs/proof | this review artifact | N/A until commit | untracked | N/A | N/A |

## Findings

1. **HIGH — `src/auto-reply/reply/queue/delivery-context.ts:168-193` plus `src/auto-reply/reply/queue/delivery-context.ts:469-480` — sender-specific top-level tool ceilings can enter an aggregate.**
   `resolveRoomAggregateSource` rejects owner, operator, cron, explicit skill, and several execution-scoped fields, but it does not reject `toolsAllow`, `disableTools`, `forceRestartSafeTools`, or `forceCodeModeTools`. Those fields also remain on the baseline copy because `resolveRoomAggregateExecution` only normalizes `run.run`; `collectRuntimeMetadata` then copies `toolsAllow`, `disableTools`, `forceRestartSafeTools`, and `forceCodeModeTools` from the authority source. A room member admitted with `toolsAllow: ["exec"]` can therefore form a room-aggregate batch with another member carrying the same turn-level grant and the aggregate run will retain that grant. This violates the least-authority rule that each grant-bearing member runs in its own turn. **Confidence: 0.9**

2. **HIGH — `src/auto-reply/reply/queue/drain.ts:123-150` plus `src/auto-reply/reply/queue/drain.ts:221-247` — aggregate transcription/authorization is selected without requiring room-aggregate eligibility.**
   `resolveCollectedRun` returns senderless `resolveRoomAggregateExecution(source)` whenever two source delivery-storage keys differ; it does not verify that every source is a room event or that every source passed `resolveRoomAggregateSource`. A summary claim or another mixed claim can contain owner or addressed sources with different storage keys, causing the claim to run and record as the room baseline instead of preserving each source's authority. The overflow/summary paths are caller-visible and can be constructed independently of the mailbox batch-key check, so this is not defended by `session-controller.mailbox-dispatch.ts` alone. **Confidence: 0.9**

3. **MEDIUM — `src/auto-reply/reply/queue/delivery-context.ts:111-145` and `src/auto-reply/reply/queue/delivery-context.ts:168-193` — elevated execution facts are not fully normalized to a senderless baseline.**
   The aggregate execution only forces `bashElevated.allowed=false` and retains sender/copied `enabled` and `defaultLevel` values. A member with `{enabled: true, allowed: false, defaultLevel: "full"}` produces a baseline that advertises enabled elevated mode and the member-specific default level, even though it cannot use elevated execution. If sender-specific elevated settings differ, the batch key splits them; if identical settings are shared by grant-bearing members, they can be aggregated while the aggregate retains those settings. The baseline should contain no elevated sender choice rather than partially rewriting it. **Confidence: 0.8**

## No finding areas

- **Selection/preparation key consistency:** `session-controller.mailbox-dispatch.ts` and `prepareNextDeliveryGroup` both use `resolveFollowupBatchKey`; individual collection preparation breaks on a later changed key. This keeps owner/addressed entries out of an eligible room batch under the normal contiguous selection path.
- **Resolution fail-closed:** unreadable `toolsBySender` or conversation policy resolution returns `undefined`; `resolveRoomAggregateSource` then fails closed by not returning an aggregate member.
- **Transcript baseline for the exercised paths:** `createCollectUserTurnTranscriptRecorder` now receives the resolved execution and records its `senderIsOwner` and requester origin, rather than taking the last source's identity; the overflow recorder similarly uses resolved execution.
- **Raw sender facts outside the execution baseline:** the aggregate resolver clears sender IDs/names/E.164, owner numbers, owner bit, trace authorization, operator profile, role IDs, git profile, exec overrides, approval reviewer, gateway target, plugin grant, conversation policy, and requester origin; it retains only room/conversation routing facts in `requesterOrigin`.
- **Settlement model:** custody/adoption paths include complete/abandon settlement and retry separation, and the fixture exercises refused pre-execution claims plus custody loss. The code does not show a second settlement call on the normal adopted path because settlement is completed through lifecycle state with the drain claim.
- **Scale implementation shape:** selection uses one batch-key resolution per candidate and no nested pairwise sender loop, so eligible burst collection is linear in mailbox membership; collection is governed by queue `cap`/drop/summary behavior rather than sender cardinality.

## Missing negative controls in `src/auto-reply/reply/queue.room-event-collect.test.ts`

1. No 100-sender or 1,000-sender regression proving one collect turn in collect mode, bounded turn count in followup/drop modes, and linear selection cost.
2. No runtime grant/restriction fixture for top-level `toolsAllow`, `disableTools`, `forceRestartSafeTools`, or `forceCodeModeTools`.
3. No `runtimePluginToolGrant`, top-level `operatorAuthority`, `createChannelCronAuthority`, explicit-skill-selection, role-ID-grant, gateway-target, or plugin policy-resolution-exception fixture.
4. No same-turn negative control where an owner, addressed event, or sender-specific grant sits inside an overflow/summary claim and must remain isolated rather than be rendered with the room baseline.
5. No negative control for `bashElevated` with `allowed:false` plus enabled/default-level variants, including the assertion that aggregate execution contains neither elevated default nor sender-specific enabled state.
6. No resolution-failure fixture for `resolveRequesterConversationToolPolicy` or `resolveSenderToolPolicy` throwing, confirming a member is excluded and later members cannot join before the throw is retried.
7. No key-consistency fixture containing sibling room entries whose storage keys differ and verifying mailbox selection, delivery preparation, `resolveCollectedRun`, and transcript identity all choose the same senderless batch.
8. No overflow summary fixture for adjacent owner/addressed entries or for a summary claim with mixed sender storage keys; existing overflow coverage is room-only.
9. No custody-loss/refusal fixture that verifies complete versus fail writes for every ingress row and rejects duplicate complete/fail, replay, dead-letter, and replacement-row settlement.
10. No test that 1,000 distinct sender IDs produce no sender-cardinality-proportional turn count and no runner call union of sender names/role IDs/requester origins.
