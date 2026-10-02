import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { isSilentReplyText, SILENT_REPLY_TOKEN } from "../../../auto-reply/tokens.js";
import { hasSqliteWorkerOutcomeUnknown } from "../../../infra/sqlite-worker-contract.js";
import { withPluginRuntimeGatewayContextResolver } from "../../../plugins/runtime/gateway-request-scope.js";
import { defaultRuntime } from "../../../runtime.js";
import { isCronSessionKey } from "../../../sessions/session-key-utils.js";
import { normalizeDeliveryContext } from "../../../utils/delivery-context.shared.js";
import {
  isDeliverableMessageChannel,
  normalizeMessageChannel,
} from "../../../utils/message-channel.js";
import {
  buildAnnounceIdFromChildRun,
  buildAnnounceIdempotencyKey,
} from "../../announce-idempotency.js";
import { isDelegateArtifactReturnConfigured } from "../../delegate-artifacts.js";
import { buildSubagentAnnounceMessages } from "../../subagent-announce-message.js";
import { normalizeSubagentAnnounceReply } from "../../subagent-announce-reply.js";
import {
  countPendingDescendantRuns,
  getLatestSubagentRunByChildSessionKey,
  isSubagentSessionRunActive,
  listSubagentRunsForRequester,
  resolveRequesterForChildSession,
  shouldIgnorePostCompletionAnnounceForSession,
} from "../registry/subagent-registry-read.js";
import { deleteSubagentSessionForCleanup } from "../registry/subagent-session-cleanup.js";
import { getSubagentDepthFromSessionStore } from "../spawn/subagent-depth.js";
import type { SubagentRunOutcome } from "../subagent-run-outcome.types.js";
import {
  finalizeSubagentAnnounceArtifacts,
  prepareSubagentAnnounceArtifactProjections,
} from "./subagent-announce-artifacts.js";
import {
  deliverSubagentAnnouncement,
  loadSessionEntryByKey,
} from "./subagent-announce-delivery.js";
import { loadSubagentContinuationRuntime, subagentAnnounceDeps } from "./subagent-announce-deps.js";
import { wakeSubagentRunWithDescendantFindings } from "./subagent-announce-descendant-findings-wake.js";
import { isWakeContinuationRun } from "./subagent-announce-descendant-wake.js";
import type { SubagentAnnounceDeliveryResult } from "./subagent-announce-dispatch.js";
import {
  resolveAnnounceOrigin,
  resolveSubagentCompletionOrigin,
} from "./subagent-announce-origin.js";
import {
  readChildCompletionFindings,
  readSubagentRunAnnounceResult,
  buildCompactAnnounceStatsLine,
  dedupeLatestChildCompletionRows,
  filterCurrentDirectChildCompletionRows,
  readLatestSubagentOutputWithRetry,
  readSubagentOutput,
  readSubagentTimeoutProgress,
} from "./subagent-announce-output.js";
import {
  createOwnerBoundContinuationEntryLoader,
  createSubagentAnnounceEntryReaders,
  formatSubagentAnnounceOwnerFailure,
} from "./subagent-announce-owner-coordination.js";
import {
  isEmbeddedAgentRunActive,
  waitForEmbeddedAgentRunEnd,
} from "./subagent-announce.runtime.js";
import type {
  SubagentAnnounceFlowOutcome,
  SubagentAnnounceFlowParams,
} from "./subagent-announce.types.js";

export { captureSubagentCompletionReply } from "./subagent-announce-output.js";
export { testing } from "./subagent-announce-deps.js";
export type {
  SubagentAnnounceFlowOutcome,
  SubagentAnnounceFlowParams,
} from "./subagent-announce.types.js";

export function hasUsableSessionEntry(entry: unknown): entry is Record<string, unknown> {
  if (!isRecord(entry)) {
    return false;
  }
  const sessionId = entry.sessionId;
  return typeof sessionId !== "string" || sessionId.trim() !== "";
}

export async function runSubagentAnnounceFlow(
  params: SubagentAnnounceFlowParams,
): Promise<SubagentAnnounceFlowOutcome> {
  return await (params.resolveGatewayContext
    ? withPluginRuntimeGatewayContextResolver(params.resolveGatewayContext, () =>
        runSubagentAnnounceFlowBound(params),
      )
    : runSubagentAnnounceFlowBound(params));
}

async function runSubagentAnnounceFlowBound(
  params: SubagentAnnounceFlowParams,
): Promise<SubagentAnnounceFlowOutcome> {
  let announceOutcome: SubagentAnnounceFlowOutcome = "retryable";
  let failureStage = "session-owner-resolution";
  const expectsCompletionMessage = params.expectsCompletionMessage === true;
  let shouldDeleteChildSession = params.cleanup === "delete";
  const childSessionEffectsAllowed = () =>
    params.suppressChildSessionEffects !== true &&
    params.isChildSessionEffectsAllowed?.() !== false;
  // Upstream result-currency gating: a result that changed mid-announce must
  // not be delivered. Both closures are replaced by prepared reads below.
  const prepareChildSessionEffects = async () =>
    childSessionEffectsAllowed() &&
    (await params.prepareChildSessionEffects?.()) !== false &&
    childSessionEffectsAllowed();
  let isOwnResultCurrent = () => true;
  let isChildResultsCurrent = () => true;
  const completionDeliveryAllowed = () =>
    params.isCompletionDeliveryAllowed?.() !== false &&
    isOwnResultCurrent() &&
    isChildResultsCurrent();
  let childSessionId: string | undefined;
  let childSessionLifecycleRevision: string | undefined;
  try {
    const { invalidateSessionEntry, readRequesterSessionEntry, readSessionEntryByKey } =
      createSubagentAnnounceEntryReaders();
    let targetRequesterSessionKey = params.requesterSessionKey;
    let targetRequesterAgentId = params.requesterAgentId;
    let targetRequesterOrigin = normalizeDeliveryContext(params.requesterOrigin);
    const childSessionEntry =
      !(await prepareChildSessionEffects()) || !childSessionEffectsAllowed()
        ? undefined
        : await loadSessionEntryByKey(params.childSessionKey, params.childAgentId);
    childSessionId =
      typeof childSessionEntry?.sessionId === "string" && childSessionEntry.sessionId.trim()
        ? childSessionEntry.sessionId.trim()
        : undefined;
    childSessionLifecycleRevision = normalizeOptionalString(childSessionEntry?.lifecycleRevision);
    const settleTimeoutMs = Math.min(Math.max(params.timeoutMs, 1), 120_000);
    let reply =
      params.terminalReply?.disposition === "visible"
        ? params.terminalReply.text
        : params.terminalReply?.disposition === "silent"
          ? SILENT_REPLY_TOKEN
          : params.roundOneReply;
    let outcome: SubagentRunOutcome = params.outcome ?? { status: "unknown" };
    if (
      childSessionId &&
      (await prepareChildSessionEffects()) &&
      childSessionEffectsAllowed() &&
      isEmbeddedAgentRunActive(childSessionId)
    ) {
      const settled = await waitForEmbeddedAgentRunEnd(childSessionId, settleTimeoutMs);
      if (!settled && isEmbeddedAgentRunActive(childSessionId)) {
        shouldDeleteChildSession = false;
        // Keep delete cleanup retryable until the active child can be removed.
        if (outcome?.status !== "timeout" || params.cleanup === "delete") {
          return "retryable";
        }
      }
    }

    const failedTerminalOutcome = outcome.status === "error";
    const allowFailedOutputCapture =
      !failedTerminalOutcome || (!params.roundOneReply && !params.fallbackReply);
    if (failedTerminalOutcome && !params.terminalReply) {
      reply = undefined;
    }
    const managedArtifactReturn =
      childSessionEffectsAllowed() &&
      params.childRunId.startsWith("continuation-delegate-") &&
      (await isDelegateArtifactReturnConfigured(params.childRunId));
    let requesterDepth = getSubagentDepthFromSessionStore(targetRequesterSessionKey, {
      cfg: subagentAnnounceDeps.getRuntimeConfig(),
      agentId: targetRequesterAgentId,
    });
    const requesterIsInternalSession = () =>
      requesterDepth >= 1 || isCronSessionKey(targetRequesterSessionKey);
    // Keep this aligned with the targeted-return router. Any explicit target,
    // plural target set, or fanout mode must reach that router even if the
    // immediate requester has already been cleaned up.
    const hasTargeting = Boolean(
      params.continuationTargetSessionKey ||
      (params.continuationTargetSessionKeys && params.continuationTargetSessionKeys.length > 0) ||
      params.continuationFanoutMode,
    );

    let childCompletionFindings: string | undefined;
    let childCompletionRows: Parameters<typeof readChildCompletionFindings>[0] | undefined;
    let subagentRegistryRuntime:
      | Awaited<ReturnType<typeof subagentAnnounceDeps.loadSubagentRegistryRuntime>>
      | undefined;
    try {
      subagentRegistryRuntime = await subagentAnnounceDeps.loadSubagentRegistryRuntime();
      if (requesterIsInternalSession()) {
        if (!isSubagentSessionRunActive(targetRequesterSessionKey)) {
          // A cleaned-up intermediate child normally must not receive a late
          // ordinary completion announcement. A tree continuation return is
          // different: its ancestor set is resolved from that intermediate
          // child, so dropping here strands a completed grandchild before the
          // targeted-return router can deliver to the root.
          if (
            params.completionTarget !== "parent" &&
            !hasTargeting &&
            !managedArtifactReturn &&
            shouldIgnorePostCompletionAnnounceForSession(targetRequesterSessionKey)
          ) {
            return "delivered";
          }
          if (!hasUsableSessionEntry(await readSessionEntryByKey(targetRequesterSessionKey))) {
            if (params.completionTarget === "parent") {
              shouldDeleteChildSession = false;
              return "retryable";
            }
            const fallback = resolveRequesterForChildSession(targetRequesterSessionKey);
            if (!fallback?.requesterSessionKey) {
              shouldDeleteChildSession = false;
              return "retryable";
            }
            targetRequesterSessionKey = fallback.requesterSessionKey;
            targetRequesterAgentId = fallback.requesterAgentId;
            targetRequesterOrigin =
              normalizeDeliveryContext(fallback.requesterOrigin) ?? targetRequesterOrigin;
            requesterDepth = getSubagentDepthFromSessionStore(targetRequesterSessionKey, {
              cfg: subagentAnnounceDeps.getRuntimeConfig(),
              agentId: targetRequesterAgentId,
            });
          }
        }
      }

      const childSessionCurrent = await prepareChildSessionEffects();
      const pendingChildDescendantRuns =
        !childSessionCurrent || !childSessionEffectsAllowed()
          ? 0
          : Math.max(
              0,
              await countPendingDescendantRuns(params.childSessionKey, () => {
                if (!childSessionEffectsAllowed()) {
                  throw new Error("Subagent child-session effects are no longer current.");
                }
              }),
            );
      if (pendingChildDescendantRuns > 0) {
        shouldDeleteChildSession = false;
        return "retryable";
      }

      if (
        childSessionCurrent &&
        childSessionEffectsAllowed() &&
        params.wakeOnDescendantSettle === true
      ) {
        const directChildren = listSubagentRunsForRequester(params.childSessionKey, {
          requesterRunId: params.childRunId,
        });
        if (directChildren.length > 0) {
          childCompletionRows = dedupeLatestChildCompletionRows(
            filterCurrentDirectChildCompletionRows(directChildren, {
              requesterSessionKey: params.childSessionKey,
              getLatestSubagentRunByChildSessionKey,
            }),
          );
        }
      }
    } catch {
      // Best-effort only.
    }

    if (
      childCompletionRows &&
      (await prepareChildSessionEffects()) &&
      childSessionEffectsAllowed()
    ) {
      const prepared = await readChildCompletionFindings(childCompletionRows);
      childCompletionFindings = prepared.text;
      isChildResultsCurrent = prepared.isCurrent;
    }

    const announceId = buildAnnounceIdFromChildRun({
      childSessionKey: params.childSessionKey,
      childRunId: params.childRunId,
    });

    const childRunAlreadyWoken = isWakeContinuationRun(params.childRunId);
    if (
      params.wakeOnDescendantSettle === true &&
      childSessionEffectsAllowed() &&
      childCompletionFindings?.trim() &&
      subagentRegistryRuntime &&
      !childRunAlreadyWoken
    ) {
      const wake = await wakeSubagentRunWithDescendantFindings(
        params,
        {
          findings: childCompletionFindings,
          prepareCurrent: prepareChildSessionEffects,
          isChildSessionEffectsAllowed: () =>
            childSessionEffectsAllowed() && completionDeliveryAllowed(),
        },
        subagentAnnounceDeps,
      );
      if (wake === "woke") {
        shouldDeleteChildSession = false;
        return "delivered";
      }
      if (wake === "termination-unconfirmed") {
        shouldDeleteChildSession = false;
        return "retryable";
      }
    }

    let skipAnnounceDelivery = false;
    const fallbackReply = failedTerminalOutcome
      ? undefined
      : normalizeOptionalString(params.fallbackReply);
    const hasVisibleFallback =
      Boolean(fallbackReply) && !isSilentReplyText(fallbackReply, SILENT_REPLY_TOKEN);
    const cleanedFallbackReply = hasVisibleFallback
      ? (normalizeSubagentAnnounceReply(fallbackReply ?? "") ?? undefined)
      : undefined;

    const childRun = getLatestSubagentRunByChildSessionKey(params.childSessionKey);
    if (
      childRun?.runId === params.childRunId &&
      (await prepareChildSessionEffects()) &&
      childSessionEffectsAllowed()
    ) {
      const prepared = await readSubagentRunAnnounceResult(childRun);
      reply = prepared.text;
      isOwnResultCurrent = prepared.isCurrent;
    }

    if (params.terminalReply?.disposition === "silent") {
      if (!hasVisibleFallback && !expectsCompletionMessage) {
        return "delivered";
      }
      reply = cleanedFallbackReply;
    }
    if (
      params.terminalReply?.disposition === "empty" &&
      outcome.status === "timeout" &&
      (await prepareChildSessionEffects()) &&
      childSessionEffectsAllowed()
    ) {
      const timeoutProgress = await readSubagentTimeoutProgress(
        params.childSessionKey,
        params.timeoutMs,
        outcome,
      );
      // Empty remains the authoritative terminal fact. Transcript text is a
      // timeout-only progress hint and must never reclassify silence as output.
      if (timeoutProgress) {
        reply = normalizeSubagentAnnounceReply(timeoutProgress) ?? undefined;
      }
    }
    if (!params.terminalReply) {
      if (
        !reply &&
        allowFailedOutputCapture &&
        (await prepareChildSessionEffects()) &&
        childSessionEffectsAllowed()
      ) {
        reply = await readSubagentOutput(params.childSessionKey, outcome);
      }

      if (
        !reply?.trim() &&
        allowFailedOutputCapture &&
        (await prepareChildSessionEffects()) &&
        childSessionEffectsAllowed()
      ) {
        reply = await readLatestSubagentOutputWithRetry({
          sessionKey: params.childSessionKey,
          maxWaitMs: params.timeoutMs,
          outcome,
        });
      }

      if (!reply?.trim() && hasVisibleFallback) {
        reply = fallbackReply;
      }

      if (isSilentReplyText(reply, SILENT_REPLY_TOKEN)) {
        if (hasVisibleFallback && cleanedFallbackReply) {
          reply = cleanedFallbackReply;
        } else {
          const suppressCompletion = !expectsCompletionMessage || hasVisibleFallback;
          if (managedArtifactReturn && suppressCompletion) {
            reply = "(no output)";
          } else if (suppressCompletion) {
            skipAnnounceDelivery = true;
          } else {
            reply = undefined;
          }
        }
      } else if (reply) {
        reply = normalizeSubagentAnnounceReply(reply) ?? cleanedFallbackReply;
        if (!reply) {
          if (managedArtifactReturn) {
            reply = "(no output)";
          } else {
            skipAnnounceDelivery = true;
          }
        }
      }
    }

    const childSessionCurrent = await prepareChildSessionEffects();
    if (!childSessionCurrent || !childSessionEffectsAllowed()) {
      reply = params.roundOneReply ?? params.fallbackReply;
      if (
        expectsCompletionMessage &&
        (params.terminalReply?.disposition === "silent" ||
          isSilentReplyText(reply, SILENT_REPLY_TOKEN))
      ) {
        reply = hasVisibleFallback ? cleanedFallbackReply : undefined;
      }
    }

    const cfg = subagentAnnounceDeps.getRuntimeConfig();
    const { announceSessionId, artifactFinalization } = await finalizeSubagentAnnounceArtifacts({
      cfg,
      flow: params,
      childSessionId,
      isChildSessionEffectsCurrent: () => childSessionCurrent && childSessionEffectsAllowed(),
      announceId,
      outcomeStatus: outcome.status,
    });
    if (artifactFinalization.status === "deferred") {
      return "retryable";
    }
    if (artifactFinalization.status === "failed") {
      outcome = {
        status: "error",
        error: `managed artifact return failed (${artifactFinalization.disposition})`,
      };
    }

    const taskLabel = params.label || params.task || "task";
    // Descendant findings are wake input; only this child's own answer travels
    // onward, so private descendants can never leak through the parent result.
    const childResultText = reply;
    let findings = childResultText || "(no output)";
    const continuationRuntime = await loadSubagentContinuationRuntime();
    failureStage = "terminal-token-admission";
    const continuation = await continuationRuntime.coordinateSubagentContinuation({
      cfg,
      childSessionKey: params.childSessionKey,
      childAgentId: params.childAgentId,
      childRunId: params.childRunId,
      targetRequesterSessionKey,
      targetRequesterOrigin,
      task: params.task ?? "",
      findings,
      skipAnnounceDelivery,
      silentAnnounce: params.silentAnnounce,
      wakeOnReturn: params.wakeOnReturn,
      traceparent: params.traceparent,
      loadEntry: createOwnerBoundContinuationEntryLoader({
        childSessionKey: params.childSessionKey,
        childAgentId: params.childAgentId,
        requesterSessionKey: targetRequesterSessionKey,
        requesterAgentId: targetRequesterAgentId,
        loadOwned: loadSessionEntryByKey,
        loadFallback: readSessionEntryByKey,
      }),
      invalidateSessionEntry,
    });
    findings = continuation.findings;
    if (
      continuation.originDelegateFlowStatus === "queued" ||
      continuation.originDelegateFlowStatus === "running" ||
      ((await prepareChildSessionEffects()) &&
        childSessionEffectsAllowed() &&
        (await countPendingDescendantRuns(params.childSessionKey, () => {
          if (!childSessionEffectsAllowed()) {
            throw new Error("Subagent child-session effects are no longer current.");
          }
        })) > 0)
    ) {
      // Coordination can admit a child after the earlier descendant check.
      // Recheck now so cleanup cannot retire the orchestrator before its return.
      shouldDeleteChildSession = false;
      return "retryable";
    }
    if (continuation.skipAnnounceDelivery && !managedArtifactReturn) {
      return "delivered";
    }
    const requesterIsSubagent = requesterIsInternalSession();
    let directOrigin = targetRequesterOrigin;
    if (!requesterIsSubagent) {
      const { entry } = readRequesterSessionEntry(
        targetRequesterSessionKey,
        targetRequesterAgentId,
      );
      directOrigin = resolveAnnounceOrigin(entry, targetRequesterOrigin);
    }
    const candidateCompletionDirectOrigin =
      expectsCompletionMessage && !requesterIsSubagent && params.completionTarget !== "parent"
        ? !(await prepareChildSessionEffects()) || !childSessionEffectsAllowed()
          ? targetRequesterOrigin
          : await resolveSubagentCompletionOrigin({
              childSessionKey: params.childSessionKey,
              requesterSessionKey: targetRequesterSessionKey,
              requesterOrigin: directOrigin,
              childRunId: params.childRunId,
              spawnMode: params.spawnMode,
              expectsCompletionMessage,
            })
        : targetRequesterOrigin;
    const completionDirectOrigin =
      (await prepareChildSessionEffects()) && childSessionEffectsAllowed()
        ? candidateCompletionDirectOrigin
        : targetRequesterOrigin;
    const completionChannel = normalizeMessageChannel(completionDirectOrigin?.channel);
    const modelRouteChange =
      params.terminalReply?.disposition === "visible"
        ? params.terminalReply.modelRouteChange
        : undefined;
    const preserveModelRouteNotice =
      requesterIsSubagent || !completionChannel || !isDeliverableMessageChannel(completionChannel);

    const candidateStatsLine =
      params.completionTarget === "parent" ||
      !(await prepareChildSessionEffects()) ||
      !childSessionEffectsAllowed()
        ? undefined
        : await buildCompactAnnounceStatsLine({
            sessionKey: params.childSessionKey,
            startedAt: params.startedAt,
            endedAt: params.endedAt,
          });
    const statsLine =
      (await prepareChildSessionEffects()) && childSessionEffectsAllowed()
        ? candidateStatsLine
        : undefined;
    const preparedArtifactProjections =
      await prepareSubagentAnnounceArtifactProjections(artifactFinalization);
    if (preparedArtifactProjections === "deferred") {
      return "retryable";
    }
    const artifactProjections = preparedArtifactProjections;
    const { internalEvents, triggerMessage, artifactTriggerMessages } =
      buildSubagentAnnounceMessages({
        requesterIsSubagent,
        completionTarget: params.completionTarget,
        childSessionKey: params.childSessionKey,
        childSessionId: announceSessionId,
        requesterSessionKey: targetRequesterSessionKey,
        taskLabel,
        outcome,
        findings,
        noVisibleResult: !childResultText && findings === "(no output)",
        statsLine,
        modelRouteChange,
        preserveModelRouteNotice,
        artifactProjections,
      });
    failureStage = "return-routing";
    const returnRoute = await continuationRuntime.routeSubagentContinuationReturn({
      cfg,
      continuationEnabled: continuation.continuationEnabled,
      isContinuationChainDelegate: continuation.isContinuationChainDelegate,
      maxChainLength: subagentAnnounceDeps.resolveContinuationRuntimeConfig(cfg).maxChainLength,
      task: params.task ?? "",
      taskLabel,
      triggerMessage,
      ...(artifactFinalization.status !== "not-configured" ? { managedArtifactReturn: true } : {}),
      ...(artifactTriggerMessages ? { triggerMessagesBySessionKey: artifactTriggerMessages } : {}),
      ...(artifactProjections ? { managedArtifactProjections: artifactProjections } : {}),
      announceId,
      childSessionKey: params.childSessionKey,
      childAgentId: continuation.ownerAgentId,
      childRunId: params.childRunId,
      targetRequesterSessionKey,
      targetRequesterAgentId,
      silentAnnounce: params.silentAnnounce,
      wakeOnReturn: params.wakeOnReturn,
      continuationTargetSessionKey: params.continuationTargetSessionKey,
      continuationTargetSessionKeys: params.continuationTargetSessionKeys,
      continuationFanoutMode: params.continuationFanoutMode,
      continuationRecipientAuthorityBinding: params.continuationRecipientAuthorityBinding,
      persistContinuationRecipientAuthorityBinding:
        params.persistContinuationRecipientAuthorityBinding,
      traceparent: params.traceparent,
      // Resolve the reads lazily: building this object eagerly would touch the
      // read-module namespace on every announce, including flows that never
      // reach the continuation-return router.
      registryRuntime: {
        shouldIgnorePostCompletionAnnounceForSession: (sessionKey: string) =>
          shouldIgnorePostCompletionAnnounceForSession(sessionKey),
      },
    });
    if (returnRoute.deferred) {
      return "retryable";
    }
    if (returnRoute.handled) {
      return "delivered";
    }

    failureStage = "completion-delivery";
    // Send to the requester session. For nested subagents this is an internal
    // follow-up injection (deliver=false) so the orchestrator receives it.
    const directIdempotencyKey = buildAnnounceIdempotencyKey(announceId);
    let deliveryResultReported = false;
    const reportDeliveryResult = async (delivery: SubagentAnnounceDeliveryResult) => {
      if (deliveryResultReported) {
        return;
      }
      deliveryResultReported = true;
      await params.onDeliveryResult?.(delivery);
    };
    const delivery = await deliverSubagentAnnouncement({
      requesterSessionKey: targetRequesterSessionKey,
      requesterAgentId: targetRequesterAgentId,
      triggerMessage,
      internalEvents,
      requesterSessionOrigin: targetRequesterOrigin,
      completionDirectOrigin,
      directOrigin,
      sourceSessionKey: params.childSessionKey,
      sourceRunId: params.childRunId,
      sourceTool: "subagent_announce",
      isSourceSessionEffectsAllowed: completionDeliveryAllowed,
      isCompletionOwnedByRequesterYield: params.isCompletionOwnedByRequesterYield,
      targetRequesterSessionKey,
      requesterIsSubagent,
      expectsCompletionMessage,
      completionTarget: params.completionTarget,
      completionRequesterSessionId: params.completionRequesterSessionId,
      completionRequesterLifecycleRevision: params.completionRequesterLifecycleRevision,
      directIdempotencyKey,
      onDeliveryResult: reportDeliveryResult,
      signal: params.signal,
      continuationTriggerOverride: returnRoute.continuationTriggerOverride,
      ...(returnRoute.traceparent ? { traceparent: returnRoute.traceparent } : {}),
      resolveGatewayContext: params.resolveGatewayContext,
    });
    await reportDeliveryResult(delivery);
    announceOutcome =
      delivery.reason === "requester_turn_pending"
        ? "requester_turn_pending"
        : (delivery.disposition ?? (delivery.delivered ? "delivered" : "retryable"));
  } catch (err) {
    shouldDeleteChildSession = false;
    if (hasSqliteWorkerOutcomeUnknown(err)) {
      throw err;
    }
    defaultRuntime.error?.(
      formatSubagentAnnounceOwnerFailure({
        childSessionKey: params.childSessionKey,
        childAgentId: params.childAgentId,
        requesterAgentId: params.requesterAgentId,
        failureStage,
        error: err,
      }),
    );
    // Best-effort follow-ups; ignore failures to avoid breaking the caller response.
  } finally {
    if (
      shouldDeleteChildSession &&
      (await prepareChildSessionEffects()) &&
      childSessionEffectsAllowed() &&
      ((await params.onBeforeDeleteChildSession?.()) ?? true) &&
      childSessionEffectsAllowed()
    ) {
      await deleteSubagentSessionForCleanup({
        callGateway: subagentAnnounceDeps.callGateway,
        prepareCurrent: prepareChildSessionEffects,
        isCurrent: childSessionEffectsAllowed,
        childSessionKey: params.childSessionKey,
        spawnMode: params.spawnMode,
        expectedSessionId: childSessionId,
        expectedLifecycleRevision: childSessionLifecycleRevision,
      });
    }
  }
  return announceOutcome;
}
