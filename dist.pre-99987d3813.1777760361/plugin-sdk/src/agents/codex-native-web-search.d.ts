import type { OpenClawConfig } from "../config/types.openclaw.js";
export { buildCodexNativeWebSearchTool, type CodexNativeSearchActivation, type CodexNativeSearchPayloadPatchResult, hasAvailableCodexAuth, hasCodexNativeWebSearchTool, isCodexNativeSearchEligibleModel, patchCodexNativeWebSearchPayload, resolveCodexNativeSearchActivation, shouldSuppressManagedWebSearchTool, } from "./codex-native-web-search-core.js";
export { type CodexNativeSearchContextSize, type CodexNativeSearchMode, type CodexNativeSearchUserLocation, describeCodexNativeWebSearch, type ResolvedCodexNativeWebSearchConfig, resolveCodexNativeWebSearchConfig, } from "./codex-native-web-search.shared.js";
export declare function isCodexNativeWebSearchRelevant(params: {
    config: OpenClawConfig;
    agentId?: string;
    agentDir?: string;
}): boolean;
