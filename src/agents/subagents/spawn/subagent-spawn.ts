import { resolveSessionStorePathCore } from "../../../config/sessions/paths.js";
import { recordSessionParticipantBestEffort } from "../../../sessions/session-participant-recording.js";
import { recordSubagentSpawned } from "../../../sessions/session-state-events.js";
import { parseInlineAttachmentMountPath } from "../../../shared/inline-attachments.js";
import { hasDeliveryTargetFields } from "../../../utils/delivery-context.shared.js";
import { runSpawnPipeline, type SpawnBackendAdapter } from "../../spawn-pipeline.js";
import { withGatewayToolOperatorContinuation } from "../../tools/gateway-caller-context.js";
import {
  buildContinuationSessionPatch,
  type ContinuationSpawnParams,
} from "../announce/subagent-announce.runtime.js";
import {
  recordAcceptedSubagentSpawnRollback,
  rollbackSubagentRunRegistration,
} from "../registry/subagent-registry.js";
import { materializeSubagentAttachments } from "./subagent-attachments.js";
import { createSubagentChildRunLauncher } from "./subagent-spawn-child-launch.js";
import { resolveSubagentChildPlan } from "./subagent-spawn-child-plan.js";
import {
  bindSubagentSpawnCleanup,
  cleanupFailedSpawnBeforeAgentStart,
  cleanupProvisionalSession,
} from "./subagent-spawn-cleanup.js";
import { activateSubagentCollectorSwarmRun } from "./subagent-spawn-collector-activation.js";
import {
  createCollectorPreparationHold,
  type CollectorCleanupOptions,
} from "./subagent-spawn-collector.js";
import {
  prepareContextEngineSubagentSpawn,
  prepareSubagentSessionContext,
  rollbackPreparedContextEngine,
  type PreparedContextEngineSubagentSpawn,
} from "./subagent-spawn-context.js";
import {
  applySubagentContinuationLaunchFields,
  buildSubagentContinuationRegistrationFields,
  resolveSubagentContinuationLaunchError,
  returnsPhaselessSubagentSpawnCancel,
  resolveSubagentContinuationChildRunId,
  resolveSubagentContinuationChildSessionKey,
  resolveSubagentSpawnOperatorBinding,
} from "./subagent-spawn-continuation.js";
import type {
  SpawnSubagentContext as BaseSpawnSubagentContext,
  SpawnSubagentParams as BaseSpawnSubagentParams,
  SpawnSubagentResult as BaseSpawnSubagentResult,
} from "./subagent-spawn-contract.js";
import { prepareSubagentSpawnEnvelope } from "./subagent-spawn-envelope.js";
import { resolveSubagentSpawnFailureLifecycleHooks } from "./subagent-spawn-failure-hooks.js";
import { buildSubagentSpawnGatewayIdentity } from "./subagent-spawn-gateway-identity.js";
import { readGatewayRunId } from "./subagent-spawn-gateway.js";
import { buildSubagentLaunchRequest } from "./subagent-spawn-launch-request.js";
import { createSubagentSpawnLifecycleEmitter } from "./subagent-spawn-lifecycle.js";
import {
  assertSubagentCollectorAdmission,
  buildSubagentSpawnPipelineFailureResult,
  publishSubagentSpawnRegistration,
} from "./subagent-spawn-registration.js";
import { resolveSubagentSpawnRequest } from "./subagent-spawn-request.js";
import { cleanupAcceptedSubagentSpawnFailure } from "./subagent-spawn-rollback.js";
import { createInitialSubagentSession } from "./subagent-spawn-session-patch.js";
import { bindThreadForSubagentSpawn } from "./subagent-spawn-thread-binding.js";
import { emitSessionLifecycleEvent, mergeDeliveryContext } from "./subagent-spawn.runtime.js";

export { SUBAGENT_SPAWN_CONTEXT_MODES, SUBAGENT_SPAWN_MODES } from "./subagent-spawn.types.js";

export type SpawnSubagentParams = BaseSpawnSubagentParams & ContinuationSpawnParams;
export type SpawnSubagentContext = BaseSpawnSubagentContext;
export type SpawnSubagentResult = BaseSpawnSubagentResult;

export async function spawnSubagentDirect(
  params: SpawnSubagentParams,
  ctx: SpawnSubagentContext,
): Promise<SpawnSubagentResult> {
  const assertActive = ctx.assertActive;
  const promptedAt = Date.now();
  const task = params.task;
  const label = params.label?.trim() || "";
  const requestThreadBinding = params.thread === true;
  const sandboxMode = params.sandbox === "require" ? "require" : "inherit";
  const continuationLaunchError = await resolveSubagentContinuationLaunchError(params);
  if (continuationLaunchError) {
    return continuationLaunchError;
  }
  const { gatewayContextResolver, operatorAuthority } = resolveSubagentSpawnOperatorBinding();
  const requestResolution = await resolveSubagentSpawnRequest(params, ctx);
  if (!requestResolution.ok) {
    return requestResolution.result;
  }
  const {
    request: {
      taskName,
      spawnMode,
      cleanup,
      expectsCompletionMessage,
      completionRequesterSessionId,
      completionRequesterLifecycleRevision,
    },
    runtime: {
      hookRunner,
      cfg,
      runTimeoutSeconds,
      contextMode,
      requesterInternalKey,
      ownership,
      requesterAgentId,
      targetAgentId,
    },
    swarm: {
      config: swarmConfig,
      groupId: swarmGroupId,
      schedulerGroupKey: swarmSchedulerGroupKey,
      launchReplayKey: swarmLaunchReplayKey,
      soleImplicitMember,
      reservationPending,
      reservation: swarmReservation,
    },
    admission: {
      resolve: resolveAdmission,
      initial: admission,
      reservation: admissionReservation,
      childDepth,
      maxSpawnDepth,
      continuationTargetSessionKeys,
      continuationRecipientAuthorityBinding,
    },
    childIdem: resolvedChildIdem,
  } = requestResolution.resolved;
  const childIdem = resolveSubagentContinuationChildRunId(params, resolvedChildIdem);

  let threadBindingReady = false;
  let hasBoundThreadDeliveryOrigin = false;
  let swarmReservationPending = reservationPending;
  const preparationHold = createCollectorPreparationHold({
    reservation: swarmReservation,
    gatewayContextResolver,
  });
  let canCleanupCreatedSession: (() => boolean) | undefined;
  let canAbortRegisteredRun: (() => boolean) | undefined;
  let canRetireReservation: (() => boolean) | undefined;
  let provisionalCleanupOpen = true;
  let contextEnginePreparation: PreparedContextEngineSubagentSpawn | undefined;
  let pipelineEntered = false;
  try {
    assertActive?.();
    if (reservationPending && !swarmReservation?.isCurrent()) {
      return { status: "error", error: "Collector FIFO reservation is no longer current" };
    }
    if (operatorAuthority && !gatewayContextResolver) {
      throw new Error("Operator subagent spawn requires its current Gateway binding");
    }
    if (params.collect && operatorAuthority) {
      operatorAuthority.assertCurrent();
      preparationHold.retainAuthority(operatorAuthority.retain?.());
    }
    const childPlan = await resolveSubagentChildPlan({
      request: params,
      ctx,
      cfg,
      requesterInternalKey,
      requesterAgentId,
      targetAgentId,
      sandboxMode,
      swarmEnabled: swarmConfig.enabled,
      requesterSandboxed: ctx.sandboxed,
    });
    if (!childPlan.ok) {
      return childPlan.result;
    }
    const {
      spawnedCwd,
      toolSpawnMetadata,
      spawnedWorkspaceDir,
      requesterOrigin,
      incognito,
      childSessionKey: resolvedChildSessionKey,
      childRuntimeSandboxed,
      creationPolicy,
      targetAgentDir,
      modelPlan: plan,
      launchAuthorization,
      resolvedModelMetadata,
    } = childPlan.resolved;
    const childSessionKey = resolveSubagentContinuationChildSessionKey(
      params,
      targetAgentId,
      resolvedChildSessionKey,
    );
    let { childSessionOrigin } = childPlan.resolved;
    const { resolvedModel, thinkingOverride } = plan;
    const initialSession = await createInitialSubagentSession({
      assertActive,
      cfg,
      requesterAgentId,
      targetAgentId,
      childSessionKey,
      label: label || undefined,
      incognito,
      requesterInternalKey,
      senderIsOwner: ctx.senderIsOwner,
      expectedParentSessionId: ctx.expectedParentSessionId,
      creationPolicy,
      completionOwnerSessionKey: ownership.completionRequesterSessionKey,
      spawnedWorkspaceDir,
      spawnedCwd,
      sessionPermissionPolicy: ctx.sessionPermissionPolicy,
      worktree: params.worktree ? params : undefined,
      admissionPatch: admission.childSessionPatch,
      inheritedToolAllowlist: ctx.inheritedToolAllowlist,
      inheritedToolDenylist: ctx.inheritedToolDenylist,
      inheritedToolPolicySource: ctx.inheritedToolPolicySource,
      modelPatch: plan.initialSessionPatch,
      continuationPatch: buildContinuationSessionPatch(params),
      swarmGroupId,
      collect: params.collect === true,
      outputSchema: params.outputSchema,
      continuationDelegateAdmission: ctx.continuationDelegateAdmission,
    });
    if (initialSession.status === "error") {
      return {
        status: "error",
        error: initialSession.error,
        childSessionKey,
      };
    }
    let provisionalSessionIdentity = {
      expectedSessionId: initialSession.entry?.sessionId,
      expectedLifecycleRevision: initialSession.entry?.lifecycleRevision,
    };
    const ownsCleanup = () => canCleanupCreatedSession?.() ?? provisionalCleanupOpen;
    const ownsAcceptedRun = () =>
      ownsCleanup() || (!params.collect && canAbortRegisteredRun?.() === true);
    const cleanupContext = gatewayContextResolver?.();
    const cleanupOwner =
      gatewayContextResolver &&
      (operatorAuthority ||
        (!params.collect && cleanupContext && cleanupContext.localEmbedded !== true))
        ? bindSubagentSpawnCleanup({
            childSessionKey,
            resolveGatewayContext: gatewayContextResolver,
            isCurrent: ownsCleanup,
            canAbortAcceptedRun: ownsAcceptedRun,
            getSessionIdentity: () => provisionalSessionIdentity,
          })
        : undefined;
    const isCleanupCurrent = cleanupOwner?.isCurrent ?? ownsCleanup;
    const isAbortCurrent = () => cleanupOwner?.isCurrent("chat.abort") ?? ownsAcceptedRun();
    const cleanupCreatedSession = (emitLifecycleHooks = false) =>
      cleanupProvisionalSession(childSessionKey, {
        emitLifecycleHooks,
        deleteTranscript: true,
        ...provisionalSessionIdentity,
        isCurrent: isCleanupCurrent,
        ...(cleanupOwner ? { callGateway: cleanupOwner.callGateway } : {}),
      });
    const preparedSpawnContext = await prepareSubagentSessionContext({
      assertActive,
      cfg,
      contextMode,
      requesterAgentId,
      targetAgentId,
      requesterInternalKey,
      childSessionKey,
    });
    if (preparedSpawnContext.status === "error") {
      await cleanupCreatedSession();
      return {
        status: "error",
        error: preparedSpawnContext.error,
        childSessionKey,
      };
    }
    const childEntry = preparedSpawnContext.childEntry ?? initialSession.entry;
    if (childEntry) {
      // Only preparation's committed entry can advance cleanup ownership. A reread
      // of the key could capture a reset/rebound successor that this spawn does not own.
      provisionalSessionIdentity = {
        expectedSessionId: childEntry.sessionId,
        expectedLifecycleRevision: childEntry.lifecycleRevision,
      };
    }
    if (requestThreadBinding) {
      const bindResult = await bindThreadForSubagentSpawn({
        assertActive,
        cfg,
        childSessionKey,
        agentId: targetAgentId,
        label: label || undefined,
        mode: spawnMode,
        requesterSessionKey: ownership.controllerSessionKey,
        requester: {
          channel: childSessionOrigin?.channel,
          accountId: childSessionOrigin?.accountId,
          to: childSessionOrigin?.to,
          threadId: childSessionOrigin?.threadId,
        },
      });
      if (bindResult.status === "error") {
        await cleanupCreatedSession();
        return {
          status: "error",
          error: bindResult.error,
          childSessionKey,
        };
      }
      threadBindingReady = true;
      hasBoundThreadDeliveryOrigin = hasDeliveryTargetFields(bindResult.deliveryOrigin);
      childSessionOrigin =
        mergeDeliveryContext(bindResult.deliveryOrigin, childSessionOrigin) ?? childSessionOrigin;
    }
    const parsedMountPath = parseInlineAttachmentMountPath(params.attachMountPath);
    const mountPathHint =
      parsedMountPath.status === "valid" ? parsedMountPath.mountPath : undefined;

    const preparedEnvelope = prepareSubagentSpawnEnvelope({
      cfg,
      collect: params.collect === true,
      requestThreadBinding,
      completionTarget: params.completionTarget,
      spawnMode,
      hasBoundThreadDeliveryOrigin,
      expectsCompletionMessage,
      soleCollectorChild: soleImplicitMember,
      task,
      requesterSessionKey: ctx.agentSessionKey,
      requesterOrigin: childSessionOrigin,
      childSessionKey,
      label: label || undefined,
      childRuntimeSandboxed,
      childDepth,
      maxSpawnDepth,
      drainsContinuationDelegateQueue: params.drainsContinuationDelegateQueue === true,
      outputSchema: params.outputSchema,
    });
    const { completionMode, envelope } = preparedEnvelope;
    let { childSystemPrompt } = preparedEnvelope;

    const materializedAttachments = await materializeSubagentAttachments({
      assertActive,
      config: cfg,
      childSessionKey,
      targetAgentId,
      sandboxed: childRuntimeSandboxed,
      attachments: params.attachments,
      mountPathHint,
      redactContinuationErrorDetails: params.drainsContinuationDelegateQueue === true,
    });
    if (materializedAttachments && materializedAttachments.status !== "ok") {
      await cleanupCreatedSession(threadBindingReady);
      return {
        status: materializedAttachments.status,
        error: materializedAttachments.error,
      };
    }
    const attachmentId = materializedAttachments?.attachmentId;
    if (materializedAttachments) {
      childSystemPrompt = `${childSystemPrompt}\n\n${materializedAttachments.systemPromptSuffix}`;
    }

    const { childLaunch, queuedLaunch, progressOrigin, spawnedMetadata } =
      buildSubagentLaunchRequest({
        completionMode,
        spawnMode,
        message: envelope.message,
        spawnedByKey: requesterInternalKey,
        toolSpawnMetadata,
        spawnedWorkspaceDir: params.worktree ? undefined : spawnedWorkspaceDir,
        childSessionKey,
        childSessionOrigin,
        childIdem,
        outputSchema: params.outputSchema,
        childSystemPrompt,
        thinkingOverride,
        runTimeoutSeconds,
        lightContext: params.lightContext === true,
        requesterOrigin,
        currentMessagingTarget: ctx.currentMessagingTarget,
        currentChannelId: ctx.currentChannelId,
        currentMessageId: ctx.currentMessageId,
        launchAuthorization,
        swarmSchedulerGroupKey,
        swarmMaxConcurrent: swarmConfig.maxConcurrent,
      });
    applySubagentContinuationLaunchFields(childLaunch.request, params);
    await recordSubagentSpawned({
      childSessionKey,
      childRunId: childIdem,
      requesterSessionKey: requesterInternalKey,
      agentId: targetAgentId,
    });
    const recordRequesterParticipation = () =>
      recordSessionParticipantBestEffort({
        promptedAt,
        identity: { type: "agent", id: requesterAgentId },
        agentId: targetAgentId,
        sessionKey: childSessionKey,
        storePath: resolveSessionStorePathCore(cfg.session?.store, { agentId: targetAgentId }),
      });
    let acceptedChildRunId: string | undefined;
    const launchChildRun = createSubagentChildRunLauncher({
      ctx,
      traceparent: params.traceparent,
      childIdem,
      childSessionKey,
      childLaunch,
      gatewayIdentity: () =>
        buildSubagentSpawnGatewayIdentity({
          cfg,
          ctx,
          requesterAgentId,
          requesterInternalKey,
          controllerSessionKey: ownership.controllerSessionKey,
          childDepth,
          maxSpawnDepth,
          targetAgentId,
          sandboxMode,
        }),
      gatewayContextResolver,
      childEntry,
      cleanupOwner,
      onAccepted: (runId) => {
        acceptedChildRunId = runId;
      },
    });

    const spawnLifecycle = createSubagentSpawnLifecycleEmitter({
      hookRunner,
      childSessionKey,
      childSessionOrigin,
      requesterInternalKey,
      progressOrigin,
      targetAgentId,
      label: label || undefined,
      requesterOrigin,
      requestThreadBinding,
      spawnMode,
      resolvedModelMetadata,
    });
    const cleanupFailedSpawn = (options?: CollectorCleanupOptions) =>
      cleanupFailedSpawnBeforeAgentStart({
        childSessionKey,
        attachmentId,
        emitLifecycleHooks: threadBindingReady,
        deleteTranscript: true,
        ...provisionalSessionIdentity,
        ...options,
        isCurrent: isCleanupCurrent,
        ...(cleanupOwner ? { callGateway: cleanupOwner.callGateway } : {}),
      });
    type SubagentBackendState = { contextEnginePreparation?: PreparedContextEngineSubagentSpawn };
    let registrationRequired = true;
    const adapter: SpawnBackendAdapter<SubagentBackendState> = {
      retainRegistrationScope(scope) {
        canCleanupCreatedSession = scope.canCleanupSession;
        canAbortRegisteredRun = scope.canAbortAcceptedRun;
        canRetireReservation = scope.canRetireReservation;
      },
      async initialize() {
        const result =
          params.lightContext && preparedSpawnContext.mode === "isolated"
            ? ({ status: "ok", preparation: undefined } as const)
            : await prepareContextEngineSubagentSpawn({
                assertActive,
                cfg,
                context: preparedSpawnContext,
                requesterInternalKey,
                childSessionKey,
                runTimeoutSeconds,
              });
        if (result.status === "error") {
          throw new Error(result.error);
        }
        contextEnginePreparation = result.preparation;
        preparationHold.prepared(result.preparation, isCleanupCurrent);
        return { contextEnginePreparation };
      },
      async dispatchTurn() {
        if (params.collect) {
          return { runId: childIdem };
        }
        const launch = await launchChildRun(assertActive);
        registrationRequired = launch.registrationRequired;
        recordRequesterParticipation();
        return { runId: readGatewayRunId(launch.response) ?? childIdem };
      },
      async cleanupOnFailure({ phase, state, error }) {
        if (phase === "initialize") {
          await cleanupFailedSpawn();
          return;
        }
        const emitLifecycleHooks = await resolveSubagentSpawnFailureLifecycleHooks({
          phase,
          threadBindingReady,
          hookRunner,
          childSessionKey,
          accountId: childSessionOrigin?.accountId,
          runId: childIdem,
          requesterSessionKey: requesterInternalKey,
        });
        await cleanupAcceptedSubagentSpawnFailure({
          phase,
          error,
          runId: childIdem,
          childSessionKey,
          acceptedChildRunId,
          registrationRequired,
          contextEnginePreparation: state?.contextEnginePreparation,
          attachmentId,
          ...provisionalSessionIdentity,
          emitLifecycleHooks,
          cleanupCreatedSession,
          isCurrent: isCleanupCurrent,
          isAbortCurrent,
          cleanupOwner,
          retainAdmission: params.collect ? undefined : admissionReservation?.retain,
          ...(cleanupOwner ? { callGateway: cleanupOwner.callGateway } : {}),
        });
      },
    };
    pipelineEntered = true;
    const pipelineResult = await runSpawnPipeline({
      adapter,
      assertActive,
      admissionReservation,
      progressOrigin,
      progressSessionKey: requesterInternalKey,
      buildRegistration: (_state, runId) => {
        if (params.collect) {
          assertSubagentCollectorAdmission(resolveAdmission);
        }
        return {
          runId,
          requesterTurnRunId: ctx.requesterTurnRunId,
          childSessionKey,
          controllerSessionKey: ownership.controllerSessionKey,
          sessionEntry: childEntry,
          requesterSessionKey: ownership.completionRequesterSessionKey,
          requesterOrigin,
          progressOrigin,
          requesterDisplayKey: ownership.completionRequesterDisplayKey,
          task,
          taskName,
          agentId: targetAgentId,
          requesterAgentId,
          cleanup,
          label: label || undefined,
          model: resolvedModel,
          agentDir: targetAgentDir,
          workspaceDir: spawnedMetadata.workspaceDir,
          runTimeoutSeconds,
          expectsCompletionMessage: completionMode === "announce",
          completionTarget: params.completionTarget,
          completionRequesterSessionId,
          completionRequesterLifecycleRevision,
          spawnMode,
          collect: params.collect === true,
          swarmRequesterSessionKey: params.collect ? requesterInternalKey : undefined,
          swarmLaunchIdempotencyKey: params.collect ? childIdem : undefined,
          swarmLaunchReplayKey: params.collect ? swarmLaunchReplayKey : undefined,
          swarmLaunchRequestFingerprint: params.collect
            ? params.swarmLaunchRequestFingerprint
            : undefined,
          outputSchema: params.outputSchema,
          groupId: swarmGroupId,
          queuedLaunch,
          queued: params.collect === true,
          ...(gatewayContextResolver ? { gatewayContextResolver } : {}),
          attachmentId,
          retainAttachmentsOnKeep: materializedAttachments?.retainOnSessionKeep ?? false,
          ...buildSubagentContinuationRegistrationFields(params, {
            continuationTargetSessionKeys,
            continuationRecipientAuthorityBinding,
          }),
        };
      },
      assertRegistrationAdmission: () =>
        ctx.continuationDelegateAdmission?.assertCurrent("registry-acceptance"),
      assertPostPublicationAdmission: () =>
        ctx.continuationDelegateAdmission?.assertCurrent("final-acceptance"),
      publishRegistration: () =>
        publishSubagentSpawnRegistration({
          cfg,
          childEntry,
          childSessionKey,
          agentId: targetAgentId,
        }),
      afterRegistration: async (state, runId, registrationScope) => {
        ctx.continuationDelegateAdmission?.assertCurrent("lifecycle-publication");
        if (params.collect && swarmGroupId && swarmSchedulerGroupKey) {
          for (
            let claim = registrationScope?.waitForClaim();
            claim;
            claim = registrationScope?.waitForClaim()
          ) {
            await claim;
          }
          const canLaunch = registrationScope?.canLaunch() !== false;
          if (swarmReservation?.isCurrent() !== false) {
            // The scheduler also settles registrations that have lost launch authority.
            // Run activation under the named requester's retained operator authority (d0dcc9dedd).
            withGatewayToolOperatorContinuation(operatorAuthority, () =>
              activateSubagentCollectorSwarmRun(swarmSchedulerGroupKey, {
                childRunId: runId,
                childSessionKey,
                requesterSessionKey: requesterInternalKey,
                gatewayContextResolver,
                // Queued launch requires BOTH live operator authority and live
                // registration/continuation ownership. Authority is
                // threaded here, not derived from chain state.
                operatorAuthority,
                releaseOperatorAuthority: preparationHold.releaseAuthority,
                cleanupOwner,
                registrationScope,
                preparation: state.contextEnginePreparation,
                provisionalSessionIdentity,
                launchChildRun,
                recordParticipant: recordRequesterParticipation,
                emitSpawnLifecycleHooks: spawnLifecycle.spawned,
                cleanupFailedSpawn,
              }),
            );
          } else {
            if (canRetireReservation?.() !== false) {
              swarmReservation?.withdraw();
            }
            if (!canLaunch && canCleanupCreatedSession?.() !== false) {
              await rollbackPreparedContextEngine(contextEnginePreparation);
            } else {
              await contextEnginePreparation?.dispose().catch(() => {});
            }
          }
          contextEnginePreparation = undefined;
        } else {
          await spawnLifecycle.spawned(runId);
        }
      },
      rollbackRegistration: rollbackSubagentRunRegistration,
      recordAcceptedRollback: (registration, error) =>
        recordAcceptedSubagentSpawnRollback({
          ...registration,
          gatewayRunId: acceptedChildRunId ?? registration.runId,
          reason: error instanceof Error ? error.message : String(error),
          expectedRegistration: registration.expectedRegistration,
          ...provisionalSessionIdentity,
        }),
    });
    if (!pipelineResult.ok) {
      return buildSubagentSpawnPipelineFailureResult(pipelineResult, {
        childIdem,
        childSessionKey,
        reportFailurePhase: params.continuationChildRunId !== undefined,
      });
    }
    const childRunId = pipelineResult.runId;
    const collectorAccepted = params.collect && swarmGroupId && swarmSchedulerGroupKey;
    if (collectorAccepted) {
      swarmReservationPending = false;
    }

    // Publish only after preparation releases its hold and exposes the scheduler's capacity state.
    await swarmReservation?.release();
    emitSessionLifecycleEvent({
      sessionKey: childSessionKey,
      reason: "create",
      parentSessionKey: requesterInternalKey,
      label: label || undefined,
    });
    return {
      status: "accepted",
      childSessionKey,
      ...(collectorAccepted ? { sessionKey: childSessionKey } : {}),
      runId: childRunId,
      mode: spawnMode,
      expectsCompletionMessage: completionMode === "announce",
      completionTarget: params.completionTarget,
      context: preparedSpawnContext.mode,
      taskName,
      note:
        [envelope.acceptedNote, preparedSpawnContext.forkFallbackNote].filter(Boolean).join(" ") ||
        undefined,
      ...resolvedModelMetadata,
      modelApplied: plan.modelApplied || undefined,
      attachments: materializedAttachments?.receipt,
    };
  } catch (error) {
    if (returnsPhaselessSubagentSpawnCancel(error, params, pipelineEntered)) {
      return { status: "cancelled", error: error.message };
    }
    throw error;
  } finally {
    provisionalCleanupOpen = false;
    preparationHold.finish();
    admissionReservation?.release();
    if (swarmReservationPending && canRetireReservation?.() !== false) {
      swarmReservation?.withdraw();
    }
    try {
      if (params.collect && contextEnginePreparation && canCleanupCreatedSession?.() !== false) {
        await rollbackPreparedContextEngine(contextEnginePreparation);
      } else {
        await contextEnginePreparation?.dispose().catch(() => {});
      }
    } finally {
      await swarmReservation?.release();
    }
  }
}
