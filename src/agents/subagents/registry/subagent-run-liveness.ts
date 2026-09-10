/**
 * Subagent run liveness policy.
 *
 * Ages out stale unended runs while keeping recent/composed child links visible.
 */
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { resolveSubagentRunDurationMs } from "./subagent-run-timeout.js";
import { getSubagentSessionStartedAt } from "./subagent-session-metrics.js";

type SubagentRunLivenessRecord = Pick<
  SubagentRunRecord,
  "createdAt" | "sessionStartedAt" | "runTimeoutSeconds"
> & {
  execution: Pick<SubagentRunRecord["execution"], "startedAt" | "endedAt">;
};

const STALE_UNENDED_SUBAGENT_RUN_MS = 2 * 60 * 60 * 1_000;
export const RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS = 30 * 60 * 1_000;
const EXPLICIT_TIMEOUT_STALE_GRACE_MS = 60_000;
const MIN_REALISTIC_RUN_TIMESTAMP_MS = Date.UTC(2020, 0, 1);

export type SubagentRunLiveness = "alive" | "confident-terminal" | "uncertain";

/** Return whether a subagent run has a finite execution end timestamp. */
export function hasSubagentRunEnded<T extends { execution: { endedAt?: number } }>(
  entry: T,
): entry is T & { execution: T["execution"] & { endedAt: number } } {
  return typeof entry.execution.endedAt === "number" && Number.isFinite(entry.execution.endedAt);
}

function resolveStaleCutoffMs(
  entry: Pick<SubagentRunRecord, "runTimeoutSeconds">,
  defaultFloorMs = STALE_UNENDED_SUBAGENT_RUN_MS,
): number {
  const durationMs = resolveSubagentRunDurationMs(entry.runTimeoutSeconds);
  if (durationMs !== undefined) {
    return Math.max(defaultFloorMs, durationMs + EXPLICIT_TIMEOUT_STALE_GRACE_MS);
  }
  return defaultFloorMs;
}

/** Return whether an unended subagent run is stale enough to hide as inactive. */
export function isStaleUnendedSubagentRun(
  entry: SubagentRunLivenessRecord,
  now = Date.now(),
): boolean {
  if (hasSubagentRunEnded(entry)) {
    return false;
  }
  return isUnendedRunStalePastCutoff(entry, now, STALE_UNENDED_SUBAGENT_RUN_MS);
}

function isUnendedRunStalePastCutoff(
  entry: SubagentRunLivenessRecord,
  now: number,
  defaultFloorMs: number,
): boolean {
  // Creation bounds stale admission, but must not become a displayed execution start.
  const startedAt = getSubagentSessionStartedAt(entry) ?? entry.createdAt;
  if (
    typeof startedAt !== "number" ||
    !Number.isFinite(startedAt) ||
    startedAt < MIN_REALISTIC_RUN_TIMESTAMP_MS
  ) {
    return false;
  }
  return now - startedAt > resolveStaleCutoffMs(entry, defaultFloorMs);
}

export function classifySubagentRunLiveness(
  entry: SubagentRunLivenessRecord | undefined,
  options: { now?: number; staleCutoffMs?: number } = {},
): SubagentRunLiveness {
  if (!entry) {
    return "uncertain";
  }
  if (hasSubagentRunEnded(entry)) {
    return "confident-terminal";
  }
  const now = options.now ?? Date.now();
  const floorMs = options.staleCutoffMs ?? STALE_UNENDED_SUBAGENT_RUN_MS;
  if (isUnendedRunStalePastCutoff(entry, now, floorMs)) {
    return "confident-terminal";
  }
  return "alive";
}

/** Return whether a subagent run is still live and unended. */
export function isLiveUnendedSubagentRun(
  entry: SubagentRunLivenessRecord,
  now = Date.now(),
): boolean {
  return !hasSubagentRunEnded(entry) && !isStaleUnendedSubagentRun(entry, now);
}

function isRecentlyEndedSubagentRun(
  entry: { execution: Pick<SubagentRunRecord["execution"], "endedAt"> },
  now = Date.now(),
  recentMs = RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS,
): boolean {
  if (!hasSubagentRunEnded(entry)) {
    return false;
  }
  return now - entry.execution.endedAt <= recentMs;
}

/** Return whether a child-session link should still appear in subagent listings. */
export function shouldKeepSubagentRunChildLink(
  entry: SubagentRunLivenessRecord,
  options?: {
    activeDescendants?: number;
    now?: number;
  },
): boolean {
  const now = options?.now ?? Date.now();
  return (
    isLiveUnendedSubagentRun(entry, now) ||
    (options?.activeDescendants ?? 0) > 0 ||
    isRecentlyEndedSubagentRun(entry, now)
  );
}
