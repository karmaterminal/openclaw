import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveProviderEndpoint } from "./provider-attribution.js";
export declare const CONTEXT_WINDOW_HARD_MIN_TOKENS = 4000;
export declare const CONTEXT_WINDOW_WARN_BELOW_TOKENS = 8000;
export declare const CONTEXT_WINDOW_HARD_MIN_RATIO = 0.1;
export declare const CONTEXT_WINDOW_WARN_BELOW_RATIO = 0.2;
export type ContextWindowSource = "model" | "modelsConfig" | "agentContextTokens" | "default";
export type ContextWindowInfo = {
    tokens: number;
    referenceTokens?: number;
    source: ContextWindowSource;
};
export declare function resolveContextWindowInfo(params: {
    cfg: OpenClawConfig | undefined;
    provider: string;
    modelId: string;
    modelContextTokens?: number;
    modelContextWindow?: number;
    defaultTokens: number;
}): ContextWindowInfo;
export type ContextWindowGuardResult = ContextWindowInfo & {
    hardMinTokens: number;
    warnBelowTokens: number;
    shouldWarn: boolean;
    shouldBlock: boolean;
};
export type ContextWindowGuardThresholds = {
    hardMinTokens: number;
    warnBelowTokens: number;
};
export type ContextWindowGuardHint = {
    endpointClass: ReturnType<typeof resolveProviderEndpoint>["endpointClass"];
    likelySelfHosted: boolean;
};
export declare function resolveContextWindowGuardHint(params: {
    runtimeBaseUrl?: string | null;
}): ContextWindowGuardHint;
export declare function resolveContextWindowGuardThresholds(contextWindowTokens: number): ContextWindowGuardThresholds;
export declare function formatContextWindowWarningMessage(params: {
    provider: string;
    modelId: string;
    guard: ContextWindowGuardResult;
    runtimeBaseUrl?: string | null;
}): string;
export declare function formatContextWindowBlockMessage(params: {
    guard: ContextWindowGuardResult;
    runtimeBaseUrl?: string | null;
}): string;
export declare function evaluateContextWindowGuard(params: {
    info: ContextWindowInfo;
    warnBelowTokens?: number;
    hardMinTokens?: number;
}): ContextWindowGuardResult;
