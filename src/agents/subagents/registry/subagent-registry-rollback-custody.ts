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

/** True when the live row equals the staged preimage apart from rollback custody. */
export function matchesSubagentRunModuloRollbackCustody(
  live: SubagentRunRecord,
  preimage: SubagentRunRecord,
): live is SubagentRunRecord & { acceptedSpawnRollback: SubagentAcceptedSpawnRollback } {
  return (
    live.acceptedSpawnRollback !== undefined &&
    isDeepStrictEqual(withoutRollbackCustody(live), withoutRollbackCustody(preimage))
  );
}

/** Replays the live row's custody annotation on top of a staged postimage. */
export function rebaseSubagentRunOntoRollbackCustody(
  next: SubagentRunRecord,
  live: SubagentRunRecord & { acceptedSpawnRollback: SubagentAcceptedSpawnRollback },
): SubagentRunRecord {
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
