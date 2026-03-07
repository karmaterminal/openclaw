export {
  countActiveDescendantRuns,
  countPendingDescendantRuns,
  countPendingDescendantRunsExcludingRun,
  isSubagentSessionRunActive,
  listSubagentRunsForRequester,
  replaceSubagentRunAfterSteer,
  resolveRequesterForChildSession,
} from "./subagent-registry.js";

// Compatibility shim for branches that adopt the newer announce flow before the
// corresponding registry helper lands. Absent richer suppression state, do not
// suppress descendant completion delivery.
export function shouldIgnorePostCompletionAnnounceForSession(_sessionKey?: string): boolean {
  return false;
}
