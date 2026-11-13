import type { InternalSessionEntry } from "../config/sessions/types.js";
import type { PreparedRestartStore } from "./session-restart-resume-discovery.js";

// Old shutdown bumped updatedAt, but abandoned cycles can survive for weeks.
// Remove this bridge once stable includes the graceful-restart redesign (#185730).
const LEGACY_RESTART_RESUME_WINDOW_MS = 6 * 60 * 60 * 1000;

export function resolveRestartResumeMarker(params: {
  selected: InternalSessionEntry;
  parked: unknown;
  orphanedRun: boolean;
  windows: PreparedRestartStore["windows"];
}): InternalSessionEntry["resumeAfterRestart"] {
  const { selected, parked, orphanedRun, windows } = params;
  return (
    selected.resumeAfterRestart ??
    (parked ||
    (orphanedRun &&
      windows?.some(
        (window) =>
          selected.startedAt !== undefined &&
          selected.startedAt >= window.startedAt &&
          selected.startedAt < window.endedAt,
      )) ||
    (selected.mainRestartRecovery &&
      selected.abortedLastRun === true &&
      selected.status === "interrupted" &&
      selected.updatedAt <= performance.timeOrigin &&
      selected.updatedAt >= performance.timeOrigin - LEGACY_RESTART_RESUME_WINDOW_MS)
      ? { queuedInputIds: [] }
      : undefined)
  );
}
