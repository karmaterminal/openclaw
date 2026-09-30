/** Runs the subagent announce flow with the registry row's continuation delivery fields. */
import { loadSubagentAnnounceModule } from "./subagent-registry-deps.js";
import type { SubagentLifecycleOptions } from "./subagent-registry-lifecycle-context.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import { persistSubagentRunsOrThrow } from "./subagent-registry-persist.js";

export const runRegistrySubagentAnnounceFlow: SubagentLifecycleOptions["runSubagentAnnounceFlow"] =
  async (params) => {
    const entry =
      subagentRuns.get(params.childRunId) ??
      [...subagentRuns.values()].find(
        (candidate) => candidate.childSessionKey === params.childSessionKey,
      );
    return (await loadSubagentAnnounceModule()).runSubagentAnnounceFlow({
      ...params,
      silentAnnounce: entry?.silentAnnounce,
      wakeOnReturn: entry?.wakeOnReturn,
      continuationTargetSessionKey: entry?.continuationTargetSessionKey,
      continuationTargetSessionKeys: entry?.continuationTargetSessionKeys,
      continuationFanoutMode: entry?.continuationFanoutMode,
      continuationRecipientAuthorityBinding: entry?.continuationRecipientAuthorityBinding,
      persistContinuationRecipientAuthorityBinding: (binding) => {
        if (!entry || subagentRuns.get(entry.runId) !== entry) {
          return false;
        }
        const previous = entry.continuationRecipientAuthorityBinding;
        entry.continuationRecipientAuthorityBinding = binding;
        try {
          persistSubagentRunsOrThrow(entry.runId);
        } catch (error) {
          // Persistence owns completion-time selection. Restore pending state so
          // a retry cannot enqueue from memory-only authority.
          entry.continuationRecipientAuthorityBinding = previous;
          throw error;
        }
        return subagentRuns.get(entry.runId) === entry;
      },
      ...(entry?.traceparent ? { traceparent: entry.traceparent } : {}),
    });
  };
