import type { RegisterSubagentRunParams } from "./subagent-registry-run-manager.js";
type CountActiveRunsForSessionFn = (requesterSessionKey: string) => number;
type RegisterSubagentRunFn = (params: RegisterSubagentRunParams) => void;
export declare function configureSubagentRegistrySpawnRuntime(params: {
    countActiveRunsForSession: CountActiveRunsForSessionFn;
    registerSubagentRun: RegisterSubagentRunFn;
}): void;
export declare function countActiveRunsForSession(requesterSessionKey: string): number;
export declare function registerSubagentRun(params: RegisterSubagentRunParams): void;
export {};
