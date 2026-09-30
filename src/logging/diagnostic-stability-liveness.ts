import type { DiagnosticEventPayload } from "../infra/diagnostic-events.js";

// Liveness-warning and continuation-queue sample fields for stability records.
const LIVENESS_EVENT_LOOP_DELAY_WARN_MS = 1_000;

export type DiagnosticStabilityContinuationQueueSummary = {
  totalQueued: number;
  pendingRunnable: number;
  pendingScheduled: number;
  stagedPostCompaction: number;
  invalidQueued: number;
  enqueuedSinceLastSample: number;
  drainedSinceLastSample: number;
  failedSinceLastSample: number;
  drainRatePerMinute?: number;
};

export function assignContinuationQueueSummary(
  record: { queueDepth?: number; continuationQueue?: DiagnosticStabilityContinuationQueueSummary },
  event: Extract<
    DiagnosticEventPayload,
    { type: "diagnostic.continuation_queue.sample" | "diagnostic.liveness.warning" }
  >,
): void {
  if (!("continuationQueue" in event) || !event.continuationQueue) {
    return;
  }
  record.queueDepth = event.continuationQueue.totalQueued;
  record.continuationQueue = {
    totalQueued: event.continuationQueue.totalQueued,
    pendingRunnable: event.continuationQueue.pendingRunnable,
    pendingScheduled: event.continuationQueue.pendingScheduled,
    stagedPostCompaction: event.continuationQueue.stagedPostCompaction,
    invalidQueued: event.continuationQueue.invalidQueued,
    enqueuedSinceLastSample: event.continuationQueue.enqueuedSinceLastSample,
    drainedSinceLastSample: event.continuationQueue.drainedSinceLastSample,
    failedSinceLastSample: event.continuationQueue.failedSinceLastSample,
    ...(event.continuationQueue.drainRatePerMinute !== undefined
      ? { drainRatePerMinute: event.continuationQueue.drainRatePerMinute }
      : {}),
  };
}

export function resolveDiagnosticLivenessRecordLevel(
  event: Extract<DiagnosticEventPayload, { type: "diagnostic.liveness.warning" }>,
): "warning" | "info" {
  const hasBlockingWork = event.waiting > 0 || event.queued > 0;
  const hasSustainedEventLoopDelay =
    (event.eventLoopDelayP99Ms ?? 0) >= LIVENESS_EVENT_LOOP_DELAY_WARN_MS;
  return event.degradedSinceMs !== undefined ||
    hasBlockingWork ||
    (event.active > 0 && hasSustainedEventLoopDelay)
    ? "warning"
    : "info";
}
