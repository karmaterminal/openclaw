import type { createSubagentRunManager } from "./subagent-registry-run-manager.js";
import type { SubagentRegistrySweeperParams } from "./subagent-registry-sweeper.types.js";
import type {
  SubagentAcceptedSteerDispatch,
  SubagentRunRecord,
} from "./subagent-registry.types.js";

type SubagentRunManager = ReturnType<typeof createSubagentRunManager>;

type SweeperRunManagerOperations = Pick<
  SubagentRegistrySweeperParams,
  | "clearSubagentRunSteerRestart"
  | "recordAcceptedSubagentSpawnRollback"
  | "rollbackSubagentRunRegistration"
  | "settleFailedQueuedSubagentLaunch"
>;

/**
 * Run-manager operations the sweeper needs. The sweeper is constructed before the
 * run manager it feeds, so every operation resolves the manager at call time.
 */
export function createSweeperRunManagerOperations(
  getRunManager: () => SubagentRunManager,
): SweeperRunManagerOperations {
  return {
    clearSubagentRunSteerRestart: (...args) =>
      getRunManager().clearSubagentRunSteerRestart(...args),
    recordAcceptedSubagentSpawnRollback: (...args) =>
      getRunManager().recordAcceptedSubagentSpawnRollback(...args),
    rollbackSubagentRunRegistration: (...args) =>
      getRunManager().rollbackSubagentRunRegistration(...args),
    settleFailedQueuedSubagentLaunch: (...args) =>
      getRunManager().settleFailedQueuedSubagentLaunch(...args),
  };
}

export type RecordAcceptedSubagentSteerDispatchParams = SubagentAcceptedSteerDispatch & {
  runId: string;
  expected: SubagentRunRecord;
  expectedDispatch?: SubagentAcceptedSteerDispatch;
};

/**
 * Records an accepted steer dispatch. A caller that names the dispatch it expects
 * replaces only that exact dispatch on that exact resident owner; otherwise it is rejected.
 */
export function recordAcceptedSubagentSteerDispatchIfCurrent(
  runManager: Pick<SubagentRunManager, "recordAcceptedSubagentSteerDispatch">,
  runs: ReadonlyMap<string, SubagentRunRecord>,
  params: RecordAcceptedSubagentSteerDispatchParams,
) {
  const owner = runs.get(params.runId.trim());
  if (
    params.expectedDispatch &&
    (owner !== params.expected || owner.acceptedSteerDispatch !== params.expectedDispatch)
  ) {
    return { status: "rejected" as const };
  }
  return runManager.recordAcceptedSubagentSteerDispatch(params);
}
