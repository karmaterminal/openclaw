export type EmbeddedRunStageTiming = {
    name: string;
    durationMs: number;
    elapsedMs: number;
};
export type EmbeddedRunStageSummary = {
    totalMs: number;
    stages: EmbeddedRunStageTiming[];
};
export type EmbeddedRunStageTracker = {
    mark: (name: string) => void;
    snapshot: () => EmbeddedRunStageSummary;
};
export declare const EMBEDDED_RUN_STAGE_WARN_TOTAL_MS = 10000;
export declare const EMBEDDED_RUN_STAGE_WARN_STAGE_MS = 5000;
export declare function createEmbeddedRunStageTracker(options?: {
    now?: () => number;
}): EmbeddedRunStageTracker;
export declare function shouldWarnEmbeddedRunStageSummary(summary: EmbeddedRunStageSummary, options?: {
    totalThresholdMs?: number;
    stageThresholdMs?: number;
}): boolean;
export declare function formatEmbeddedRunStageSummary(prefix: string, summary: EmbeddedRunStageSummary): string;
