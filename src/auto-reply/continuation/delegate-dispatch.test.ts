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
    const attachment = {
      name: "handoff.txt",
      content: "fanout payload",
      encoding: "utf8" as const,
    };
    enqueuePendingDelegate(sessionKey, {
      task: "targeted fanout",
      mode: "silent-wake",
      targetSessionKeys: ["agent:main:root", "agent:main:sibling"],
      attachments: [attachment],
      attachAs: { mountPath: "/workspace/fanout" },
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
        attachments: [attachment],
        attachMountPath: "/workspace/fanout",
      }),
      expect.objectContaining({
        agentSessionKey: sessionKey,
      }),
    );
  });

  it("surfaces malformed attachment spawn errors clearly", async () => {
    const sessionKey = "session-delegate-bad-attachment";
    enqueuePendingDelegate(sessionKey, {
      task: "bad attachment",
      attachments: [{ name: "../secret.txt", content: "nope" }],
    });
    spawnSubagentDirectMock.mockResolvedValueOnce({
      status: "error",
      error: "attachments_invalid_name (../secret.txt)",
    });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.rejected).toBe(1);
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("attachments_invalid_name (../secret.txt)"),
      { sessionKey },
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

  it("marks rejected/thrown delegates failed without aborting later delegates", async () => {
    const sessionKey = "session-delegate-spawn-failure";
    enqueuePendingDelegate(sessionKey, { task: "rejected" });
    enqueuePendingDelegate(sessionKey, { task: "throws" });
    enqueuePendingDelegate(sessionKey, { task: "accepted" });
    spawnSubagentDirectMock
      .mockResolvedValueOnce({ status: "forbidden" })
      .mockRejectedValueOnce(new Error("spawn unavailable"))
      .mockResolvedValueOnce({ status: "accepted" });

    const queuedBefore = [...mockFlows.values()]
      .filter((f) => f.ownerKey === sessionKey && f.status === "queued")
      .map((f) => f.flowId as string);

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
      expect.stringContaining("DELEGATE spawn failed: spawn unavailable"),
      { sessionKey },
    );
    expect(mockFlows.get(queuedBefore[0])?.status).toBe("failed");
    expect(mockFlows.get(queuedBefore[1])?.status).toBe("failed");
    expect(mockFlows.get(queuedBefore[2])?.status).toBe("succeeded");
  });

  it("marks over-limit delegates failed instead of leaving them as silent success", async () => {
    const sessionKey = "session-delegate-over-limit-status";
    for (let index = 0; index < 6; index++) {
      enqueuePendingDelegate(sessionKey, { task: `delegate-${index}` });
    }

    const queuedBefore = [...mockFlows.values()]
      .filter((f) => f.ownerKey === sessionKey && f.status === "queued")
      .map((f) => f.flowId as string);

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(mockFlows.get(queuedBefore[5])?.status).toBe("failed");
  });
});

describe("hedge-fire chainState persistence", () => {
  it("persists advanced chainState via callback after hedge-timer dispatch", async () => {
    const sessionKey = "session-hedge-persist";
    const persistedStates: Array<{ currentChainCount: number; accumulatedChainTokens: number }> =
      [];

    // Enqueue a single delayed delegate — unmatured at arm time, matures at hedge fire
    enqueuePendingDelegate(sessionKey, { task: "deferred work", delayMs: 30_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 1,
        chainStartedAt: 1_700_000_000_000,
        accumulatedChainTokens: 5_000,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
      persistChainState: async (state) => {
        persistedStates.push({
          currentChainCount: state.currentChainCount,
          accumulatedChainTokens: state.accumulatedChainTokens,
        });
      },
    });

    // Hedge is armed but nothing persisted yet
    expect(persistedStates).toHaveLength(0);

    // Let the deferred delegate mature and the hedge fire
    await vi.advanceTimersByTimeAsync(30_000 + 100);
    // Drain microtasks from the async hedge callback
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    // The single deferred delegate spawned, advancing chain count from 1 → 2
    expect(persistedStates).toHaveLength(1);
    expect(persistedStates[0].currentChainCount).toBe(2);
    expect(persistedStates[0].accumulatedChainTokens).toBe(5_000);
  });

  it("does not persist when hedge dispatch spawns zero delegates", async () => {
    const sessionKey = "session-hedge-no-persist";
    const persistedStates: Array<Record<string, unknown>> = [];

    enqueuePendingDelegate(sessionKey, { task: "deferred work", delayMs: 30_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      persistChainState: async (state) => {
        persistedStates.push(state);
      },
    });

    // Cancel delegates before hedge fires — hedge re-dispatch finds empty queue
    cancelPendingDelegates(sessionKey);

    await vi.advanceTimersByTimeAsync(30_000 + 100);
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(persistedStates).toHaveLength(0);
  });

  it("enforces max-chain budget correctly after hedge persists advanced state", async () => {
    const sessionKey = "session-hedge-budget";
    const maxChainLength = 3;
    let latestPersistedCount = 0;
    const sessionEntry = {
      continuationChainCount: 1,
      chainStartedAt: 1_700_000_000_000,
      continuationChainTokens: 0,
    };

    // Single deferred delegate — will mature at hedge fire
    enqueuePendingDelegate(sessionKey, { task: "deferred-1", delayMs: 10_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 1,
        chainStartedAt: 1_700_000_000_000,
        accumulatedChainTokens: 0,
      },
      ctx: { sessionKey },
      maxChainLength,
      loadFreshChainState: () => ({
        currentChainCount: sessionEntry.continuationChainCount,
        chainStartedAt: sessionEntry.chainStartedAt,
        accumulatedChainTokens: sessionEntry.continuationChainTokens,
      }),
      persistChainState: async (state) => {
        sessionEntry.continuationChainCount = state.currentChainCount;
        sessionEntry.continuationChainTokens = state.accumulatedChainTokens;
        latestPersistedCount = state.currentChainCount;
      },
    });

    await vi.advanceTimersByTimeAsync(10_000 + 100);
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    // Deferred delegate matured and spawned: hop 1 → 2
    expect(latestPersistedCount).toBe(2);
    expect(sessionEntry.continuationChainCount).toBe(2);
  });
});

describe("dispatchToolDelegates — TaskFlow status after spawn failure", () => {
  // Pins the contract that the regression report called out as structurally unpinned:
  // "what is the intended TaskFlow status after spawn failure?"
  //
  // Current emergent behavior on v5.2 (`delegate-dispatch.ts:160 + 240-292`):
  //   1. consumePendingDelegates(sessionKey) at line 160 calls finishFlow on
  //      each consumed delegate → TaskFlow row → status="succeeded"
  //   2. spawnSubagentDirect(...) per delegate
  //   3. If spawn returns non-"accepted" status → log info + enqueue system
  //      event + rejected++
  //   4. If spawn throws → log info + enqueue system event + rejected++
  //   5. NO retry, NO un-finish, NO mark-for-inspection — durable record is
  //      already in succeeded state, only observability remains.
  //
  // This is the **one-shot-loss + observability-only** invariant. It is
  // substrate-consistent with task-executor's exit-code-failure shape (also
  // single-shot, no retry). The substrate has NO infrastructure for automatic
  // re-enqueue, NO retry-count metadata field, NO transitional
  // failed_retryable state — runaway-amplification-via-retry-storm is
  // structurally pre-empted by the absence of those primitives.
  //
  // Pin the contract here so a refactor that introduces retry semantics
  // OR moves finishFlow to after-spawn-success will surface as a test
  // failure rather than a silent invariant change. The deliberate choice
  // is one-shot / no-retry semantics that do not silently present spawn
  // failure as success.

  it("marks consumed flows failed after spawn rejection", async () => {
    const sessionKey = "session-449-rejected";
    enqueuePendingDelegate(sessionKey, { task: "rejected-task" });
    spawnSubagentDirectMock.mockResolvedValueOnce({ status: "forbidden" });

    // Capture flowId before dispatch so we can inspect its post-dispatch state.
    const queuedBefore = [...mockFlows.values()].filter(
      (f) => f.ownerKey === sessionKey && f.status === "queued",
    );
    expect(queuedBefore).toHaveLength(1);
    const flowId = queuedBefore[0].flowId as string;

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.dispatched).toBe(0);
    expect(result.rejected).toBe(1);

    // Honest failure visibility on the same one-shot substrate.
    const finalized = mockFlows.get(flowId);
    expect(finalized?.status).toBe("failed");
  });

  it("marks consumed flows failed after spawn throws", async () => {
    const sessionKey = "session-449-thrown";
    enqueuePendingDelegate(sessionKey, { task: "throwing-task" });
    spawnSubagentDirectMock.mockRejectedValueOnce(new Error("spawn unavailable"));

    const queuedBefore = [...mockFlows.values()].filter(
      (f) => f.ownerKey === sessionKey && f.status === "queued",
    );
    expect(queuedBefore).toHaveLength(1);
    const flowId = queuedBefore[0].flowId as string;

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.dispatched).toBe(0);
    expect(result.rejected).toBe(1);

    // Same shape for the throw-path: no retry, but durable failed-state.
    const finalized = mockFlows.get(flowId);
    expect(finalized?.status).toBe("failed");
  });

  it("preserves per-delegate terminal truth across mixed spawn outcomes (rejected + thrown + accepted)", async () => {
    const sessionKey = "session-449-mixed";
    enqueuePendingDelegate(sessionKey, { task: "rejected" });
    enqueuePendingDelegate(sessionKey, { task: "throws" });
    enqueuePendingDelegate(sessionKey, { task: "accepted" });
    spawnSubagentDirectMock
      .mockResolvedValueOnce({ status: "forbidden" })
      .mockRejectedValueOnce(new Error("spawn unavailable"))
      .mockResolvedValueOnce({ status: "accepted" });

    const queuedBefore = [...mockFlows.values()]
      .filter((f) => f.ownerKey === sessionKey && f.status === "queued")
      .map((f) => f.flowId as string);
    expect(queuedBefore).toHaveLength(3);

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(mockFlows.get(queuedBefore[0])?.status).toBe("failed");
    expect(mockFlows.get(queuedBefore[1])?.status).toBe("failed");
    expect(mockFlows.get(queuedBefore[2])?.status).toBe("succeeded");
  });
});
