import type { SubagentRunRecord } from "./subagent-registry.types.js";

// Accepted-spawn rollback custody is an annotation, not an owner transition: it
// marks the row so restart can terminate an accepted child, and it must be durable
// before its launch owner awaits anything.

type SubagentAcceptedSpawnRollback = NonNullable<SubagentRunRecord["acceptedSpawnRollback"]>;

/** Applies custody fields in place; the recorder persists the row afterward. */
export function annotateSubagentRunRollbackCustody(
  entry: SubagentRunRecord,
  rollback: SubagentAcceptedSpawnRollback,
): void {
  entry.acceptedSpawnRollback = rollback;
  entry.suppressCompletionDelivery = true;
  if (entry.execution.status !== "terminal") {
    entry.execution = { ...entry.execution, suppressSessionEffects: true };
  }
}
