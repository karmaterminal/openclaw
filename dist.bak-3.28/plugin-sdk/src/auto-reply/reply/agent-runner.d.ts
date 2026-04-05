import { type SessionEntry } from "../../config/sessions.js";
import type { TypingMode } from "../../config/types.js";
import type { TemplateContext } from "../templating.js";
import { type VerboseLevel } from "../thinking.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import { type FollowupRun, type QueueSettings } from "./queue.js";
import type { TypingController } from "./typing.js";
export declare function setDelegatePending(sessionKey: string): void;
export declare function hasDelegatePending(sessionKey: string): boolean;
export declare function clearDelegatePending(sessionKey: string): void;
export declare function currentContinuationGeneration(sessionKey: string): number;
export declare function bumpContinuationGeneration(sessionKey: string): number;
/**
 * Cancel any pending continuation timer for the given session AND reset
 * chain metadata. Call this from early-return paths (inline actions, slash
 * commands, directive replies) that bypass runReplyAgent but still represent
 * real user input that should preempt a running continuation chain.
 *
 * We only bump (not clear) generations to avoid reuse: if we cleared the map
 * entry, a subsequent chain could reuse a generation value that matches a
 * stale in-flight timer callback.
 */
export declare function cancelContinuationTimer(sessionKey: string, sessionCtx?: {
    sessionEntry?: SessionEntry;
    sessionStore?: Record<string, SessionEntry>;
    storePath?: string;
}): void;
export declare function runReplyAgent(params: {
    commandBody: string;
    followupRun: FollowupRun;
    queueKey: string;
    resolvedQueue: QueueSettings;
    shouldSteer: boolean;
    shouldFollowup: boolean;
    isActive: boolean;
    isRunActive?: () => boolean;
    isStreaming: boolean;
    opts?: GetReplyOptions;
    typing: TypingController;
    sessionEntry?: SessionEntry;
    sessionStore?: Record<string, SessionEntry>;
    sessionKey?: string;
    storePath?: string;
    defaultModel: string;
    agentCfgContextTokens?: number;
    resolvedVerboseLevel: VerboseLevel;
    isNewSession: boolean;
    blockStreamingEnabled: boolean;
    blockReplyChunking?: {
        minChars: number;
        maxChars: number;
        breakPreference: "paragraph" | "newline" | "sentence";
        flushOnParagraph?: boolean;
    };
    resolvedBlockStreamingBreak: "text_end" | "message_end";
    sessionCtx: TemplateContext;
    shouldInjectGroupIntro: boolean;
    typingMode: TypingMode;
    /** True when this turn was triggered by a continuation timer (detected before system events are drained). */
    isContinuationWake?: boolean;
}): Promise<ReplyPayload | ReplyPayload[] | undefined>;
