// Armed registration wiring for native spawns (H1, absorb 14fe10d0). The child is
// armed in its registration write; `sessions_spawn` confirms inside the pipeline,
// while continuation delegate callers own final acceptance and confirm themselves.
import type { runSpawnPipeline } from "../../spawn-pipeline.js";
import {
  confirmSubagentSpawnAcceptance,
  releaseSubagentSpawnAcceptanceHoldForRun,
} from "../registry/subagent-registry.js";
import type { SpawnSubagentContext, SpawnSubagentResult } from "./subagent-spawn-contract.js";

type PipelineParams = Parameters<typeof runSpawnPipeline>[0];
type PipelineResult = Extract<Awaited<ReturnType<typeof runSpawnPipeline>>, { ok: true }>;

const UNCERTAIN_ACCEPTANCE_NOTE =
  "The registry acknowledgement of this spawn was lost; a gateway restart may cancel the child.";

/** Registration arm plus the pipeline's confirm/hold callbacks; collectors arm at dispatch. */
export function buildNativeSpawnAcceptance(params: {
  collect: boolean;
  ctx: SpawnSubagentContext;
}): Pick<
  PipelineParams,
  "confirmAcceptance" | "deferAcceptanceConfirmation" | "releaseAcceptanceHold"
> {
  if (params.collect) {
    return {};
  }
  return {
    confirmAcceptance: (registration) =>
      confirmSubagentSpawnAcceptance({
        runId: registration.runId,
        childSessionKey: registration.childSessionKey,
        expectedRegistration: registration.expectedRegistration,
      }),
    // Continuation delegate callers own final acceptance (§3.2).
    deferAcceptanceConfirmation: params.ctx.continuationDelegateAdmission !== undefined,
    releaseAcceptanceHold: (registration) =>
      releaseSubagentSpawnAcceptanceHoldForRun(registration.runId),
  };
}

/** Arms the accepted native child in its registration write; collectors arm at dispatch. */
export function arm(
  params: { collect?: boolean },
  gatewayRunId: string,
  identity: { expectedSessionId?: string; expectedLifecycleRevision?: string },
): {
  acceptanceCustody?: {
    gatewayRunId: string;
    expectedSessionId?: string;
    expectedLifecycleRevision?: string;
  };
} {
  return params.collect ? {} : { acceptanceCustody: { gatewayRunId, ...identity } };
}

/** Appended to the accepted note when the acceptance outcome is unknown. */
export function note(pipelineResult: PipelineResult): string | undefined {
  return pipelineResult.acceptance === "uncertain" ? UNCERTAIN_ACCEPTANCE_NOTE : undefined;
}

/**
 * Accepted-result fields. Only continuation delegate callers own a post-accept
 * decision, so only they receive the handles (the pipeline's rollback handle was
 * previously dropped here, making their post-accept rollbacks no-ops). Tool results
 * stay plain data.
 */
export function buildAcceptedSpawnHandles(
  pipelineResult: PipelineResult,
  ctx: SpawnSubagentContext,
): Pick<
  SpawnSubagentResult,
  "rollbackAccepted" | "confirmAccepted" | "releaseAcceptanceHold" | "acceptance"
> {
  return {
    ...(ctx.continuationDelegateAdmission
      ? {
          rollbackAccepted: pipelineResult.rollbackAccepted,
          confirmAccepted: pipelineResult.confirmAccepted,
          releaseAcceptanceHold: pipelineResult.releaseAcceptanceHold,
        }
      : {}),
    ...(pipelineResult.acceptance === "uncertain" ? { acceptance: "uncertain" as const } : {}),
  };
}
