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

import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("continuation/context-pressure");

/** Pressure bands as percentages. Ordered ascending. */
const PRESSURE_BANDS = [25, 80, 90, 95] as const;

/**
 * Closed union of pressure-band values returned by {@link resolveContextPressureBand}.
 * `0` represents "below all hard-coded bands".
 */
export type PressureBand = 0 | (typeof PRESSURE_BANDS)[number];

/**
 * Per-session dedup state: the last band that fired.
 * Reset when a new lifecycle begins (e.g., after compaction).
 *
 * Absence (`!map.has(sessionKey)`) means the session has never fired —
 * it replaces the prior `-1` magic sentinel.
 */
const lastFiredBand = new Map<string, PressureBand>();

/**
 * Resolve which pressure band the current ratio falls into.
 * Returns 0 if below all bands.
 */
export function resolveContextPressureBand(ratio: number): PressureBand {
  let band: PressureBand = 0;
  for (const threshold of PRESSURE_BANDS) {
    if (ratio * 100 >= threshold) {
      band = threshold;
    }
  }
  return band;
}

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
export function checkContextPressure(params: {
  sessionKey: string;
  totalTokens: number;
  contextWindow: number;
  threshold: number;
  postCompaction?: boolean;
}): string | null {
  const { sessionKey, totalTokens, contextWindow, threshold, postCompaction } = params;

  if (contextWindow <= 0) {
    if (log.isEnabled("debug")) {
      log.debug(
        `[context-pressure:noop] reason=window-zero contextWindow=${contextWindow} session=${sessionKey}`,
      );
    }
    return null;
  }

  const ratio = totalTokens / contextWindow;
  const percentUsed = Math.round(ratio * 100);

  // Post-compaction: always fire to inform the session about the lifecycle event.
  if (postCompaction) {
    const band = resolveContextPressureBand(ratio);
    lastFiredBand.set(sessionKey, band);
    const eventText =
      `[system:context-pressure] Post-compaction: ${percentUsed}% context consumed ` +
      `(${Math.round(totalTokens / 1000)}k/${Math.round(contextWindow / 1000)}k tokens). ` +
      `Session was compacted. Working state may need rehydration.`;
    log.info(
      `[context-pressure:fire] post-compaction band=${band} ratio=${percentUsed}% session=${sessionKey}`,
    );
    return eventText;
  }

  // Below threshold: don't fire.
  if (ratio < threshold) {
    if (log.isEnabled("debug")) {
      // Log raw ratio/threshold (4dp) alongside rounded percent so the breadcrumb
      // is unambiguous when rounded values would coincide (e.g. 6%==6% but ratio<threshold).
      log.debug(
        `[context-pressure:noop] reason=below-threshold ratio=${percentUsed}% threshold=${Math.round(threshold * 100)}% rawRatio=${ratio.toFixed(4)} rawThreshold=${threshold.toFixed(4)} session=${sessionKey}`,
      );
    }
    return null;
  }

  const band = resolveContextPressureBand(ratio);

  // Dedup: same band as last time → suppress.
  // First-fire is signalled by absence in the map (previously a `-1`
  // sentinel — dropped in #228). The shape this protects against (#580):
  // when `contextPressureThreshold` is below the lowest hard-coded band,
  // a session's first crossing has band===0; comparing against `?? 0`
  // silently suppressed it. Using `.has()` instead of a sentinel keeps
  // the semantics intact without the magic number.
  const previous = lastFiredBand.get(sessionKey);
  const isFirstFire = previous === undefined;
  if (!isFirstFire && band === previous) {
    if (log.isEnabled("debug")) {
      log.debug(
        `[context-pressure:noop] reason=band-dedup band=${band} previous=${previous} ratio=${percentUsed}% session=${sessionKey}`,
      );
    }
    return null;
  }

  lastFiredBand.set(sessionKey, band);

  const eventText =
    `[system:context-pressure] ${percentUsed}% context consumed ` +
    `(${Math.round(totalTokens / 1000)}k/${Math.round(contextWindow / 1000)}k tokens). ` +
    `Consider evacuating working state to memory files or delegating remaining work.`;

  log.info(
    `[context-pressure:fire] band=${band} previous=${previous ?? "none"} ratio=${percentUsed}% session=${sessionKey}`,
  );

  return eventText;
}

/**
 * Clear pressure dedup state for a session. Call after compaction completes
 * so the post-compaction lifecycle can fire fresh bands.
 */
export function clearContextPressureState(sessionKey: string): void {
  lastFiredBand.delete(sessionKey);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function resetContextPressureForTests(): void {
  lastFiredBand.clear();
}
