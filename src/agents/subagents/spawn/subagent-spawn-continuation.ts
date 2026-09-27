/** Continuation-delegate spawn params: validation, child ids, launch fields, and registration fields. */
import {
  deriveContinuationDelegateChildRunId,
  deriveContinuationDelegateChildSessionKey,
} from "../../subagent-continuation-ids.js";
import type { ContinuationSpawnParams } from "../announce/subagent-announce.runtime.js";
import type { SpawnSubagentResult } from "./subagent-spawn-contract.js";
import type { resolveSubagentSpawnRequest } from "./subagent-spawn-request.js";

export function validateSubagentContinuationSpawnParams(
  params: Pick<
    ContinuationSpawnParams,
    "drainsContinuationDelegateQueue" | "continuationChainState"
  >,
): SpawnSubagentResult | undefined {
  if (params.drainsContinuationDelegateQueue && !params.continuationChainState) {
    return {
      status: "error",
      error: "continuationChainState is required when drainsContinuationDelegateQueue is true",
    };
  }
  return undefined;
}

export function resolveSubagentContinuationChildRunId(
  params: Pick<ContinuationSpawnParams, "continuationDelegateFlowId">,
  resolvedChildIdem: string,
): string {
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
