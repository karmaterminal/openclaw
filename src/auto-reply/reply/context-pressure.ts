import type { SessionEntry } from "../../config/sessions.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";

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
export function checkContextPressure(
  params: CheckContextPressureParams,
): CheckContextPressureResult {
  const { sessionEntry, sessionKey, contextPressureThreshold, contextWindowTokens } = params;

  // Guard: feature disabled or no usable data.
  // Note: !contextPressureThreshold is intentionally falsy for 0.0 — a threshold of 0%
  // ("fire on empty session") is not a useful configuration. Zod validates min(0).max(1).
  if (
    !contextPressureThreshold ||
    contextWindowTokens <= 0 ||
    sessionEntry.totalTokens == null ||
    !sessionEntry.totalTokens ||
    sessionEntry.totalTokensFresh === false
  ) {
    return { fired: false, band: 0 };
  }

  const ratio = sessionEntry.totalTokens / contextWindowTokens;
  const thresholdPct = Math.round(contextPressureThreshold * 100);
  const band =
    ratio >= 0.95 ? 95 : ratio >= 0.9 ? 90 : ratio >= contextPressureThreshold ? thresholdPct : 0;

  if (band === 0 || band === (sessionEntry.lastContextPressureBand ?? 0)) {
    return { fired: false, band };
  }

  const pct = Math.round(ratio * 100);
  const tokensK = Math.round(sessionEntry.totalTokens / 1000);
  const windowK = Math.round(contextWindowTokens / 1000);

  const urgency =
    band >= 95
      ? `Compaction is imminent. Evacuate working state now via CONTINUE_DELEGATE or memory files.`
      : band >= 90
        ? `Context window nearly full. Strongly consider evacuating working state.`
        : `Consider evacuating working state via CONTINUE_DELEGATE or memory files.`;

  enqueueSystemEvent(
    `[system:context-pressure] ${pct}% of context window consumed (${tokensK}k / ${windowK}k tokens). ${urgency}`,
    { sessionKey },
  );

  sessionEntry.lastContextPressureBand = band;
  return { fired: true, band };
}
