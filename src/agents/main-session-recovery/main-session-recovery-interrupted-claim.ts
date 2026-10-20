import type { InternalSessionEntry as SessionEntry } from "../../config/sessions.js";
import {
  hasMainSessionRecoveryClaim,
  isMainRestartRecoveryCandidate,
} from "../../config/sessions/restart-recovery-state.js";

/**
 * A stop or supersede in this generation leaves `abortedLastRun` beside a live
 * delivery claim, with a killed outcome or none yet when the stop flag lands first.
 * Without a restart mark or a fence from an earlier generation, that claim did not
 * outlive its process and is not restart-interrupted work (openclaw#1468).
 */
export function isMainSessionCurrentGenerationStop(
  entry: SessionEntry,
  lifecycleGeneration: string,
): boolean {
  return (
    (entry.status === "killed" || entry.status === undefined) &&
    entry.mainRestartRecovery === undefined &&
    entry.restartRecoveryRuns?.some((run) => run.lifecycleGeneration !== lifecycleGeneration) !==
      true
  );
}

/** A main-session claim that outlived its run and may open or join a restart recovery cycle. */
export function isMainSessionRestartInterruptedClaim(
  entry: SessionEntry,
  scope: { sessionKey: string; lifecycleGeneration: string },
): boolean {
  return (
    hasMainSessionRecoveryClaim(entry) &&
    entry.abortedLastRun === true &&
    isMainRestartRecoveryCandidate(entry, scope.sessionKey) &&
    !isMainSessionCurrentGenerationStop(entry, scope.lifecycleGeneration)
  );
}
