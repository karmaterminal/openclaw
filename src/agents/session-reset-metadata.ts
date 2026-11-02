import type { InternalSessionEntry } from "../config/sessions/types.js";
import { settle } from "../plugins/host-hook-injection-outcomes.js";
import { isPluginNextTurnInjectionRecord } from "../plugins/host-hook-injection-validation.js";
import { clearAllCliSessions } from "./cli-session.js";

export function clearRotatedSessionMetadata(entry: InternalSessionEntry): InternalSessionEntry {
  const next = {
    ...entry,
    pluginNextTurnInjectionOutcomes: structuredClone(entry.pluginNextTurnInjectionOutcomes),
    pluginNextTurnInjections: undefined,
    sessionFile: undefined,
    status: undefined,
    lifecycleRunId: undefined,
    lastRunId: undefined,
    startedAt: undefined,
    endedAt: undefined,
    runtimeMs: undefined,
    abortedLastRun: undefined,
    resumeAfterRestart: undefined,
    sessionStartedAt: undefined,
    sessionDiffBaseline: undefined,
    sessionDiffBaselineCapture: undefined,
    lastInteractionAt: undefined,
    pendingTranscriptRepair: undefined,
  };
  for (const [pluginId, records] of Object.entries(entry.pluginNextTurnInjections ?? {})) {
    if (!Array.isArray(records)) {
      continue;
    }
    for (const record of records) {
      if (isPluginNextTurnInjectionRecord(record)) {
        settle(next, pluginId, record, "discarded", Date.now());
      }
    }
  }
  clearAllCliSessions(next);
  return next;
}
