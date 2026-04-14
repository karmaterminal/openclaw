type RegisterSubagentRunParams = {
  runId: string;
  childSessionKey: string;
  controllerSessionKey?: string;
  requesterSessionKey: string;
  requesterOrigin?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
    groupId?: string | null;
    groupChannel?: string | null;
    groupSpace?: string | null;
  };
  requesterDisplayKey: string;
  task: string;
  cleanup: "delete" | "keep";
  label?: string;
  model?: string;
  workspaceDir?: string;
  runTimeoutSeconds?: number;
  expectsCompletionMessage?: boolean;
  spawnMode?: "run" | "session";
  silentAnnounce?: boolean;
  wakeOnReturn?: boolean;
  attachmentsDir?: string;
  attachmentsRootDir?: string;
  retainAttachmentsOnKeep?: boolean;
};

type CountActiveRunsForSessionFn = (requesterSessionKey: string) => number;
type RegisterSubagentRunFn = (params: RegisterSubagentRunParams) => void;

let countActiveRunsForSessionImpl: CountActiveRunsForSessionFn | null = null;
let registerSubagentRunImpl: RegisterSubagentRunFn | null = null;

export function configureSubagentRegistrySpawnRuntime(params: {
  countActiveRunsForSession: CountActiveRunsForSessionFn;
  registerSubagentRun: RegisterSubagentRunFn;
}) {
  countActiveRunsForSessionImpl = params.countActiveRunsForSession;
  registerSubagentRunImpl = params.registerSubagentRun;
}

export function countActiveRunsForSession(requesterSessionKey: string): number {
  return countActiveRunsForSessionImpl?.(requesterSessionKey) ?? 0;
}

export function registerSubagentRun(params: RegisterSubagentRunParams): void {
  registerSubagentRunImpl?.(params);
}
