// Continuation (karmaterminal): the /status continuation banner row.
/**
 * Format the /status continuation overview row per
 * docs/design/continue-work-signal-v2.md §6.3. Pure function over
 * already-resolved config + recent-session runtime counts; the live queries
 * (custody lookups per session key) live at the caller.
 *
 * @returns the formatted banner value, or `undefined` when continuation is
 *   disabled (so the caller can skip rendering the row).
 */
export function formatContinuationBannerValue(params: {
  enabled: boolean;
  maxChainLength: number;
  maxDelegatesPerTurn: number;
  pendingDelegatesRecent: number;
  postCompactionStagedRecent: number;
}): string | undefined {
  if (!params.enabled) {
    return undefined;
  }
  const parts: string[] = ["enabled", `chain max ${params.maxChainLength}`];
  if (params.pendingDelegatesRecent > 0) {
    parts.push(
      `${params.pendingDelegatesRecent} delegate${params.pendingDelegatesRecent === 1 ? "" : "s"} pending (recent sessions)`,
    );
  }
  if (params.postCompactionStagedRecent > 0) {
    parts.push(`${params.postCompactionStagedRecent} post-compaction (recent sessions)`);
  }
  parts.push(`fan-out max ${params.maxDelegatesPerTurn}`);
  return parts.join(" · ");
}
