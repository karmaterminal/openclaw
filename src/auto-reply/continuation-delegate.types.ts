export interface PendingContinuationDelegate {
  task: string;
  delayMs?: number;
  silent?: boolean;
  silentWake?: boolean;
  /**
   * Address a sibling session for cross-session enrichment.
   * This is the (a)-shape (RPC-style address-recipient); v3 surfaces broadcast-mode
   * via karmaterminal/binary-canticle#11. Same substrate; different verb-set.
   */
  targetSessionKey?: string;
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
