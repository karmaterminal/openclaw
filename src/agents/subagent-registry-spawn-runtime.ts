import type { RegisterSubagentRunParams } from "./subagent-registry-run-manager.js";

type CountActiveRunsForSessionFn = (requesterSessionKey: string) => number;
type RegisterSubagentRunFn = (params: RegisterSubagentRunParams) => void;

let countActiveRunsForSessionImpl: CountActiveRunsForSessionFn | undefined;
let registerSubagentRunImpl: RegisterSubagentRunFn | undefined;

export function configureSubagentRegistrySpawnRuntime(params: {
  countActiveRunsForSession: CountActiveRunsForSessionFn;
  registerSubagentRun: RegisterSubagentRunFn;
}) {
  countActiveRunsForSessionImpl = params.countActiveRunsForSession;
  registerSubagentRunImpl = params.registerSubagentRun;
}

export function countActiveRunsForSession(requesterSessionKey: string): number {
  if (!countActiveRunsForSessionImpl) {
    throw new Error(
      "subagent registry spawn runtime is not configured before countActiveRunsForSession()",
    );
  }
  return countActiveRunsForSessionImpl(requesterSessionKey);
}

export function registerSubagentRun(params: RegisterSubagentRunParams): void {
  if (!registerSubagentRunImpl) {
    throw new Error(
      "subagent registry spawn runtime is not configured before registerSubagentRun()",
    );
  }
  registerSubagentRunImpl(params);
}
