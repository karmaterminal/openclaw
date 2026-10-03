import type { callGateway } from "../../../gateway/call.js";
import type { GatewayRecoveryRuntime } from "../../../gateway/server-instance-runtime.types.js";
import type { createSubagentRegistryCompletionRuntime } from "./subagent-registry-completion-runtime.js";
import type {
  SubagentLifecycleController,
  SubagentLifecycleOptions,
} from "./subagent-registry-lifecycle.js";
import type { createSubagentRunManager } from "./subagent-registry-run-manager.js";
import type {
  ContextEngineSubagentEndedParams,
  SubagentRunRecord,
} from "./subagent-registry.types.js";

type CompletionRuntime = ReturnType<typeof createSubagentRegistryCompletionRuntime>;
type SubagentRunManager = ReturnType<typeof createSubagentRunManager>;

export type SubagentRegistrySweeperParams = {
  runs: Map<string, SubagentRunRecord>;
  resumedRuns: Set<string>;
  persist: (...runIds: string[]) => void;
  clearPendingLifecycleError: (runId: string) => void;
  clearPendingLifecycleTimeout: (runId: string) => void;
  sweepPendingLifecycle: (now: number) => void;
  completeSubagentRunWithRecovery: CompletionRuntime["completeSubagentRunWithRecovery"];
  recordAcceptedSubagentSpawnRollback: SubagentRunManager["recordAcceptedSubagentSpawnRollback"];
  releaseAcceptedSubagentSpawnRollback: SubagentRunManager["releaseAcceptedSubagentSpawnRollback"];
  rollbackSubagentRunRegistration: SubagentRunManager["rollbackSubagentRunRegistration"];
  settleFailedQueuedSubagentLaunch: SubagentRunManager["settleFailedQueuedSubagentLaunch"];
  getGatewayRecoveryRuntime: () => GatewayRecoveryRuntime | undefined;
  finalizeInterruptedSubagentRun: CompletionRuntime["finalizeInterruptedSubagentRun"];
  resumeRequesterSettleWake: SubagentLifecycleController["resumeRequesterSettleWake"];
  startSubagentAnnounceCleanupFlow: SubagentLifecycleController["startSubagentAnnounceCleanupFlow"];
  completeCleanupBookkeeping: SubagentLifecycleController["completeCleanupBookkeeping"];
  isEndedHookOwnerCurrent: SubagentLifecycleController["isEndedHookOwnerCurrent"];
  sessionEffectsHostCurrent: SubagentLifecycleController["sessionEffectsHostCurrent"];
  shouldSuppressSessionEffects: SubagentLifecycleController["shouldSuppressSessionEffects"];
  discardTerminalDelivery: typeof SubagentLifecycleController.discardTerminalDelivery;
  shouldEmitEndedHookForRun: SubagentLifecycleOptions["shouldEmitEndedHookForRun"];
  emitSubagentEndedHookForRun: SubagentLifecycleOptions["emitSubagentEndedHookForRun"];
  /** Continuation: live continuation work on the child session holds its archive. */
  shouldDeferArchive: (entry: SubagentRunRecord) => boolean;
  callGateway: typeof callGateway;
  cleanupCollectorLaunchResources: (entry: SubagentRunRecord) => Promise<boolean>;
  runContextEngineSubagentEnded: (params: ContextEngineSubagentEndedParams) => Promise<void>;
  notifyContextEngineSubagentEnded: (params: ContextEngineSubagentEndedParams) => Promise<void>;
  retireSupersededRun: (runId: string, entry: SubagentRunRecord) => Promise<void>;
  getRunsForChildSession: (childSessionKey: string) => Iterable<SubagentRunRecord>;
  getRunsForCollectorGroup: (
    requesterSessionKey: string,
    groupId: string,
    requesterAgentId?: string,
  ) => Iterable<[string, SubagentRunRecord]>;
  warn: (message: string, meta?: Record<string, unknown>) => void;
};
