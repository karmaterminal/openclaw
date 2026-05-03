import type { OpenClawConfig } from "../config/config.js";
export declare const DEFAULT_COMMITMENT_EXTRACTION_DEBOUNCE_MS = 15000;
export declare const DEFAULT_COMMITMENT_BATCH_MAX_ITEMS = 8;
export declare const DEFAULT_COMMITMENT_CONFIDENCE_THRESHOLD = 0.72;
export declare const DEFAULT_COMMITMENT_CARE_CONFIDENCE_THRESHOLD = 0.86;
export declare const DEFAULT_COMMITMENT_EXTRACTION_TIMEOUT_SECONDS = 45;
export declare const DEFAULT_COMMITMENT_MAX_PER_HEARTBEAT = 3;
export declare const DEFAULT_COMMITMENT_EXPIRE_AFTER_HOURS = 72;
export declare const DEFAULT_COMMITMENT_MAX_PER_DAY = 3;
export type ResolvedCommitmentsConfig = {
    enabled: boolean;
    maxPerDay: number;
    extraction: {
        debounceMs: number;
        batchMaxItems: number;
        confidenceThreshold: number;
        careConfidenceThreshold: number;
        timeoutSeconds: number;
    };
};
export declare function resolveCommitmentsConfig(cfg?: OpenClawConfig): ResolvedCommitmentsConfig;
export declare function resolveCommitmentTimezone(cfg?: OpenClawConfig): string;
