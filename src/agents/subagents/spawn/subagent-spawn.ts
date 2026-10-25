import { composeSessionSourceAssertion } from "../../../config/sessions/session-source-authority.js";
import {
  readExecRequestOwners,
  withExecRequestOwners,
} from "../../../infra/exec-request-context.js";
import { parseInlineAttachmentMountPath } from "../../../shared/inline-attachments.js";
import { hasDeliveryTargetFields } from "../../../utils/delivery-context.shared.js";
import { runWithAgentToolSourceExecutionScope } from "../../agent-tool-source-execution-guard.js";
import { prepareNativeDelegatedToolPolicy } from "../../delegated-tool-policy.js";
import { runSpawnPipeline, type SpawnBackendAdapter } from "../../spawn-pipeline.js";
import { withGatewayToolOperatorContinuation } from "../../tools/gateway-caller-context.js";
import {
  buildContinuationSessionPatch,
  type ContinuationSpawnParams,
} from "../announce/subagent-announce.runtime.js";
import { materializeSubagentAttachments } from "./subagent-attachments.js";
import * as acceptance from "./subagent-spawn-acceptance.js";
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
  settlePreparedContextEngine,
  type PreparedContextEngineSubagentSpawn,
} from "./subagent-spawn-context.js";
import {
  applySubagentContinuationLaunchFields,
  buildSubagentContinuationRegistrationFields,
  resolveSubagentContinuationLaunchError,
  returnsPhaselessSubagentSpawnCancel,
  resolveSubagentContinuationChildRunId,
  resolveSubagentContinuationChildSessionKey,
} from "./subagent-spawn-continuation.js";
import type {
  SpawnSubagentContext,
  SpawnSubagentParams as BaseSpawnSubagentParams,
  SpawnSubagentResult,
} from "./subagent-spawn-contract.js";
import { prepareSubagentSpawnEnvelope } from "./subagent-spawn-envelope.js";
import { buildSubagentSpawnGatewayIdentity } from "./subagent-spawn-gateway-identity.js";
import { captureSubagentSpawnGatewayContext, readGatewayRunId } from "./subagent-spawn-gateway.js";
import { buildSubagentLaunchRequest } from "./subagent-spawn-launch-request.js";
import {
  createSubagentSpawnLifecycleEmitter,
  recordSubagentSessionSetup,
} from "./subagent-spawn-lifecycle.js";
import { applySubagentProfile } from "./subagent-spawn-profile.js";
import {
  assertSubagentCollectorAdmission,
  buildSubagentSpawnPipelineFailureResult,
  notifyHomeOfAcceptedSubagentSession,
} from "./subagent-spawn-registration.js";
import { resolveSubagentSpawnRequest } from "./subagent-spawn-request.js";
import { cleanupAcceptedSubagentSpawnFailure } from "./subagent-spawn-rollback.js";
import { createInitialSubagentSession } from "./subagent-spawn-session-patch.js";
import { bindThreadForSubagentSpawn } from "./subagent-spawn-thread-binding.js";
import { emitSessionLifecycleEvent, mergeDeliveryContext } from "./subagent-spawn.runtime.js";

export { SUBAGENT_SPAWN_CONTEXT_MODES, SUBAGENT_SPAWN_MODES } from "./subagent-spawn.types.js";

export type SpawnSubagentParams = BaseSpawnSubagentParams & ContinuationSpawnParams;
export type { SpawnSubagentContext, SpawnSubagentResult };

export async function spawnSubagentDirect(
  input: SpawnSubagentParams,
  context: SpawnSubagentContext,
): Promise<SpawnSubagentResult> {
  const { params, ctx, profileReceipt, systemPrompt } = applySubagentProfile(input, context);
  let assertDelegationCurrent: (() => void) | undefined;
  const assertActive = composeSessionSourceAssertion([ctx.assertActive], (assertSource) => {
    assertSource();
    assertDelegationCurrent?.();
  });
  const promptedAt = Date.now();
  const label = params.label?.trim() || "";
  const requestThreadBinding = params.thread === true;
  const sandboxMode = params.sandbox === "require" ? "require" : "inherit";
  // Capture before any await. operatorAuthority is a separate gate from
  // continuationChainState: chain state is accounting, never authorization.
  const { gatewayContextResolver, operatorAuthority, requester, creatorProfileId } =
    captureSubagentSpawnGatewayContext();
  const continuationLaunchError = await resolveSubagentContinuationLaunchError(params);
  if (continuationLaunchError) {
    return continuationLaunchError;
  }
  const requestResolution = await resolveSubagentSpawnRequest(params, ctx);
  if (!requestResolution.ok) {
    return requestResolution.result;
  }
  const {
    taskName,
    spawnMode,
    cleanup,
    expectsCompletionMessage,
    completionRequesterSessionId,
    completionRequesterLifecycleRevision,
    hookRunner,
    cfg,
    runTimeoutSeconds,
    contextMode,
    requesterInternalKey,
    ownership,
    requesterAgentId,
    targetAgentId,
    swarmConfig,
    swarmGroupId,
    swarmSchedulerGroupKey,
    swarmLaunchReplayKey,
    soleImplicitMember,
    reservationPending,
    swarmReservation,
    resolveAdmission,
    admission,
    admissionReservation,
    childDepth,
    maxSpawnDepth,
    continuationTargetSessionKeys,
    continuationRecipientAuthorityBinding,
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
    const delegation = prepareNativeDelegatedToolPolicy({
      config: cfg,
      requesterAgentId,
      targetAgentId,
      requesterSessionKey: requesterInternalKey,
      context: ctx,
    });
    const delegatedToolPolicy = delegation.policy;
    assertDelegationCurrent = delegation.assertCurrent;
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
      request: { ...params, context: contextMode },
      ctx: { ...ctx, assertActive },
      cfg,
      requesterInternalKey,
      requesterAgentId,
      targetAgentId,
      requesterEntry: requestResolution.resolved.requesterEntry,
      sandboxMode,
      swarmEnabled: swarmConfig.enabled,
      requesterSandboxed: ctx.sandboxed,
      creatorProfileId,
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
    const sessionError = (error: string): SpawnSubagentResult => ({
      status: "error",
      error,
      childSessionKey,
    });
    const initialSession = await runWithAgentToolSourceExecutionScope(assertActive, () =>
      createInitialSubagentSession({
        assertActive,
        cfg,
        requesterAgentId,
        targetAgentId,
        childSessionKey,
        label: label || undefined,
        incognito,
        requesterInternalKey,
        parentTarget: requestResolution.resolved.requesterTarget,
        senderIsOwner: ctx.senderIsOwner,
        gitContributorProfileId: ctx.gitContributorProfileId,
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
        delegatedToolPolicy,
        modelPatch: plan.initialSessionPatch,
        continuationPatch: buildContinuationSessionPatch(params),
        swarmGroupId,
        collect: params.collect === true,
        outputSchema: params.outputSchema,
        continuationDelegateAdmission: ctx.continuationDelegateAdmission,
        firstAdmission: childPlan.resolved.firstAdmission,
      }),
    );
    if (initialSession.status === "error") {
      return sessionError(initialSession.error);
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
            target: initialSession.controllerTarget,
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
        ...provisionalSessionIdentity,
        isCurrent: isCleanupCurrent,
        ...(cleanupOwner ? { callGateway: cleanupOwner.callGateway } : {}),
      });
    const preparedSpawnContext = await runWithAgentToolSourceExecutionScope(assertActive, () =>
      prepareSubagentSessionContext({
        assertActive,
        cfg,
        contextMode,
        requesterAgentId,
        targetAgentId,
        requesterInternalKey,
        childSessionKey,
      }),
    );
    if (preparedSpawnContext.status === "error") {
      await cleanupCreatedSession();
      return sessionError(preparedSpawnContext.error);
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
      const bindResult = await runWithAgentToolSourceExecutionScope(assertActive, () =>
        bindThreadForSubagentSpawn({
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
        }),
      );
      if (bindResult.status === "error") {
        await cleanupCreatedSession();
        return sessionError(bindResult.error);
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
      task: params.task,
      requesterSessionKey: ctx.agentSessionKey,
      requesterOrigin: childSessionOrigin,
      childSessionKey,
      label: label || undefined,
      childRuntimeSandboxed,
      childDepth,
      maxSpawnDepth,
      drainsContinuationDelegateQueue: params.drainsContinuationDelegateQueue === true,
      outputSchema: params.outputSchema,
      systemPrompt,
    });
    const { completionMode, envelope } = preparedEnvelope;
    let { childSystemPrompt } = preparedEnvelope;

    const materializedAttachments = await runWithAgentToolSourceExecutionScope(assertActive, () =>
      materializeSubagentAttachments({
        assertActive,
        config: cfg,
        childSessionKey,
        targetAgentId,
        sandboxed: childRuntimeSandboxed,
        attachments: params.attachments,
        mountPathHint,
        continuationDelegateSnapshot: params.drainsContinuationDelegateQueue === true,
      }),
    );
    if (materializedAttachments && materializedAttachments.status !== "ok") {
      await cleanupCreatedSession(threadBindingReady);
      return materializedAttachments;
    }
    const attachmentId = materializedAttachments?.attachmentId;
    if (materializedAttachments) {
      childSystemPrompt = `${childSystemPrompt}\n\n${materializedAttachments.systemPromptSuffix}`;
    }

    const launchContext = buildSubagentLaunchRequest({
      completionMode,
      spawnMode,
      message: envelope.message,
      spawnedByKey: requesterInternalKey,
      toolSpawnMetadata,
      spawnedWorkspaceDir: params.worktree ? undefined : spawnedWorkspaceDir,
      childSessionKey,
      childSession: { entry: childEntry, freshChild: initialSession.freshChild },
      childSessionOrigin,
      childIdem,
      outputSchema: params.outputSchema,
      childSystemPrompt,
      runTimeoutSeconds,
      lightContext: params.lightContext === true,
      requesterOrigin,
      currentMessagingTarget: ctx.currentMessagingTarget,
      currentChannelId: ctx.currentChannelId,
      currentMessageId: ctx.currentMessageId,
      launchAuthorization,
      requesterFacts: requester?.requesterOrigin,
      operatorAuthority,
      swarmSchedulerGroupKey,
      swarmMaxConcurrent: swarmConfig.maxConcurrent,
    });
    const { childLaunch, queuedLaunch, progressOrigin, spawnedMetadata } = launchContext;
    applySubagentContinuationLaunchFields(childLaunch.request, params);
    const recordRequesterParticipation = await recordSubagentSessionSetup({
      cfg,
      childEntry,
      childSessionKey,
      childRunId: childIdem,
      requesterSessionKey: requesterInternalKey,
      requesterAgentId,
      targetAgentId,
      promptedAt,
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
      requester,
      preparedLaunch: launchContext.preparedLaunch,
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
    const childTarget = { childSessionKey, childAgentId: targetAgentId };
    const cleanupFailedSpawn = (options?: CollectorCleanupOptions) =>
      cleanupFailedSpawnBeforeAgentStart({
        ...childTarget,
        attachmentId,
        emitLifecycleHooks: threadBindingReady,
        ...provisionalSessionIdentity,
        ...options,
        isCurrent: isCleanupCurrent,
        ...(cleanupOwner ? { callGateway: cleanupOwner.callGateway } : {}),
      });
    type SubagentBackendState = { contextEnginePreparation?: PreparedContextEngineSubagentSpawn };
    let registrationRequired = true;
    let acceptedRunCleanupError: string | undefined;
    const adapter: SpawnBackendAdapter<SubagentBackendState> = {
      retainRegistrationScope(scope) {
        canCleanupCreatedSession = scope.canCleanupSession;
        canAbortRegisteredRun = scope.canAbortAcceptedRun;
        canRetireReservation = scope.canRetireReservation;
      },
      async initialize() {
        const preparation =
          params.lightContext && preparedSpawnContext.mode === "isolated"
            ? undefined
            : await runWithAgentToolSourceExecutionScope(assertActive, () =>
                prepareContextEngineSubagentSpawn({
                  assertActive,
                  cfg,
                  context: preparedSpawnContext,
                  requesterInternalKey,
                  childSessionKey,
                  runTimeoutSeconds,
                }),
              );
        contextEnginePreparation = preparation;
        preparationHold.prepared(preparation, isCleanupCurrent);
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
        acceptedRunCleanupError = await cleanupAcceptedSubagentSpawnFailure({
          phase,
          error,
          runId: childIdem,
          ...childTarget,
          acceptedChildRunId,
          registrationRequired,
          contextEnginePreparation: state?.contextEnginePreparation,
          attachmentId,
          ...provisionalSessionIdentity,
          resolveLifecycleHooks: async () =>
            phase === "dispatch" && threadBindingReady
              ? !(await spawnLifecycle.failed(childIdem))
              : threadBindingReady,
          cleanupCreatedSession,
          isCurrent: isCleanupCurrent,
          isAbortCurrent,
          cleanupOwner,
          ...(cleanupOwner ? { callGateway: cleanupOwner.callGateway } : {}),
        });
      },
    };
    pipelineEntered = true;
    const pipelineResult = await runSpawnPipeline({
      ...withExecRequestOwners({}, readExecRequestOwners(ctx)),
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
          nativePluginOwner: params.collect ? ctx.nativePluginOwner : undefined,
          subagentProfile: profileReceipt,
          ...childTarget,
          controllerSessionKey: ownership.controllerSessionKey,
          sessionEntry: childEntry,
          requesterSessionKey: ownership.completionRequesterSessionKey,
          requesterOrigin,
          progressOrigin,
          requesterDisplayKey: ownership.completionRequesterDisplayKey,
          task: params.task,
          taskName,
          requesterAgentId,
          cleanup,
          label: label || undefined,
          model: plan.resolvedModel,
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
          ...acceptance.arm(params, acceptedChildRunId ?? runId, provisionalSessionIdentity),
        };
      },
      ...acceptance.buildNativeSpawnAcceptance({ collect: params.collect === true, ctx }),
      assertRegistrationAdmission: () =>
        ctx.continuationDelegateAdmission?.assertCurrent("registry-acceptance"),
      assertPostPublicationAdmission: () =>
        ctx.continuationDelegateAdmission?.assertCurrent("final-acceptance"),
      onAcceptanceConfirmed: () =>
        notifyHomeOfAcceptedSubagentSession(cfg, childEntry, childSessionKey, targetAgentId),
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
            const selection = { operatorAuthority, requesterOrigin: requester?.requesterOrigin };
            // Run activation under the named requester's retained operator authority (d0dcc9dedd).
            withGatewayToolOperatorContinuation(selection, () =>
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
            await settlePreparedContextEngine(
              contextEnginePreparation,
              !canLaunch && canCleanupCreatedSession?.() !== false,
            );
          }
          contextEnginePreparation = undefined;
        } else {
          await spawnLifecycle.spawned(runId);
        }
      },
      ...acceptance.buildRegistrationRollback(() => ({
        gatewayRunId: acceptedChildRunId,
        identity: provisionalSessionIdentity,
      })),
    });
    if (!pipelineResult.ok) {
      return buildSubagentSpawnPipelineFailureResult(pipelineResult, {
        childIdem,
        childSessionKey,
        reportFailurePhase: params.continuationChildRunId !== undefined,
        acceptedRunCleanupError,
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
      ...(label ? { label } : {}),
      ...(swarmGroupId ? { groupId: swarmGroupId } : {}),
      ...(collectorAccepted ? { sessionKey: childSessionKey } : {}),
      runId: childRunId,
      mode: spawnMode,
      expectsCompletionMessage: completionMode === "announce",
      completionTarget: params.completionTarget,
      context: preparedSpawnContext.mode,
      taskName,
      note:
        [
          envelope.acceptedNote,
          preparedSpawnContext.forkFallbackNote,
          acceptance.note(pipelineResult),
        ]
          .filter(Boolean)
          .join(" ") || undefined,
      ...resolvedModelMetadata,
      modelApplied: plan.modelApplied || undefined,
      attachments: materializedAttachments?.receipt,
      ...acceptance.buildAcceptedSpawnHandles(pipelineResult, ctx),
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
      await settlePreparedContextEngine(
        contextEnginePreparation,
        params.collect === true && canCleanupCreatedSession?.() !== false,
      );
    } finally {
      await swarmReservation?.release();
    }
  }
}
