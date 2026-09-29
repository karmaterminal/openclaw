/** Continuation-delegate spawn params: validation, child ids, launch fields, and registration fields. */
import { parseContinuationChildRunId } from "../../../shared/continuation-run-key.js";
import {
  deriveContinuationDelegateChildRunId,
  deriveContinuationDelegateChildSessionKey,
} from "../../subagent-continuation-ids.js";
import type { ContinuationSpawnParams } from "../announce/subagent-announce.runtime.js";
import { getSubagentRunByRunId } from "../registry/subagent-registry.js";
import type { SpawnSubagentParams, SpawnSubagentResult } from "./subagent-spawn-contract.js";
import type { resolveSubagentSpawnRequest } from "./subagent-spawn-request.js";

/** Rejects invalid continuation params before spawn creates any child state. */
export function validateSubagentContinuationSpawnParams(
  params: Pick<SpawnSubagentParams, "collect" | "swarmLaunchReplayKey"> &
    Pick<
      ContinuationSpawnParams,
      "drainsContinuationDelegateQueue" | "continuationChainState" | "continuationChildRunId"
    >,
): SpawnSubagentResult | undefined {
  if (params.drainsContinuationDelegateQueue && !params.continuationChainState) {
    return {
      status: "error",
      error: "continuationChainState is required when drainsContinuationDelegateQueue is true",
    };
  }
  const launchRunId = params.continuationChildRunId;
  if (launchRunId === undefined) {
    return undefined;
  }
  if (!parseContinuationChildRunId(launchRunId)) {
    return { status: "error", error: "continuationChildRunId must be a continuation child run id" };
  }
  if (params.collect || params.swarmLaunchReplayKey !== undefined) {
    // Collector launch identity is the requester-scoped `swarm_<hash>` derivation.
    return { status: "error", error: "continuationChildRunId is not supported for collectors" };
  }
  // Registration replaces a row with the same run id. A second launch under a key that
  // already names a row, owned by this requester or another, must never overwrite it;
  // resolving an existing row is the continuation owner's handoff decision, not spawn's.
  if (getSubagentRunByRunId(launchRunId)) {
    return {
      status: "error",
      error: `Launch run id ${launchRunId} is already registered; refusing to replace it.`,
    };
  }
  return undefined;
}

export function resolveSubagentContinuationChildRunId(
  params: Pick<ContinuationSpawnParams, "continuationDelegateFlowId" | "continuationChildRunId">,
  resolvedChildIdem: string,
): string {
  if (params.continuationChildRunId) {
    return params.continuationChildRunId;
  }
  return params.continuationDelegateFlowId
    ? deriveContinuationDelegateChildRunId(params.continuationDelegateFlowId)
    : resolvedChildIdem;
}

export function resolveSubagentContinuationChildSessionKey(
  params: Pick<ContinuationSpawnParams, "continuationDelegateFlowId">,
  targetAgentId: string,
  resolvedChildSessionKey: string,
): string {
  return params.continuationDelegateFlowId
    ? deriveContinuationDelegateChildSessionKey(targetAgentId, params.continuationDelegateFlowId)
    : resolvedChildSessionKey;
}

export function applySubagentContinuationLaunchFields(
  request: { drainsContinuationDelegateQueue?: boolean; traceparent?: string },
  params: Pick<ContinuationSpawnParams, "drainsContinuationDelegateQueue" | "traceparent">,
): void {
  if (params.drainsContinuationDelegateQueue) {
    request.drainsContinuationDelegateQueue = true;
  }
  if (params.traceparent) {
    request.traceparent = params.traceparent;
  }
}

type ResolvedSpawnAdmission = Extract<
  Awaited<ReturnType<typeof resolveSubagentSpawnRequest>>,
  { ok: true }
>["resolved"]["admission"];

export function buildSubagentContinuationRegistrationFields(
  params: Omit<
    ContinuationSpawnParams,
    "continuationTargetSessionKeys" | "continuationRecipientAuthorityBinding"
  >,
  {
    continuationTargetSessionKeys,
    continuationRecipientAuthorityBinding,
  }: Pick<
    ResolvedSpawnAdmission,
    "continuationTargetSessionKeys" | "continuationRecipientAuthorityBinding"
  >,
) {
  return {
    ...(params.silentAnnounce ? { silentAnnounce: true } : {}),
    ...(params.wakeOnReturn ? { wakeOnReturn: true } : {}),
    ...(params.drainsContinuationDelegateQueue ? { drainsContinuationDelegateQueue: true } : {}),
    ...(params.continuationTargetSessionKey
      ? { continuationTargetSessionKey: params.continuationTargetSessionKey }
      : {}),
    ...(continuationTargetSessionKeys?.length ? { continuationTargetSessionKeys } : {}),
    ...(params.continuationFanoutMode
      ? { continuationFanoutMode: params.continuationFanoutMode }
      : {}),
    ...(continuationRecipientAuthorityBinding ? { continuationRecipientAuthorityBinding } : {}),
    ...(params.traceparent ? { traceparent: params.traceparent } : {}),
  };
}

/**
 * Completion settlement (#157061) retires a result whose run has no `subagent` task row.
 * Continuation spawns start from detached cleanup with no Gateway request scope, so they
 * dispatch over the WebSocket fallback, where the registry otherwise leaves tracking to
 * Gateway's `cli` row. Keep that fallback's never-reject policy but write the canonical row:
 * an unset ownership is the registry's best-effort row mode.
 */
export function resolveSubagentContinuationTaskRowOwnership(
  params: Pick<ContinuationSpawnParams, "continuationChainState">,
  taskRowOwnership: "required" | "gateway_best_effort",
): "required" | "gateway_best_effort" | undefined {
  return taskRowOwnership === "gateway_best_effort" && params.continuationChainState
    ? undefined
    : taskRowOwnership;
}
