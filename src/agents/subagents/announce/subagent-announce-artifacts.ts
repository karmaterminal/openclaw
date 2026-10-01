/** Managed delegate-artifact finalization and recipient projection for a subagent announce. */
import {
  finalizeDelegateArtifacts,
  prepareDelegateArtifactDelivery,
  type DelegateArtifactRecipientProjectionV1,
} from "../../delegate-artifacts.js";
import type { SubagentRunOutcome } from "../subagent-run-outcome.types.js";
import { loadSessionEntryByKey } from "./subagent-announce-delivery.js";
import { subagentAnnounceDeps } from "./subagent-announce-deps.js";
import type { SubagentAnnounceFlowParams } from "./subagent-announce.types.js";

export async function finalizeSubagentAnnounceArtifacts(finalization: {
  cfg: ReturnType<typeof subagentAnnounceDeps.getRuntimeConfig>;
  flow: Pick<
    SubagentAnnounceFlowParams,
    "childSessionKey" | "childRunId" | "endedAt" | "silentAnnounce"
  >;
  childSessionId: string | undefined;
  isChildSessionEffectsCurrent: () => boolean;
  announceId: string;
  outcomeStatus: SubagentRunOutcome["status"];
}) {
  const { flow, announceId } = finalization;
  const artifactConfig = subagentAnnounceDeps.resolveContinuationRuntimeConfig(finalization.cfg);
  const announceSessionId = finalization.isChildSessionEffectsCurrent()
    ? finalization.childSessionId || "unknown"
    : "unknown";
  // Policies exist only for continuation-delegate child runs, so any other run
  // is "not-configured" without a shared-state command.
  const artifactFinalization =
    finalization.isChildSessionEffectsCurrent() &&
    flow.childRunId.startsWith("continuation-delegate-")
      ? await finalizeDelegateArtifacts({
          producerSessionKey: flow.childSessionKey,
          producerSessionId: announceSessionId,
          producerRunId: flow.childRunId,
          completionId: announceId,
          finalizationKey: `delegate-artifact-finalization:${announceId}`,
          completionStatus: finalization.outcomeStatus,
          completedAt: flow.endedAt ?? Date.now(),
          silent: flow.silentAnnounce === true,
          runtimeEnabled: artifactConfig.enabled,
          crossSessionEnabled: artifactConfig.crossSessionTargeting === "enabled",
          resolveSessionId: async (sessionKey) =>
            (await loadSessionEntryByKey(sessionKey))?.sessionId,
        })
      : ({ status: "not-configured" } as const);
  return { announceSessionId, artifactFinalization };
}

/** Prepares each finalized recipient projection; "deferred" means the announce must retry. */
export async function prepareSubagentAnnounceArtifactProjections(
  artifactFinalization: Awaited<
    ReturnType<typeof finalizeSubagentAnnounceArtifacts>
  >["artifactFinalization"],
): Promise<Map<string, DelegateArtifactRecipientProjectionV1> | "deferred" | undefined> {
  const finalizedArtifactProjections =
    "projections" in artifactFinalization ? artifactFinalization.projections : undefined;
  let artifactProjections: Map<string, DelegateArtifactRecipientProjectionV1> | undefined;
  if (finalizedArtifactProjections) {
    const deliveryConfig = subagentAnnounceDeps.resolveContinuationRuntimeConfig(
      subagentAnnounceDeps.getRuntimeConfig(),
    );
    artifactProjections = new Map();
    for (const [sessionKey, projection] of finalizedArtifactProjections) {
      const delivery = await prepareDelegateArtifactDelivery({
        projection,
        runtimeEnabled: deliveryConfig.enabled,
        crossSessionEnabled: deliveryConfig.crossSessionTargeting === "enabled",
        currentRecipientSessionId: (await loadSessionEntryByKey(sessionKey))?.sessionId,
      });
      if (delivery.status === "deferred") {
        return "deferred";
      }
      if (delivery.status === "ready") {
        artifactProjections.set(sessionKey, delivery.projection);
      }
    }
  }
  return artifactProjections;
}
