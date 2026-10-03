import type { createSubagentRunManager } from "./subagent-registry-run-manager.js";
import type { SubagentRegistrySweeperParams } from "./subagent-registry-sweeper.types.js";

type SubagentRunManager = ReturnType<typeof createSubagentRunManager>;

type SweeperRunManagerOperations = Pick<
  SubagentRegistrySweeperParams,
  | "recordAcceptedSubagentSpawnRollback"
  | "releaseAcceptedSubagentSpawnRollback"
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
    recordAcceptedSubagentSpawnRollback: (...args) =>
      getRunManager().recordAcceptedSubagentSpawnRollback(...args),
    releaseAcceptedSubagentSpawnRollback: (...args) =>
      getRunManager().releaseAcceptedSubagentSpawnRollback(...args),
    rollbackSubagentRunRegistration: (...args) =>
      getRunManager().rollbackSubagentRunRegistration(...args),
    settleFailedQueuedSubagentLaunch: (...args) =>
      getRunManager().settleFailedQueuedSubagentLaunch(...args),
  };
}
