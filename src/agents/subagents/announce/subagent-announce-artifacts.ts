/** Managed delegate-artifact finalization and recipient projection for a subagent announce. */
import {
  finalizeDelegateArtifacts,
  prepareDelegateArtifactDelivery,
  type DelegateArtifactRecipientProjectionV1,
} from "../../delegate-artifacts.js";
import type { SubagentRunOutcome } from "../subagent-run-outcome.types.js";
import { loadSessionEntryByKey } from "./subagent-announce-delivery.js";
import { subagentAnnounceDeps } from "./subagent-announce-deps.js";
import { readSessionIdByKeySync } from "./subagent-announce-session-id.js";
import type { SubagentAnnounceFlowParams } from "./subagent-announce.types.js";

export function finalizeSubagentAnnounceArtifacts(finalization: {
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
  const artifactFinalization = finalization.isChildSessionEffectsCurrent()
    ? finalizeDelegateArtifacts({
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
        // Runs inside finalization's synchronous transaction: a synchronous read.
        resolveSessionId: readSessionIdByKeySync,
      })
    : ({ status: "not-configured" } as const);
  return { announceSessionId, artifactFinalization };
}

/** Prepares each finalized recipient projection; "deferred" means the announce must retry. */
export async function prepareSubagentAnnounceArtifactProjections(
  artifactFinalization: ReturnType<
    typeof finalizeSubagentAnnounceArtifacts
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
      const delivery = prepareDelegateArtifactDelivery({
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
