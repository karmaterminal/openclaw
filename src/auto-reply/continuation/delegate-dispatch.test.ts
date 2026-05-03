import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock TaskFlow registry — delegate-store resolves it transitively.
const mockFlows = new Map<string, Record<string, unknown>>();
const enqueueSystemEventMock = vi.fn();
const loggerRecords: Array<{ level: string; message: string }> = [];
const spawnSubagentDirectMock = vi.fn();
let flowIdCounter = 0;
let listTaskFlowsShouldThrow = false;

vi.mock("../../agents/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEvent: (text: string, options: unknown) => enqueueSystemEventMock(text, options),
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

vi.mock("../../tasks/task-flow-registry.js", () => ({
  createManagedTaskFlow: vi.fn((params: Record<string, unknown>) => {
    const flowId = `flow-${++flowIdCounter}`;
    mockFlows.set(flowId, {
      flowId,
      syncMode: "managed",
      ownerKey: params.ownerKey,
      controllerId: params.controllerId,
      status: "queued",
      stateJson: params.stateJson,
      goal: params.goal,
      currentStep: params.currentStep,
      revision: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return mockFlows.get(flowId);
  }),
  listTaskFlowsForOwnerKey: vi.fn((ownerKey: string) => {
    if (listTaskFlowsShouldThrow) {
      throw new Error("taskflow unavailable");
    }
    return [...mockFlows.values()].filter((f) => f.ownerKey === ownerKey);
  }),
  finishFlow: vi.fn((params: { flowId: string; expectedRevision: number }) => {
    const flow = mockFlows.get(params.flowId);
    if (!flow || flow.revision !== params.expectedRevision) {
      return { applied: false, reason: flow ? "revision_conflict" : "not_found" };
    }
    flow.status = "succeeded";
    flow.revision = flow.revision + 1;
    return { applied: true, flow: { ...flow } };
  }),
  failFlow: vi.fn((params: { flowId: string }) => {
    const flow = mockFlows.get(params.flowId);
    if (flow) {
      flow.status = "failed";
    }
    return { applied: !!flow };
  }),
  deleteTaskFlowRecordById: vi.fn((flowId: string) => {
    mockFlows.delete(flowId);
  }),
}));

import { dispatchToolDelegates, resetDelegateDispatchHedgesForTests } from "./delegate-dispatch.js";
import { cancelPendingDelegates, enqueuePendingDelegate } from "./delegate-store.js";
import { hasLiveContinuationTimerRefs, resetContinuationStateForTests } from "./state.js";

beforeEach(() => {
  mockFlows.clear();
  enqueueSystemEventMock.mockClear();
  loggerRecords.length = 0;
  spawnSubagentDirectMock.mockReset().mockResolvedValue({ status: "accepted" });
  flowIdCounter = 0;
  listTaskFlowsShouldThrow = false;
  vi.useFakeTimers();
});

afterEach(() => {
  resetDelegateDispatchHedgesForTests();
  resetContinuationStateForTests();
  mockFlows.clear();
  listTaskFlowsShouldThrow = false;
  vi.useRealTimers();
});

describe("hedge timer ref/handle cleanup", () => {
  it("releases the timer ref + handle after a natural hedge fire", async () => {
    const sessionKey = "session-hedge-natural";

    // Queue an unmatured delegate so `dispatchToolDelegates` arms a hedge.
    enqueuePendingDelegate(sessionKey, { task: "deferred work", delayMs: 30_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);

    // Cancel the delegate before the hedge fires so the re-dispatch hits
    // the empty-queue / no-unmatured path — isolates the natural-fire
    // cleanup we're asserting.
    cancelPendingDelegates(sessionKey);

    await vi.advanceTimersByTimeAsync(30_000 + 100);
    // Drain the fire-and-forget re-dispatch promise.
    await vi.runAllTimersAsync();

    // Before the fix: the natural-fire branch deleted the hedgeTimers map
    // entry but never called unregisterContinuationTimerHandle, so the
    // ref count stayed >= 1. The fix makes the natural-fire path mirror
    // clearHedgeTimer's cleanup.
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(false);
  });

  it("releases the timer ref + handle on explicit clearHedgeTimer", async () => {
    const sessionKey = "session-hedge-cancel";

    enqueuePendingDelegate(sessionKey, { task: "deferred", delayMs: 30_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);

    // Cancel then re-dispatch: the follow-up call sees no unmatured
    // delegate and takes the clearHedgeTimer branch, which should drop
    // the ref to zero.
    cancelPendingDelegates(sessionKey);
    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(false);
  });

  it("surfaces hedge dispatch failures and re-arms a retry instead of orphaning queued delegates", async () => {
    const sessionKey = "session-hedge-failure";

    enqueuePendingDelegate(sessionKey, { task: "deferred work", delayMs: 30_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);

    listTaskFlowsShouldThrow = true;
    await vi.advanceTimersByTimeAsync(30_000 + 100);
    await Promise.resolve();

    expect(loggerRecords).toContainEqual({
      level: "error",
      message: `[continuation:delegate-hedge-error] error=taskflow unavailable session=${sessionKey}`,
    });
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("Hedge-timer dispatch failed; queued delegates may be orphaned."),
      { sessionKey },
    );
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);
  });
});

describe("tool delegate dispatch contract", () => {
  it("caps dispatch at maxDelegatesPerTurn and surfaces over-limit delegates", async () => {
    const sessionKey = "session-delegate-cap";
    for (let index = 0; index < 6; index++) {
      enqueuePendingDelegate(sessionKey, { task: `delegate-${index}` });
    }

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.dispatched).toBe(5);
    expect(result.rejected).toBe(1);
    expect(result.chainState.currentChainCount).toBe(5);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(5);
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("maxDelegatesPerTurn exceeded (5). Task: delegate-5"),
      { sessionKey },
    );
  });

  it("maps delegate modes into spawn flags without changing normal delegates", async () => {
    const sessionKey = "session-delegate-modes";
    enqueuePendingDelegate(sessionKey, { task: "normal" });
    enqueuePendingDelegate(sessionKey, { task: "silent", mode: "silent" });
    enqueuePendingDelegate(sessionKey, { task: "wake", mode: "silent-wake" });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    const spawnParams = spawnSubagentDirectMock.mock.calls.map(
      (call) => call[0] as Record<string, unknown>,
    );
    expect(spawnParams[0]).toMatchObject({
      task: expect.stringContaining("normal"),
      drainsContinuationDelegateQueue: true,
    });
    expect(spawnParams[0]).not.toHaveProperty("silentAnnounce");
    expect(spawnParams[0]).not.toHaveProperty("wakeOnReturn");
    expect(spawnParams[1]).toMatchObject({
      task: expect.stringContaining("silent"),
      silentAnnounce: true,
      drainsContinuationDelegateQueue: true,
    });
    expect(spawnParams[1]).not.toHaveProperty("wakeOnReturn");
    expect(spawnParams[2]).toMatchObject({
      task: expect.stringContaining("wake"),
      silentAnnounce: true,
      wakeOnReturn: true,
      drainsContinuationDelegateQueue: true,
    });
  });

  it("threads cross-session targeting metadata into spawned continuation runs", async () => {
    const sessionKey = "session-delegate-targeting";
    enqueuePendingDelegate(sessionKey, {
      task: "targeted fanout",
      mode: "silent-wake",
      targetSessionKeys: ["agent:main:root", "agent:main:sibling"],
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("targeted fanout"),
        silentAnnounce: true,
        wakeOnReturn: true,
        continuationTargetSessionKeys: ["agent:main:root", "agent:main:sibling"],
      }),
      expect.objectContaining({
        agentSessionKey: sessionKey,
      }),
    );
  });

  it("advances chain state and prefixes spawned tasks with the next hop", async () => {
    const sessionKey = "session-delegate-chain";
    enqueuePendingDelegate(sessionKey, { task: "inspect logs" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 2,
        chainStartedAt: 1_700_000_000_000,
        accumulatedChainTokens: 123,
      },
      ctx: { sessionKey, agentChannel: "discord", agentTo: "channel" },
      maxChainLength: 10,
    });

    expect(result.chainState).toEqual({
      currentChainCount: 3,
      chainStartedAt: 1_700_000_000_000,
      accumulatedChainTokens: 123,
    });
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "[continuation:chain-hop:3] Delegated task (turn 3/10): inspect logs",
      }),
      {
        agentSessionKey: sessionKey,
        agentChannel: "discord",
        agentAccountId: undefined,
        agentTo: "channel",
        agentThreadId: undefined,
      },
    );
  });

  it("counts spawn rejections and thrown spawn errors without aborting later delegates", async () => {
    const sessionKey = "session-delegate-spawn-failure";
    enqueuePendingDelegate(sessionKey, { task: "rejected" });
    enqueuePendingDelegate(sessionKey, { task: "throws" });
    enqueuePendingDelegate(sessionKey, { task: "accepted" });
    spawnSubagentDirectMock
      .mockResolvedValueOnce({ status: "forbidden" })
      .mockRejectedValueOnce(new Error("spawn unavailable"))
      .mockResolvedValueOnce({ status: "accepted" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.dispatched).toBe(1);
    expect(result.rejected).toBe(2);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(3);
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("DELEGATE spawn forbidden"),
      { sessionKey },
    );
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("DELEGATE spawn failed: Error: spawn unavailable"),
      { sessionKey },
    );
  });
});
