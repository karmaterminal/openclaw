import type { AnyAgentTool } from "./common.js";
export type ContinueWorkRequest = {
    reason: string;
    delaySeconds: number;
};
export type ContinueWorkToolOpts = {
    agentSessionKey?: string;
    requestContinuation: (request: ContinueWorkRequest) => void;
};
export declare function createContinueWorkTool(opts: ContinueWorkToolOpts): AnyAgentTool;
