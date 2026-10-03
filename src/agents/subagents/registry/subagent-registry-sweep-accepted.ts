// Sweeper reconciliation for accepted spawn rollbacks.
import type { callGateway } from "../../../gateway/call.js";
import { terminateAcceptedCollectorRun } from "../spawn/subagent-spawn-cleanup.js";
import { hasPendingSubagentRetirementPublication } from "./subagent-registry-memory.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

export async function reconcileAcceptedSpawnRollback(params: {
  runId: string;
  entry: SubagentRunRecord;
  runs: Map<string, SubagentRunRecord>;
  callGateway: typeof callGateway;
  recordAcceptedSubagentSpawnRollback: (params: {
    runId: string;
    childSessionKey: string;
    gatewayRunId: string;
    reason: string;
    expectedSessionId?: string;
    expectedLifecycleRevision?: string;
  }) =>
    | { status: "persisted" }
    | { status: "pending-persistence"; error: unknown }
    | { status: "rejected" };
  releaseAcceptedSubagentSpawnRollback: (params: {
    runId: string;
    childSessionKey: string;
    gatewayRunId: string;
  }) => boolean;
  rollbackSubagentRunRegistration: (params: { runId: string; childSessionKey: string }) => boolean;
  settleFailedQueuedSubagentLaunch: (runId: string, error: string) => boolean;
  warn: (message: string, meta?: Record<string, unknown>) => void;
}): Promise<boolean> {
  const rollback = params.entry.acceptedSpawnRollback;
  if (!rollback || params.runs.get(params.runId) !== params.entry) {
    return false;
  }
  const record = params.recordAcceptedSubagentSpawnRollback({
    runId: params.runId,
    childSessionKey: params.entry.childSessionKey,
    gatewayRunId: rollback.gatewayRunId,
    reason: rollback.reason,
    expectedSessionId: rollback.expectedSessionId,
    expectedLifecycleRevision: rollback.expectedLifecycleRevision,
  });
  if (record.status === "pending-persistence") {
    params.warn("failed to persist accepted spawn rollback owner", {
      runId: params.runId,
      childSessionKey: params.entry.childSessionKey,
      error: record.error,
    });
  }
  const terminated = await terminateAcceptedCollectorRun({
    childSessionKey: params.entry.childSessionKey,
    gatewayRunId: rollback.gatewayRunId,
    expectedSessionId: rollback.expectedSessionId,
    expectedLifecycleRevision: rollback.expectedLifecycleRevision,
    callGateway: params.callGateway,
    retry: false,
  });
  if (
    !terminated ||
    params.runs.get(params.runId) !== params.entry ||
    params.entry.acceptedSpawnRollback !== rollback ||
    // A Stop that began publishing during termination decides the outcome first;
    // settlement and release are idempotent and wait for a later sweep.
    hasPendingSubagentRetirementPublication(params.entry)
  ) {
    return true;
  }
  if (params.entry.collect) {
    params.settleFailedQueuedSubagentLaunch(params.runId, rollback.reason);
    // The accepted child is proven stopped, so this custody is discharged. Keeping
    // it would terminate the same gateway run again on every sweep.
    params.releaseAcceptedSubagentSpawnRollback({
      runId: params.runId,
      childSessionKey: params.entry.childSessionKey,
      gatewayRunId: rollback.gatewayRunId,
    });
  } else {
    params.rollbackSubagentRunRegistration({
      runId: params.runId,
      childSessionKey: params.entry.childSessionKey,
    });
  }
  return true;
}

export function selectNextAcceptedSpawnRollbackCandidate<T extends { runId: string }>(
  candidates: readonly T[],
  previousRunId?: string,
): T | undefined {
  const previousIndex = candidates.findIndex((candidate) => candidate.runId === previousRunId);
  return candidates.length > 0 ? candidates[(previousIndex + 1) % candidates.length] : undefined;
}
