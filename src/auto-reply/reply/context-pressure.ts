import type { SessionEntry } from "../../config/sessions.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("continuation/context-pressure");

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

export function checkContextPressure(
  params: CheckContextPressureParams,
): CheckContextPressureResult {
  const { sessionEntry, sessionKey, contextPressureThreshold, contextWindowTokens } = params;

  if (
    contextPressureThreshold == null ||
    contextPressureThreshold <= 0 ||
    contextWindowTokens <= 0 ||
    sessionEntry.totalTokens == null ||
    sessionEntry.totalTokens <= 0 ||
    sessionEntry.totalTokensFresh === false
  ) {
    return { fired: false, band: 0 };
  }

  const ratio = Math.max(0, sessionEntry.totalTokens / contextWindowTokens);
  const thresholdPct = Math.round(contextPressureThreshold * 100);
  const bandThresholds = [
    { threshold: contextPressureThreshold, band: thresholdPct },
    ...(contextPressureThreshold < 0.9 ? [{ threshold: 0.9, band: 90 }] : []),
    ...(Math.max(contextPressureThreshold, 0.9) < 0.95 ? [{ threshold: 0.95, band: 95 }] : []),
  ];
  let band = 0;
  for (const candidate of bandThresholds) {
    if (ratio >= candidate.threshold) {
      band = candidate.band;
    }
  }

  if (band === 0 || band === (sessionEntry.lastContextPressureBand ?? 0)) {
    return { fired: false, band };
  }

  const pct = Math.round(ratio * 100);
  const tokensK = Math.round(sessionEntry.totalTokens / 1000);
  const windowK = Math.round(contextWindowTokens / 1000);
  const urgency =
    band >= 95
      ? "COMPACTION IMMINENT. Evacuate critical working state now."
      : band >= 90
        ? "Context window nearly full. Prepare to evacuate working state."
        : "Context pressure rising. Start planning state evacuation.";

  log.debug(
    `[context-pressure:fire] band=${band} ratio=${pct}% tokens=${tokensK}k/${windowK}k session=${sessionKey}`,
  );

  enqueueSystemEvent(
    `[system:context-pressure] ${pct}% of context window consumed (${tokensK}k / ${windowK}k tokens). ${urgency}`,
    { sessionKey },
  );

  sessionEntry.lastContextPressureBand = band;
  return { fired: true, band };
}
