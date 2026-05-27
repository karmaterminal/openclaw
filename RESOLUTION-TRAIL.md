# PR #85651 drift-cure resolution trail

Lane: `ronan-seat-copilot`

Target: `530468259392ed8b77b43d8811bae058addf1ddb`

Rebase completed at `7f2f51d978367efc57dec2ad19e1dea6880ca6a0`; the pushed candidate is the branch HEAD after the post-rebase merge-fix commit.

## Preservation mandate

Cherry-picked the upstream delta onto the PR-head feature line. No wholesale file replacement was used for shared overlay files. Preservation-list deletion audits were run before each `git rebase --continue` and once after the rebase completed.

Final preservation counts:

- `src/agents/agent-command.ts`: `runWithDiagnosticTraceparent` = 2
- `src/agents/command/attempt-execution.ts`: `runWithDiagnosticTraceparent` = 3
- `src/agents/command/attempt-execution.cli.test.ts`: inherited-traceparent test = 1
- `src/gateway/server-methods/agent.ts`: `senderIsOwner` refs = 2
- `src/gateway/server-methods/agent.ts`: `continuationTrigger` refs = 2
- `src/gateway/server-methods/agent.ts`: `sessionContinuationTraceparent` refs = 3

Receipts:

- `/tmp/wo-pr85651-driftcure-2026-05-27/gates/deletion-audit-0dff94dbe4.log`
- `/tmp/wo-pr85651-driftcure-2026-05-27/gates/deletion-audit-30cc1607e8.log`
- `/tmp/wo-pr85651-driftcure-2026-05-27/gates/deletion-audit-final.log`
- `/tmp/wo-pr85651-driftcure-2026-05-27/gates/deletion-audit-final-before-push.log`

## Conflict stop: `0dff94dbe4`

Commit: `feat(continuation): context-pressure-aware continuation (continue_work / continue_delegate / request_compaction)`

### `src/agents/command/attempt-execution.ts`

Preservation-list impact: yes. Conflict was the CLI-agent call body. Upstream had the current run parameters including `sessionEntry`; PR-head wrapped the call in `runWithDiagnosticTraceparent(params.opts.traceparent, ...)`. Resolution merged both: kept upstream call parameters and preserved the traceparent wrapper.

### `src/auto-reply/reply/agent-runner-execution.ts`

Preservation-list impact: indirect continuation feature surface. Conflict combined upstream timing/runtime/fallback changes with PR-head continuation result wrapping. Resolution kept upstream `agentTurnTiming`, CLI runtime resolution, profiler milestones, user-turn transcript recorder, blocked-liveness handling, and fallback/session reset behavior while preserving PR-head `ContinueWorkRequest`, `compactionTraceparent`, `releaseQueuedCompactionCompletion`, `resolveReplyRunFireReason`, `continueWorkOpts`, `requestCompactionOpts`, and wrapped fallback result unwrapping.

### `src/infra/session-cost-usage.ts`

Preservation-list impact: no. Upstream extracted `listUsageCountedTranscriptFileStats(...)`; PR-head had inline checkpoint filtering/dedup behavior. Resolution kept the upstream helper and extended it with an explicit `includeCheckpoints` option so daily totals exclude checkpoint twins while discovery can include and deduplicate them under the parent session.

### `src/tasks/task-flow-registry.store.sqlite.ts`

Preservation-list impact: no. Upstream introduced reusable `FLOW_RUNS_COLUMNS` and legacy table rebuild; PR-head added `chain_id` persistence. Resolution added `chain_id TEXT` to `FLOW_RUNS_COLUMNS`, kept the legacy rebuild, and kept the idempotent `ALTER TABLE`/index for existing registries.

### Other `0dff94dbe4` conflicts

Preservation-list impact: no. Resolved by merging upstream structural/test additions with PR-head continuation behavior:

- `scripts/crabbox-wrapper.mjs`: kept upstream sparse-sync logic and PR-head `--id` no-full-checkout guard.
- `test/scripts/crabbox-wrapper.test.ts`: kept upstream helper/`scriptContent` parsing while preserving PR-head tests.
- `src/agents/model-fallback.test.ts`: kept upstream cache/provider-order regression tests and PR-head default provider/model test body.
- `src/agents/openclaw-tools.ts`: kept upstream unified secrets runtime import, session tool config, transcripts tool gating, and shared update-plan helper.
- `src/agents/pi-embedded-runner/compact-reasons.ts` and `.test.ts`: merged upstream deferred-background and `already under target` support with PR-head closed reason union and continuation compaction reason tests.
- `src/agents/pi-embedded-runner/compact.types.ts`: kept upstream `deferOwningContextEngineCompaction` and PR-head `volitional` trigger.
- `src/agents/pi-embedded-runner/run.ts` and `run/failover-policy.ts`: kept both upstream harness transport timeout ownership and PR-head compaction failure context.
- `src/agents/session-write-lock.ts`: kept upstream `respectMaxHold` handling in both reclaim paths.
- `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`: kept `OpenClawConfig` type import and PR-head runtime snapshot setter.
- `src/auto-reply/reply/get-reply.ts`: kept upstream resolver timing and PR-head continuation timer/system-event cleanup for directive replies.
- `src/auto-reply/tokens.test.ts`: kept upstream trailing-token tests and PR-head leading-token section.
- `src/config/sessions/store-load.ts`: kept upstream cache serialization ownership fields.
- `src/flows/doctor-health-contributions.test.ts`: kept upstream structured-repairs ordering tests.

## Conflict stop: `30cc1607e8`

Commit: `restore(gateway-agent): isolation guards + delivery-plan-with-session-route (#782)`

### `src/gateway/server-methods/agent.ts`

Preservation-list impact: yes, file contains `senderIsOwner`, `continuationTrigger`, and `sessionContinuationTraceparent`. Conflict itself was not one of those semantics: upstream already had `type AgentSendSessionLifecycleTransition` near the top of the file, while the replayed commit tried to add the same type again before `emitAgentSendSessionLifecycleTransition`. Resolution kept the upstream type location, removed only the duplicate conflict block, and verified the session-route and preservation surfaces remained:

- `resolveAgentDeliveryPlanWithSessionRoute(...)` remains in use.
- `senderIsOwner` remains derived from `clientHasAdminScope(client)` and passed through ingress options.
- `continuationTrigger` remains in the request shape and dispatch payload.
- `sessionContinuationTraceparent` remains declared, assigned from session state, and threaded into inherited traceparent fallback.

## Dropped commit during rebase

`97a636588c2dc67227a3ae132452a229f9b2b2b1 test(gateway-agent): wire emitGatewaySession*PluginHook mocks (#782)` was dropped by Git because the patch contents were already upstream after resolving `30cc1607e8`.

## Post-rebase merge-fix commit

After the rebase completed, the gates found merge fallout that did not change the preservation-list contract:

- `src/agents/session-write-lock.ts`: restored upstream max-hold payload/inspection support so the `respectMaxHold` call sites preserved from upstream type-check and enforce the intended stale-lock policy.
- `src/auto-reply/tokens.test.ts`: restored the `stripSilentToken` import after preserving upstream trailing-token tests.
- `src/agents/pi-embedded-runner/run/failover-policy.ts`: merged PR-head compaction-failure `surface_error` behavior with upstream harness-owned timeout handling so harness-owned timeout rotation tests stay green.
- `src/auto-reply/reply/agent-runner-execution.ts`: kept compaction-failure recovery text on the preserved-session path when no reset happens, while preserving reset copy when reset succeeds.
- `scripts/crabbox-wrapper.mjs`: restored upstream full-checkout behavior for `--id` lease reuse; the earlier conflict resolution had incorrectly treated all `--id` runs as no-sync.
- `src/agents/pi-embedded-runner/run.cross-provider-fallback-error-context.test.ts`: aligned the timeout assertion with upstream timeout-payload synthesis while preserving the PR-head guarantee that stale prior-provider assistant text is not reused.
- `src/agents/pi-tools.workspace-paths.test.ts`: changed the symlink-parent write proof to use a non-memory day-file path, preserving the new memory/day-file overwrite guard semantics.

Focused receipts for these fixes are in `/tmp/wo-pr85651-driftcure-2026-05-27/gates/`:

- `focused-failover-policy.log`
- `focused-agent-runner-execution.log`
- `focused-crabbox-wrapper.log`
- `focused-cross-provider-fallback.log`
- `focused-pi-tools-workspace-paths.log`
- `focused-pi-tools-write-guard.log`

## Gate summary

Green gates:

- Gate 3a: `/tmp/wo-pr85651-driftcure-2026-05-27/gates/gate3a-install.log`
- Gate 3b: `/tmp/wo-pr85651-driftcure-2026-05-27/gates/gate3b-tsgo.log`
- Gate 3c: `/tmp/wo-pr85651-driftcure-2026-05-27/gates/gate3c-tsgo-test.log`
- Gate 3d: `/tmp/wo-pr85651-driftcure-2026-05-27/gates/gate3d-check.log`
- Gate 3f: `/tmp/wo-pr85651-driftcure-2026-05-27/gates/gate3f-build.log`
- Gate 3e: `/tmp/wo-pr85651-driftcure-2026-05-27/gates/gate3e-test.log`

Gate 3g:

- `gate3g-prepush-ci.fail1.log` and `gate3g-prepush-ci.log` both reached the full-extension shard and failed on Matrix/Slack/Codex tests in files byte-identical to the pinned target.
- `focused-matrix-staged-recovery.log` passed the first Matrix failure in isolation.
- `gate3g-full-extensions-rerun.log` passed the full-extension shard once.

Classification: Gate 3g remains a proof gap caused by upstream-class/flaky full-extension shard behavior, not by the branch diff.
