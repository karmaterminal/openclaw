# WO-1396 P89 top-up absorb of upstream 4d8c9bdd: BLOCKED (design fork)

Bound issue: karmaterminal/openclaw#1396. Status: **BLOCKED — awaiting 🌿 decision**. This is not READY_FOR_SCRIBE_REVIEW.

## Named refs

| category | ref | full SHA | local / tracking / server |
| --- | --- | --- | --- |
| product/base (accepted candidate) | `7b3815d7` | 7b3815d7f55ee68dd1322c6aec47efa3eabcda11 | n/a |
| lane branch | `codeagent/1396-p89-topup-4d8c9bdd` | 7b3815d7f55ee68dd1322c6aec47efa3eabcda11 | equal / equal / equal (unchanged) |
| pre-merge savegame | `savegame/p89-topup-pre-4d8c9bdd-20260929T060359Z` | 7b3815d7f55ee68dd1322c6aec47efa3eabcda11 | `ls-remote` verified |
| pinned upstream floor | `openclaw/openclaw@4d8c9bdd` | 4d8c9bddda7f992e293005b78f6bc1f8adea81ed | fetched |
| previous absorb | `e834097fb7` | e834097fb7e6baab4a397385dfb79d443b93996c | ancestor of both sides (merge base) |
| CI | Mode-B | N/A (not dispatched, per WO) | |
| presentation / composite / docs | read-only / N/A | untouched | |
| this evidence ref | `codeagent/1396-p89-topup-4d8c9bdd-output` | a child of 7b3815d7 carrying only this file. Never merge it. | |

## What happened

1. Published the lane branch unchanged; local, tracking and server all equal `7b3815d7`. Pushed and verified the savegame.
2. Envelope: `git merge-tree --write-tree --name-only 4d8c9bdd 7b3815d7` gives **115** conflicted files, the same as the dispatch count. The window is 996 commits.
3. Ran the real `git merge --no-ff --no-commit` (diff3). It produced 115 conflicts: 90 content, 21 modify/delete, 4 file-location.
4. **Stop condition.** The floor contains upstream `6652f7eac8d96ccc50b0da648cbbd8b556fcfb7b`, "refactor: remove Tasks and TaskFlow runtime (#159179)" (2026-09-27, 1613 files, +30k/-183k lines):
   - All of `src/tasks` is gone upstream: 263 files on the candidate, 0 at the floor.
   - Upstream removed the runtime, APIs, CLI, SDK and panels. Stored rows stay (`flow_runs` and `task_runs` remain in the schema), with legacy native import through Doctor.
   - The commit says "retained responsibilities use their existing owners". It names no replacement for general TaskFlow.
5. The continuation feature's durable custody is built on TaskFlow. After the merge:
   - 25 conflicts are TaskFlow/Tasks modify/delete or file-location.
   - 48 merged files outside `src/tasks` still import deleted `src/tasks` modules. Production importers are listed below.
   - The WO forbids blindly restoring a deleted host, and re-homing continuation custody onto a new owner is a feature re-architecture, not a bounded top-up.
6. Posted a TROUBLE to #sprites with options. Then ran `git merge --abort`. The merge is deterministic (same two SHAs) and can be replayed exactly once the frond decides. **Nothing past 7b3815d7 was committed or pushed.**

## Production continuation owners that import deleted TaskFlow/Tasks modules

- `src/auto-reply/continuation/work-store.ts`: task-flow-registry.types, task-flow-runtime-internal
- `src/auto-reply/continuation/delegate-flow-store.ts`: task-flow-continuation-state, task-flow-registry.types, task-flow-runtime-internal
- `src/auto-reply/continuation/work-replacement-store.ts`: task-flow-registry.types, task-flow-runtime-internal
- `src/auto-reply/continuation/session-reset.ts`: task-flow-continuation-state, task-flow-registry.types, task-flow-runtime-internal
- `src/auto-reply/continuation/delegate-attachment-payload-store.ts`: task-flow-registry.types (#1403 durable-custody design is also open here)
- `src/auto-reply/continuation/work-flow-state.ts`, `work-scheduling-batch.ts`, `work-scheduling-replacement.ts`, `delegate-flow-diagnostics.ts`, `types.ts`: task-flow-registry.types
- `src/agents/subagents/registry/subagent-registry-run-recovery.ts`: detached-task-runtime, task-backing-authority, task-backing-authority-write

Full importer list, tests included (48 files):

- `src/plugin-sdk/task-flow-test-runtime.ts`: task-flow-registry task-flow-registry.test-support 
- `src/plugins/runtime/runtime-taskflow.test.ts`: task-backing-authority.test-support task-executor task-flow-registry task-flow-registry.types task-registry task-registry.maintenance 
- `src/commands/flows.test.ts`: task-executor task-flow-continuation-state task-flow-registry task-flow-registry.types task-flow-runtime-internal task-registry task-registry.types task-runtime.test-helpers 
- `src/agents/subagent-registry-registration-rollback.test.ts`: detached-task-runtime 
- `src/agents/subagent-announce.continuation-fallback-task-row.test.ts`: task-registry-query task-runtime.test-helpers 
- `src/agents/embedded-agent-runner/run/attempt.cwd-split.test.ts`: task-registry.test-support task-runtime.test-helpers 
- `src/agents/subagent-announce.postcompaction-route.test.ts`: task-runtime.test-helpers 
- `src/agents/subagent-registry.archive.continuation.e2e.test.ts`: detached-task-runtime-contract task-runtime.test-helpers 
- `src/test-utils/task-registry-store.ts`: cron-history-retention task-backing-records task-cron-maintenance-policy task-execution-owner task-flow-registry.records task-flow-registry.store task-flow-registry.store.types task-flow-registry.types task-flow-runtime-internal task-initial-flow.rules task-initial-worker.types task-notification.operation task-registry-agent-event.operation task-registry-agent-event-target task-registry-create.operation task-registry-create-rules task-registry-parent-flow-rules task-registry-records task-registry-restore.worker task-registry-retention.operation task-registry-retention-receipt task-registry-retention-source task-registry.store task-registry.store.types task-registry-transition.kernel task-registry-transition.operation task-retention 
- `src/agents/command/attempt-execution.continue-work-token.test.ts`: task-flow-registry 
- `src/agents/subagent-registry.persistence.restore-recovery.test.ts`: detached-task-runtime.test-support task-registry-delivery.test-support task-registry.maintenance task-registry.test-support task-runtime.test-helpers 
- `src/auto-reply/reply/agent-runner.continuation-postcompaction-autocompaction.test.ts`: task-runtime.test-helpers 
- `src/agents/subagent-partial-registration-ownership.test.ts`: detached-task-runtime 
- `src/auto-reply/reply/agent-runner.continuation-chain-break-reset.test.ts`: task-flow-runtime-internal task-runtime.test-helpers 
- `src/auto-reply/continuation/delegate-flow-diagnostics.ts`: task-flow-registry.types 
- `src/auto-reply/continuation/types.ts`: task-flow-registry.types 
- `src/auto-reply/continuation/session-reset.ts`: task-flow-continuation-state task-flow-registry.types task-flow-runtime-internal 
- `src/agents/subagent-announce.live-tree-chain-proof.test.ts`: task-flow-registry task-flow-runtime-internal task-registry-query task-runtime.test-helpers 
- `src/auto-reply/continuation/work-terminal-notice.durability.test.ts`: task-flow-registry task-runtime.test-helpers 
- `src/auto-reply/continuation/delegate-store.ownership.test.ts`: task-flow-registry task-runtime.test-helpers 
- `src/auto-reply/continuation/work-scheduling-replacement.ts`: task-flow-registry.types 
- `src/auto-reply/continuation/work-flow-state.ts`: task-flow-registry.types 
- `src/auto-reply/continuation/delegate-store-consumption.test-harness.ts`: task-flow-registry 
- `src/agents/subagents/registry/subagent-registry.archive.test-support.ts`: detached-task-runtime-contract 
- `src/gateway/server.sessions.reset-continuation.test.ts`: task-flow-registry task-flow-registry.store.test-support task-runtime.test-helpers 
- `src/gateway/server.sessions.compaction.test.ts`: task-runtime.test-helpers 
- `src/agents/subagent-announce.self-continuation.test.ts`: task-flow-registry task-runtime.test-helpers 
- `src/agents/tools/media-generate-background-shared.trace-context.test.ts`: task-runtime.test-helpers 
- `src/agents/command/attempt-execution.continue-work-races.test.ts`: task-flow-registry task-flow-registry.types 
- `src/agents/subagent-announce.crosssession-gate.test.ts`: task-runtime.test-helpers 
- `src/agents/subagent-announce.chain-guard.test.ts`: task-runtime.test-helpers 
- `src/agents/subagents/registry/subagent-registry-run-recovery.ts`: detached-task-runtime task-backing-authority task-backing-authority-write 
- `src/agents/command/attempt-execution.continue-work-opts.test.ts`: task-flow-registry.types 
- `src/auto-reply/reply/session-reset-cleanup.test.ts`: task-flow-registry task-runtime.test-helpers 
- `src/auto-reply/reply/post-compaction-delegate-dispatch.ownership.test.ts`: task-flow-registry task-runtime.test-helpers 
- `src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts`: task-flow-runtime-internal 
- `src/auto-reply/reply/agent-runner.continuation-work-span.reservation.test.ts`: task-flow-runtime-internal task-runtime.test-helpers 
- `src/auto-reply/continuation/delegate-attachment-payload-store.test.ts`: task-flow-registry.types 
- `src/auto-reply/reply/session.test.ts`: task-flow-registry task-runtime.test-helpers 
- `src/auto-reply/continuation/work-store.ts`: task-flow-registry.types task-flow-runtime-internal 
- `src/auto-reply/continuation/work-replacement-store.ts`: task-flow-registry.types task-flow-runtime-internal 
- `src/auto-reply/reply/agent-runner.continuation-work-span.test.ts`: task-flow-runtime-internal task-runtime.test-helpers 
- `src/auto-reply/continuation/work-replacement-store.test.ts`: task-flow-registry task-runtime.test-helpers 
- `src/auto-reply/continuation/delegate-flow-store.ts`: task-flow-continuation-state task-flow-registry.types task-flow-runtime-internal 
- `src/auto-reply/continuation/delegate-attachment-payload-store.ts`: task-flow-registry.types 
- `src/auto-reply/continuation/work-store.test-support.ts`: task-flow-runtime-internal 
- `src/auto-reply/continuation/work-scheduling-batch.ts`: task-flow-registry.types 
- `src/gateway/server-runtime-subscriptions.task-terminals.test-harness.ts`: task-registry task-registry.store 

## Full conflict table at the real merge (count 115 = dispatch 115)

Format: `<conflict-marker count or D=modify/delete / file-location> <path>`. Kinds: 90 content / 21 modify-delete / 4 file-location. No resolution decisions were made; everything is blocked on the fork above.

```
2 config/assertion-safety-baseline.txt
1 docs/.generated/config-baseline.counts.json
1 docs/.generated/config-baseline.sha256
2 extensions/codex/src/app-server/run-attempt.dynamic-tools.test.ts
2 extensions/diagnostics-otel/src/service.test.ts
1 extensions/diagnostics-otel/src/service.ts
2 scripts/lib/ci-node-test-plan.mts
1 scripts/lib/tsgo-core-test-shards.mts
2 scripts/plugin-sdk-surface-report.mts
1 src/agents/bash-tools.notify-on-exit-ack.test.ts
1 src/agents/bash-tools.process.delivery.test.ts
4 src/agents/embedded-agent-runner/compact.hooks.test.ts
2 src/agents/embedded-agent-runner/run/attempt.cwd-split.test.ts
D src/agents/embedded-agent-subscribe.block-reply-rejections.test.ts
1 src/agents/embedded-agent-subscribe.handlers.compaction.test.ts
2 src/agents/embedded-agent-subscribe.handlers.lifecycle.test.ts
1 src/agents/embedded-agent-subscribe.handlers.lifecycle.ts
2 src/agents/embedded-agent-subscribe.handlers.messages.update-stream-phases.test.ts
1 src/agents/embedded-agent-subscribe.handlers.tools.test.ts
1 src/agents/embedded-agent-subscribe.run-state.ts
1 src/agents/subagents/announce/subagent-announce-delivery.test.ts
1 src/agents/subagents/announce/subagent-announce-delivery.ts
4 src/agents/subagents/announce/subagent-announce-descendant-wake.ts
9 src/agents/subagents/announce/subagent-announce.ts
1 src/agents/subagents/registry/subagent-control.late-registration.test-support.ts
3 src/agents/subagents/registry/subagent-registry.archive.e2e.test.ts
2 src/agents/subagents/registry/subagent-registry-lifecycle-announce-cleanup.ts
2 src/agents/subagents/registry/subagent-registry-lifecycle-delivery.ts
1 src/agents/subagents/registry/subagent-registry-lifecycle.test.ts
10 src/agents/subagents/registry/subagent-registry.persistence.resume.test.ts
11 src/agents/subagents/registry/subagent-registry.persistence.test.ts
1 src/agents/subagents/registry/subagent-registry-queries.ts
2 src/agents/subagents/registry/subagent-registry-queued-registration-claims.test-support.ts
1 src/agents/subagents/registry/subagent-registry-queued-registration.test.ts
3 src/agents/subagents/registry/subagent-registry-read.ts
1 src/agents/subagents/registry/subagent-registry-run-launch-record.ts
2 src/agents/subagents/registry/subagent-registry-run-launch.ts
1 src/agents/subagents/registry/subagent-registry-run-recovery.ts
8 src/agents/subagents/registry/subagent-registry-sweeper.ts
1 src/agents/subagents/registry/subagent-registry-sweep-kill.ts
2 src/agents/subagents/registry/subagent-registry.ts
1 src/agents/subagents/registry/subagent-session-cleanup.ts
3 src/agents/subagents/registry/subagent-session-reconciliation.ts
3 src/agents/subagents/spawn/subagent-attachments.ts
1 src/agents/subagents/spawn/subagent-spawn.authority.test.ts
1 src/agents/subagents/spawn/subagent-spawn.context-resources.test.ts
3 src/agents/subagents/spawn/subagent-spawn-session-patch.ts
1 src/agents/subagents/spawn/subagent-spawn.test.ts
5 src/agents/subagents/spawn/subagent-spawn.ts
D src/agents/task-flow-continuation-state.ts
D src/agents/task-flow-durable-obligation.ts
D src/agents/task-flow-registry-mutations.ts
D src/agents/task-flow-registry.records.test.ts
1 src/agents/tools/media-generate-background-shared.ts
1 src/agents/tools/sessions-send-tool.ts
1 src/auto-reply/get-reply-options.types.ts
1 src/auto-reply/reply/agent-runner-execute.ts
2 src/auto-reply/reply/agent-runner-result-payloads.ts
1 src/auto-reply/reply/agent-runner-run.ts
1 src/auto-reply/reply/block-reply-pipeline.ts
1 src/auto-reply/reply/commands-system-prompt.ts
5 src/auto-reply/reply/session-system-events.ts
D src/commands/flows.test.ts
1 src/commands/status.command-report-data.ts
1 src/config/config.agent-concurrency-defaults.test.ts
1 src/config/sessions/artifacts.ts
1 src/config/sessions/session-accessor.sqlite-entry.ts
1 src/config/sessions/session-sharing-store.native.ts
2 src/cron/isolated-agent/delivery-dispatch.double-announce.test.ts
2 src/gateway/agent-turn/agent-run-execution-phase.ts
1 src/gateway/config-reload.test.ts
1 src/gateway/server-maintenance.ts
1 src/gateway/server-methods/agent.sessions-and-models.test-utils.ts
1 src/gateway/server-methods/chat.directive-tags.test.ts
2 src/gateway/server-restart-sentinel-agent-delivery.ts
1 src/gateway/server-restart-sentinel.test.ts
4 src/gateway/server-restart-sentinel.ts
1 src/gateway/session-utils.queued-collector.test.ts
1 src/infra/diagnostic-trace-context.ts
D src/infra/heartbeat-runner.ghost-reminder.test.ts
1 src/infra/heartbeat-runner.isolated-session-mirror.test.ts
1 src/infra/heartbeat-runner.returns-default-unset.test.ts
1 src/infra/session-delivery-queue.records.ts
4 src/infra/session-delivery-queue-storage.ts
1 src/infra/session-delivery-queue.worker-contract.ts
1 src/infra/session-delivery-queue.worker.ts
1 src/infra/system-events.ts
D src/plugins/runtime/runtime-taskflow.test.ts
1 src/state/openclaw-agent-db-contract.ts
1 src/state/openclaw-agent-db-lifecycle.ts
1 src/state/openclaw-state-db-schema-additive.ts
2 src/status/status-message.ts
2 src/status/status-text.ts
D src/tasks/detached-task-lookup.worker.test.ts
D src/tasks/task-boundaries.test.ts
D src/tasks/task-flow-maintenance.worker.ts
D src/tasks/task-flow-registry.audit.test.ts
D src/tasks/task-flow-registry.maintenance.test.ts
D src/tasks/task-flow-registry.maintenance.ts
D src/tasks/task-flow-registry.records.ts
D src/tasks/task-flow-registry.store.kernel.ts
D src/tasks/task-flow-registry.store.sqlite.ts
D src/tasks/task-flow-registry.store.test.ts
D src/tasks/task-flow-registry.store.ts
D src/tasks/task-flow-registry.store.types.ts
D src/tasks/task-flow-registry.test.ts
D src/tasks/task-flow-registry.ts
D src/tasks/task-flow-registry.types.ts
D src/tasks/task-flow-runtime-internal.ts
D src/test-utils/task-registry-store.ts
3 src/tui/tui-pty-local.e2e.test.ts
1 test/scripts/ci-node-test-plan.test.ts
1 test/scripts/test-projects.test.ts
1 test/vitest/vitest.database-worker-core-paths.mjs
1 tsdown.config.ts
```

The 4 file-location conflicts are our added `src/tasks/{task-flow-continuation-state,task-flow-durable-obligation,task-flow-registry-mutations}.ts` and `task-flow-registry.records.test.ts`. git guessed a directory rename to `src/agents/`. That guess is wrong: upstream deleted the directory.

## Options put to 🌿

- **A (recommended now): re-floor at `44f67c2a7d3b1752de4d8998fcc85cab1afbc756` (= `6652f7eac8^1`).**
  - That is 90 of the 996 window commits.
  - `git merge-tree --write-tree --name-only 44f67c2a7d 7b3815d7` gives **4** conflicted files.
  - Bounded, and fits this lane's procedure unchanged.
- **B: separate design lane.** Re-home continuation durable custody off TaskFlow, either onto the retained `flow_runs` rows through a continuation-owned store or onto a new owner. Then absorb from `6652f7eac8` forward.
  - This also has to cover subagent run-recovery's task-backing authority, which upstream moved to "existing owners" in #158221/#158217/#158225/#158222/#158702/#158776.
  - It is the only route to presenting against current upstream.
- **C: carry TaskFlow as fork substrate.** This contradicts upstream's direction and the WO's no-blind-restore rule, and would re-add about 68k lines to the presentation diff. Not recommended.

## Gates

Gates 2 / 2.5 / 2.7 / 2.8, the worker-bundle table, and focused/static/lint receipts: **not run**. There is no merge head to measure. Every gate is blocked on the decision above.

## Changed-file envelope vs the floor

None. The lane branch is unchanged at 7b3815d7 and there is no root detritus: this file lives only on the separate `-output` evidence ref.

## Residual risks and notes

- Upstream `main` keeps moving past 4d8c9bdd. Per the WO the floor is frozen; the re-floor under A is a strictly older SHA.
- The 905 post-removal commits (`6652f7eac8..4d8c9bdd`) are not scanned for fixes to our filed defects. That Gate 2.8 scan should run in whichever lane absorbs them.
- The ronan copilot CLI is broken (node v25.7.0 missing, per the channel). This lane ran as Claude.

## Exact commands

```
git merge-tree --write-tree --name-only 4d8c9bddda7f992e293005b78f6bc1f8adea81ed 7b3815d7f55ee68dd1322c6aec47efa3eabcda11   # 115
git -c merge.conflictStyle=diff3 merge --no-ff --no-commit 4d8c9bddda7f992e293005b78f6bc1f8adea81ed                     # 115: 90/21/4; then --abort
git show -s 6652f7eac8                                                                                                     # the TaskFlow removal
git merge-tree --write-tree --name-only 44f67c2a7d3b1752de4d8998fcc85cab1afbc756 7b3815d7f55ee68dd1322c6aec47efa3eabcda11   # 4
```
