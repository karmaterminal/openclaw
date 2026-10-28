// Continuation (karmaterminal) reads over the subagent run map, split from
// subagent-registry-queries.ts to keep that file under its line cap.
import { getLatestSubagentRunByChildSessionKeyFromRuns } from "./subagent-registry-queries.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { classifySubagentRunLiveness, type SubagentRunLiveness } from "./subagent-run-liveness.js";

/**
 * Three-state liveness of the latest run for a child session (orphan-reap).
 *
 * READ-TIME JOIN: liveness mutates after a continuation flow is classified
 * (a driver can die or finish between the classify and this read), so the
 * verdict is computed fresh against the live `runs` map at each dispatch — never
 * persisted onto the flow row. A missing record resolves to `uncertain`
 * (never reap) so same-session/main flows with no child-run record are safe.
 */
export function classifyChildSessionRunLivenessFromRuns(
  runs: Map<string, SubagentRunRecord>,
  childSessionKey: string,
  options?: { now?: number; staleCutoffMs?: number },
): SubagentRunLiveness {
  const latest = getLatestSubagentRunByChildSessionKeyFromRuns(runs, childSessionKey);
  return classifySubagentRunLiveness(latest, options ?? {});
}

export function listAncestorSessionKeysFromRuns(
  runs: Map<string, SubagentRunRecord>,
  sessionKey: string,
): string[] {
  const first = sessionKey.trim();
  if (!first) {
    return [];
  }
  const ancestors: string[] = [];
  const visited = new Set<string>();
  let current = first;
  while (current && !visited.has(current)) {
    ancestors.push(current);
    visited.add(current);
    const latest = getLatestSubagentRunByChildSessionKeyFromRuns(runs, current);
    const parent = latest?.requesterSessionKey.trim();
    if (!parent || parent === current) {
      break;
    }
    current = parent;
  }
  return ancestors;
}
