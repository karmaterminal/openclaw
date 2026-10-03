import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enqueueSystemEventMock = vi.fn();
const spawnSubagentDirectMock = vi.fn();

// Dispatch revalidates the owner session before claiming a delegate, so every
// owner key resolves with a stable lifecycle identity (mirrors
// delegate-dispatch.test.ts).
const loadOwnerSession = (sessionKey: string) => ({
  sessionId: `session-${sessionKey}`,
  lifecycleRevision: "revision-1",
});

vi.mock("../../agents/subagents/spawn/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEventRaw: (text: string, options: unknown) => enqueueSystemEventMock(text, options),
}));

vi.mock("../../config/sessions/session-accessor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config/sessions/session-accessor.js")>()),
  loadSessionEntry: ({ sessionKey }: { sessionKey: string }) => loadOwnerSession(sessionKey),
}));

vi.mock("../../logging/subsystem.js", () => {
  const noop = (): void => {};
  const logger = {
    subsystem: "test",
    isEnabled: () => true,
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    raw: noop,
    child: () => logger,
  };
  return {
    createSubsystemLogger: () => logger,
  };
});

import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import { resetContinuationTracer } from "../../infra/continuation-tracer.js";
import { loadPendingSessionDeliveries } from "../../infra/session-delivery-queue-storage.js";
import { resetGatewayWorkAdmission } from "../../process/gateway-work-admission.js";
import {
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import { dispatchToolDelegates, resetDelegateDispatchHedgesForTests } from "./delegate-dispatch.js";
import { enqueuePendingDelegate } from "./delegate-store.js";
import { captureContinuationQueueContext } from "./queue-context.js";
import { resetContinuationStateForTests } from "./state.js";

const INTERRUPTED_NOTICE = "[continuation:delegate-spawn-interrupted]";

useContinuationCustodyTestState();

async function queuedDelegateRecordId(sessionKey: string, task: string): Promise<string> {
  const record = await enqueuePendingDelegate(sessionKey, { task });
  expect(record).toMatchObject({ ownerSessionKey: sessionKey, kind: "delegate", status: "queued" });
  return record.recordId;
}

async function interruptedNoticesFor(sessionKey: string): Promise<string[]> {
  return (await loadPendingSessionDeliveries(captureContinuationQueueContext())).flatMap((entry) =>
    entry.sessionKey === sessionKey &&
    entry.kind === "systemEvent" &&
    entry.text.includes(INTERRUPTED_NOTICE)
      ? [entry.text]
      : [],
  );
}

beforeEach(() => {
  enqueueSystemEventMock.mockClear();
  spawnSubagentDirectMock.mockReset().mockResolvedValue({ status: "accepted" });
  resetGatewayWorkAdmission();
  // Custody commands run on the shared-state worker; fake only the clocks and
  // timers the dispatch owns so worker round trips still settle.
  vi.useFakeTimers({
    toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
});

afterEach(() => {
  resetDelegateDispatchHedgesForTests();
  resetContinuationStateForTests();
  resetContinuationTracer();
  clearRuntimeConfigSnapshot();
  resetGatewayWorkAdmission();
  vi.useRealTimers();
});

describe("dispatchToolDelegates — custody status after spawn failure", () => {
  // Pins the intended custody status after spawn failure (RFC
  // docs/design/continue-work-signal-v2.md §5.4.4):
  //
  //   1. consumePendingDelegates(sessionKey) claims each due delegate: the
  //      record is `running` with a fresh, never-reused spawn attempt.
  //   2. spawnSubagentDirect(...) per claimed delegate.
  //   3. A spawn result that provably never dispatched (no runId, no failure
  //      phase) ends the record `failed` with the rejection summary, plus a
  //      system event.
  //   4. A thrown spawn leaves admission unproven: the record ends `failed`
  //      with failureReason "spawn-interrupted" and exactly one durable
  //      `[continuation:delegate-spawn-interrupted]` notice. It is never
  //      requeued or re-spawned (Q3).
  //
  // No retry either way, and spawn failure is never presented as success.

  it("marks consumed records failed after spawn rejection", async () => {
    const sessionKey = "session-449-rejected";
    const recordId = await queuedDelegateRecordId(sessionKey, "rejected-task");
    spawnSubagentDirectMock.mockResolvedValueOnce({ status: "forbidden" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.dispatched).toBe(0);
    expect(result.rejected).toBe(1);

    // Honest failure visibility on the same one-shot substrate.
    const finalized = await readCustodyRecordForTest(recordId);
    expect(finalized?.status).toBe("failed");
    expect(finalized?.failureReason).toBe("DELEGATE spawn forbidden: delegation was not accepted.");
    expect(await interruptedNoticesFor(sessionKey)).toEqual([]);
  });

  it("marks consumed records failed as spawn-interrupted after spawn throws", async () => {
    const sessionKey = "session-449-thrown";
    const recordId = await queuedDelegateRecordId(sessionKey, "throwing-task");
    spawnSubagentDirectMock.mockRejectedValueOnce(new Error("spawn unavailable"));

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.dispatched).toBe(0);
    expect(result.rejected).toBe(1);

    // Same shape for the throw-path: no retry, durable failed-state, and one
    // interrupted notice because the spawn call had begun.
    const finalized = await readCustodyRecordForTest(recordId);
    expect(finalized?.status).toBe("failed");
    expect(finalized?.failureReason).toBe("spawn-interrupted");
    expect(finalized?.terminalNoticePending).toBeUndefined();
    const notices = await interruptedNoticesFor(sessionKey);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("throwing-task");
  });

  it("preserves per-delegate terminal truth across mixed spawn outcomes (rejected + thrown + accepted)", async () => {
    const sessionKey = "session-449-mixed";
    const recordIds = [
      await queuedDelegateRecordId(sessionKey, "rejected"),
      await queuedDelegateRecordId(sessionKey, "throws"),
      await queuedDelegateRecordId(sessionKey, "accepted"),
    ];
    spawnSubagentDirectMock
      .mockResolvedValueOnce({ status: "forbidden" })
      .mockRejectedValueOnce(new Error("spawn unavailable"))
      .mockResolvedValueOnce({ status: "accepted" });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    const rejected = await readCustodyRecordForTest(
      expectDefined(recordIds.at(0), "first record id"),
    );
    const thrown = await readCustodyRecordForTest(
      expectDefined(recordIds.at(1), "second record id"),
    );
    const accepted = await readCustodyRecordForTest(
      expectDefined(recordIds.at(2), "third record id"),
    );
    expect(rejected?.status).toBe("failed");
    expect(thrown?.status).toBe("failed");
    expect(thrown?.failureReason).toBe("spawn-interrupted");
    expect(accepted?.status).toBe("succeeded");
    expect(await interruptedNoticesFor(sessionKey)).toHaveLength(1);
  });
});

describe("dispatchToolDelegates — nonexistent target session", () => {
  it("passes a nonexistent targetSessionKey through to spawn without throwing", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { crossSessionTargeting: "enabled" } } },
    });
    const sessionKey = "session-nonexistent-target";
    await enqueuePendingDelegate(sessionKey, {
      task: "deliver to ghost",
      mode: "silent-wake",
      targetSessionKey: "agent:main:never-existed",
    });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.dispatched).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.chainState.currentChainCount).toBe(1);
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("deliver to ghost"),
        silentAnnounce: true,
        wakeOnReturn: true,
        continuationTargetSessionKey: "agent:main:never-existed",
      }),
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );
  });

  it("passes nonexistent targetSessionKeys (plural) through to spawn", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { crossSessionTargeting: "enabled" } } },
    });
    const sessionKey = "session-nonexistent-targets-plural";
    await enqueuePendingDelegate(sessionKey, {
      task: "deliver to ghosts",
      mode: "silent-wake",
      targetSessionKeys: ["agent:main:ghost", "agent:main:phantom"],
    });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.dispatched).toBe(1);
    expect(result.rejected).toBe(0);
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        continuationTargetSessionKeys: ["agent:main:ghost", "agent:main:phantom"],
      }),
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );
  });

  it("normalizes empty-string targetSessionKey away from spawn params", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { crossSessionTargeting: "enabled" } } },
    });
    const sessionKey = "session-empty-target";
    await enqueuePendingDelegate(sessionKey, {
      task: "deliver to empty",
      targetSessionKey: "",
    });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.dispatched).toBe(1);
    expect(result.rejected).toBe(0);
    const spawnParams = expectDefined(
      spawnSubagentDirectMock.mock.calls.at(0)?.at(0),
      "spawn params",
    ) as Record<string, unknown>;
    expect(spawnParams).not.toHaveProperty("continuationTargetSessionKey");
  });

  it("advances chain state correctly when targeting a nonexistent session", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { crossSessionTargeting: "enabled" } } },
    });
    const sessionKey = "session-nonexistent-chain";
    await enqueuePendingDelegate(sessionKey, {
      task: "chained ghost delivery",
      targetSessionKey: "agent:main:stale-removed",
    });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 3,
        chainStartedAt: 1_700_000_000_000,
        accumulatedChainTokens: 500,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.chainState).toEqual({
      currentChainCount: 4,
      chainStartedAt: 1_700_000_000_000,
      accumulatedChainTokens: 500,
      chainId: expect.any(String),
    });
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("[continuation:chain-hop:4]"),
        continuationTargetSessionKey: "agent:main:stale-removed",
      }),
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );
  });

  it("marks the custody record succeeded for a nonexistent target (same as normal)", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { crossSessionTargeting: "enabled" } } },
    });
    const sessionKey = "session-nonexistent-taskflow";
    const queued = await enqueuePendingDelegate(sessionKey, {
      task: "taskflow ghost",
      targetSessionKey: "agent:main:never-existed",
    });
    expect(queued).toMatchObject({ ownerSessionKey: sessionKey, status: "queued" });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect((await readCustodyRecordForTest(queued.recordId))?.status).toBe("succeeded");
  });
});
