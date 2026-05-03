/**
 * Context-pressure awareness for the continuation system.
 *
 * Monitors session token usage relative to the context window and fires
 * system events when pressure bands are crossed. This gives the agent
 * advance warning to evacuate working state before compaction.
 *
 * Post-compaction: fires regardless of context level to inform the session
 * that compaction occurred. The session learns this cycle behaviorally.
 *
 * Band dedup: equality-based. The same band doesn't fire twice consecutively,
 * but a new band (including a lower band after compaction) always fires.
 *
 * First-fire is signalled by `lastFiredBand.has(sessionKey) === false`
 * (previously a `-1` magic sentinel — replaced in #228 per CLAUDE.md). The
 * #580 collision shape — first-crossing of a sub-lowest-band ratio being
 * silently suppressed because `band===previous===0` — is now precluded by
 * checking presence in the map before comparing. The behavior pinned by
 * `context-pressure.test.ts` (#580 regression) is preserved.
 *
 * RFC: docs/design/continue-work-signal-v2.md §4.2
 */
/** Pressure bands as percentages. Ordered ascending. */
declare const PRESSURE_BANDS: readonly [25, 80, 90, 95];
/**
 * Closed union of pressure-band values returned by {@link resolveContextPressureBand}.
 * `0` represents "below all hard-coded bands".
 */
export type PressureBand = 0 | (typeof PRESSURE_BANDS)[number];
/**
 * Resolve which pressure band the current ratio falls into.
 * Returns 0 if below all bands.
 */
export declare function resolveContextPressureBand(ratio: number): PressureBand;
/**
 * Check whether a context-pressure event should fire for the given session.
 *
 * Returns the event text if it should fire, or null if suppressed by dedup.
 *
 * @param sessionKey - Session identifier for dedup tracking
 * @param totalTokens - Current token count in the session
 * @param contextWindow - Total context window size in tokens
 * @param threshold - Config threshold (0-1); only fire if ratio >= threshold
 * @param postCompaction - If true, fire unconditionally (post-compaction lifecycle)
 */
export declare function checkContextPressure(params: {
    sessionKey: string;
    totalTokens: number;
    contextWindow: number;
    threshold: number;
    postCompaction?: boolean;
}): string | null;
/**
 * Clear pressure dedup state for a session. Call after compaction completes
 * so the post-compaction lifecycle can fire fresh bands.
 */
export declare function clearContextPressureState(sessionKey: string): void;
export declare function resetContextPressureForTests(): void;
export {};
