export interface PendingContinuationDelegate {
  task: string;
  delayMs?: number;
  silent?: boolean;
  silentWake?: boolean;
  postCompaction?: boolean;
}
