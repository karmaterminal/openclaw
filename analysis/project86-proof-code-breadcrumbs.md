# Project 86 proof-code breadcrumbs

Bound to OpenClaw assembly `b134a64a44351bcbce2d086da4ac30a596c01699`, docs catalog `abe1f9f0749d849b01da4e5d354c205ecffac946`, and reference corpus `4c235d8c1997e8964160117f8d6bf650ad1e8203`.

> Triage aid only: these breadcrumbs identify likely source ownership and blast radius. They do not replace live proof, authoritative receipts, or candidate-SHA review.

## How to use this catalog

1. Start with the failed receipt name under the row, then open the listed symbols in order.
2. Diff the bound assembly against the final candidate before assuming the breadcrumb still owns the behavior.
3. Apply the row's halt scope: stop only that family unless the regression-trap row or shared configuration proves a wider defect.
4. Treat missing telemetry as an observability failure unless behavior receipts independently prove a runtime failure.

## Canonical shared state and defaults

Continuation TaskFlow and return-delivery state live in `state/openclaw.sqlite` (`flow_runs` and `delivery_queue_entries`). Process timers are hedges, not authority. Session chain identity is `continuationChainCount`, `continuationChainStartedAt`, `continuationChainTokens`, `continuationChainId`.

| Key | Assembly default |
| --- | --- |
| `agents.defaults.continuation.enabled` | `false` |
| `agents.defaults.continuation.defaultDelayMs` | `15000` |
| `agents.defaults.continuation.minDelayMs` | `5000` |
| `agents.defaults.continuation.maxDelayMs` | `300000` |
| `agents.defaults.continuation.maxChainLength` | `10` |
| `agents.defaults.continuation.costCapTokens` | `500000` |
| `agents.defaults.continuation.maxDelegatesPerTurn` | `5` |
| `agents.defaults.continuation.maxPendingWork` | `32` |
| `agents.defaults.continuation.earlyWarningBand` | `0.3125` |
| `agents.defaults.continuation.crossSessionTargeting` | `"disabled"` |
| `agents.defaults.continuation.busySkipBackoff.baseMs` | `1000` |
| `agents.defaults.continuation.busySkipBackoff.factor` | `2` |
| `agents.defaults.continuation.busySkipBackoff.ceilingMs` | `"inherits maxDelayMs (300000 by default)"` |
| `tools.sessions_spawn.attachments.enabled` | `false` |

## Shared blast-radius families

| Family | Rows |
| --- | --- |
| delegate | `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN` |
| work | `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN` |
| model | `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL` |
| targeting | `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-RETURN-OVERLAP`, `R-CONFIG-INTERSESSION` |
| compaction | `R-CD-3`, `R-RC-1`, `R-RC-2`, `R-OBS-STATUS` |
| trace | `R-CD-TOKEN`, `R-CW-3`, `R-CW-7`, `R-OBS-2`, `R-TRACE-REDACTION-1121` |
| persistence | `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-RETURN-OVERLAP`, `R-CW-1`, `R-CW-2`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION` |
| observability | `R-OBS-1`, `R-OBS-2`, `R-OBS-STATUS`, `R-TRACE-REDACTION-1121` |

## Shared ownership surfaces

### `tool-registration`

Gate and register the typed continuation tools for an agent run.

**Symbols:** `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools`

**Tests:** `src/agents/openclaw-tools.continuation-registration.test.ts`, `src/agents/openclaw-tools.continuation-misconfig-warn.test.ts`, `src/agents/tools-effective-inventory.runtime-and-policy.test.ts`

### `delegate-input`

Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission.

**Symbols:** `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`

**Tests:** `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`

### `delegate-durable-dispatch`

Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child.

**Symbols:** `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`

**Tests:** `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`

### `delegate-return`

Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake.

**Symbols:** `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`

**Tests:** `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`

### `delegate-chain`

Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops.

**Symbols:** `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`

**Tests:** `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`

### `token-parser`

Parse and strip the final winning CONTINUE_WORK or CONTINUE_DELEGATE bracket signal without exposing hidden trace state.

**Symbols:** `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt`

**Tests:** `src/auto-reply/continuation/rfc-contract.scenario.test.ts`, `src/agents/command/attempt-execution.continue-work-token.test.ts`

### `model-routing`

Resolve explicit or inherited provider/model selection and persist the authoritative child session metadata used by proof receipts.

**Symbols:** `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`

**Tests:** `src/agents/model-selection.test.ts`, `src/agents/subagent-spawn.model-session.test.ts`, `src/agents/subagent-spawn.test.ts`

### `post-compaction`

Stage post-compaction delegates durably and release them only after a confirmed compaction boundary.

**Symbols:** `src/auto-reply/continuation/delegate-store.ts::stagePostCompactionDelegate`, `src/auto-reply/continuation/post-compaction-release.ts::releasePostCompactionLifecycle`, `src/auto-reply/continuation/post-compaction-staged-dispatch.ts::dispatchStagedPostCompactionDelegates`, `src/infra/session-delivery-queue-storage.ts::enqueuePostCompactionDelegateDelivery`, `src/infra/continuation-tracer.ts::emitContinuationCompactionReleasedSpan`

**Tests:** `src/auto-reply/continuation/post-compaction-release.test.ts`, `src/auto-reply/continuation/post-compaction-durable-handoff.test.ts`, `src/infra/continuation-tracer.queue-and-compaction.test.ts`

### `work-scheduling`

Capture each continue_work election and create one durable same-session wake with bounded delay.

**Symbols:** `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`

**Tests:** `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`

### `work-execution`

Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once.

**Symbols:** `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`

**Tests:** `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`

### `startup-recovery`

Recover durable delegate and work rows on gateway startup, with delegate recovery ordered first.

**Symbols:** `src/gateway/server-runtime-services.ts::recoverPendingContinuations`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/auto-reply/continuation/work-dispatch.ts::recoverPendingContinuationWork`

**Tests:** `src/gateway/server-runtime-services.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`

### `runtime-config`

Define, validate, and resolve the canonical continuation configuration and defaults.

**Symbols:** `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig`, `src/auto-reply/continuation/config.ts::resolveLiveContinuationRuntimeConfig`

**Tests:** `src/config/zod-schema.continuation.test.ts`, `src/auto-reply/continuation/config.test.ts`

### `request-compaction`

Apply the 70% context guard, per-session cooldown, in-flight dedupe, and asynchronous compaction request lifecycle.

**Symbols:** `src/agents/tools/request-compaction-tool.ts::createRequestCompactionTool`, `src/agents/tools/request-compaction-tool.ts::getVolitionalCompactionCount`, `src/agents/command/attempt-execution.ts::requestCompactionOpts`

**Tests:** `src/agents/tools/request-compaction-tool.test.ts`, `src/agents/tools/request-compaction-tool.volitional-threading.test.ts`, `src/agents/command/attempt-execution.request-compaction-opts.test.ts`

### `observability`

Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Symbols:** `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Tests:** `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`

## Row index

| Row | Scenario | Reference state | Halt scope |
| --- | --- | --- | --- |
| [R-CD-1](#r-cd-1) | `r-cd-1-typed-delegate` | partial | continue-delegate-family |
| [R-CD-2](#r-cd-2) | `r-cd-2-silent-wake` | partial | continue-delegate-family |
| [R-CD-3](#r-cd-3) | `r-cd-3-post-compaction` | partial | request-compaction-family |
| [R-CD-4](#r-cd-4) | `r-cd-4-target-session-key` | partial | targeting-and-collection-family |
| [R-CD-CHAINED-DEPTH-2](#r-cd-chained-depth-2) | `r-cd-chained-depth-2` | partial | targeting-and-collection-family |
| [R-CD-COLLECTION-ON-COLLAPSE](#r-cd-collection-on-collapse) | `static-corpus-row-validator` | partial | targeting-and-collection-family |
| [R-CD-MODEL-CHAINED-ALT](#r-cd-model-chained-alt) | `r-cd-model-chained-alt` | partial | model-routing-family |
| [R-CD-MODEL-DEFAULT](#r-cd-model-default) | `r-cd-model-default` | partial | model-routing-family |
| [R-CD-MODEL-TOKEN](#r-cd-model-token) | `r-cd-model-token` | partial | model-routing-family |
| [R-CD-MODEL-TOOL](#r-cd-model-tool) | `r-cd-model-tool` | partial | model-routing-family |
| [R-CD-RETURN-OVERLAP](#r-cd-return-overlap) | `r-cd-return-overlap` | partial | targeting-and-collection-family |
| [R-CD-SILENT](#r-cd-silent) | `r-cd-silent` | partial | continue-delegate-family |
| [R-CD-TOKEN](#r-cd-token) | `r-cd-token-bracket-delegate` | partial | continue-delegate-family |
| [R-CONFIG-DEFAULTS](#r-config-defaults) | `r-config-defaults` | partial | all-continuation-proofs |
| [R-CONFIG-INTERSESSION](#r-config-intersession) | `r-config-intersession` | partial | targeting-and-collection-family |
| [R-CW-1](#r-cw-1) | `r-cw-1-tool-schedule-wake` | partial | continue-work-family |
| [R-CW-2](#r-cw-2) | `r-cw-2-immediate-wake` | partial | continue-work-family |
| [R-CW-3](#r-cw-3) | `r-cw-3-reason-telemetry` | partial | continue-work-family |
| [R-CW-4](#r-cw-4) | `r-cw-4-chain-depth` | partial | continue-work-family |
| [R-CW-5](#r-cw-5) | `r-cw-5-cost-cap-reject` | pass | continue-work-family |
| [R-CW-6](#r-cw-6) | `r-cw-6-max-chain-length` | pass | continue-work-family |
| [R-CW-7](#r-cw-7) | `static-corpus-row-validator` | partial | continue-work-family |
| [R-CW-DELEGATE-CHILD-LIVE](#r-cw-delegate-child-live) | `static-corpus-row-validator` | partial | continue-work-family |
| [R-CW-DELEGATE-SELF-CONTINUATION](#r-cw-delegate-self-continuation) | `r-cw-delegate-self-continuation` | partial | continue-work-family |
| [R-CW-DELEGATE-TOKEN](#r-cw-delegate-token) | `static-corpus-row-validator` | partial | continue-work-family |
| [R-CW-MULTI](#r-cw-multi) | `static-corpus-row-validator` | partial | continue-work-family |
| [R-CW-MULTI-COLLAPSE](#r-cw-multi-collapse) | `static-corpus-row-validator` | partial | continue-work-family |
| [R-CW-TOKEN](#r-cw-token) | `r-cw-token-bracket` | partial | continue-work-family |
| [R-OBS-1](#r-obs-1) | `r-obs-1` | fail | observability-family |
| [R-OBS-2](#r-obs-2) | `r-obs-2` | partial | observability-family |
| [R-OBS-STATUS](#r-obs-status) | `r-obs-status` | partial | observability-family |
| [R-RC-1](#r-rc-1) | `r-rc-1-threshold-reject` | partial | request-compaction-family |
| [R-RC-2](#r-rc-2) | `r-rc-2-delegate-request-compaction` | partial | request-compaction-family |
| [R-REGRESSION-TRAP-TESTS](#r-regression-trap-tests) | `r-regression-trap-tests` | partial | all-proofs |
| [R-TRACE-REDACTION-1121](#r-trace-redaction-1121) | `r-trace-redaction-1121` | partial | observability-family |

## Row breadcrumbs

### R-CD-1

**Scenario:** `r-cd-1-typed-delegate` via `tools/k6-proofs/manifests/r-cd-1.json` (typed-tool; reference state: **partial**).

**Behavior contract:** Typed continue_delegate() schedule/spawn/return. Fires a delegate with a nonce-only child task, observes task ledger entry and parent return.

**Primary production symbols:** `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools`, `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `delegate TaskFlow row`, `child session key/run id`, `durable recipient delivery`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `tools.sessions_spawn.attachments.enabled` = `false`.

**Continuation lifecycle/tool surfaces:** tool-registration: Gate and register the typed continuation tools for an agent run. delegate-input: Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`.

**Owner/regression tests:** `src/agents/openclaw-tools.continuation-registration.test.ts`, `src/agents/openclaw-tools.continuation-misconfig-warn.test.ts`, `src/agents/tools-effective-inventory.runtime-and-policy.test.ts`, `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `tool-invoke-accepted` — sessions.send dispatch accepted (agent turn triggered for continue_delegate) | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `task-ledger-entry` — Optional context only: generic task ledger row with nonce correlation (may be absent for continue_delegate) | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-session-key` — Child session key or run ID from task metadata | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `delegate-scheduled-sentinel` — Post-dispatch CD1-DELEGATE-SCHEDULED sentinel emitted after continue_delegate tool result reports scheduled | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `parent-return-event` — Post-dispatch CD1-DONE or delegate.return evidence observed on parent session | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `trace-id` — Trace ID from tool response or task metadata for Tempo fetch | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN`, `R-CW-1`, `R-CW-2`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`. **Halt:** `continue-delegate-family` — A defect in typed admission, TaskFlow dispatch, child spawn, or terminal return affects the delegate family.

**Future-candidate triage commands:**

```bash
git grep -n -E 'createOpenClawContinuationTools' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/openclaw-tools.continuation.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts src/agents/openclaw-tools.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'createOpenClawContinuationTools' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/openclaw-tools.continuation-registration.test.ts src/agents/openclaw-tools.continuation-misconfig-warn.test.ts
```

### R-CD-2

**Scenario:** `r-cd-2-silent-wake` via `tools/k6-proofs/manifests/r-cd-2.json` (typed-tool; reference state: **partial**).

**Behavior contract:** continue_delegate(mode='silent-wake') full path. Fires a delegate that returns silently and triggers a fresh parent turn without channel output.

**Primary production symbols:** `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools`, `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `delegate.mode=silent-wake`, `silentAnnounce`, `wakeOnReturn`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `tools.sessions_spawn.attachments.enabled` = `false`.

**Continuation lifecycle/tool surfaces:** tool-registration: Gate and register the typed continuation tools for an agent run. delegate-input: Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys. Suppress child channel announcement, enqueue trusted return, then request a heartbeat wake for the parent.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/agents/openclaw-tools.continuation-registration.test.ts`, `src/agents/openclaw-tools.continuation-misconfig-warn.test.ts`, `src/agents/tools-effective-inventory.runtime-and-policy.test.ts`, `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `send-run-lifecycle` — Accepted sessions.send run/turn ID is bound to same-run terminal success and same-run parent wake; generic delayed messages cannot satisfy it | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `task-ledger-entry` — Optional extra context from the generic TaskFlow task ledger; continue_delegate does not reliably write here | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-session-key` — Child session key from task metadata | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `typed-delegate-topology` — One continue_delegate silent-wake tool execution plus continuation.delegate.dispatch/fire spans share one non-zero trace and chain | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `tempo-trace-json` — Public-safe Tempo trace projection that carries the same authoritative trace and chain binding as the accepted send lifecycle | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `no-channel-delivery` — Delegate return does NOT produce a channel message (silent mode verified) | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `row-scoped-authoritative-receipt` — Validated public-safe R-CD-2 receipt is the sole authority for candidate verdict surfaces | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |

**Blast radius:** `R-CD-1`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN`, `R-CW-1`, `R-CW-2`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`. **Halt:** `continue-delegate-family` — A defect in typed admission, TaskFlow dispatch, child spawn, or terminal return affects the delegate family.

**Future-candidate triage commands:**

```bash
git grep -n -E 'createOpenClawContinuationTools' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/openclaw-tools.continuation.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts src/agents/openclaw-tools.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'createOpenClawContinuationTools' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/openclaw-tools.continuation-registration.test.ts src/agents/openclaw-tools.continuation-misconfig-warn.test.ts
```

### R-CD-3

**Scenario:** `r-cd-3-post-compaction` via `tools/k6-proofs/manifests/r-cd-3.json` (typed-tool; reference state: **partial**).

**Behavior contract:** Stage continue_delegate(mode=post-compaction), then call request_compaction. PASS requires the post-compaction lifeboat return; a structured below-threshold refusal remains PARTIAL.

**Primary production symbols:** `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`, `src/auto-reply/continuation/delegate-store.ts::stagePostCompactionDelegate`, `src/auto-reply/continuation/post-compaction-release.ts::releasePostCompactionLifecycle`, `src/auto-reply/continuation/post-compaction-staged-dispatch.ts::dispatchStagedPostCompactionDelegates`, `src/infra/session-delivery-queue-storage.ts::enqueuePostCompactionDelegateDelivery`, `src/infra/continuation-tracer.ts::emitContinuationCompactionReleasedSpan`, `src/agents/tools/request-compaction-tool.ts::createRequestCompactionTool`, `src/agents/tools/request-compaction-tool.ts::getVolitionalCompactionCount`, `src/agents/command/attempt-execution.ts::requestCompactionOpts`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `agent turn` → `createRequestCompactionTool.execute` → `context guard and per-session coordinator` → `triggerCompaction lane` → `confirmed autoCompactionCount` → `dispatchPostCompactionDelegates`.

**Durable state/session identity:** `staged post-compaction delegate`, `source flow revision`, `compaction counter`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `tools.sessions_spawn.attachments.enabled` = `false`.

**Continuation lifecycle/tool surfaces:** delegate-input: Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission. post-compaction: Stage post-compaction delegates durably and release them only after a confirmed compaction boundary. request-compaction: Apply the 70% context guard, per-session cooldown, in-flight dedupe, and asynchronous compaction request lifecycle. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `continuation.compaction.released span`, `[system:compaction-failed] trusted event`, `volitional compaction count`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`, `src/auto-reply/continuation/post-compaction-release.test.ts`, `src/auto-reply/continuation/post-compaction-durable-handoff.test.ts`, `src/infra/continuation-tracer.queue-and-compaction.test.ts`, `src/agents/tools/request-compaction-tool.test.ts`, `src/agents/tools/request-compaction-tool.volitional-threading.test.ts`, `src/agents/command/attempt-execution.request-compaction-opts.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `dispatch-accepted` — Gateway accepted the sessions.send proof turn | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `delegate-staging-requested` — Agent was instructed to stage continue_delegate(mode=post-compaction) | `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments` |
| `compaction-requested` — Agent was instructed to call request_compaction after staging the delegate | `src/agents/tools/request-compaction-tool.ts::createRequestCompactionTool`, `src/agents/tools/request-compaction-tool.ts::getVolitionalCompactionCount`, `src/agents/command/attempt-execution.ts::requestCompactionOpts` |
| `threshold-refusal-or-lifeboat` — Either structured below-threshold request_compaction refusal is observed, or post-compaction lifeboat return is observed | `src/agents/tools/request-compaction-tool.ts::createRequestCompactionTool`, `src/agents/tools/request-compaction-tool.ts::getVolitionalCompactionCount`, `src/agents/command/attempt-execution.ts::requestCompactionOpts` |
| `trace-id` — Trace ID for gateway/session dispatch correlation when available | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN`, `R-RC-1`, `R-RC-2`, `R-OBS-STATUS`, `R-CW-1`, `R-CW-2`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`. **Halt:** `request-compaction-family` — Stop request-compaction and post-compaction release rows; ordinary work/delegate rows remain independently triageable.

**Future-candidate triage commands:**

```bash
git grep -n -E 'ContinueDelegateToolSchema' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'ContinueDelegateToolSchema' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-delegate-tool.test.ts src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts
```

### R-CD-4

**Scenario:** `r-cd-4-target-session-key` via `tools/k6-proofs/manifests/r-cd-4.json` (typed-tool; reference state: **partial**).

**Behavior contract:** continue_delegate with targetSessionKey: delegate return lands in a SPECIFIED target session, not the dispatching session. Cross-session targeted delivery.

**Primary production symbols:** `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `targetSessionKey`, `expected recipient session id`, `recipient-key delivery id`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `tools.sessions_spawn.attachments.enabled` = `false`.

**Continuation lifecycle/tool surfaces:** delegate-input: Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `parent-session-created` — Disposable parent session was created via sessions.create when disposable mode is enabled | `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments` |
| `target-session-created` — Disposable target session was created via sessions.create when disposable mode is enabled | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `dispatch-accepted` — Gateway accepted the dispatching sessions.send request that asks the agent to call continue_delegate with targetSessionKey | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `target-return-event` — The TARGET session receives the exact TARGET-RECEIVED {{nonce}} marker in a structured role=system session.message event | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `child-session-identity` — A structured spawn/task record binds the child session key to the same row nonce | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `no-parent-return` — Dispatching parent session does NOT receive the delayed return/wake | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `task-ledger-entry` — Optional context only; continue_delegate may not appear in generic TaskFlow task ledger | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `trace-id` — Trace ID for Tempo correlation when emitted | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN`, `R-CONFIG-INTERSESSION`. **Halt:** `targeting-and-collection-family` — Stop cross-session, fanout, collapse-collection, and overlap rows; same-session work can continue.

**Future-candidate triage commands:**

```bash
git grep -n -E 'ContinueDelegateToolSchema' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'ContinueDelegateToolSchema' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-delegate-tool.test.ts src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts
```

### R-CD-CHAINED-DEPTH-2

**Scenario:** `r-cd-chained-depth-2` via `tools/k6-proofs/manifests/r-cd-chained-depth-2.json` (typed-tool; reference state: **partial**).

**Behavior contract:** Depth-2 delegate chain: parent→child→grandchild→return path. Three sub-tests: (1) up-tree silent-wake, (2) inter-session return, (3) echo+broadcast via fanoutMode.

**Primary production symbols:** `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `chain hop 1 and hop 2`, `shared continuationChainId`, `target/fanout return set`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `tools.sessions_spawn.attachments.enabled` = `false`.

**Continuation lifecycle/tool surfaces:** delegate-input: Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `parent-dispatch-accepted` — Parent fires continue_delegate → accepted | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-spawns` — Post-dispatch, non-harness session event contains strict CHILD-DONE {{nonce}} CHILD-DELEGATE-SCHEDULED sentinel | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-fires-grandchild` — CHILD-DONE sentinel confirms depth-1 delegate executed the nested continue_delegate instruction | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `grandchild-spawns` — Post-dispatch, non-harness session event contains strict GRANDCHILD-DONE sentinel | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `grandchild-returns` — A nonce-bound grandchild identity and exact GRANDCHILD-DONE sentinel are observed after dispatch acceptance | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `parent-receives-chain-return` — The exact root session receives GRANDCHILD-DONE {{nonce}} as a structured role=system return event, bound to distinct child and grandchild identities | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `trace-id` — Trace ID for chain visualization in Tempo | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN`, `R-CONFIG-INTERSESSION`. **Halt:** `targeting-and-collection-family` — Stop cross-session, fanout, collapse-collection, and overlap rows; same-session work can continue.

**Future-candidate triage commands:**

```bash
git grep -n -E 'ContinueDelegateToolSchema' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'ContinueDelegateToolSchema' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-delegate-tool.test.ts src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts
```

### R-CD-COLLECTION-ON-COLLAPSE

**Scenario:** `static-corpus-row-validator` via `tools/k6-proofs/manifests/r-cd-collection-on-collapse.json` (read-only; reference state: **partial**).

**Behavior contract:** Static validator for committed A→B→delayed-C collection-on-collapse proof receipts.

**Primary production symbols:** `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `explicit root target`, `durable recipient-key delivery id`, `late-announcement active-session guard`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`.

**Continuation lifecycle/tool surfaces:** delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake. C returns directly to the still-active root target even after intermediate B is finalized; cleaned recipients are filtered only after the complete target set is resolved.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`.

**Owner/regression tests:** `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `collection-collapse-artifacts` — Current PROOFS corpus receipts parse for this row. | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `root-collection-after-intermediate-finalized` — Committed evidence satisfies the row-specific PASS predicate. | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN`, `R-CONFIG-INTERSESSION`, `R-CW-1`, `R-CW-2`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`. **Halt:** `targeting-and-collection-family` — Stop cross-session, fanout, collapse-collection, and overlap rows; same-session work can continue.

**Future-candidate triage commands:**

```bash
git grep -n -E 'delegateFlowRecords' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/auto-reply/continuation/delegate-flow-store.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/delegate-flow-store.ts src/auto-reply/continuation/delegate-dispatch.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'delegateFlowRecords' "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/delegate-flow-store.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/auto-reply/continuation/delegate-dispatch.test.ts src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts
```

### R-CD-MODEL-CHAINED-ALT

**Scenario:** `r-cd-model-chained-alt` via `tools/k6-proofs/manifests/r-cd-model-chained-alt.json` (typed-tool; reference state: **partial**).

**Behavior contract:** Depth-1 delegate schedules a depth-2 continue_delegate with explicit alternate model; depth-2 reports observed model/provider.

**Primary production symbols:** `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `depth-2 model override`, `child provider/model session metadata`, `chain hop identity`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `tools.sessions_spawn.attachments.enabled` = `false`.

**Continuation lifecycle/tool surfaces:** delegate-input: Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. model-routing: Resolve explicit or inherited provider/model selection and persist the authoritative child session metadata used by proof receipts. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`.

**Owner/regression tests:** `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/agents/model-selection.test.ts`, `src/agents/subagent-spawn.model-session.test.ts`, `src/agents/subagent-spawn.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `dispatch-accepted` — Gateway accepted the parent request that asks the agent to call continue_delegate for this model row | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-session-observed` — A nonce-correlated delegate child session/run is observed on the subscribed session stream or session history | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-model-byte` — Observed child runtime model/provider byte from status/session metadata or child self-report backed by session metadata | `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan` |
| `return-payload` — Delegate return includes the row nonce and observed model/provider summary | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `trace-or-session-correlation` — Trace id, span tree, or session-event correlation tying dispatch to child and return | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `depth-1-child-observed` — Depth-1 delegate session/run observed | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `depth-2-child-observed` — Depth-2 delegate session/run observed | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `depth-2-model-byte` — Depth-2 child reports/records the requested alternate provider/model | `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan` |
| `depth-1-scheduled-inner` — Depth-1 child emitted sentinel after scheduling the depth-2 delegate with explicit model override | `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN`. **Halt:** `model-routing-family` — Stop the four model rows; other delegate behavior may continue if spawn/return is intact.

**Future-candidate triage commands:**

```bash
git grep -n -E 'ContinueDelegateToolSchema' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'ContinueDelegateToolSchema' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-delegate-tool.test.ts src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts
```

### R-CD-MODEL-DEFAULT

**Scenario:** `r-cd-model-default` via `tools/k6-proofs/manifests/r-cd-model-default.json` (mixed; reference state: **partial**).

**Behavior contract:** Default provider/model inheritance for continue_delegate tool and bracket/token forms when no override is supplied.

**Primary production symbols:** `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`, `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `omitted model override`, `agent/default provider-model`, `child provider/model metadata`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `tools.sessions_spawn.attachments.enabled` = `false`.

**Continuation lifecycle/tool surfaces:** delegate-input: Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission. token-parser: Parse and strip the final winning CONTINUE_WORK or CONTINUE_DELEGATE bracket signal without exposing hidden trace state. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. model-routing: Resolve explicit or inherited provider/model selection and persist the authoritative child session metadata used by proof receipts.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`.

**Owner/regression tests:** `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`, `src/auto-reply/continuation/rfc-contract.scenario.test.ts`, `src/agents/command/attempt-execution.continue-work-token.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/model-selection.test.ts`, `src/agents/subagent-spawn.model-session.test.ts`, `src/agents/subagent-spawn.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `dispatch-accepted` — Gateway accepted the parent request that asks the agent to call continue_delegate for this model row | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-session-observed` — A nonce-correlated delegate child session/run is observed on the subscribed session stream or session history | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-model-byte` — Observed child runtime model/provider byte from status/session metadata or child self-report backed by session metadata | `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan` |
| `return-payload` — Delegate return includes the row nonce and observed model/provider summary | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `trace-or-session-correlation` — Trace id, span tree, or session-event correlation tying dispatch to child and return | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `parent-model-byte` — Parent/provider model byte used as the inheritance baseline | `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN`. **Halt:** `model-routing-family` — Stop the four model rows; other delegate behavior may continue if spawn/return is intact.

**Future-candidate triage commands:**

```bash
git grep -n -E 'ContinueDelegateToolSchema' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'ContinueDelegateToolSchema' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-delegate-tool.test.ts src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts
```

### R-CD-MODEL-TOKEN

**Scenario:** `r-cd-model-token` via `tools/k6-proofs/manifests/r-cd-model-token.json` (bracket-token; reference state: **partial**).

**Behavior contract:** continue_delegate bracket/token form parses and forwards model=<provider/model> to the delegate child.

**Primary production symbols:** `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `parsed model modifier`, `child provider/model session metadata`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`.

**Continuation lifecycle/tool surfaces:** token-parser: Parse and strip the final winning CONTINUE_WORK or CONTINUE_DELEGATE bracket signal without exposing hidden trace state. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. model-routing: Resolve explicit or inherited provider/model selection and persist the authoritative child session metadata used by proof receipts.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`.

**Owner/regression tests:** `src/auto-reply/continuation/rfc-contract.scenario.test.ts`, `src/agents/command/attempt-execution.continue-work-token.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/model-selection.test.ts`, `src/agents/subagent-spawn.model-session.test.ts`, `src/agents/subagent-spawn.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `dispatch-accepted` — Gateway accepted the parent request that asks the agent to call continue_delegate for this model row | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-session-observed` — A nonce-correlated delegate child session/run is observed on the subscribed session stream or session history | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-model-byte` — Observed child runtime model/provider byte from status/session metadata or child self-report backed by session metadata | `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan` |
| `return-payload` — Delegate return includes the row nonce and observed model/provider summary | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `trace-or-session-correlation` — Trace id, span tree, or session-event correlation tying dispatch to child and return | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `bracket-parse-origin` — Journal/session evidence that the delegate originated from bracket-token parsing with model modifier present | `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt` |
| `bracket-model-modifier` — Observed terminal bracket included model=<requested> modifier before scan/strip | `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN`. **Halt:** `model-routing-family` — Stop the four model rows; other delegate behavior may continue if spawn/return is intact.

**Future-candidate triage commands:**

```bash
git grep -n -E 'extractContinuationSignal' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/auto-reply/continuation/signal.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/signal.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'extractContinuationSignal' "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/signal.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/auto-reply/continuation/rfc-contract.scenario.test.ts src/agents/command/attempt-execution.continue-work-token.test.ts
```

### R-CD-MODEL-TOOL

**Scenario:** `r-cd-model-tool` via `tools/k6-proofs/manifests/r-cd-model-tool.json` (typed-tool; reference state: **partial**).

**Behavior contract:** continue_delegate typed tool form forwards an explicit model override to the delegate child.

**Primary production symbols:** `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `typed model override`, `child provider/model session metadata`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `tools.sessions_spawn.attachments.enabled` = `false`.

**Continuation lifecycle/tool surfaces:** delegate-input: Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. model-routing: Resolve explicit or inherited provider/model selection and persist the authoritative child session metadata used by proof receipts.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`.

**Owner/regression tests:** `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/model-selection.test.ts`, `src/agents/subagent-spawn.model-session.test.ts`, `src/agents/subagent-spawn.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `dispatch-accepted` — Gateway accepted the parent request that asks the agent to call continue_delegate for this model row | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-session-observed` — A nonce-correlated delegate child session/run is observed on the subscribed session stream or session history | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-model-byte` — Observed child provider/model byte from authoritative gateway child-session metadata or spawn record; child prose is auxiliary only | `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan` |
| `return-payload` — Delegate return includes the row nonce and observed model/provider summary | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `trace-or-session-correlation` — Trace id, span tree, or session-event correlation tying dispatch to child and return | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `requested-model-byte` — Committed request byte showing continue_delegate model=<provider/model> | `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN`. **Halt:** `model-routing-family` — Stop the four model rows; other delegate behavior may continue if spawn/return is intact.

**Future-candidate triage commands:**

```bash
git grep -n -E 'ContinueDelegateToolSchema' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'ContinueDelegateToolSchema' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-delegate-tool.test.ts src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts
```

### R-CD-RETURN-OVERLAP

**Scenario:** `r-cd-return-overlap` via `tools/k6-proofs/manifests/r-cd-return-overlap.json` (read-only; reference state: **partial**).

**Behavior contract:** Offline/static validator for committed silent plus silent-wake delegate return overlap receipts in the current PROOFS corpus; proves collection/no-loss, not isolated wake causality.

**Primary production symbols:** `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `one recipient-key idempotency key per announce id`, `durable delivery pending/completed tombstone`, `silent and silent-wake wake intent`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`.

**Continuation lifecycle/tool surfaces:** delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `overlap-artifacts` — flow/task/journal/tempo overlap receipts parse from current PROOFS corpus | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `collection-no-loss` — Both silent and silent-wake return markers are present with targeted root delivery and no duplicate-storm claim | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-SILENT`, `R-CD-TOKEN`, `R-CONFIG-INTERSESSION`, `R-CW-1`, `R-CW-2`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`. **Halt:** `targeting-and-collection-family` — Stop cross-session, fanout, collapse-collection, and overlap rows; same-session work can continue.

**Future-candidate triage commands:**

```bash
git grep -n -E 'delegateFlowRecords' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/auto-reply/continuation/delegate-flow-store.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/delegate-flow-store.ts src/auto-reply/continuation/delegate-dispatch.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'delegateFlowRecords' "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/delegate-flow-store.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/auto-reply/continuation/delegate-dispatch.test.ts src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts
```

### R-CD-SILENT

**Scenario:** `r-cd-silent` via `tools/k6-proofs/manifests/r-cd-silent.json` (typed-tool; reference state: **partial**).

**Behavior contract:** Typed continue_delegate(mode='silent') proof. Fires a silent delegate, waits for child internal completion, then asks the parent to report the silent child token from internal context while checking no child channel delivery occurred.

**Primary production symbols:** `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `delegate.mode=silent`, `silentAnnounce`, `internal trusted return`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `tools.sessions_spawn.attachments.enabled` = `false`.

**Continuation lifecycle/tool surfaces:** delegate-input: Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`.

**Owner/regression tests:** `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `dispatch-accepted` — Gateway accepted the dispatching sessions.send turn that asks the agent to call continue_delegate(mode=silent). | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `delegate-scheduled-sentinel` — Parent emitted RCDS-SCHEDULED only after continue_delegate returned a scheduled result. | `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments` |
| `child-completion-observed` — The silent delegate child completed on the internal subagent stream before the follow-up turn was sent. | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `followup-accepted` — A later follow-up turn was accepted after the silent delegate had time to return. | `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments` |
| `parent-internal-context-observed` — Parent follow-up reported the child-only SILENTCHILD token that was not included in the follow-up prompt. | `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments` |
| `no-channel-delivery` — No channel-delivery event contained the child-only silent delegate token. | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `trace-id` — Trace ID from dispatch response or task metadata for Tempo fetch/review. | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-TOKEN`. **Halt:** `continue-delegate-family` — A defect in typed admission, TaskFlow dispatch, child spawn, or terminal return affects the delegate family.

**Future-candidate triage commands:**

```bash
git grep -n -E 'ContinueDelegateToolSchema' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'ContinueDelegateToolSchema' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-delegate-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-delegate-tool.test.ts src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts
```

### R-CD-TOKEN

**Scenario:** `r-cd-token-bracket-delegate` via `tools/k6-proofs/manifests/r-cd-token.json` (bracket-token; reference state: **partial**).

**Behavior contract:** Terminal [[CONTINUE_DELEGATE:...]] path from an isolated raw-final-text child; joins a runner-owned attempt to exactly one origin task, one token-scheduled delegate, completion, return, and Tempo topology.

**Primary production symbols:** `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send` → `agent turn` → `createOpenClawContinuationTools` → `createContinueDelegateTool.execute` → `TaskFlow delegate row` → `agent-runner/followup-runner queue drain` → `dispatchToolDelegates` → `spawnSubagentDirect` → `coordinateSubagentContinuation` → `routeSubagentContinuationReturn` → `enqueueContinuationReturnDeliveries` → `recipient prompt drain`.

**Durable state/session identity:** `winning terminal bracket token`, `origin task/child flow correlation`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`.

**Continuation lifecycle/tool surfaces:** token-parser: Parse and strip the final winning CONTINUE_WORK or CONTINUE_DELEGATE bracket signal without exposing hidden trace state. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/auto-reply/continuation/rfc-contract.scenario.test.ts`, `src/agents/command/attempt-execution.continue-work-token.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `exact-candidate-runtime-identity` — Exact 40-character candidate and deployed runtime SHAs are equal before dispatch and bound into the signed authority receipt | `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt` |
| `attempt-state` — Runner-owned attempt/nonce fingerprint and automatic-retry disposition persisted before k6 launch | `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt` |
| `raw-final-text-origin` — Declared scanner-supported raw-final-text surface; message-body and unknown surfaces cannot PASS | `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt` |
| `prompt-injected` — sessions.send accepted the bracket-instructing prompt with a concrete run identity | `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt` |
| `parser-detected` — Terminal bracket text observed from the isolated origin child and joined to the token delegate reason fingerprint | `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt` |
| `queue-identity` — Exactly one token delegate task identity appears in the authoritative task ledger | `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt` |
| `child-spawned` — Exactly one nonce-bound token delegate child/run identity is present | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-completed` — The one token delegate task reaches succeeded state | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `parent-return-event` — The exact nonce-bound delegate return sentinel is observed on the parent | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `tempo-trace-json` — Public-safe Tempo trace for the token delegate dispatch/fire topology | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `continuation-trace-correlation` — Reason fingerprint, one dispatch, one fire, chain identity, and absence of a typed continue_delegate tool origin are validated | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CW-3`, `R-CW-7`, `R-OBS-2`, `R-TRACE-REDACTION-1121`. **Halt:** `continue-delegate-family` — A defect in typed admission, TaskFlow dispatch, child spawn, or terminal return affects the delegate family.

**Future-candidate triage commands:**

```bash
git grep -n -E 'extractContinuationSignal' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/auto-reply/continuation/signal.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/signal.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'extractContinuationSignal' "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/signal.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/auto-reply/continuation/rfc-contract.scenario.test.ts src/agents/command/attempt-execution.continue-work-token.test.ts
```

### R-CONFIG-DEFAULTS

**Scenario:** `r-config-defaults` via `tools/k6-proofs/manifests/r-config-defaults.json` (read-only; reference state: **partial**).

**Behavior contract:** Read-only continuation config defaults via direct authenticated operator config.get RPC.

**Primary production symbols:** `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig`, `src/auto-reply/continuation/config.ts::resolveLiveContinuationRuntimeConfig`, `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools`

**Upstream caller chain:** `authenticated config.get` → `canonical config schema` → `serialized config response`.

**Durable state/session identity:** `read-only canonical operator config`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.earlyWarningBand` = `0.3125`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `agents.defaults.continuation.busySkipBackoff.baseMs` = `1000`, `agents.defaults.continuation.busySkipBackoff.factor` = `2`, `agents.defaults.continuation.busySkipBackoff.ceilingMs` = `"inherits maxDelayMs (300000 by default)"`.

**Continuation lifecycle/tool surfaces:** runtime-config: Define, validate, and resolve the canonical continuation configuration and defaults. tool-registration: Gate and register the typed continuation tools for an agent run.

**Observability:** No row-specific telemetry contract; inspect the owning source and proof receipts..

**Owner/regression tests:** `src/config/zod-schema.continuation.test.ts`, `src/auto-reply/continuation/config.test.ts`, `src/agents/openclaw-tools.continuation-registration.test.ts`, `src/agents/openclaw-tools.continuation-misconfig-warn.test.ts`, `src/agents/tools-effective-inventory.runtime-and-policy.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `config-read` — Configuration read successful | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `continuation-values` — Continuation enabled/maxChainLength/maxDelegatesPerTurn/costCapTokens bytes observed | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |

**Blast radius:** . **Halt:** `all-continuation-proofs` — Wrong canonical defaults or tool gating can change every continuation row on the same candidate.

**Future-candidate triage commands:**

```bash
git grep -n -E 'AgentDefaultsConfig' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/config/types.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts src/config/zod-schema.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'AgentDefaultsConfig' "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/config/zod-schema.continuation.test.ts src/auto-reply/continuation/config.test.ts
```

### R-CONFIG-INTERSESSION

**Scenario:** `r-config-intersession` via `tools/k6-proofs/manifests/r-config-intersession.json` (read-only; reference state: **partial**).

**Behavior contract:** Read-only continuation cross-session targeting config receipt via direct authenticated operator config.get RPC.

**Primary production symbols:** `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig`, `src/auto-reply/continuation/config.ts::resolveLiveContinuationRuntimeConfig`, `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`

**Upstream caller chain:** `authenticated config.get` → `canonical config schema` → `serialized config response`.

**Durable state/session identity:** `read-only cross-session targeting policy`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.earlyWarningBand` = `0.3125`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `agents.defaults.continuation.busySkipBackoff.baseMs` = `1000`, `agents.defaults.continuation.busySkipBackoff.factor` = `2`, `agents.defaults.continuation.busySkipBackoff.ceilingMs` = `"inherits maxDelayMs (300000 by default)"`, `tools.sessions_spawn.attachments.enabled` = `false`.

**Continuation lifecycle/tool surfaces:** runtime-config: Define, validate, and resolve the canonical continuation configuration and defaults. delegate-input: Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`.

**Owner/regression tests:** `src/config/zod-schema.continuation.test.ts`, `src/auto-reply/continuation/config.test.ts`, `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `config-read` — Configuration read successful | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `cross-session-targeting` — agents.defaults.continuation.crossSessionTargeting explicitly observed as enabled | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |

**Blast radius:** `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-RETURN-OVERLAP`. **Halt:** `targeting-and-collection-family` — Stop cross-session, fanout, collapse-collection, and overlap rows; same-session work can continue.

**Future-candidate triage commands:**

```bash
git grep -n -E 'AgentDefaultsConfig' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/config/types.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts src/config/zod-schema.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'AgentDefaultsConfig' "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/config/zod-schema.continuation.test.ts src/auto-reply/continuation/config.test.ts
```

### R-CW-1

**Scenario:** `r-cw-1-tool-schedule-wake` via `tools/k6-proofs/manifests/r-cw-1.json` (typed-tool; reference state: **partial**).

**Behavior contract:** Typed continue_work() tool-form schedule + wake. Fires continue_work with a reason, observes the scheduled work entry and wake event on the session.

**Primary production symbols:** `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools`, `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `work TaskFlow row`, `hop/dueAt/recoveryDueAt`, `terminal delivered marker`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** tool-registration: Gate and register the typed continuation tools for an agent run. work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/agents/openclaw-tools.continuation-registration.test.ts`, `src/agents/openclaw-tools.continuation-misconfig-warn.test.ts`, `src/agents/tools-effective-inventory.runtime-and-policy.test.ts`, `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `tool-invoke-accepted` — Gateway accepted the continue_work tool invocation | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `continue-work-tool-result-scheduled` — Post-dispatch non-harness event includes explicit CW-SCHEDULED sentinel emitted after continue_work tool result reports scheduled | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `work-woke-event` — Session wake event delivered after delaySeconds | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `trace-id` — Unique safe-fingerprint correlation to a public-safe Tempo projection containing same-trace continue_work tool, continuation.work, and continuation.work.fire spans | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`, `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-RETURN-OVERLAP`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'createOpenClawContinuationTools' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/openclaw-tools.continuation.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts src/agents/openclaw-tools.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'createOpenClawContinuationTools' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/openclaw-tools.continuation-registration.test.ts src/agents/openclaw-tools.continuation-misconfig-warn.test.ts
```

### R-CW-2

**Scenario:** `r-cw-2-immediate-wake` via `tools/k6-proofs/manifests/r-cw-2.json` (typed-tool; reference state: **partial**).

**Behavior contract:** Typed continue_work(delaySeconds=0) immediate wake proof. Requires an explicit scheduled sentinel and a continuation wake sentinel, while ignoring harness prompt echoes.

**Primary production symbols:** `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools`, `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `explicit delaySeconds=0`, `zero-delay TaskFlow row`, `next-tick wake`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** tool-registration: Gate and register the typed continuation tools for an agent run. work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once.

**Observability:** `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`.

**Owner/regression tests:** `src/agents/openclaw-tools.continuation-registration.test.ts`, `src/agents/openclaw-tools.continuation-misconfig-warn.test.ts`, `src/agents/tools-effective-inventory.runtime-and-policy.test.ts`, `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `dispatch-accepted` — Gateway accepted the sessions.send turn that asks the agent to call continue_work(delaySeconds=0). | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `continue-work-tool-result-scheduled` — Agent emitted CW2-SCHEDULED only after the continue_work tool result reported scheduled. | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `immediate-wake-event` — Continuation wake turn emitted CW2-WOKE nonce sentinel. | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |
| `prompt-echo-filtered` — Harness prompt echo was ignored; CW2-WOKE is only accepted after CW2-SCHEDULED. | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `trace-id` — Trace ID from dispatch response or optional task metadata for Tempo fetch. | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CW-1`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`, `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-RETURN-OVERLAP`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'createOpenClawContinuationTools' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/openclaw-tools.continuation.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts src/agents/openclaw-tools.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'createOpenClawContinuationTools' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/openclaw-tools.continuation-registration.test.ts src/agents/openclaw-tools.continuation-misconfig-warn.test.ts
```

### R-CW-3

**Scenario:** `r-cw-3-reason-telemetry` via `tools/k6-proofs/manifests/r-cw-3.json` (typed-tool; reference state: **partial**).

**Behavior contract:** continue_work reason telemetry/redaction partial candidate. k6 proves schedule+wake and keeps the raw reason out of public artifacts; Tempo JSON review must verify safe reason attrs present and raw reason absent before a PASS fold.

**Primary production symbols:** `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `raw reason remains local`, `reason length/redacted hash only in spans`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `dispatch-accepted` — Gateway accepted the sessions.send turn that asks the agent to call continue_work with a nonce-bearing reason. | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `continue-work-tool-result-scheduled` — Agent emitted CW3-SCHEDULED only after the continue_work tool result reported scheduled. | `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork` |
| `work-woke-event` — Continuation wake turn emitted CW3-WOKE nonce sentinel. | `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork` |
| `public-artifact-raw-reason-absent` — Scenario public evidence redacts the raw reason sentinel rather than committing it. | `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork` |
| `tempo-trace-json` — Fetched Tempo trace JSON for reviewer validation of reason telemetry/redaction. | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `reason-telemetry-redaction-review` — Reviewer confirms safe reason attrs are present and the raw reason sentinel is absent from Tempo JSON before folding PASS. | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CW-1`, `R-CW-2`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`, `R-CD-TOKEN`, `R-OBS-2`, `R-TRACE-REDACTION-1121`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'createContinueWorkTool' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-work-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-work-tool.ts src/auto-reply/continuation/work-dispatch.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'createContinueWorkTool' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-work-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-work-tool.test.ts src/agents/command/attempt-execution.continue-work-opts.test.ts
```

### R-CW-4

**Scenario:** `r-cw-4-chain-depth` via `tools/k6-proofs/manifests/r-cw-4.json` (typed-tool; reference state: **partial**).

**Behavior contract:** Chain depth hop counter: fires continue_work 3× in sequence, verifies hop increments from 1/200 → 3/200 in traced responses.

**Primary production symbols:** `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `monotone continuationChainCount`, `shared continuationChainId`, `per-hop TaskFlow rows`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `hop-1-accepted` — First continue_work accepted, chain.step shows 1/N | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |
| `hop-2-accepted` — Second continue_work accepted after wake, chain.step shows 2/N | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |
| `hop-3-accepted` — Third continue_work accepted after wake, chain.step shows 3/N | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |
| `trace-ids` — Trace IDs from each hop for Tempo chain verification | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `final-done` — Final continuation wake emitted CW4-DONE nonce sentinel | `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork` |

**Blast radius:** `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'createContinueWorkTool' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-work-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-work-tool.ts src/auto-reply/continuation/work-dispatch.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'createContinueWorkTool' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-work-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-work-tool.test.ts src/agents/command/attempt-execution.continue-work-opts.test.ts
```

### R-CW-5

**Scenario:** `r-cw-5-cost-cap-reject` via `tools/k6-proofs/manifests/r-cw-5.json` (typed-tool; reference state: **pass**).

**Behavior contract:** Cost-cap exhaustion uses a disposable exact-candidate typed-tool fixture; continue_work is intentionally not externally invocable through the gateway loopback.

**Primary production symbols:** `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig`, `src/auto-reply/continuation/config.ts::resolveLiveContinuationRuntimeConfig`, `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `continuationChainTokens`, `cost-capped terminal outcome`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.earlyWarningBand` = `0.3125`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `agents.defaults.continuation.busySkipBackoff.baseMs` = `1000`, `agents.defaults.continuation.busySkipBackoff.factor` = `2`, `agents.defaults.continuation.busySkipBackoff.ceilingMs` = `"inherits maxDelayMs (300000 by default)"`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** runtime-config: Define, validate, and resolve the canonical continuation configuration and defaults. work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/config/zod-schema.continuation.test.ts`, `src/auto-reply/continuation/config.test.ts`, `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `fixture-readiness` — Exact source/SHA, installed dependencies, and zero production mutation are proven before execution. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `boundary-matrix` — Below/equal/over cap results are null/null/cost-capped at the production budget predicate. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `typed-tool-surface` — The real attempt runner receives two typed continue_work callbacks and creates no durable work when over cap. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `dispatch-boundary-suite` — Production dispatcher asserts no rejected-hop spawn and failed-flow persistence. | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `cleanup` — Disposable worktree is removed and no production config/state/source mutation occurred. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |

**Blast radius:** `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'AgentDefaultsConfig' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/config/types.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts src/config/zod-schema.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'AgentDefaultsConfig' "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/config/zod-schema.continuation.test.ts src/auto-reply/continuation/config.test.ts
```

### R-CW-6

**Scenario:** `r-cw-6-max-chain-length` via `tools/k6-proofs/manifests/r-cw-6.json` (typed-tool; reference state: **pass**).

**Behavior contract:** The max-chain boundary uses a disposable exact-candidate runtime fixture; continue_work is intentionally not externally invocable through the gateway loopback.

**Primary production symbols:** `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig`, `src/auto-reply/continuation/config.ts::resolveLiveContinuationRuntimeConfig`, `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `continuationChainCount`, `chain-capped terminal outcome`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.earlyWarningBand` = `0.3125`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `agents.defaults.continuation.busySkipBackoff.baseMs` = `1000`, `agents.defaults.continuation.busySkipBackoff.factor` = `2`, `agents.defaults.continuation.busySkipBackoff.ceilingMs` = `"inherits maxDelayMs (300000 by default)"`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** runtime-config: Define, validate, and resolve the canonical continuation configuration and defaults. work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/config/zod-schema.continuation.test.ts`, `src/auto-reply/continuation/config.test.ts`, `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `fixture-readiness` — Exact source/SHA, installed dependencies, explicit maxChainLength, and zero production mutation are proven before execution. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `boundary-matrix` — The production budget predicate permits attempted hops max-1 and max, then returns chain-capped for attempted hop max+1. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `runtime-boundary` — Production scheduleContinuationWorkBatch and scheduleContinuationWork emit below/at/first-over outcomes plus a structured chain-capped receipt. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `durable-state-recovery` — The at-limit chain count is persisted, reloaded from the temporary session store, and still rejects the first recovered over-limit election. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `typed-tool-surface` — The real attempt runner forwards its continuation options into the production continuation tool registry; the registered continue_work executor is invoked three times, schedules only the two in-budget hops, and persists the at-limit count. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `dispatch-boundary-suite` — The production delegate dispatcher is exercised at the selected fixture maximum, proving one at-limit dispatch, first-over rejection before a second spawn, and failed rejected-flow state; the candidate regression suite also passes. | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `cleanup` — The disposable worktree/state are removed and no production gateway/config/state/source mutation occurred. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `public-artifact-safety` — Every emitted receipt is checked for private filesystem paths and secret/session/environment/process-output fields before PASS-candidate is written. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |

**Blast radius:** `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'AgentDefaultsConfig' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/config/types.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts src/config/zod-schema.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'AgentDefaultsConfig' "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/config/zod-schema.continuation.test.ts src/auto-reply/continuation/config.test.ts
```

### R-CW-7

**Scenario:** `static-corpus-row-validator` via `tools/k6-proofs/manifests/r-cw-7.json` (read-only; reference state: **partial**).

**Behavior contract:** Static validator for committed runtime traceparent propagation source/test receipts.

**Primary production symbols:** `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`, `src/gateway/server-runtime-services.ts::recoverPendingContinuations`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/auto-reply/continuation/work-dispatch.ts::recoverPendingContinuationWork`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `internal traceparent`, `traceparent provenance`, `parent-stitched work/fire spans`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once. startup-recovery: Recover durable delegate and work rows on gateway startup, with delegate recovery ordered first. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`, `src/gateway/server-runtime-services.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `traceparent-propagation-artifacts` — Current PROOFS corpus receipts parse for this row. | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `traceparent-propagation-tests` — Committed evidence satisfies the row-specific PASS predicate. | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`, `R-CD-TOKEN`, `R-OBS-2`, `R-TRACE-REDACTION-1121`, `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-RETURN-OVERLAP`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'createContinueWorkTool' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-work-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-work-tool.ts src/auto-reply/continuation/work-dispatch.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'createContinueWorkTool' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-work-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-work-tool.test.ts src/agents/command/attempt-execution.continue-work-opts.test.ts
```

### R-CW-DELEGATE-CHILD-LIVE

**Scenario:** `static-corpus-row-validator` via `tools/k6-proofs/manifests/r-cw-delegate-child-live.json` (read-only; reference state: **partial**).

**Behavior contract:** Static validator for committed delegate-child self-continuation hop1/hop2 receipts.

**Primary production symbols:** `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `accepted childSessionKey`, `live delegate flow`, `cleanup retention decision`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`.

**Owner/regression tests:** `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `delegate-child-hop-artifacts` — Current PROOFS corpus receipts parse for this row. | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |
| `delegate-child-hop2-executed` — Committed evidence satisfies the row-specific PASS predicate. | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |

**Blast radius:** `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`, `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-RETURN-OVERLAP`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'delegateFlowRecords' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/auto-reply/continuation/delegate-flow-store.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/delegate-flow-store.ts src/auto-reply/continuation/delegate-dispatch.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'delegateFlowRecords' "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/delegate-flow-store.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/auto-reply/continuation/delegate-dispatch.test.ts src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts
```

### R-CW-DELEGATE-SELF-CONTINUATION

**Scenario:** `r-cw-delegate-self-continuation` via `tools/k6-proofs/manifests/r-cw-delegate-self.json` (typed-tool; reference state: **partial**).

**Behavior contract:** Fires continue_delegate that internally calls continue_work — proves hop-2 woke inside a delegate child session. The delegate dispatches, the child fires its own continue_work, and the hop-2 turn executes.

**Primary production symbols:** `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `child-owned work row`, `parentRunId intentionally absent`, `child session chain identity`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`.

**Owner/regression tests:** `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `delegate-accepted` — sessions.send dispatch accepted (agent turn triggered) | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-spawned` — Corroborative only: concrete delegate lifecycle/child-session signal (not arbitrary nonce event) | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-continue-work-accepted` — Post-dispatch non-harness CHILD-CW-SCHEDULED sentinel emitted after child continue_work tool result reports scheduled | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-hop-2-woke` — Child's hop-2 turn executed and emitted CHILD-HOP2-DONE sentinel | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |
| `parent-return` — Delegate return event observed post-dispatch on parent session | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |

**Blast radius:** `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`, `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-RETURN-OVERLAP`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'delegateFlowRecords' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/auto-reply/continuation/delegate-flow-store.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/delegate-flow-store.ts src/auto-reply/continuation/delegate-dispatch.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'delegateFlowRecords' "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/delegate-flow-store.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/auto-reply/continuation/delegate-dispatch.test.ts src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts
```

### R-CW-DELEGATE-TOKEN

**Scenario:** `static-corpus-row-validator` via `tools/k6-proofs/manifests/r-cw-delegate-token.json` (read-only; reference state: **partial**).

**Behavior contract:** Static validator for committed delegate child bare-token continuation receipts.

**Primary production symbols:** `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `child terminal CONTINUE_WORK token`, `child-owned work TaskFlow row`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** token-parser: Parse and strip the final winning CONTINUE_WORK or CONTINUE_DELEGATE bracket signal without exposing hidden trace state. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`.

**Owner/regression tests:** `src/auto-reply/continuation/rfc-contract.scenario.test.ts`, `src/agents/command/attempt-execution.continue-work-token.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `delegate-token-artifacts` — Current PROOFS corpus receipts parse for this row. | `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt` |
| `bare-token-hop2-executed` — Committed evidence satisfies the row-specific PASS predicate. | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |

**Blast radius:** `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'extractContinuationSignal' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/auto-reply/continuation/signal.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/signal.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'extractContinuationSignal' "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/signal.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/auto-reply/continuation/rfc-contract.scenario.test.ts src/agents/command/attempt-execution.continue-work-token.test.ts
```

### R-CW-MULTI

**Scenario:** `static-corpus-row-validator` via `tools/k6-proofs/manifests/r-cw-multi.json` (read-only; reference state: **partial**).

**Behavior contract:** Static validator for committed same-turn multi continue_work fanout/collapse receipts.

**Primary production symbols:** `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `one TaskFlow row per same-turn election`, `independent delay and hop per row`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once.

**Observability:** `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`.

**Owner/regression tests:** `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `multi-work-artifacts` — Current PROOFS corpus receipts parse for this row. | `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork` |
| `fanout-collapse-semantics` — Committed evidence satisfies the row-specific PASS predicate. | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |

**Blast radius:** `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'createContinueWorkTool' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-work-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-work-tool.ts src/auto-reply/continuation/work-dispatch.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'createContinueWorkTool' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-work-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-work-tool.test.ts src/agents/command/attempt-execution.continue-work-opts.test.ts
```

### R-CW-MULTI-COLLAPSE

**Scenario:** `static-corpus-row-validator` via `tools/k6-proofs/manifests/r-cw-multi-collapse.json` (read-only; reference state: **partial**).

**Behavior contract:** Static validator for committed synthetic stale/new continuation collapse proof receipts.

**Primary production symbols:** `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `stale reply-run-ended parked rows`, `newest election`, `superseded terminal outcomes`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `multi-collapse-artifacts` — Current PROOFS corpus receipts parse for this row. | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |
| `stale-superseded-newest-granted-config-restored` — Committed evidence satisfies the row-specific PASS predicate. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |

**Blast radius:** `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-TOKEN`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'createContinueWorkTool' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/tools/continue-work-tool.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-work-tool.ts src/auto-reply/continuation/work-dispatch.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'createContinueWorkTool' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/tools/continue-work-tool.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/tools/continue-work-tool.test.ts src/agents/command/attempt-execution.continue-work-opts.test.ts
```

### R-CW-TOKEN

**Scenario:** `r-cw-token-bracket` via `tools/k6-proofs/manifests/r-cw-token.json` (bracket-token; reference state: **partial**).

**Behavior contract:** Bracket/token CONTINUE_WORK path: lightContext subagent emits bare CONTINUE_WORK token at end-of-turn, hop-2 drives. Proves the token-form continuation works for subagents (the #952 row lineage).

**Primary production symbols:** `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt`, `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`

**Upstream caller chain:** `gateway sessions.send or child completion` → `agent turn` → `createContinueWorkTool.execute or extractContinuationSignal` → `scheduleContinuationWorkBatch` → `TaskFlow work row` → `dispatchPendingContinuationWork` → `executePendingContinuationWork` → `getReplyFromConfig with continuationTrigger=work-wake` → `terminal durable settlement`.

**Durable state/session identity:** `winning terminal CONTINUE_WORK token`, `child same-session work row`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** token-parser: Parse and strip the final winning CONTINUE_WORK or CONTINUE_DELEGATE bracket signal without exposing hidden trace state. work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`.

**Owner/regression tests:** `src/auto-reply/continuation/rfc-contract.scenario.test.ts`, `src/agents/command/attempt-execution.continue-work-token.test.ts`, `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `parent-dispatch-accepted` — sessions.send dispatch accepted for disposable parent session | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `subagent-spawn-requested` — parent instructed to call sessions_spawn lightContext child | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `subagent-spawn-accepted` — parent observed sessions_spawn acceptance/final sentinel | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `token-emitted-or-stripped` — child first turn reached TOKEN-HOP1 and emitted/stripped bare CONTINUE_WORK:N token | `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt` |
| `hop-2-executed` — TOKEN-HOP2-DONE sentinel from continuation wake/hop-2 | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |
| `parent-return` — hop-2 result returned/observable on parent session | `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries` |
| `journal-work-wake-hop-2` — Review receipt: journal [continuation:work-wake] for the child session; runtime labels the first child continuation wake as hop=1/200, which is the semantic hop-2 turn for this row | `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered` |
| `tempo-trace` — Review receipt: Tempo trace for continuation.work.fire/work wake path | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`. **Halt:** `continue-work-family` — A defect in the shared work scheduler/store/executor affects the work family; delegate-only rows may proceed.

**Future-candidate triage commands:**

```bash
git grep -n -E 'extractContinuationSignal' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/auto-reply/continuation/signal.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/signal.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'extractContinuationSignal' "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/signal.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/auto-reply/continuation/rfc-contract.scenario.test.ts src/agents/command/attempt-execution.continue-work-token.test.ts
```

### R-OBS-1

**Scenario:** `r-obs-1` via `tools/k6-proofs/manifests/r-obs-1.json` (typed-tool; reference state: **fail**).

**Behavior contract:** Session-status-card observability via the session_status tool. Creates a disposable session, asks the agent to call session_status, and verifies build/context/continuation-chain/route visibility by nonce-correlated sentinel.

**Primary production symbols:** `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig`, `src/auto-reply/continuation/config.ts::resolveLiveContinuationRuntimeConfig`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `agent calls session_status` → `status command snapshot` → `formatStatusMessage`.

**Durable state/session identity:** `session entry`, `continuation chain counters`, `route/model/context snapshot`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.earlyWarningBand` = `0.3125`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `agents.defaults.continuation.busySkipBackoff.baseMs` = `1000`, `agents.defaults.continuation.busySkipBackoff.factor` = `2`, `agents.defaults.continuation.busySkipBackoff.ceilingMs` = `"inherits maxDelayMs (300000 by default)"`.

**Continuation lifecycle/tool surfaces:** runtime-config: Define, validate, and resolve the canonical continuation configuration and defaults. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/config/zod-schema.continuation.test.ts`, `src/auto-reply/continuation/config.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `session-created` — Disposable proof session was created for the status-card read. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `dispatch-accepted` — sessions.send accepted the agent turn that calls session_status. | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `status-card-sentinel` — Agent reply included OBS1-STATUS sentinel for the nonce. | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `build-context-chain-route-visible` — Sentinel confirms build/version, context usage, continuation chain/queue, and route/delivery context were visible in the status card. | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `trace-id` — Trace ID from sessions.send or event payload when available. | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-OBS-2`, `R-OBS-STATUS`, `R-TRACE-REDACTION-1121`. **Halt:** `observability-family` — Stop rows whose PASS requires this evidence surface; do not convert missing telemetry into a behavior failure.

**Future-candidate triage commands:**

```bash
git grep -n -E 'AgentDefaultsConfig' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/config/types.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts src/config/zod-schema.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'AgentDefaultsConfig' "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/config/zod-schema.continuation.test.ts src/auto-reply/continuation/config.test.ts
```

### R-OBS-2

**Scenario:** `r-obs-2` via `tools/k6-proofs/manifests/r-obs-2.json` (read-only; reference state: **partial**).

**Behavior contract:** Offline/static validator for committed R-OBS-2 trace-tree/span-tree/span-count artifacts in the current PROOFS corpus.

**Primary production symbols:** `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`

**Upstream caller chain:** `continuation accept/fire/return seams` → `continuation tracer shim` → `diagnostics-otel adapter` → `OTLP exporter`.

**Durable state/session identity:** `traceparent`, `chain.id`, `span ids and canonical attributes`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `trace-tree-artifacts` — trace-tree/span-tree/span-count artifacts parse from current PROOFS corpus | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `continuation-lineage` — Required continuation span names and zero-orphan tree shape observed | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CD-TOKEN`, `R-CW-3`, `R-CW-7`, `R-TRACE-REDACTION-1121`, `R-OBS-1`, `R-OBS-STATUS`. **Halt:** `observability-family` — Stop rows whose PASS requires this evidence surface; do not convert missing telemetry into a behavior failure.

**Future-candidate triage commands:**

```bash
git grep -n -E 'continuationReasonAttributes' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/infra/continuation-tracer.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/infra/continuation-tracer.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'continuationReasonAttributes' "$OPENCLAW_CANDIDATE_SHA" -- src/infra/continuation-tracer.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/infra/continuation-tracer.test.ts src/infra/continuation-tracer.emit-and-fire.test.ts
```

### R-OBS-STATUS

**Scenario:** `r-obs-status` via `tools/k6-proofs/manifests/r-obs-status.json` (source-status-formatter; reference state: **partial**).

**Behavior contract:** Exact-SHA #1172 source contract: active continuation renders a line while a clean all-zero session omits it.

**Primary production symbols:** `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig`, `src/auto-reply/continuation/config.ts::resolveLiveContinuationRuntimeConfig`, `src/agents/tools/request-compaction-tool.ts::createRequestCompactionTool`, `src/agents/tools/request-compaction-tool.ts::getVolitionalCompactionCount`, `src/agents/command/attempt-execution.ts::requestCompactionOpts`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `status command` → `formatContinuationStatusLine` → `formatStatusMessage`.

**Durable state/session identity:** `continuationChainCount`, `pending delegate count`, `staged post-compaction count`, `volitional compaction count`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.earlyWarningBand` = `0.3125`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `agents.defaults.continuation.busySkipBackoff.baseMs` = `1000`, `agents.defaults.continuation.busySkipBackoff.factor` = `2`, `agents.defaults.continuation.busySkipBackoff.ceilingMs` = `"inherits maxDelayMs (300000 by default)"`.

**Continuation lifecycle/tool surfaces:** runtime-config: Define, validate, and resolve the canonical continuation configuration and defaults. request-compaction: Apply the 70% context guard, per-session cooldown, in-flight dedupe, and asynchronous compaction request lifecycle. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `continuation.compaction.released span`, `[system:compaction-failed] trusted event`, `volitional compaction count`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/config/zod-schema.continuation.test.ts`, `src/auto-reply/continuation/config.test.ts`, `src/agents/tools/request-compaction-tool.test.ts`, `src/agents/tools/request-compaction-tool.volitional-threading.test.ts`, `src/agents/command/attempt-execution.request-compaction-opts.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `candidate-source-sha256` — Public SHA-256 digest of the exact candidate source fetched by immutable SHA | `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig` |
| `active-continuation-line` — Exact candidate formatter rendered the expected continuation line for a non-zero active state | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `clean-session-line-absence` — Exact candidate formatter omitted the continuation line for the all-zero clean-session state | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CD-3`, `R-RC-1`, `R-RC-2`, `R-OBS-1`, `R-OBS-2`, `R-TRACE-REDACTION-1121`. **Halt:** `observability-family` — Stop rows whose PASS requires this evidence surface; do not convert missing telemetry into a behavior failure.

**Future-candidate triage commands:**

```bash
git grep -n -E 'AgentDefaultsConfig' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/config/types.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts src/config/zod-schema.agent-defaults.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'AgentDefaultsConfig' "$OPENCLAW_CANDIDATE_SHA" -- src/config/types.agent-defaults.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/config/zod-schema.continuation.test.ts src/auto-reply/continuation/config.test.ts
```

### R-RC-1

**Scenario:** `r-rc-1-threshold-reject` via `tools/k6-proofs/manifests/r-rc-1.json` (typed-tool; reference state: **partial**).

**Behavior contract:** request_compaction below-threshold structured reject via disposable session/inventory-only path.

**Primary production symbols:** `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools`, `src/agents/tools/request-compaction-tool.ts::createRequestCompactionTool`, `src/agents/tools/request-compaction-tool.ts::getVolitionalCompactionCount`, `src/agents/command/attempt-execution.ts::requestCompactionOpts`

**Upstream caller chain:** `agent turn` → `createRequestCompactionTool.execute` → `context guard and per-session coordinator` → `triggerCompaction lane` → `confirmed autoCompactionCount` → `dispatchPostCompactionDelegates`.

**Durable state/session identity:** `context usage percentage`, `per-session cooldown/in-flight coordinator`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`.

**Continuation lifecycle/tool surfaces:** tool-registration: Gate and register the typed continuation tools for an agent run. request-compaction: Apply the 70% context guard, per-session cooldown, in-flight dedupe, and asynchronous compaction request lifecycle.

**Observability:** `continuation.compaction.released span`, `[system:compaction-failed] trusted event`, `volitional compaction count`.

**Owner/regression tests:** `src/agents/openclaw-tools.continuation-registration.test.ts`, `src/agents/openclaw-tools.continuation-misconfig-warn.test.ts`, `src/agents/tools-effective-inventory.runtime-and-policy.test.ts`, `src/agents/tools/request-compaction-tool.test.ts`, `src/agents/tools/request-compaction-tool.volitional-threading.test.ts`, `src/agents/command/attempt-execution.request-compaction-opts.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `tool-registered` — Direct tools.effective inventory contains request_compaction for the disposable session | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `tool-invoked` — The current row nonce appears in a typed request_compaction invocation with a correlation ID | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `tool-invoke-rejected` — Authoritative request_compaction toolResult is bound by toolCallId to this row's nonce-bearing invocation and returned status=rejected with guard=context_threshold | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |

**Blast radius:** `R-CD-3`, `R-RC-2`, `R-OBS-STATUS`. **Halt:** `request-compaction-family` — Stop request-compaction and post-compaction release rows; ordinary work/delegate rows remain independently triageable.

**Future-candidate triage commands:**

```bash
git grep -n -E 'createOpenClawContinuationTools' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/openclaw-tools.continuation.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts src/agents/openclaw-tools.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'createOpenClawContinuationTools' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/openclaw-tools.continuation-registration.test.ts src/agents/openclaw-tools.continuation-misconfig-warn.test.ts
```

### R-RC-2

**Scenario:** `r-rc-2-delegate-request-compaction` via `tools/k6-proofs/manifests/r-rc-2.json` (typed-tool; reference state: **partial**).

**Behavior contract:** Parent fires continue_delegate to a child that calls request_compaction. Accepts actual compaction path or structured below-threshold rejection as environmental honest limit.

**Primary production symbols:** `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/agents/tools/request-compaction-tool.ts::createRequestCompactionTool`, `src/agents/tools/request-compaction-tool.ts::getVolitionalCompactionCount`, `src/agents/command/attempt-execution.ts::requestCompactionOpts`, `src/auto-reply/continuation/delegate-store.ts::stagePostCompactionDelegate`, `src/auto-reply/continuation/post-compaction-release.ts::releasePostCompactionLifecycle`, `src/auto-reply/continuation/post-compaction-staged-dispatch.ts::dispatchStagedPostCompactionDelegates`, `src/infra/session-delivery-queue-storage.ts::enqueuePostCompactionDelegateDelivery`, `src/infra/continuation-tracer.ts::emitContinuationCompactionReleasedSpan`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`

**Upstream caller chain:** `agent turn` → `createRequestCompactionTool.execute` → `context guard and per-session coordinator` → `triggerCompaction lane` → `confirmed autoCompactionCount` → `dispatchPostCompactionDelegates`.

**Durable state/session identity:** `child session context percentage`, `structured request result`, `optional compaction id`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`.

**Continuation lifecycle/tool surfaces:** delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. request-compaction: Apply the 70% context guard, per-session cooldown, in-flight dedupe, and asynchronous compaction request lifecycle. post-compaction: Stage post-compaction delegates durably and release them only after a confirmed compaction boundary. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `continuation.compaction.released span`, `[system:compaction-failed] trusted event`, `volitional compaction count`.

**Owner/regression tests:** `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/agents/tools/request-compaction-tool.test.ts`, `src/agents/tools/request-compaction-tool.volitional-threading.test.ts`, `src/agents/command/attempt-execution.request-compaction-opts.test.ts`, `src/auto-reply/continuation/post-compaction-release.test.ts`, `src/auto-reply/continuation/post-compaction-durable-handoff.test.ts`, `src/infra/continuation-tracer.queue-and-compaction.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `parent-dispatch-accepted` — Gateway accepted parent sessions.send proof turn | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `delegate-requested` — Parent agent was instructed to call continue_delegate(mode=normal) | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `child-report-observed` — Delegate child returned a request_compaction result sentinel | `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates` |
| `threshold-rejection-or-accepted-compaction` — Either structured context-threshold rejection or accepted/post-compaction path observed | `src/agents/tools/request-compaction-tool.ts::createRequestCompactionTool`, `src/agents/tools/request-compaction-tool.ts::getVolitionalCompactionCount`, `src/agents/command/attempt-execution.ts::requestCompactionOpts` |
| `trace-id` — Unique safe-fingerprint correlation to a public-safe Tempo projection containing same-trace continue_delegate tool, fire, and dispatch spans | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CD-3`, `R-RC-1`, `R-OBS-STATUS`. **Halt:** `request-compaction-family` — Stop request-compaction and post-compaction release rows; ordinary work/delegate rows remain independently triageable.

**Future-candidate triage commands:**

```bash
git grep -n -E 'delegateFlowRecords' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/auto-reply/continuation/delegate-flow-store.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/delegate-flow-store.ts src/auto-reply/continuation/delegate-dispatch.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'delegateFlowRecords' "$OPENCLAW_CANDIDATE_SHA" -- src/auto-reply/continuation/delegate-flow-store.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/auto-reply/continuation/delegate-dispatch.test.ts src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts
```

### R-REGRESSION-TRAP-TESTS

**Scenario:** `r-regression-trap-tests` via `tools/k6-proofs/manifests/r-regression-trap-tests.json` (read-only; reference state: **partial**).

**Behavior contract:** Offline/static validator for committed continuation sibling-surface regression-trap test receipts in the current PROOFS corpus.

**Primary production symbols:** `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools`, `src/agents/tools/continue-delegate-tool.ts::ContinueDelegateToolSchema`, `src/agents/tools/continue-delegate-tool.ts::createContinueDelegateTool`, `src/agents/subagent-attachments.ts::validateSubagentAttachments`, `src/agents/subagent-attachments.ts::materializeSubagentAttachments`, `src/auto-reply/continuation/delegate-flow-store.ts::delegateFlowRecords.create`, `src/auto-reply/continuation/delegate-dispatch.ts::dispatchToolDelegates`, `src/auto-reply/continuation/delegate-dispatch-recovery.ts::recoverPendingContinuationDelegates`, `src/agents/subagent-spawn.ts::spawnSubagentDirect`, `src/agents/subagent-continuation-ids.ts::deriveContinuationDelegateChildSessionKeyFromParent`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`, `src/agents/subagent-announce.continuation.runtime.ts::coordinateSubagentContinuation`, `src/agents/subagent-announce.continuation.accounting.ts::prepareSubagentContinuationAccounting`, `src/auto-reply/continuation/state.ts::persistContinuationChainState`, `src/auto-reply/continuation/scheduler.ts::checkContinuationBudget`, `src/auto-reply/continuation/signal.ts::extractContinuationSignal`, `src/auto-reply/continuation/signal.ts::stripContinuationSignal`, `src/agents/command/attempt-execution.ts::runAgentAttempt`, `src/agents/model-selection.ts::resolveSubagentSpawnModelSelection`, `src/agents/model-selection.ts::resolveConfiguredSubagentSpawnModelSelection`, `src/agents/subagent-spawn-plan.ts::resolveSubagentModelAndThinkingPlan`, `src/auto-reply/continuation/delegate-store.ts::stagePostCompactionDelegate`, `src/auto-reply/continuation/post-compaction-release.ts::releasePostCompactionLifecycle`, `src/auto-reply/continuation/post-compaction-staged-dispatch.ts::dispatchStagedPostCompactionDelegates`, `src/infra/session-delivery-queue-storage.ts::enqueuePostCompactionDelegateDelivery`, `src/infra/continuation-tracer.ts::emitContinuationCompactionReleasedSpan`, `src/agents/tools/continue-work-tool.ts::createContinueWorkTool`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWorkBatch`, `src/auto-reply/continuation/work-dispatch.ts::scheduleContinuationWork`, `src/auto-reply/continuation/work-store.ts::enqueuePendingWork`, `src/auto-reply/continuation/work-dispatch-execution.ts::executePendingContinuationWork`, `src/auto-reply/continuation/work-dispatch.ts::dispatchPendingContinuationWork`, `src/auto-reply/continuation/work-store.ts::markPendingWorkDelivered`, `src/auto-reply/continuation/work-store.ts::requeuePendingWork`, `src/auto-reply/continuation/work-store.ts::supersedeQueuedTurnEndParkedWork`, `src/gateway/server-runtime-services.ts::recoverPendingContinuations`, `src/auto-reply/continuation/work-dispatch.ts::recoverPendingContinuationWork`, `src/config/types.agent-defaults.ts::AgentDefaultsConfig`, `src/config/zod-schema.agent-defaults.ts::AgentDefaultsSchema`, `src/auto-reply/continuation/config.ts::resolveContinuationRuntimeConfig`, `src/auto-reply/continuation/config.ts::resolveLiveContinuationRuntimeConfig`, `src/agents/tools/request-compaction-tool.ts::createRequestCompactionTool`, `src/agents/tools/request-compaction-tool.ts::getVolitionalCompactionCount`, `src/agents/command/attempt-execution.ts::requestCompactionOpts`, `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`

**Upstream caller chain:** `source contract` → `owner tests` → `sibling regression tests` → `full sanctioned suite`.

**Durable state/session identity:** `test fixtures only; no live mutation`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** `agents.defaults.continuation.enabled` = `false`, `agents.defaults.continuation.defaultDelayMs` = `15000`, `agents.defaults.continuation.minDelayMs` = `5000`, `agents.defaults.continuation.maxDelayMs` = `300000`, `agents.defaults.continuation.maxChainLength` = `10`, `agents.defaults.continuation.costCapTokens` = `500000`, `agents.defaults.continuation.maxDelegatesPerTurn` = `5`, `agents.defaults.continuation.maxPendingWork` = `32`, `agents.defaults.continuation.earlyWarningBand` = `0.3125`, `agents.defaults.continuation.crossSessionTargeting` = `"disabled"`, `agents.defaults.continuation.busySkipBackoff.baseMs` = `1000`, `agents.defaults.continuation.busySkipBackoff.factor` = `2`, `agents.defaults.continuation.busySkipBackoff.ceilingMs` = `"inherits maxDelayMs (300000 by default)"`, `tools.sessions_spawn.attachments.enabled` = `false`, `agents.defaults.continuation.busySkipBackoff` = `{"baseMs":1000,"factor":2,"ceilingMs":300000}`.

**Continuation lifecycle/tool surfaces:** tool-registration: Gate and register the typed continuation tools for an agent run. delegate-input: Validate typed continue_delegate task, delay, mode, targeting, fanout, model, attachment, and managed-return input before durable admission. delegate-durable-dispatch: Persist delegate intent in TaskFlow, enforce policy and budgets, then spawn an idempotently named child. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake. delegate-chain: Fold child token use into chain state, drain child-owned delegates, preserve silent/wake inheritance, and account for nested hops. token-parser: Parse and strip the final winning CONTINUE_WORK or CONTINUE_DELEGATE bracket signal without exposing hidden trace state. model-routing: Resolve explicit or inherited provider/model selection and persist the authoritative child session metadata used by proof receipts. post-compaction: Stage post-compaction delegates durably and release them only after a confirmed compaction boundary. work-scheduling: Capture each continue_work election and create one durable same-session wake with bounded delay. work-execution: Grant, fire, retry, supersede, and terminally settle durable continuation work exactly once. startup-recovery: Recover durable delegate and work rows on gateway startup, with delegate recovery ordered first. runtime-config: Define, validate, and resolve the canonical continuation configuration and defaults. request-compaction: Apply the 70% context guard, per-session cooldown, in-flight dedupe, and asynchronous compaction request lifecycle. observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `continuation.work / continuation.work.fire spans`, `work-hedge, work-wake, work-delivered, busy-skip, superseded TaskFlow events`, `continuation.compaction.released span`, `[system:compaction-failed] trusted event`, `volitional compaction count`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/agents/openclaw-tools.continuation-registration.test.ts`, `src/agents/openclaw-tools.continuation-misconfig-warn.test.ts`, `src/agents/tools-effective-inventory.runtime-and-policy.test.ts`, `src/agents/tools/continue-delegate-tool.test.ts`, `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts`, `src/agents/subagent-spawn.attachments.test.ts`, `src/auto-reply/continuation/delegate-dispatch.test.ts`, `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`, `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`, `src/agents/subagent-announce.continuation.runtime.test.ts`, `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`, `src/auto-reply/continuation/state.test.ts`, `src/auto-reply/continuation/rfc-contract.scenario.test.ts`, `src/agents/command/attempt-execution.continue-work-token.test.ts`, `src/agents/model-selection.test.ts`, `src/agents/subagent-spawn.model-session.test.ts`, `src/agents/subagent-spawn.test.ts`, `src/auto-reply/continuation/post-compaction-release.test.ts`, `src/auto-reply/continuation/post-compaction-durable-handoff.test.ts`, `src/infra/continuation-tracer.queue-and-compaction.test.ts`, `src/agents/tools/continue-work-tool.test.ts`, `src/agents/command/attempt-execution.continue-work-opts.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`, `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`, `src/gateway/server-runtime-services.test.ts`, `src/config/zod-schema.continuation.test.ts`, `src/auto-reply/continuation/config.test.ts`, `src/agents/tools/request-compaction-tool.test.ts`, `src/agents/tools/request-compaction-tool.volitional-threading.test.ts`, `src/agents/command/attempt-execution.request-compaction-opts.test.ts`, `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `regression-trap-artifacts` — regression-trap evidence/log/source/test inventory artifacts parse from current PROOFS corpus | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |
| `regression-tests-passed` — Committed evidence records 31/31 continuation sibling-surface trap tests passing | `src/agents/openclaw-tools.continuation.ts::createOpenClawContinuationTools`, `src/agents/openclaw-tools.ts::createOpenClawTools` |

**Blast radius:** `R-CD-1`, `R-CD-2`, `R-CD-3`, `R-CD-4`, `R-CD-CHAINED-DEPTH-2`, `R-CD-COLLECTION-ON-COLLAPSE`, `R-CD-MODEL-CHAINED-ALT`, `R-CD-MODEL-DEFAULT`, `R-CD-MODEL-TOKEN`, `R-CD-MODEL-TOOL`, `R-CD-RETURN-OVERLAP`, `R-CD-SILENT`, `R-CD-TOKEN`, `R-CONFIG-DEFAULTS`, `R-CONFIG-INTERSESSION`, `R-CW-1`, `R-CW-2`, `R-CW-3`, `R-CW-4`, `R-CW-5`, `R-CW-6`, `R-CW-7`, `R-CW-DELEGATE-CHILD-LIVE`, `R-CW-DELEGATE-SELF-CONTINUATION`, `R-CW-DELEGATE-TOKEN`, `R-CW-MULTI`, `R-CW-MULTI-COLLAPSE`, `R-CW-TOKEN`, `R-OBS-1`, `R-OBS-2`, `R-OBS-STATUS`, `R-RC-1`, `R-RC-2`, `R-TRACE-REDACTION-1121`. **Halt:** `all-proofs` — A failing shared regression trap invalidates the assembly baseline until the owning test identifies a narrower family.

**Future-candidate triage commands:**

```bash
git grep -n -E 'createOpenClawContinuationTools' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/agents/openclaw-tools.continuation.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts src/agents/openclaw-tools.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'createOpenClawContinuationTools' "$OPENCLAW_CANDIDATE_SHA" -- src/agents/openclaw-tools.continuation.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/agents/openclaw-tools.continuation-registration.test.ts src/agents/openclaw-tools.continuation-misconfig-warn.test.ts
```

### R-TRACE-REDACTION-1121

**Scenario:** `r-trace-redaction-1121` via `tools/k6-proofs/manifests/r-trace-redaction-1121.json` (read-only; reference state: **partial**).

**Behavior contract:** Offline/static validator for committed #1121 trace-redaction contract evidence in the current PROOFS corpus.

**Primary production symbols:** `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan`, `src/logging/diagnostic-continuation-queues.ts::getDiagnosticContinuationQueueMetrics`, `src/status/status-message.ts::formatContinuationStatusLine`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts::createContinuationOtelTracerAdapter`, `src/agents/subagent-announce.continuation-return.ts::routeSubagentContinuationReturn`, `src/auto-reply/continuation/targeting.ts::resolveContinuationReturnTargetSessionKeys`, `src/auto-reply/continuation/targeting.ts::enqueueContinuationReturnDeliveries`, `src/infra/session-delivery-queue-storage.ts::enqueueSessionDelivery`, `src/infra/session-delivery-queue-storage.ts::completeSessionDelivery`

**Upstream caller chain:** `continuation reason/task at local call site` → `shared tool-payload redactor` → `sha256-16 correlation hash` → `diagnostics-otel adapter` → `public-safe exported span`.

**Durable state/session identity:** `reason.present`, `reason.length`, `reason.hash`, `reason.redacted`, `hashed fanout recipient session keys`, `state/openclaw.sqlite`, `continuationChainCount/StartedAt/Tokens/Id`.

**Configuration:** .

**Continuation lifecycle/tool surfaces:** observability: Emit public-safe chain spans, queue diagnostics, and status output without exporting raw task/reason text or raw recipient keys. delegate-return: Route one child completion to the intended session set through durable, idempotent delivery and optional trusted wake.

**Observability:** `continuation.delegate.dispatch / continuation.delegate.fire spans`, `trusted [continuation:*] system events`, `continuation/announce and subagent-chain-hop logs`, `chain.id and traceparent correlation`, `reason length/redacted hash without raw reason`, `continuation queue diagnostic samples`, `conditional /status continuation line`.

**Owner/regression tests:** `src/infra/continuation-tracer.test.ts`, `src/infra/continuation-tracer.emit-and-fire.test.ts`, `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`, `src/logging/diagnostic.test.ts`, `src/auto-reply/status.test.ts`, `src/status/status-text.test.ts`, `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`, `src/agents/subagent-announce.continuation.test.ts`, `src/agents/subagent-announce.continuation-return.delegate-artifacts.test.ts`, `src/auto-reply/continuation/cross-session-targeting.test.ts`, `src/infra/session-delivery-queue.storage.test.ts`, `src/infra/session-delivery-queue.recovery.test.ts`.

| Declared failure class | First inspection points |
| --- | --- |
| `trace-redaction-contract` — Evidence records safe reason attrs and absence of raw reason.preview export | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |
| `trace-redaction-tests-passed` — Evidence records continuation-tracer redaction tests passing | `src/infra/continuation-tracer.ts::continuationReasonAttributes`, `src/infra/continuation-tracer.ts::emitContinuationDelegateSpan`, `src/infra/continuation-tracer.ts::emitContinuationWorkSpan` |

**Blast radius:** `R-CD-TOKEN`, `R-CW-3`, `R-CW-7`, `R-OBS-2`, `R-OBS-1`, `R-OBS-STATUS`. **Halt:** `observability-family` — Stop rows whose PASS requires this evidence surface; do not convert missing telemetry into a behavior failure.

**Future-candidate triage commands:**

```bash
git grep -n -E 'continuationReasonAttributes' b134a64a44351bcbce2d086da4ac30a596c01699 -- src/infra/continuation-tracer.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git diff --stat b134a64a44351bcbce2d086da4ac30a596c01699 "$OPENCLAW_CANDIDATE_SHA" -- src/infra/continuation-tracer.ts
test -n "$OPENCLAW_CANDIDATE_SHA" && git grep -n -E 'continuationReasonAttributes' "$OPENCLAW_CANDIDATE_SHA" -- src/infra/continuation-tracer.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1 src/infra/continuation-tracer.test.ts src/infra/continuation-tracer.emit-and-fire.test.ts
```

