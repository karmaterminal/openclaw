import type { InternalSessionEntry as SessionEntry } from "../../config/sessions.js";
import { hasRestartRecoveryTerminalRun } from "../../config/sessions/restart-recovery-state.js";
import { buildMainSessionRecoverySettlementPatch } from "./main-session-recovery-clear.js";
import type {
  MainSessionRecoveryCommand,
  MainSessionRecoveryConflict,
  MainSessionRecoveryObservation,
  MainSessionRecoveryTransitionResult,
} from "./main-session-recovery-types.js";

/**
 * A restart can explain an interruption only if an open fence predates this Gateway
 * generation or an earlier attempt already ran. Rows without an open fence predate
 * generation tracking and keep fail-closed restart handling.
 */
export function hasMainSessionRestartEvidence(
  entry: SessionEntry,
  lifecycleGeneration: string,
): boolean {
  const state = entry.mainRestartRecovery;
  const fences =
    entry.restartRecoveryRuns?.filter((run) => !hasRestartRecoveryTerminalRun(entry, run.runId)) ??
    [];
  return (
    fences.length === 0 ||
    fences.some((run) => run.lifecycleGeneration !== lifecycleGeneration) ||
    (state !== undefined && (state.chargedAttempts > 0 || state.startedAttempt !== undefined))
  );
}

/** Settles only non-restart work, against the state owner's observed cycle. */
export function retireMainSessionLiveInterruption(
  entry: SessionEntry,
  command: Extract<MainSessionRecoveryCommand, { kind: "retire_live_interruption" }>,
  matchesObservation: (
    entry: SessionEntry,
    observation: MainSessionRecoveryObservation,
  ) => MainSessionRecoveryConflict | null,
): MainSessionRecoveryTransitionResult {
  const conflict = matchesObservation(entry, command.observation);
  if (conflict) {
    return { kind: "rejected", reason: conflict };
  }
  const state = entry.mainRestartRecovery!;
  if (state.reservation) {
    return { kind: "rejected", reason: "reservation_active" };
  }
  if (state.tombstone) {
    return { kind: "rejected", reason: "already_tombstoned" };
  }
  if (hasMainSessionRestartEvidence(entry, command.lifecycleGeneration)) {
    return { kind: "no_change" };
  }
  // The turn ended in this process without a reply. Retire its claim like any
  // failed turn; the live session stays usable and nothing is replayed.
  Object.assign(
    entry,
    buildMainSessionRecoverySettlementPatch({ entry, recordTerminalSource: true }),
  );
  if (entry.status === undefined || entry.status === "interrupted") {
    entry.status = "failed";
    entry.lastRunError = "Run ended before replying; no Gateway restart to recover from.";
  }
  entry.lifecycleRunId = undefined;
  entry.endedAt ??= command.now;
  entry.updatedAt = command.now;
  return { kind: "applied" };
}
