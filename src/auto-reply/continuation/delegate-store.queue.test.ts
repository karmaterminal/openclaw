// Queue-level delegate custody behavior: the hot-path projection counts, the
// diagnostics queue-metrics provider, due-time gating, and claim races, all on
// real continuation custody (RFC docs/design/continue-work-signal-v2.md §5.4.4,
// §5.4.6).
import crypto from "node:crypto";
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Logger mock for breadcrumb assertions (same shape as delegate-store.test.ts).
const loggerRecords: Array<{ level: string; message: string }> = [];
vi.mock("../../logging/subsystem.js", () => {
  const record =
    (level: string) =>
    (message: string): void => {
      loggerRecords.push({ level, message });
    };
  const logger = {
    subsystem: "test",
    isEnabled: () => true,
    trace: record("trace"),
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    fatal: record("fatal"),
    raw: record("raw"),
    child: () => logger,
  };
  return {
    createSubsystemLogger: () => logger,
  };
});

import { getDiagnosticContinuationQueueMetrics } from "../../logging/diagnostic-continuation-queues.js";
import { resetContinuationCustodyProjection } from "./custody/custody-projection.js";
import {
  claimContinuationSpawnAttempt,
  createContinuationRecord,
  hydrateContinuationCustody,
  updateContinuationRecords,
} from "./custody/custody-store.js";
import type { ContinuationRecord, ContinuationRecordPatch } from "./custody/custody-store.types.js";
import {
  listCustodyRecordsForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import { getContinuationDelegateQueueDepths } from "./delegate-flow-store.js";
import {
  claimStagedPostCompactionDelegates,
  stagePostCompactionCustodyDelegate,
  stagedPostCompactionDelegateCount,
} from "./delegate-store-post-compaction.js";
import {
  consumePendingDelegates,
  enqueuePendingDelegate,
  markPendingDelegateFailed,
  markPendingDelegateSpawnAccepted,
  peekEarliestQueuedDelegateDueAt,
  pendingDelegateCount,
  resetDelegateStoreForTests,
} from "./delegate-store.js";

useContinuationCustodyTestState();

async function readRecord(recordId: string | undefined): Promise<ContinuationRecord> {
  return expectDefined(
    await readCustodyRecordForTest(expectDefined(recordId, "record id")),
    "custody record",
  );
}

/** Seed a record exactly as a legacy import or corrupt writer could have left it. */
async function queueRawRecord(sessionKey: string, state: unknown): Promise<string> {
  const recordId = crypto.randomUUID();
  const created = await createContinuationRecord({
    recordId,
    kind: "delegate",
    ownerSessionKey: sessionKey,
    status: "queued",
    phase: "Queued for continuation dispatch",
    createdAt: Date.now(),
    stateJson: JSON.stringify(state),
  });
  expect(created.outcome).toBe("created");
  return recordId;
}

/** A concurrent writer committing against the record's current revision. */
async function writeConcurrently(recordId: string, patch: ContinuationRecordPatch): Promise<void> {
  const current = await readRecord(recordId);
  const result = await updateContinuationRecords(
    [
      {
        recordId,
        ownerSessionKey: current.ownerSessionKey,
        expectedRevision: current.revision,
        patch,
      },
    ],
    { now: Date.now() },
  );
  expect(result.outcome).toBe("applied");
}

beforeEach(() => {
  loggerRecords.length = 0;
  resetDelegateStoreForTests();
});

afterEach(() => {
  resetDelegateStoreForTests();
  vi.useRealTimers();
});

describe("delegate queue projection and diagnostics", () => {
  it("projects queue depths and counts from committed writes", async () => {
    const sessionKey = "session-projection-depths";
    await enqueuePendingDelegate(sessionKey, { task: "due" });
    const future = await enqueuePendingDelegate(sessionKey, { task: "future", delayMs: 60_000 });
    await stagePostCompactionCustodyDelegate(sessionKey, { task: "staged", stagedAt: Date.now() });

    const now = Date.now();
    expect(getContinuationDelegateQueueDepths(sessionKey, now)).toEqual({
      pendingQueued: 2,
      pendingRunnable: 1,
      pendingScheduled: 1,
      stagedPostCompaction: 1,
      totalQueued: 3,
    });
    expect(pendingDelegateCount(sessionKey)).toBe(2);
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(1);

    // A claim, a staged claim, and a foreign cancel fence each commit through
    // custody and move the projection with them.
    expect(await consumePendingDelegates(sessionKey)).toHaveLength(1);
    expect(await claimStagedPostCompactionDelegates(sessionKey)).toHaveLength(1);
    await writeConcurrently(future.recordId, { cancelRequestedAt: Date.now() });
    expect(getContinuationDelegateQueueDepths(sessionKey, now)).toEqual({
      pendingQueued: 0,
      pendingRunnable: 0,
      pendingScheduled: 0,
      stagedPostCompaction: 0,
      totalQueued: 0,
    });
    expect(pendingDelegateCount(sessionKey)).toBe(0);
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(0);
  });

  it("answers projection counts conservatively until hydration, then from committed rows", async () => {
    const sessionKey = "session-projection-hydration";
    await enqueuePendingDelegate(sessionKey, { task: "queued" });
    await stagePostCompactionCustodyDelegate(sessionKey, { task: "staged", stagedAt: Date.now() });

    resetContinuationCustodyProjection();
    expect(pendingDelegateCount(sessionKey)).toBe(0);
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(0);
    expect(getContinuationDelegateQueueDepths(sessionKey).totalQueued).toBe(0);

    await hydrateContinuationCustody();
    expect(pendingDelegateCount(sessionKey)).toBe(1);
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(1);
    expect(getContinuationDelegateQueueDepths(sessionKey).totalQueued).toBe(2);
  });

  it("reports global continuation queue depth and drain-rate diagnostics", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);

    await enqueuePendingDelegate("session-1", { task: "due" });
    await enqueuePendingDelegate("session-1", { task: "future", delayMs: 60_000 });
    await stagePostCompactionCustodyDelegate("session-2", {
      task: "post-compact",
      stagedAt: 1_000,
    });
    // Custody validates state when a claim decodes it, so an undecodable
    // record counts as queued (and due) until the claim fails it.
    await queueRawRecord("session-3", {
      kind: "continuation_delegate",
      task: "invalid flags",
      silent: true,
      postCompaction: true,
    });

    const first = getDiagnosticContinuationQueueMetrics(1_000);
    expect(first).toMatchObject({
      totalQueued: 4,
      pendingQueued: 3,
      pendingRunnable: 2,
      pendingScheduled: 1,
      stagedPostCompaction: 1,
      invalidQueued: 0,
      enqueuedSinceLastSample: 0,
      drainedSinceLastSample: 0,
      failedSinceLastSample: 0,
    });
    expect(first?.topQueues[0]).toMatchObject({
      sessionKey: "session-1",
      totalQueued: 2,
    });

    vi.setSystemTime(2_000);
    expect(await consumePendingDelegates("session-1")).toHaveLength(1);

    const second = getDiagnosticContinuationQueueMetrics(2_000);
    expect(second).toMatchObject({
      totalQueued: 3,
      pendingQueued: 2,
      pendingRunnable: 1,
      pendingScheduled: 1,
      stagedPostCompaction: 1,
      invalidQueued: 0,
      enqueuedSinceLastSample: 0,
      drainedSinceLastSample: 0,
      failedSinceLastSample: 0,
      drainRatePerMinute: 0,
    });
    expect(second?.queueDepthHistory.map((point) => point.totalQueued)).toEqual([4, 3]);

    // The claim fails the undecodable record; the next sample counts that failure.
    vi.setSystemTime(3_000);
    expect(await consumePendingDelegates("session-3")).toEqual([]);
    expect(getDiagnosticContinuationQueueMetrics(3_000)).toMatchObject({
      totalQueued: 2,
      pendingQueued: 1,
      pendingRunnable: 0,
      failedSinceLastSample: 1,
    });
  });

  it("counts drained and failed delegates since the last sample from custody commits", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);
    const sessionKey = "session-diagnostics-drain";
    await enqueuePendingDelegate(sessionKey, { task: "accepted" });
    await enqueuePendingDelegate(sessionKey, { task: "rejected" });
    expect(getDiagnosticContinuationQueueMetrics(1_000)).toMatchObject({
      totalQueued: 2,
      enqueuedSinceLastSample: 0,
    });

    vi.setSystemTime(2_000);
    await enqueuePendingDelegate(sessionKey, { task: "still running" });
    const [accepted, rejected, running] = await consumePendingDelegates(sessionKey);
    expect(running?.task).toBe("still running");
    expect(
      await markPendingDelegateSpawnAccepted(
        expectDefined(accepted, "accepted"),
        "agent:main:subagent:child",
      ),
    ).toBe(true);
    expect(
      await markPendingDelegateFailed(expectDefined(rejected, "rejected"), "spawn failed"),
    ).toBe(true);

    expect(getDiagnosticContinuationQueueMetrics(2_000)).toMatchObject({
      intervalMs: 1_000,
      totalQueued: 0,
      enqueuedSinceLastSample: 1,
      drainedSinceLastSample: 1,
      failedSinceLastSample: 1,
      enqueueRatePerMinute: 60,
      drainRatePerMinute: 60,
      failedRatePerMinute: 60,
    });
    // Each terminal transition is counted in exactly one sample window.
    expect(getDiagnosticContinuationQueueMetrics(3_000)).toMatchObject({
      enqueuedSinceLastSample: 0,
      drainedSinceLastSample: 0,
      failedSinceLastSample: 0,
    });
  });

  it("resets the sole diagnostic sample clock and bounded history", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);
    await enqueuePendingDelegate("session-diagnostics-reset", { task: "queued" });

    expect(getDiagnosticContinuationQueueMetrics(1_000)?.queueDepthHistory).toHaveLength(1);
    expect(getDiagnosticContinuationQueueMetrics(2_000)?.queueDepthHistory).toHaveLength(2);

    resetDelegateStoreForTests();
    const afterReset = getDiagnosticContinuationQueueMetrics(3_000);
    expect(afterReset?.intervalMs).toBeUndefined();
    expect(afterReset?.queueDepthHistory).toEqual([
      expect.objectContaining({ sampledAt: 3_000, totalQueued: 1 }),
    ]);
  });
});

describe("consumePendingDelegates — delayMs gating", () => {
  it("leaves an unmatured delegate (delayMs in the future) in queued state", async () => {
    await enqueuePendingDelegate("session-1", { task: "future", delayMs: 60_000 });

    const matured = await consumePendingDelegates("session-1");
    expect(matured).toEqual([]);
    expect(pendingDelegateCount("session-1")).toBe(1);
  });

  it("drains a matured delegate (delayMs elapsed)", async () => {
    await enqueuePendingDelegate("session-1", { task: "due", delayMs: 0 });

    const matured = await consumePendingDelegates("session-1");
    expect(matured).toHaveLength(1);
    expect(expectDefined(matured.at(0), "matured delegate").task).toBe("due");
    expect(pendingDelegateCount("session-1")).toBe(0);
  });

  it("drains matured entries and re-parks unmatured entries in the same call", async () => {
    await enqueuePendingDelegate("session-1", { task: "due", delayMs: 0 });
    await enqueuePendingDelegate("session-1", { task: "future", delayMs: 60_000 });

    const matured = await consumePendingDelegates("session-1");
    expect(matured.map((delegate) => delegate.task)).toEqual(["due"]);
    expect(pendingDelegateCount("session-1")).toBe(1);
  });

  it("treats omitted delayMs as zero (matures immediately, preserves legacy behavior)", async () => {
    await enqueuePendingDelegate("session-1", { task: "no-delay" });

    const matured = await consumePendingDelegates("session-1");
    expect(matured).toHaveLength(1);
    expect(expectDefined(matured.at(0), "matured delegate").task).toBe("no-delay");
  });
});

describe("peekEarliestQueuedDelegateDueAt", () => {
  it("returns undefined when no entries are queued", async () => {
    expect(await peekEarliestQueuedDelegateDueAt("empty")).toBeUndefined();
  });

  describe("markPendingDelegateFailed", () => {
    it("emits a breadcrumb instead of silently dropping delegates missing flow metadata", async () => {
      await markPendingDelegateFailed({ task: "missing metadata" }, "rejected");

      const warnings = loggerRecords.filter(
        (record) =>
          record.level === "warn" &&
          record.message.includes("[continuation:delegate-fail-missing-flow]"),
      );
      expect(warnings).toHaveLength(1);
    });
  });

  it("returns an already-due deadline so callers can arm an immediate hedge", async () => {
    const before = Date.now();
    await enqueuePendingDelegate("session-1", { task: "due", delayMs: 0 });
    const earliest = await peekEarliestQueuedDelegateDueAt("session-1");
    expect(earliest).toBeDefined();
    expect(earliest!).toBeGreaterThanOrEqual(before);
    expect(earliest!).toBeLessThanOrEqual(Date.now());
  });

  it("returns the soonest dueAt across multiple unmatured entries", async () => {
    const before = Date.now();
    await enqueuePendingDelegate("session-1", { task: "far", delayMs: 120_000 });
    await enqueuePendingDelegate("session-1", { task: "near", delayMs: 30_000 });
    await enqueuePendingDelegate("session-1", { task: "mid", delayMs: 60_000 });

    const soonest = await peekEarliestQueuedDelegateDueAt("session-1");
    expect(soonest).toBeDefined();
    expect(soonest!).toBeGreaterThanOrEqual(before + 30_000);
    expect(soonest!).toBeLessThan(before + 30_000 + 5_000);
  });
});

describe("consumePendingDelegates — concurrent-consumer race contract", () => {
  it("sequential consumers: second call sees the delegate already claimed, returns empty", async () => {
    await enqueuePendingDelegate("session-1", { task: "single" });

    const first = await consumePendingDelegates("session-1");
    expect(first).toHaveLength(1);
    expect(expectDefined(first.at(0), "delegate").task).toBe("single");
    expect(await consumePendingDelegates("session-1")).toHaveLength(0);
  });

  it("interleaved consumers: only one claim wins per delegate revision", async () => {
    const queued = await enqueuePendingDelegate("session-1", { task: "raced" });
    const sharedRevision = queued.revision;
    const claim = () =>
      claimContinuationSpawnAttempt({
        recordId: queued.recordId,
        ownerSessionKey: "session-1",
        expectedRevision: sharedRevision,
        now: Date.now(),
      });

    const results = [await claim(), await claim()];

    const winners = results.filter((result) => result.outcome === "claimed");
    const losers = results.filter((result) => result.outcome !== "claimed");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]?.outcome).toBe("revision_conflict");
    const claimed = await readRecord(queued.recordId);
    expect(claimed.status).toBe("running");
    expect(claimed.revision).toBe(sharedRevision + 1);
    expect(claimed.spawnAttempts).toHaveLength(1);
  });

  it("two real consume calls claim each queued delegate only once", async () => {
    await enqueuePendingDelegate("session-1", { task: "first" });
    await enqueuePendingDelegate("session-1", { task: "second" });
    await enqueuePendingDelegate("session-1", { task: "third" });

    const [first, second] = await Promise.all([
      consumePendingDelegates("session-1"),
      consumePendingDelegates("session-1"),
    ]);
    expect([...first, ...second].map((delegate) => delegate.task).toSorted()).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(await consumePendingDelegates("session-1")).toHaveLength(0);
  });

  it("interleaved consumers across multiple records claim each record exactly once", async () => {
    for (const task of ["A", "B", "C"]) {
      await enqueuePendingDelegate("session-1", { task });
    }
    const queuedBefore = (await listCustodyRecordsForTest({ ownerSessionKey: "session-1" })).map(
      (record) => ({ recordId: record.recordId, capturedRevision: record.revision }),
    );
    expect(queuedBefore).toHaveLength(3);

    for (const record of queuedBefore) {
      const claim = () =>
        claimContinuationSpawnAttempt({
          recordId: record.recordId,
          ownerSessionKey: "session-1",
          expectedRevision: record.capturedRevision,
          now: Date.now(),
        });
      const pair = [await claim(), await claim()];
      expect(pair.filter((result) => result.outcome === "claimed")).toHaveLength(1);
      expect(pair.filter((result) => result.outcome !== "claimed")).toEqual([
        expect.objectContaining({ outcome: "revision_conflict" }),
      ]);
    }
    const claimed = await listCustodyRecordsForTest({ ownerSessionKey: "session-1" });
    expect(claimed.every((record) => record.status === "running")).toBe(true);
    expect(claimed.every((record) => record.spawnAttempts.length === 1)).toBe(true);
  });
});
