import {
  emitInternalDiagnosticEvent as emitDiagnosticEvent,
  type DiagnosticContinuationQueueMetrics,
} from "../infra/diagnostic-events.js";
import { getDiagnosticContinuationQueueMetrics } from "./diagnostic-continuation-queues.js";
import {
  diagnosticLogger as diag,
  markDiagnosticActivity as markActivity,
} from "./diagnostic-runtime.js";

// Continuation queue depth and motion, as surfaced by the gateway diagnostic
// heartbeat and liveness warnings.

function formatContinuationQueueNumber(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

export function hasContinuationQueueActivity(
  continuationQueue: DiagnosticContinuationQueueMetrics | undefined,
): continuationQueue is DiagnosticContinuationQueueMetrics {
  return (
    continuationQueue !== undefined &&
    (continuationQueue.totalQueued > 0 ||
      continuationQueue.enqueuedSinceLastSample > 0 ||
      continuationQueue.drainedSinceLastSample > 0 ||
      continuationQueue.failedSinceLastSample > 0)
  );
}

// Liveness-warn predicate: only fires on motion (enqueue/drain/fail since
// last sample), NOT on persistent queue depth alone. This keeps healthy
// sessions with steady-state queue depth from re-introducing the same
// per-heartbeat noise that v2026.5.3's session-attention throttle removed
// for `recovery=none` long-running warnings (see
// `lastLongRunningWarnAgeMs` in `logSessionAttention`). Depth is still
// surfaced via the message suffix and event payload so observers can see
// it; we just don't escalate to warn on presence alone.
export function hasContinuationQueueMotion(
  continuationQueue: DiagnosticContinuationQueueMetrics | undefined,
): continuationQueue is DiagnosticContinuationQueueMetrics {
  return (
    continuationQueue !== undefined &&
    (continuationQueue.enqueuedSinceLastSample > 0 ||
      continuationQueue.drainedSinceLastSample > 0 ||
      continuationQueue.failedSinceLastSample > 0)
  );
}

export function safeGetDiagnosticContinuationQueueMetrics(
  now: number,
): DiagnosticContinuationQueueMetrics | undefined {
  try {
    return getDiagnosticContinuationQueueMetrics(now);
  } catch (err) {
    diag.debug(`continuation queue diagnostics failed: ${String(err)}`);
    return undefined;
  }
}

function formatContinuationQueueTopQueues(
  continuationQueue: DiagnosticContinuationQueueMetrics,
): string {
  return continuationQueue.topQueues
    .map(
      (queue) =>
        `${queue.sessionKey}(total=${queue.totalQueued},runnable=${queue.pendingRunnable},scheduled=${queue.pendingScheduled},staged=${queue.stagedPostCompaction},invalid=${queue.invalidQueued})`,
    )
    .join(",");
}

function formatContinuationQueueHistory(
  continuationQueue: DiagnosticContinuationQueueMetrics,
): string {
  return JSON.stringify(
    continuationQueue.queueDepthHistory.map((point) => ({
      sampled_at: point.sampledAt,
      total_queued: point.totalQueued,
      runnable: point.pendingRunnable,
      scheduled: point.pendingScheduled,
      staged_post_compaction: point.stagedPostCompaction,
      invalid_queued: point.invalidQueued,
      enqueued: point.enqueued,
      drained: point.drained,
      failed: point.failed,
    })),
  );
}

export function formatContinuationQueueLogSuffix(
  continuationQueue: DiagnosticContinuationQueueMetrics | undefined,
): string {
  if (!hasContinuationQueueActivity(continuationQueue)) {
    return "";
  }
  return ` continuationQueueTotal=${continuationQueue.totalQueued} continuationQueueRunnable=${continuationQueue.pendingRunnable} continuationQueueScheduled=${continuationQueue.pendingScheduled} continuationQueueStagedPostCompaction=${continuationQueue.stagedPostCompaction} continuationQueueInvalid=${continuationQueue.invalidQueued} continuationQueueEnqueued=${continuationQueue.enqueuedSinceLastSample} continuationQueueDrained=${continuationQueue.drainedSinceLastSample} continuationQueueFailed=${continuationQueue.failedSinceLastSample} continuationQueueEnqueueRatePerMinute=${formatContinuationQueueNumber(continuationQueue.enqueueRatePerMinute)} continuationQueueDrainRatePerMinute=${formatContinuationQueueNumber(continuationQueue.drainRatePerMinute)} continuationQueueFailedRatePerMinute=${formatContinuationQueueNumber(continuationQueue.failedRatePerMinute)} continuationQueueTop=[${formatContinuationQueueTopQueues(continuationQueue)}] queue_depth_history=${formatContinuationQueueHistory(continuationQueue)}`;
}

export function emitDiagnosticContinuationQueueSample(
  continuationQueue: DiagnosticContinuationQueueMetrics,
): void {
  emitDiagnosticEvent({
    type: "diagnostic.continuation_queue.sample",
    continuationQueue,
  });
  markActivity();
}
