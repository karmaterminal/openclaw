import { asOptionalRecord } from "@openclaw/normalization-core/record-coerce";
import { hasLiveOrRecentlyDispatchedContinuationWork } from "../../../auto-reply/continuation/work-store.js";
import { callGateway } from "../../../gateway/call.js";
import { subagentRegistryDeps } from "./subagent-registry-deps.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

export function hasContinuationWorkForSweepEntry(entry: SubagentRunRecord): boolean {
  if (hasLiveOrRecentlyDispatchedContinuationWork(entry.childSessionKey)) {
    return true;
  }
  if (!entry.collect || !entry.groupId) {
    return false;
  }
  return [...subagentRuns.values()].some(
    (candidate) =>
      candidate.collect === true &&
      candidate.groupId === entry.groupId &&
      candidate.swarmRequesterSessionKey === entry.swarmRequesterSessionKey &&
      hasLiveOrRecentlyDispatchedContinuationWork(candidate.childSessionKey),
  );
}

export async function callGatewayForSweep<T>(
  request: Parameters<typeof callGateway>[0],
): Promise<T> {
  if (request.method === "sessions.delete") {
    const key = asOptionalRecord(request.params)?.key;
    if (typeof key === "string") {
      const entry = [...subagentRuns.values()].find(
        (candidate) => candidate.childSessionKey === key,
      );
      if (entry && hasContinuationWorkForSweepEntry(entry)) {
        throw new Error("subagent session still owns live continuation work");
      }
    }
  }
  return await subagentRegistryDeps.callGateway<T>(request);
}
