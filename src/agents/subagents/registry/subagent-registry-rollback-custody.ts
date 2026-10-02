import { isDeepStrictEqual } from "node:util";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

// Accepted-spawn rollback custody is an annotation, not an owner transition: it
// marks the row so restart can terminate an accepted child, and it must be durable
// before its launch owner awaits anything. A staged owner write (for example a
// Stop's kill claim) can be pending on the same row at that moment. Recording the
// custody supersedes that write; the staged write then rebases onto the custody
// instead of losing its mutation. Revisions are kept per live row object so a
// staged write can tell a custody annotation apart from any other row change.
const custodyRevisions = new WeakMap<SubagentRunRecord, number>();

type SubagentAcceptedSpawnRollback = NonNullable<SubagentRunRecord["acceptedSpawnRollback"]>;

/** Applies custody fields in place; the recorder persists the row afterward. */
export function annotateSubagentRunRollbackCustody(
  entry: SubagentRunRecord,
  rollback: SubagentAcceptedSpawnRollback,
): void {
  custodyRevisions.set(entry, (custodyRevisions.get(entry) ?? 0) + 1);
  entry.acceptedSpawnRollback = rollback;
  entry.suppressCompletionDelivery = true;
  if (entry.execution.status !== "terminal") {
    entry.execution = { ...entry.execution, suppressSessionEffects: true };
  }
}

export function readSubagentRunRollbackCustodyRevision(entry: SubagentRunRecord): number {
  return custodyRevisions.get(entry) ?? 0;
}

function withoutRollbackCustody(entry: SubagentRunRecord): SubagentRunRecord {
  const {
    acceptedSpawnRollback: _rollback,
    suppressCompletionDelivery: _delivery,
    ...rest
  } = entry;
  const { suppressSessionEffects: _effects, ...execution } = entry.execution;
  return { ...rest, execution };
}

/**
 * Re-stages a superseded postimage when the live row differs from its staged
 * preimage only by a custody annotation (or not at all, for sibling rows of a
 * multi-row write). Any other change keeps the supersession.
 */
export function rebaseSubagentRunOntoRollbackCustody(params: {
  live: SubagentRunRecord;
  preimage: SubagentRunRecord;
  next: SubagentRunRecord;
}): SubagentRunRecord | undefined {
  const { live, preimage, next } = params;
  if (isDeepStrictEqual(live, preimage)) {
    return next;
  }
  if (
    !live.acceptedSpawnRollback ||
    !isDeepStrictEqual(withoutRollbackCustody(live), withoutRollbackCustody(preimage))
  ) {
    return undefined;
  }
  return {
    ...next,
    acceptedSpawnRollback: live.acceptedSpawnRollback,
    suppressCompletionDelivery: true,
    execution:
      next.execution.status === "terminal"
        ? next.execution
        : { ...next.execution, suppressSessionEffects: true },
  };
}
