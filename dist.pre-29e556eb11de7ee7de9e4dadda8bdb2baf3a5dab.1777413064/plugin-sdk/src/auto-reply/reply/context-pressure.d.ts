import type { SessionEntry } from "../../config/sessions.js";
export interface CheckContextPressureParams {
    sessionEntry: SessionEntry;
    sessionKey: string;
    contextPressureThreshold: number | undefined;
    contextWindowTokens: number;
}
export interface CheckContextPressureResult {
    fired: boolean;
    band: number;
}
/**
 * Check whether the session's token usage has crossed a context-pressure
 * threshold band and, if so, enqueue a `[system:context-pressure]` event.
 *
 * Bands are fixed at 90 and 95; the first band uses the configured threshold
 * rounded to percentage (e.g. 0.8 → 80, 0.5 → 50). Dedup is via
 * `lastContextPressureBand` on the session entry — each band fires once.
 *
 * Returns `{ fired, band }` so callers can persist the band to the session store.
 */
export declare function checkContextPressure(params: CheckContextPressureParams): CheckContextPressureResult;
