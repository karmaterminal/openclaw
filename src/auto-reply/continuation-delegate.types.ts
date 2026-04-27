export interface PendingContinuationDelegate {
  task: string;
  delayMs?: number;
  silent?: boolean;
  silentWake?: boolean;
  /**
   * Address one or more sibling sessions for cross-session enrichment.
   * One delegate completion → N receivers (the choral fan-out shape).
   *
   * Stage-1 (this surface): persisted as descriptor on the pending delegate;
   * Stage-2 (follow-up under karmaterminal/openclaw#355): dispatch wiring fans
   * out one substrate-queue row per recipient with per-target fail-isolation
   * via the existing FallbackResolver, riding on the queue substrate landed
   * in #354. Single-recipient and N-recipient share the same path.
   *
   * Binary-canticle (a)-shape (RPC-style address-recipient); broadcast-mode
   * (b)-shape lands on top of this via karmaterminal/binary-canticle#11.
   */
  targetSessionKeys?: string[];
}

export interface DelayedContinuationReservation {
  id: string;
  source: "bracket" | "tool";
  task: string;
  createdAt: number;
  fireAt: number;
  plannedHop: number;
  silent?: boolean;
  silentWake?: boolean;
}
