// Continuation queue depth and motion in the gateway diagnostic heartbeat.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  onDiagnosticEvent,
  resetDiagnosticEventsForTest,
  type DiagnosticEventPayload,
} from "../infra/diagnostic-events.js";
import { registerDiagnosticContinuationQueueMetricsProvider } from "./diagnostic-continuation-queues.js";
import { getDiagnosticStabilitySnapshot } from "./diagnostic-stability.js";
import { diagnosticLogger } from "./diagnostic.js";
import {
  resetDiagnosticStateForTest,
  startDiagnosticHeartbeatForTest as startDiagnosticHeartbeat,
} from "./diagnostic.test-support.js";

function createEmitMemorySampleMock() {
  return vi.fn(() => ({
    rssBytes: 100,
    heapTotalBytes: 80,
    heapUsedBytes: 40,
    externalBytes: 10,
    arrayBuffersBytes: 5,
  }));
}

describe("stuck session diagnostics threshold", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDiagnosticStateForTest();
    resetDiagnosticEventsForTest();
    vi.spyOn(diagnosticLogger, "isEnabled").mockReturnValue(true);
  });

  afterEach(() => {
    resetDiagnosticEventsForTest();
    resetDiagnosticStateForTest();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("emits continuation queue samples and attaches queue history to liveness warnings", () => {
    const emitMemorySample = createEmitMemorySampleMock();
    const events: DiagnosticEventPayload[] = [];
    const unsubscribe = onDiagnosticEvent((event) => events.push(event));
    const unregisterContinuationQueue = registerDiagnosticContinuationQueueMetricsProvider(
      (now) => ({
        sampledAt: now,
        intervalMs: 30_000,
        totalQueued: 3,
        pendingQueued: 2,
        pendingRunnable: 1,
        pendingScheduled: 1,
        stagedPostCompaction: 1,
        invalidQueued: 0,
        enqueuedSinceLastSample: 2,
        drainedSinceLastSample: 1,
        failedSinceLastSample: 0,
        enqueueRatePerMinute: 4,
        drainRatePerMinute: 2,
        failedRatePerMinute: 0,
        topQueues: [
          {
            sessionKey: "session-a",
            pendingQueued: 2,
            pendingRunnable: 1,
            pendingScheduled: 1,
            stagedPostCompaction: 1,
            invalidQueued: 0,
            totalQueued: 3,
          },
        ],
        queueDepthHistory: [
          {
            sampledAt: now,
            intervalMs: 30_000,
            totalQueued: 3,
            pendingRunnable: 1,
            pendingScheduled: 1,
            stagedPostCompaction: 1,
            invalidQueued: 0,
            enqueued: 2,
            drained: 1,
            failed: 0,
          },
        ],
      }),
    );

    try {
      startDiagnosticHeartbeat(
        {
          diagnostics: {
            enabled: true,
          },
        },
        {
          emitMemorySample,
          sampleLiveness: () => ({
            reasons: ["cpu"],
            intervalMs: 30_000,
            cpuCoreRatio: 1,
          }),
        },
      );

      vi.advanceTimersByTime(30_000);
    } finally {
      unregisterContinuationQueue();
      unsubscribe();
    }

    const livenessWarning = events.find(
      (event): event is Extract<DiagnosticEventPayload, { type: "diagnostic.liveness.warning" }> =>
        event.type === "diagnostic.liveness.warning",
    );
    const queueSample = events.find(
      (
        event,
      ): event is Extract<
        DiagnosticEventPayload,
        { type: "diagnostic.continuation_queue.sample" }
      > => event.type === "diagnostic.continuation_queue.sample",
    );

    expect(emitMemorySample).toHaveBeenLastCalledWith({ emitSample: true });
    expect(livenessWarning?.continuationQueue).toMatchObject({
      totalQueued: 3,
      drainedSinceLastSample: 1,
      drainRatePerMinute: 2,
    });
    expect(queueSample?.continuationQueue.queueDepthHistory[0]).toMatchObject({
      totalQueued: 3,
      enqueued: 2,
      drained: 1,
    });
    expect(getDiagnosticStabilitySnapshot({ limit: 10 }).events).toContainEqual(
      expect.objectContaining({
        type: "diagnostic.continuation_queue.sample",
        count: 3,
        queueDepth: 3,
        continuationQueue: expect.objectContaining({
          totalQueued: 3,
          pendingRunnable: 1,
          drainedSinceLastSample: 1,
          drainRatePerMinute: 2,
        }),
      }),
    );
  });

  // Honors v2026.5.3 throttle philosophy: persistent queue depth alone is not
  // motion. A healthy session that parks a pending delegate in the queue and
  // makes no further progress should not re-emit the same liveness warning
  // every heartbeat. Only enqueue/drain/fail motion since the last sample
  // escalates to warn; depth is still surfaced via the message suffix and
  // event payload (covered by the prior test).
  it("does not warn on persistent continuation queue depth without motion, but still surfaces depth in debug suffix", () => {
    const emitMemorySample = createEmitMemorySampleMock();
    const warnSpy = vi.spyOn(diagnosticLogger, "warn").mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(diagnosticLogger, "debug").mockImplementation(() => undefined);
    const events: DiagnosticEventPayload[] = [];
    const unsubscribe = onDiagnosticEvent((event) => events.push(event));
    const unregisterContinuationQueue = registerDiagnosticContinuationQueueMetricsProvider(
      (now) => ({
        sampledAt: now,
        intervalMs: 30_000,
        totalQueued: 3,
        pendingQueued: 3,
        pendingRunnable: 1,
        pendingScheduled: 2,
        stagedPostCompaction: 0,
        invalidQueued: 0,
        // No motion since last sample: healthy steady-state queue depth.
        enqueuedSinceLastSample: 0,
        drainedSinceLastSample: 0,
        failedSinceLastSample: 0,
        enqueueRatePerMinute: 0,
        drainRatePerMinute: 0,
        failedRatePerMinute: 0,
        topQueues: [
          {
            sessionKey: "session-steady",
            pendingQueued: 3,
            pendingRunnable: 1,
            pendingScheduled: 2,
            stagedPostCompaction: 0,
            invalidQueued: 0,
            totalQueued: 3,
          },
        ],
        queueDepthHistory: [],
      }),
    );

    try {
      startDiagnosticHeartbeat(
        {
          diagnostics: {
            enabled: true,
          },
        },
        {
          emitMemorySample,
          sampleLiveness: () => ({
            reasons: ["cpu"],
            intervalMs: 30_000,
            cpuCoreRatio: 1,
          }),
        },
      );

      vi.advanceTimersByTime(30_000);
    } finally {
      unregisterContinuationQueue();
      unsubscribe();
    }

    // Depth-only must not escalate to warn (no motion).
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("liveness warning:"));

    // Depth IS still surfaced via debug suffix and event payload, so observers
    // can see queue state without warn-noise. Guards against future regressions
    // that re-conflate motion-driven warn-decision with depth-driven
    // observability surfaces.
    const debugSuffixCall = debugSpy.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("liveness warning:"),
    );
    expect(debugSuffixCall?.[0]).toContain("continuationQueueTotal=3");
    expect(debugSuffixCall?.[0]).toContain("continuationQueueRunnable=1");
    expect(debugSuffixCall?.[0]).toContain("continuationQueueEnqueued=0");

    const livenessEvent = events.find(
      (event): event is Extract<DiagnosticEventPayload, { type: "diagnostic.liveness.warning" }> =>
        event.type === "diagnostic.liveness.warning",
    );
    expect(livenessEvent?.continuationQueue).toMatchObject({ totalQueued: 3 });
  });
});
