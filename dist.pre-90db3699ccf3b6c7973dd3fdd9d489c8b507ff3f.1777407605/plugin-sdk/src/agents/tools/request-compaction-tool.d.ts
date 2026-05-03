import type { AnyAgentTool } from "./common.js";
export type RequestCompactionToolOpts = {
    /** Current session key (e.g. "telegram:12345"). */
    agentSessionKey?: string;
    /** Session id (the Pi session UUID). */
    sessionId?: string;
    /**
     * Returns the current context usage as a fraction (0-1).
     * Injected so the tool does not reach into session internals.
     */
    getContextUsage: () => number;
    /**
     * Async function that triggers compaction. Injected so the tool does not
     * import the heavy compaction module directly. The caller provides a
     * closure over `compactEmbeddedPiSession` with all required session params.
     */
    triggerCompaction: () => Promise<{
        ok: boolean;
        compacted: boolean;
        reason?: string;
    }>;
};
/**
 * Creates the `request_compaction` tool.
 *
 * This tool allows the agent to **request** compaction after it has prepared —
 * evacuated working state to memory files, staged post-compaction delegates,
 * or otherwise accepted the context loss.
 *
 * The tool is ASYNC: it enqueues compaction and returns immediately. The
 * compaction runs between turns via the lane queue, not during the tool call.
 *
 * Guards (all checked before compaction is enqueued):
 *   - **Context threshold:** context usage must be >= 70%.
 *   - **Rate limit:** at most one compaction per 5 minutes per session.
 *   - **Generation guard:** if the session generation has advanced since the
 *     agent's turn started, another message arrived.
 */
export declare function createRequestCompactionTool(opts: RequestCompactionToolOpts): AnyAgentTool;
/** Increment the volitional compaction counter for a session. */
export declare function incrementVolitionalCompactionCount(sessionKey: string): void;
/** Get the volitional compaction count for a session. */
export declare function getVolitionalCompactionCount(sessionKey: string): number;
/** Reset per-session guard state. Exported for tests only. */
export declare function _resetGuardState(sessionKey?: string): void;
/** Mark a session as having a pending compaction. Exported for tests only. */
export declare function _setPending(sessionKey: string): void;
/** Reset volitional compaction counters. Exported for tests only. */
export declare function _resetVolitionalCounts(sessionKey?: string): void;
/** Expose constants for test assertions. */
export declare const _guards: {
    readonly MIN_CONTEXT_THRESHOLD: 0.7;
    readonly RATE_LIMIT_MS: number;
    readonly VOLITIONAL_COMPACTION_COUNT_TTL_MS: number;
};
