import type { SessionEntry } from "../config/sessions.js";
export declare const SUBAGENT_RECOVERY_MAX_AUTOMATIC_ATTEMPTS = 2;
export declare const SUBAGENT_RECOVERY_REWEDGE_WINDOW_MS: number;
export type SubagentRecoveryGate = {
    allowed: true;
    nextAttempt: number;
} | {
    allowed: false;
    reason: string;
    shouldMarkWedged: boolean;
};
export declare function isSubagentRecoveryWedgedEntry(entry: unknown): boolean;
export declare function formatSubagentRecoveryWedgedReason(entry: SessionEntry): string;
export declare function evaluateSubagentRecoveryGate(entry: SessionEntry, now: number): SubagentRecoveryGate;
export declare function markSubagentRecoveryAttempt(params: {
    entry: SessionEntry;
    now: number;
    runId: string;
    attempt: number;
}): void;
export declare function markSubagentRecoveryWedged(params: {
    entry: SessionEntry;
    now: number;
    runId?: string;
    reason: string;
}): void;
export declare function clearWedgedSubagentRecoveryAbort(entry: SessionEntry, now: number): boolean;
