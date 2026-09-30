/** Attaches requester progress presentation to pending subagent settle wakes. */
import { subagentRuns } from "./subagent-registry-memory.js";
import { persistSubagentRunsOrThrow } from "./subagent-registry-persist.js";

/** Attaches presentation to an existing wake without changing completion ownership. */
export function attachRequesterProgressPresentation(params: {
  operationId: string;
  members: readonly { runId: string; generation: number; rearmGeneration: number }[];
  assertCurrent: () => void;
}): void {
  params.assertCurrent();
  const rows = params.members.map((member) => {
    const entry = subagentRuns.get(member.runId);
    const wake = entry?.requesterSettleWake;
    if (
      !entry ||
      entry.generation !== member.generation ||
      wake?.requesterYieldBatch !== true ||
      wake.status !== "pending" ||
      wake.rearmGeneration !== member.rearmGeneration
    ) {
      throw new Error("Progress handoff batch was replaced");
    }
    return { entry, wake, previous: wake.progressOperationId };
  });
  for (const { wake } of rows) {
    wake.progressOperationId = params.operationId;
  }
  try {
    params.assertCurrent();
    persistSubagentRunsOrThrow(...rows.map(({ entry }) => entry.runId));
  } catch (error) {
    for (const { wake, previous } of rows) {
      wake.progressOperationId = previous;
    }
    throw error;
  }
}
