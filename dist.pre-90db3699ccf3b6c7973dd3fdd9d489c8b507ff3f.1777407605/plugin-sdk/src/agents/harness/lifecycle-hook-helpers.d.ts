import type { PluginHookAgentEndEvent, PluginHookLlmInputEvent, PluginHookLlmOutputEvent } from "../../plugins/hook-types.js";
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
export declare function runAgentHarnessLlmInputHook(params: {
    event: PluginHookLlmInputEvent;
    ctx: AgentHarnessHookContext;
}): void;
export declare function runAgentHarnessLlmOutputHook(params: {
    event: PluginHookLlmOutputEvent;
    ctx: AgentHarnessHookContext;
}): void;
export declare function runAgentHarnessAgentEndHook(params: {
    event: PluginHookAgentEndEvent;
    ctx: AgentHarnessHookContext;
}): void;
export {};
