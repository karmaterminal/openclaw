// Sweeper archival for completed collector groups: a group archives only as a whole,
// after every member's session, attachments, and context-engine cleanup succeed.
import { shouldSuppressSubagentRecoverySessionEffects } from "./subagent-recovery-state.js";
import { safeRemoveAttachmentsDir } from "./subagent-registry-helpers.js";
import type { SubagentRegistrySweeperParams } from "./subagent-registry-sweeper.types.js";
import type {
  ContextEngineSubagentEndedParams,
  SubagentRunRecord,
} from "./subagent-registry.types.js";

type FrozenSessionIdentity = { sessionId: string; lifecycleRevision: string };

export type CollectorArchiveCandidate = {
  requesterSessionKey: string;
  groupId: string;
  requesterAgentId?: string;
};

export const isCollectorArchiveReady = (entry: SubagentRunRecord, now: number) =>
  entry.collectorCompletion &&
  entry.collectorLaunchCleanupPending !== true &&
  entry.archiveAtMs !== undefined &&
  entry.archiveAtMs <= now;

export async function sweepCollectorArchiveGroups(sweep: {
  candidates: Map<string, CollectorArchiveCandidate>;
  now: number;
  cleanupIdentities: Map<SubagentRunRecord, FrozenSessionIdentity | undefined>;
  mutatedRunIds: Set<string>;
  deleteSession: (
    entry: SubagentRunRecord,
    identity: FrozenSessionIdentity,
  ) => Promise<"deleted" | "changed">;
  sweptContext: (entry: SubagentRunRecord) => ContextEngineSubagentEndedParams;
  params: Pick<
    SubagentRegistrySweeperParams,
    | "runs"
    | "getRunsForCollectorGroup"
    | "shouldDeferArchive"
    | "runContextEngineSubagentEnded"
    | "persist"
    | "clearPendingLifecycleError"
    | "warn"
  >;
}): Promise<void> {
  const { candidates, now, cleanupIdentities, mutatedRunIds, deleteSession, sweptContext, params } =
    sweep;
  const { runs } = params;
  collectorGroups: for (const {
    requesterSessionKey,
    groupId,
    requesterAgentId,
  } of candidates.values()) {
    const readGroup = () => [
      ...params.getRunsForCollectorGroup(requesterSessionKey, groupId, requesterAgentId),
    ];
    const groupEntries = readGroup();
    if (
      groupEntries.some(
        ([, candidate]) =>
          !isCollectorArchiveReady(candidate, now) ||
          params.shouldDeferArchive(candidate) ||
          !cleanupIdentities.has(candidate),
      )
    ) {
      continue;
    }
    for (const [candidateRunId, candidate] of groupEntries) {
      if (runs.get(candidateRunId) !== candidate) {
        continue collectorGroups;
      }
      if (shouldSuppressSubagentRecoverySessionEffects(candidate)) {
        continue;
      }
      const sessionIdentity = cleanupIdentities.get(candidate);
      if (!sessionIdentity) {
        candidate.execution = {
          ...candidate.execution,
          suppressSessionEffects: true,
        };
        continue;
      }
      try {
        const deletion = await deleteSession(candidate, sessionIdentity);
        if (runs.get(candidateRunId) !== candidate) {
          continue collectorGroups;
        }
        if (deletion === "changed") {
          candidate.execution = {
            ...candidate.execution,
            suppressSessionEffects: true,
          };
        }
      } catch (error) {
        params.warn("sessions.delete failed during collector group sweep; keeping group", {
          runId: candidateRunId,
          childSessionKey: candidate.childSessionKey,
          groupId,
          error,
        });
        continue collectorGroups;
      }
    }
    for (const [candidateRunId, candidate] of groupEntries) {
      if (await safeRemoveAttachmentsDir(candidate)) {
        continue;
      }
      params.warn("attachment cleanup failed during collector group sweep; keeping group", {
        runId: candidateRunId,
        childSessionKey: candidate.childSessionKey,
        groupId,
      });
      continue collectorGroups;
    }
    for (const [candidateRunId, candidate] of groupEntries) {
      if (
        candidate.cleanup === "delete" ||
        shouldSuppressSubagentRecoverySessionEffects(candidate) ||
        typeof candidate.contextEngineCleanupCompletedAt === "number"
      ) {
        continue;
      }
      try {
        await params.runContextEngineSubagentEnded(sweptContext(candidate));
        candidate.contextEngineCleanupCompletedAt = Date.now();
        params.persist(candidateRunId);
      } catch (error) {
        params.warn("context-engine cleanup failed during collector group sweep; keeping group", {
          runId: candidateRunId,
          childSessionKey: candidate.childSessionKey,
          groupId,
          error,
        });
        continue collectorGroups;
      }
    }
    const expectedGroupEntries = new Map(groupEntries);
    const liveGroupEntries = readGroup();
    if (
      liveGroupEntries.length !== groupEntries.length ||
      liveGroupEntries.some(
        ([candidateRunId, candidate]) =>
          expectedGroupEntries.get(candidateRunId) !== candidate ||
          !isCollectorArchiveReady(candidate, now),
      )
    ) {
      continue;
    }
    for (const [candidateRunId] of liveGroupEntries) {
      params.clearPendingLifecycleError(candidateRunId);
      runs.delete(candidateRunId);
      mutatedRunIds.add(candidateRunId);
    }
  }
}
