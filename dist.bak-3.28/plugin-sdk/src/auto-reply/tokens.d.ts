export declare const HEARTBEAT_TOKEN = "HEARTBEAT_OK";
export declare const SILENT_REPLY_TOKEN = "NO_REPLY";
export declare const CONTINUE_WORK_TOKEN = "CONTINUE_WORK";
export declare function isSilentReplyText(text: string | undefined, token?: string): boolean;
export declare function isSilentReplyEnvelopeText(text: string | undefined, token?: string): boolean;
export declare function isSilentReplyPayloadText(text: string | undefined, token?: string): boolean;
/**
 * Strip a trailing silent reply token from mixed-content text.
 * Returns the remaining text with the token removed (trimmed).
 * If the result is empty, the entire message should be treated as silent.
 */
export declare function stripSilentToken(text: string, token?: string): string;
export declare function isSilentReplyPrefixText(text: string | undefined, token?: string): boolean;
export type ContinuationSignal = {
    kind: "work";
    delayMs?: number;
} | {
    kind: "delegate";
    task: string;
    delayMs?: number;
    silent?: boolean;
    silentWake?: boolean;
};
/**
 * Checks if the agent response ends with a continuation signal.
 * Returns the parsed signal or null if no continuation is requested.
 *
 * Formats:
 *   CONTINUE_WORK              → continue with default delay
 *   CONTINUE_WORK:30           → continue after 30 seconds
 *   [[CONTINUE_DELEGATE: task]]      → spawn sub-agent with task immediately
 *   [[CONTINUE_DELEGATE: task +30s]] → spawn sub-agent after 30-second delay
 *
 * The `+Ns` suffix on DELEGATE specifies a timer offset before the sub-agent
 * spawns (delegate-as-scheduler pattern). Timers do not survive gateway restarts.
 *
 * DELEGATE uses bracket syntax ([[...]]) following the repo convention for tokens
 * that carry body content (see reply_to, tts, line directives). Brackets naturally
 * delimit the boundary, so multiline tasks work without ambiguity.
 */
export declare function parseContinuationSignal(text: string | undefined): ContinuationSignal | null;
/**
 * Strips the continuation signal from the response text, returning the
 * displayable text and the parsed signal separately.
 */
export declare function stripContinuationSignal(text: string): {
    text: string;
    signal: ContinuationSignal | null;
};
