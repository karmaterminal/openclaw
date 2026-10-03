import {
  captureContinuationRecipientAuthorities,
  continuationRecipientAuthorityMap,
  parseContinuationRecipientAuthorityBinding,
  resolveContinuationRecipientAgentIds,
} from "../auto-reply/continuation/recipient-authority-binding.js";
import { withContinuationOwner } from "../auto-reply/continuation/system-event-ownership.js";
import {
  enqueueContinuationReturnDeliveries,
  resolveContinuationReturnTargetSessionKeys,
} from "../auto-reply/continuation/targeting.js";
import type { ContinuationTrigger } from "../auto-reply/get-reply-options.types.js";
import { listSessionEntriesCore } from "../config/sessions/session-accessor.js";
import type { ContinuationRecipientAuthorityBinding } from "../config/sessions/session-recipient-authority-types.js";
import { resolveAllAgentSessionStoreTargetsSync } from "../config/sessions/targets.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  markTrustedContinuationHeartbeatWake,
  requestHeartbeatNow,
} from "../infra/heartbeat-wake.js";
import { enqueueSystemEventRaw as enqueueSystemEvent } from "../infra/system-events.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { defaultRuntime } from "../runtime.js";
import { parseContinuationChainHop } from "./subagent-announce.continuation.accounting.js";

const continuationLog = createSubsystemLogger("continuation/announce");

type RegistryReturnRuntime = {
  shouldIgnorePostCompletionAnnounceForSession: (sessionKey: string) => boolean;
};

async function listKnownSessionKeysOnHost(cfg: OpenClawConfig): Promise<string[]> {
  const keys = new Set<string>();
  for (const target of resolveAllAgentSessionStoreTargetsSync(cfg)) {
    for (const { sessionKey } of listSessionEntriesCore({
      agentId: target.agentId,
      storePath: target.storePath,
    })) {
      if (sessionKey) {
        keys.add(sessionKey);
      }
    }
  }
  return [...keys].toSorted();
}

function resolveCompletionTraceContext(params: {
  traceparent?: string;
  task: string;
  maxChainLength: number;
}): { traceparent?: string; chainStepRemaining?: number } {
  if (!params.traceparent) {
    return {};
  }
  const childChainHop = parseContinuationChainHop(params.task);
  if (childChainHop === undefined) {
    return { traceparent: params.traceparent };
  }
  const chainStepRemaining = Math.max(0, params.maxChainLength - childChainHop);
  return {
    chainStepRemaining,
    ...(chainStepRemaining > 0 ? { traceparent: params.traceparent } : {}),
  };
}

export async function routeSubagentContinuationReturn(params: {
  cfg: OpenClawConfig;
  continuationEnabled: boolean;
  isContinuationChainDelegate: boolean;
  maxChainLength: number;
  task: string;
  taskLabel: string;
  triggerMessage: string;
  announceId: string;
  childSessionKey: string;
  childAgentId?: string;
  childRunId: string;
  targetRequesterSessionKey: string;
  targetRequesterAgentId?: string;
  silentAnnounce?: boolean;
  wakeOnReturn?: boolean;
  continuationTargetSessionKey?: string;
  continuationTargetSessionKeys?: string[];
  continuationFanoutMode?: "tree" | "all";
  continuationRecipientAuthorityBinding?: ContinuationRecipientAuthorityBinding;
  persistContinuationRecipientAuthorityBinding?: (
    binding: ContinuationRecipientAuthorityBinding,
  ) => boolean;
  traceparent?: string;
  registryRuntime?: RegistryReturnRuntime;
}): Promise<{
  handled: boolean;
  continuationTriggerOverride?: ContinuationTrigger;
  traceparent?: string;
}> {
  const completionTrace = resolveCompletionTraceContext({
    traceparent: params.traceparent,
    task: params.task,
    maxChainLength: params.maxChainLength,
  });
  const hasTargeting = Boolean(
    params.continuationTargetSessionKey ||
    (params.continuationTargetSessionKeys && params.continuationTargetSessionKeys.length > 0) ||
    params.continuationFanoutMode ||
    params.continuationRecipientAuthorityBinding,
  );
  if (hasTargeting) {
    const parsedAuthorityBinding = parseContinuationRecipientAuthorityBinding(
      params.continuationRecipientAuthorityBinding,
    );
    if (parsedAuthorityBinding.state === "invalid") {
      throw new Error("Invalid persisted continuation recipient authority binding");
    }
    let recipientAuthorityBinding =
      parsedAuthorityBinding.state === "valid" ? parsedAuthorityBinding.binding : undefined;
    // Tree recipients were frozen by spawn admission while ancestry was live.
    // Never re-derive them after parent cleanup or registry retirement.
    const treeSessionKeys =
      params.continuationFanoutMode === "tree" ? params.continuationTargetSessionKeys : undefined;
    const selectAllRecipients =
      params.continuationFanoutMode === "all" &&
      recipientAuthorityBinding?.selection !== "selected";
    const allSessionKeys = selectAllRecipients
      ? await listKnownSessionKeysOnHost(params.cfg)
      : undefined;
    const frozenRecipientSessionKeys =
      params.continuationFanoutMode === "all" && recipientAuthorityBinding?.selection === "selected"
        ? recipientAuthorityBinding.recipients.map((recipient) => recipient.sessionKey)
        : undefined;
    const resolvedTargetSessionKeys = frozenRecipientSessionKeys
      ? frozenRecipientSessionKeys
      : resolveContinuationReturnTargetSessionKeys({
          defaultSessionKey: params.targetRequesterSessionKey,
          targetSessionKey: params.continuationTargetSessionKey,
          targetSessionKeys: params.continuationTargetSessionKeys,
          fanoutMode: params.continuationFanoutMode,
          treeSessionKeys,
          allSessionKeys,
          childSessionKey: params.childSessionKey,
        });
    const targetSessionKeys = resolvedTargetSessionKeys.filter(
      (sessionKey) =>
        !params.registryRuntime?.shouldIgnorePostCompletionAnnounceForSession(sessionKey),
    );
    const recipientAgentIds = resolveContinuationRecipientAgentIds(params.cfg, targetSessionKeys);
    if (
      recipientAuthorityBinding?.selection === "pending" &&
      recipientAuthorityBinding.fanoutMode === "tree"
    ) {
      throw new Error("Tree recipient authority was not selected before spawn acceptance");
    }
    if (
      recipientAuthorityBinding?.selection === "pending" &&
      recipientAuthorityBinding.fanoutMode === "all"
    ) {
      const selected = captureContinuationRecipientAuthorities(targetSessionKeys);
      if (!params.persistContinuationRecipientAuthorityBinding?.(selected)) {
        throw new Error("Continuation all-recipient authority selection was not durably committed");
      }
      recipientAuthorityBinding = selected;
    }
    const recipientAuthorities = recipientAuthorityBinding
      ? continuationRecipientAuthorityMap(recipientAuthorityBinding, targetSessionKeys)
      : undefined;
    if (targetSessionKeys.length > 0) {
      await enqueueContinuationReturnDeliveries({
        targetSessionKeys,
        text:
          params.triggerMessage ||
          `[continuation:enrichment-return] Delegate completed: ${params.taskLabel}`,
        idempotencyKeyBase: `continuation-return:${params.announceId}`,
        wakeRecipients: params.wakeOnReturn === true || params.silentAnnounce !== true,
        childRunId: params.childRunId,
        ...(recipientAuthorities ? { recipientAuthorities } : {}),
        ...(params.continuationFanoutMode ? { fanoutMode: params.continuationFanoutMode } : {}),
        ...(completionTrace.chainStepRemaining !== undefined
          ? { chainStepRemaining: completionTrace.chainStepRemaining }
          : {}),
        ...(completionTrace.traceparent ? { traceparent: completionTrace.traceparent } : {}),
        recipientAgentIds,
        ownerAgentId: params.childAgentId,
      });
    }
    defaultRuntime.log(
      `[continuation:targeted-return] Delivered to ${targetSessionKeys.join(",")} from ${params.childSessionKey}`,
    );
    return { handled: true };
  }

  if (params.silentAnnounce) {
    // The untargeted silent-announcement path is a one-recipient return to the
    // requester. It must honor the same post-completion guard as tree, all,
    // and explicit returns; otherwise a cleaned run-mode requester can be
    // reopened merely because the delegate did not specify fanout metadata.
    if (
      params.registryRuntime?.shouldIgnorePostCompletionAnnounceForSession(
        params.targetRequesterSessionKey,
      )
    ) {
      continuationLog.info(
        `[continuation/silent-wake] suppressed cleaned requester=${params.targetRequesterSessionKey}`,
      );
      return { handled: true };
    }
    if (params.wakeOnReturn) {
      continuationLog.info(
        `[continuation/silent-wake] wakeOnReturn=true target=${params.targetRequesterSessionKey} silentAnnounce=true`,
      );
    }
    const eventOptions = {
      sessionKey: params.targetRequesterSessionKey,
      trusted: true,
      ...(completionTrace.traceparent ? { traceparent: completionTrace.traceparent } : {}),
    };
    enqueueSystemEvent(
      params.triggerMessage ||
        `[continuation:enrichment-return] Delegate completed: ${params.taskLabel}`,
      withContinuationOwner(eventOptions, params.childAgentId),
    );
    continuationLog.info(
      `[continuation:enrichment-return] Delivered to ${params.targetRequesterSessionKey} from ${params.childSessionKey}`,
    );
    if (params.wakeOnReturn) {
      requestHeartbeatNow(
        markTrustedContinuationHeartbeatWake({
          sessionKey: params.targetRequesterSessionKey,
          ...(params.targetRequesterAgentId ? { agentId: params.targetRequesterAgentId } : {}),
          reason: "silent-wake-enrichment",
          parentRunId: params.childRunId,
        }),
      );
    }
    return { handled: true };
  }

  return {
    handled: false,
    continuationTriggerOverride: params.continuationEnabled
      ? params.isContinuationChainDelegate
        ? "delegate-return"
        : "subagent-return"
      : undefined,
    traceparent: completionTrace.traceparent,
  };
}
