import type { AgentMessage } from "@mariozechner/pi-agent-core";
type AgentHarnessHookContext = {
    runId: string;
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    workspaceDir?: string;
    messageProvider?: string;
    trigger?: string;
    channelId?: string;
};
export type AgentHarnessPromptBuildResult = {
    prompt: string;
    developerInstructions: string;
};
export declare function resolveAgentHarnessBeforePromptBuildResult(params: {
    prompt: string;
    developerInstructions: string;
    messages: unknown[];
    ctx: AgentHarnessHookContext;
}): Promise<AgentHarnessPromptBuildResult>;
export declare function runAgentHarnessBeforeCompactionHook(params: {
    sessionFile: string;
    messages: AgentMessage[];
    ctx: AgentHarnessHookContext;
}): Promise<void>;
export declare function runAgentHarnessAfterCompactionHook(params: {
    sessionFile: string;
    messages: AgentMessage[];
    ctx: AgentHarnessHookContext;
    compactedCount: number;
}): Promise<void>;
export {};
