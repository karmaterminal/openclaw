import type { OpenClawConfig } from "../config/types.openclaw.js";
export type AgentRuntimeMetadata = {
    id: string;
    fallback?: "pi" | "none";
    source: "env" | "agent" | "defaults" | "implicit";
};
export declare function resolveAgentRuntimeMetadata(cfg: OpenClawConfig, agentId: string, env?: NodeJS.ProcessEnv): AgentRuntimeMetadata;
