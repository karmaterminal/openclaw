import {
  hasLiveContinuationCustody,
  hasLiveOrRecentlyDispatchedContinuationWork,
} from "../../../auto-reply/continuation/work-store.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

function sweepGroupMembers(entry: SubagentRunRecord): SubagentRunRecord[] {
  if (!entry.collect || !entry.groupId) {
    return [entry];
  }
  return [
    entry,
    ...[...subagentRuns.values()].filter(
      (candidate) =>
        candidate !== entry &&
        candidate.collect === true &&
        candidate.groupId === entry.groupId &&
        candidate.swarmRequesterSessionKey === entry.swarmRequesterSessionKey,
    ),
  ];
}

/**
 * Authoritative guard for the delete itself: reads continuation custody, so
 * a session is never deleted while its own or its collector group's custody
 * still needs it.
 */
export async function hasLiveContinuationCustodyForSweepEntry(
  entry: SubagentRunRecord,
): Promise<boolean> {
  for (const member of sweepGroupMembers(entry)) {
    if (await hasLiveContinuationCustody(member.childSessionKey)) {
      return true;
    }
  }
  return false;
}

/**
 * Synchronous archive deferral from the custody projection (RFC §5.4.6). An
 * owner the projection cannot answer for defers, so archiving errs late.
 */
export function hasContinuationWorkForSweepEntry(entry: SubagentRunRecord): boolean {
  return sweepGroupMembers(entry).some((member) =>
    hasLiveOrRecentlyDispatchedContinuationWork(member.childSessionKey),
  );
}
