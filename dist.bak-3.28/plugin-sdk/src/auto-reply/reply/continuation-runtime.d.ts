import type { OpenClawConfig } from "../../config/config.js";
export type ContinuationRuntimeConfig = {
    enabled: boolean;
    defaultDelayMs: number;
    minDelayMs: number;
    maxDelayMs: number;
    maxChainLength: number;
    costCapTokens: number;
    maxDelegatesPerTurn: number;
    generationGuardTolerance: number;
    contextPressureThreshold?: number;
};
export declare function resolveContinuationRuntimeConfig(cfg?: OpenClawConfig): ContinuationRuntimeConfig;
export declare function resolveMaxDelegatesPerTurn(cfg?: OpenClawConfig): number;
