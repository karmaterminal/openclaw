// Sweeper reconciliation for accepted steer dispatches and accepted spawn rollbacks.
import type { callGateway } from "../../../gateway/call.js";
import { isAgentEventLifecycleGenerationCurrent } from "../../../infra/agent-events.js";
import { terminateAcceptedCollectorRun } from "../spawn/subagent-spawn-cleanup.js";
import type {
  SubagentAcceptedSteerDispatch,
  SubagentRunRecord,
} from "./subagent-registry.types.js";

export async function reconcileAcceptedSteerDispatch(params: {
  runId: string;
  entry: SubagentRunRecord;
  runs: Map<string, SubagentRunRecord>;
  callGateway: typeof callGateway;
  persistOrThrow: (runId: string) => void;
  clearSubagentRunSteerRestart: (
    runId: string,
    expected?: SubagentRunRecord,
    acceptedDispatch?: SubagentAcceptedSteerDispatch,
    requirePersistence?: boolean,
  ) => boolean;
  warn: (message: string, meta?: Record<string, unknown>) => void;
}): Promise<boolean> {
  const dispatch = params.entry.acceptedSteerDispatch;
  if (!dispatch) {
    return false;
  }
  if (
    params.runs.get(params.runId) !== params.entry ||
    params.entry.acceptedSteerDispatch !== dispatch
  ) {
    return true;
  }
  if (
    dispatch.phase === "dispatching" &&
    dispatch.lifecycleGeneration !== undefined &&
    isAgentEventLifecycleGenerationCurrent(dispatch.lifecycleGeneration)
  ) {
    return true;
  }
  try {
    // Retry the strict owner write before cleanup. Termination must not erase the
    // only in-memory receipt before restart can recover it.
    params.persistOrThrow(params.runId);
  } catch (error) {
    params.warn("failed to persist accepted steer dispatch during sweep", {
      error,
      runId: params.runId,
      gatewayRunId: dispatch.gatewayRunId,
    });
    return true;
  }

  const terminated = await terminateAcceptedCollectorRun({
    childSessionKey: params.entry.childSessionKey,
    gatewayRunId: dispatch.gatewayRunId,
    expectedSessionId: dispatch.expectedSessionId,
    expectedLifecycleRevision: dispatch.expectedLifecycleRevision,
    timeoutMs: 10_000,
    callGateway: params.callGateway,
    retry: false,
  });
  if (
    terminated &&
    params.runs.get(params.runId) === params.entry &&
    params.entry.acceptedSteerDispatch === dispatch
  ) {
    params.clearSubagentRunSteerRestart(params.runId, params.entry, dispatch);
  }
  return true;
}

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
    params.entry.acceptedSpawnRollback !== rollback
  ) {
    return true;
  }
  if (params.entry.collect) {
    params.settleFailedQueuedSubagentLaunch(params.runId, rollback.reason);
  } else {
    params.rollbackSubagentRunRegistration({
      runId: params.runId,
      childSessionKey: params.entry.childSessionKey,
    });
  }
  return true;
}

export function selectNextAcceptedSteerCandidate<T extends { runId: string }>(
  candidates: readonly T[],
  previousRunId?: string,
): T | undefined {
  const previousIndex = candidates.findIndex((candidate) => candidate.runId === previousRunId);
  return candidates.length > 0 ? candidates[(previousIndex + 1) % candidates.length] : undefined;
}
