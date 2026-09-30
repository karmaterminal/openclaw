/** Continuation-delegate spawn params: validation, child ids, launch fields, and registration fields. */
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { getPluginRuntimeGatewayRequestScope } from "../../../plugins/runtime/gateway-request-scope.js";
import { parseContinuationChildRunId } from "../../../shared/continuation-run-key.js";
import {
  deriveContinuationDelegateChildRunId,
  deriveContinuationDelegateChildSessionKey,
} from "../../subagent-continuation-ids.js";
import {
  getGatewayToolCallerIdentity,
  resolveGatewayToolOperatorSelection,
} from "../../tools/gateway-caller-context.js";
import type { ContinuationSpawnParams } from "../announce/subagent-announce.runtime.js";
import { prepareSubagentRunsByRunIds } from "../registry/subagent-registry.js";
import {
  isSpawnSubagentAdmissionCancelledError,
  type SpawnSubagentAdmissionCancelledError,
  type SpawnSubagentParams,
  type SpawnSubagentResult,
} from "./subagent-spawn-contract.js";
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
  return undefined;
}

/**
 * Refuses a launch key that already names a registry row, before any child side effect.
 * Registration replaces a row with the same run id, and resolving an existing row is the
 * continuation owner's handoff decision, not spawn's. This is a pre-dispatch refusal, not
 * a lock: custody's claim CAS and never-reused attempt ids keep two launches of one key
 * from racing past it.
 */
const CONTINUATION_LAUNCH_READ_ATTEMPTS = 8;

export async function refuseRegisteredSubagentContinuationLaunch(
  params: Pick<ContinuationSpawnParams, "continuationChildRunId">,
): Promise<SpawnSubagentResult | undefined> {
  const launchRunId = params.continuationChildRunId;
  if (launchRunId === undefined) {
    return undefined;
  }
  let registered: boolean | undefined;
  try {
    // A prepared read can be superseded by a concurrent registry write before it is
    // consumed ({ ready: false }); re-prepare, as agents_wait does, but bounded.
    for (let attempt = 0; attempt < CONTINUATION_LAUNCH_READ_ATTEMPTS; attempt += 1) {
      const prepared = await prepareSubagentRunsByRunIds([launchRunId]);
      const read = prepared.consume((runs) => runs.has(launchRunId));
      if (read.ready) {
        registered = read.value;
        break;
      }
      await yieldToEventLoop();
    }
  } catch (error) {
    // An unreadable registry cannot prove the key is free.
    return {
      status: "error",
      error: `Could not verify launch run id ${launchRunId} is unregistered: ${String(error)}`,
    };
  }
  if (registered === undefined) {
    return {
      status: "error",
      error: `Could not verify launch run id ${launchRunId} is unregistered: registry read did not settle`,
    };
  }
  return registered
    ? {
        status: "error",
        error: `Launch run id ${launchRunId} is already registered; refusing to replace it.`,
      }
    : undefined;
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
 * Whether an admission cancel may be returned as `{ status: "cancelled" }`. A launch-keyed
 * caller reads a phaseless cancel as "nothing dispatched"; once the spawn pipeline has
 * started, only a thrown error keeps the outcome unknown (RFC §5.4.4, Q3).
 */
export function returnsPhaselessSubagentSpawnCancel(
  error: unknown,
  params: Pick<ContinuationSpawnParams, "continuationChildRunId">,
  pipelineEntered: boolean,
): error is SpawnSubagentAdmissionCancelledError {
  return (
    isSpawnSubagentAdmissionCancelledError(error) &&
    !(pipelineEntered && params.continuationChildRunId !== undefined)
  );
}

/** Validation, then the registered-key refusal: the first error a keyed launch must return. */
export async function resolveSubagentContinuationLaunchError(
  params: Parameters<typeof validateSubagentContinuationSpawnParams>[0] &
    Parameters<typeof refuseRegisteredSubagentContinuationLaunch>[0],
): Promise<SpawnSubagentResult | undefined> {
  return (
    validateSubagentContinuationSpawnParams(params) ??
    (await refuseRegisteredSubagentContinuationLaunch(params))
  );
}

/**
 * Resolves the spawn's Gateway binding and operator authority from the ambient caller.
 * Upstream's chain subsumes our single-source lookup; operatorAuthority is a
 * SEPARATE gate from continuationChainState -- chain state is accounting, never
 * authorization (Ronan's ruling on this absorb).
 */
export function resolveSubagentSpawnOperatorBinding() {
  const gatewayCaller = getGatewayToolCallerIdentity();
  const gatewayScope = getPluginRuntimeGatewayRequestScope();
  const gatewayContextResolver =
    gatewayCaller?.gatewayContextResolver ??
    gatewayScope?.resolveGatewayContext ??
    gatewayScope?.context?.resolveGatewayContext;
  const operatorAuthority =
    resolveGatewayToolOperatorSelection().operatorAuthority ??
    gatewayScope?.client?.internal?.operatorRunAuthority;
  return { gatewayContextResolver, operatorAuthority };
}
