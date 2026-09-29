/**
 * Fanout error isolation.
 *
 * If one delegate in a fanout batch errors mid-dispatch, sibling delegates
 * are NOT aborted. The parent (dispatch loop) collects partial results:
 * dispatched count + rejected count + per-delegate custody status
 * (succeeded / failed). Each delegate is spawned independently via
 * `spawnSubagentDirect` and a single failure does NOT short-circuit the loop.
 *
 * This test extends the existing coverage in delegate-dispatch.test.ts
 * ("marks rejected/thrown delegates failed without aborting later delegates")
 * to the targeted fanout shape: each delegate targets a DIFFERENT session via
 * `targetSessionKey`, and a mid-batch failure does not affect siblings.
 *
 * subagent-spawn, system-events, and the subsystem logger are stubbed;
 * continuation custody is the real store, so per-delegate record state is
 * observed directly.
 */
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock infrastructure — self-contained so this file survives independent
// refactors of delegate-dispatch.test.ts.
// ---------------------------------------------------------------------------

const enqueueSystemEventMock = vi.fn();
const loggerRecords: Array<{ level: string; message: string }> = [];
const spawnSubagentDirectMock = vi.fn();

vi.mock("../../agents/subagents/spawn/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEventRaw: (text: string, options: unknown) => enqueueSystemEventMock(text, options),
}));

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

import { clearRuntimeConfigSnapshot } from "../../config/config.js";
import { upsertSessionEntryCore } from "../../config/sessions/session-accessor.js";
import { resetContinuationTracer } from "../../infra/continuation-tracer.js";
import { loadPendingSessionDeliveries } from "../../infra/session-delivery-queue-storage.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import { closeOpenClawAgentDatabasesForTest } from "../../state/openclaw-agent-db.js";
import {
  listCustodyRecordsForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import { CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG } from "./custody/spawn-interrupted-notice.js";
import { dispatchToolDelegates, resetDelegateDispatchHedgesForTests } from "./delegate-dispatch.js";
import { enqueuePendingDelegate } from "./delegate-store.js";
import { resetContinuationStateForTests } from "./state.js";

useContinuationCustodyTestState();

// Dispatch revalidates the owner session before claiming a delegate, so tests
// that reach the spawn path seed the owner row in the isolated session store
// (mirrors delegate-dispatch-post-compaction.test.ts).
async function seedOwnerSession(sessionKey: string): Promise<void> {
  await upsertSessionEntryCore(
    { agentId: "main", sessionKey },
    {
      sessionId: `session:${sessionKey}`,
      lifecycleRevision: `lifecycle:${sessionKey}`,
      updatedAt: Date.now(),
    },
  );
}

beforeEach(() => {
  closeOpenClawAgentDatabasesForTest();
  enqueueSystemEventMock.mockClear();
  loggerRecords.length = 0;
  spawnSubagentDirectMock.mockReset().mockResolvedValue({ status: "accepted" });
});

afterEach(() => {
  resetDelegateDispatchHedgesForTests();
  resetContinuationStateForTests();
  resetContinuationTracer();
  clearRuntimeConfigSnapshot();
  closeOpenClawAgentDatabasesForTest();
});

describe("fanout error isolation", () => {
  it("three delegates targeting different sessions: middle one fails, first and third still dispatch", async () => {
    const sessionKey = "session-fanout-isolation";
    await seedOwnerSession(sessionKey);

    // Each delegate fans out to a DIFFERENT target session via targetSessionKey:
    // one tool turn, N delegates, each with an independent target.
    await enqueuePendingDelegate(sessionKey, {
      task: "fanout-target-A",
      targetSessionKey: "channel:target-A",
    });
    await enqueuePendingDelegate(sessionKey, {
      task: "fanout-target-B",
      targetSessionKey: "channel:target-B",
    });
    await enqueuePendingDelegate(sessionKey, {
      task: "fanout-target-C",
      targetSessionKey: "channel:target-C",
    });

    // The MIDDLE delegate's spawn rejects mid-fanout. First and third succeed.
    spawnSubagentDirectMock
      .mockResolvedValueOnce({ status: "accepted" })
      .mockRejectedValueOnce(new Error("session-B delivery failure"))
      .mockResolvedValueOnce({ status: "accepted" });

    const queuedBefore = (
      await listCustodyRecordsForTest({
        ownerSessionKey: sessionKey,
        kinds: ["delegate"],
        statuses: ["queued"],
      })
    ).map((record) => record.recordId);
    expect(queuedBefore).toHaveLength(3);

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: {
        enabled: true,
        defaultDelayMs: 15_000,
        minDelayMs: 5_000,
        maxDelayMs: 300_000,
        maxChainLength: 10,
        costCapTokens: 500_000,
        maxDelegatesPerTurn: 5,
        maxPendingWork: 32,
        crossSessionTargeting: "enabled",
        earlyWarningBand: 0.3125,
      },
    });

    // PARTIAL RESULTS: parent collected 2 successes + 1 failure.
    // The middle failure did NOT abort the third delegate.
    expect(result.dispatched).toBe(2);
    expect(result.rejected).toBe(1);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(3);

    // Per-delegate custody status is recorded independently. The thrown spawn
    // began after the claim, so its admission is unproven: the record fails as
    // spawn-interrupted and is never requeued (RFC §5.4.4, Q3).
    expect(
      (await readCustodyRecordForTest(expectDefined(queuedBefore.at(0), "first record id")))
        ?.status,
    ).toBe("succeeded");
    const middleRecordId = expectDefined(queuedBefore.at(1), "second record id");
    expect(await readCustodyRecordForTest(middleRecordId)).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
    });
    expect(
      (await readCustodyRecordForTest(expectDefined(queuedBefore.at(2), "third record id")))
        ?.status,
    ).toBe("succeeded");

    // The targetSessionKey was preserved end-to-end for the surviving siblings —
    // proves the third delegate's fanout target was NOT clobbered by the
    // middle delegate's failure path.
    const spawnParams = spawnSubagentDirectMock.mock.calls.map(
      (call) => call[0] as Record<string, unknown>,
    );
    expect(spawnParams[0]).toMatchObject({ task: expect.stringContaining("fanout-target-A") });
    expect(spawnParams[2]).toMatchObject({ task: expect.stringContaining("fanout-target-C") });

    // The failure was surfaced to the originating session exactly once, and
    // only for the failing delegate — siblings did NOT generate noise. A thrown
    // spawn owes the durable interrupted notice (one session-delivery row plus
    // its in-memory fast-path event), not the pre-spawn "spawn failed" event.
    const failureEvents = enqueueSystemEventMock.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" && call[0].includes(CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG),
    );
    expect(failureEvents).toHaveLength(1);
    expect(failureEvents[0]?.[0]).toContain(`Delegate record ${middleRecordId}`);
    expect(failureEvents[0]?.[0]).toContain("fanout-target-B");
    expect(failureEvents[0]?.[1]).toMatchObject({
      sessionKey: resolveSystemEventQueueKey(sessionKey, "main"),
      trusted: true,
    });
    expect(
      enqueueSystemEventMock.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("DELEGATE spawn failed"),
      ),
    ).toHaveLength(0);
    const noticeRows = (await loadPendingSessionDeliveries()).filter(
      (entry) =>
        entry.kind === "systemEvent" &&
        entry.text.includes(CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG),
    );
    expect(noticeRows).toHaveLength(1);
    expect(noticeRows[0]).toMatchObject({
      sessionKey,
      idempotencyKey: `continuation-spawn-interrupted:record:${middleRecordId}`,
    });
  });

  it("first delegate fails: subsequent siblings are NOT short-circuited", async () => {
    // Inverse-position variant: failure at the HEAD of the fanout still
    // permits all tail siblings to dispatch. Pins that the dispatch loop
    // has no "stop on first error" path.
    const sessionKey = "session-fanout-head-failure";
    await seedOwnerSession(sessionKey);

    await enqueuePendingDelegate(sessionKey, {
      task: "head-fails",
      targetSessionKey: "channel:head",
    });
    await enqueuePendingDelegate(sessionKey, {
      task: "tail-1",
      targetSessionKey: "channel:tail-1",
    });
    await enqueuePendingDelegate(sessionKey, {
      task: "tail-2",
      targetSessionKey: "channel:tail-2",
    });

    spawnSubagentDirectMock
      .mockResolvedValueOnce({ status: "forbidden" })
      .mockResolvedValueOnce({ status: "accepted" })
      .mockResolvedValueOnce({ status: "accepted" });

    const queuedBefore = (
      await listCustodyRecordsForTest({
        ownerSessionKey: sessionKey,
        kinds: ["delegate"],
        statuses: ["queued"],
      })
    ).map((record) => record.recordId);

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: {
        enabled: true,
        defaultDelayMs: 15_000,
        minDelayMs: 5_000,
        maxDelayMs: 300_000,
        maxChainLength: 10,
        costCapTokens: 500_000,
        maxDelegatesPerTurn: 5,
        maxPendingWork: 32,
        crossSessionTargeting: "enabled",
        earlyWarningBand: 0.3125,
      },
    });

    expect(result.dispatched).toBe(2);
    expect(result.rejected).toBe(1);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(3);
    expect(
      (await readCustodyRecordForTest(expectDefined(queuedBefore.at(0), "first record id")))
        ?.status,
    ).toBe("failed");
    expect(
      (await readCustodyRecordForTest(expectDefined(queuedBefore.at(1), "second record id")))
        ?.status,
    ).toBe("succeeded");
    expect(
      (await readCustodyRecordForTest(expectDefined(queuedBefore.at(2), "third record id")))
        ?.status,
    ).toBe("succeeded");
  });
});
