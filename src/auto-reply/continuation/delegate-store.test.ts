import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the TaskFlow registry before importing the store.
type MockTaskFlowRecord = {
  flowId: string;
  syncMode: "managed";
  ownerKey: string;
  controllerId: string;
  status: string;
  stateJson: unknown;
  goal: string;
  currentStep: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
};

const mockFlows = new Map<string, MockTaskFlowRecord>();
let flowIdCounter = 0;

vi.mock("../../tasks/task-flow-registry.js", () => ({
  createManagedTaskFlow: vi.fn(
    (params: {
      ownerKey: string;
      controllerId: string;
      stateJson: unknown;
      goal: string;
      currentStep: string;
    }) => {
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
    },
  ),
  listTaskFlowsForOwnerKey: vi.fn((ownerKey: string) =>
    [...mockFlows.values()].filter((f) => f.ownerKey === ownerKey),
  ),
  listTaskFlowRecords: vi.fn(() => [...mockFlows.values()]),
  finishFlow: vi.fn(
    (params: {
      flowId: string;
      expectedRevision: number;
      updatedAt?: number;
      endedAt?: number;
      stateJson?: unknown;
    }) => {
      const flow = mockFlows.get(params.flowId);
      if (!flow || flow.revision !== params.expectedRevision) {
        return { applied: false, reason: flow ? "revision_conflict" : "not_found" };
      }
      flow.status = "succeeded";
      flow.stateJson = params.stateJson ?? flow.stateJson;
      flow.endedAt = params.endedAt ?? params.updatedAt ?? Date.now();
      flow.updatedAt = params.updatedAt ?? flow.endedAt;
      flow.revision = flow.revision + 1;
      return { applied: true, flow: { ...flow } };
    },
  ),
  failFlow: vi.fn((params: { flowId: string; updatedAt?: number; endedAt?: number }) => {
    const flow = mockFlows.get(params.flowId);
    if (flow) {
      flow.status = "failed";
      flow.endedAt = params.endedAt ?? params.updatedAt ?? Date.now();
      flow.updatedAt = params.updatedAt ?? flow.endedAt;
      flow.revision = flow.revision + 1;
    }
    return { applied: !!flow };
  }),
  deleteTaskFlowRecordById: vi.fn((flowId: string) => {
    mockFlows.delete(flowId);
  }),
}));

import { getDiagnosticContinuationQueueMetrics } from "../../logging/diagnostic-continuation-queues.js";
import {
  CONTINUATION_DELEGATE_CONTROLLER_ID,
  CONTINUATION_POST_COMPACTION_CONTROLLER_ID,
  cancelPendingDelegates,
  consumePendingDelegates,
  consumeStagedPostCompactionDelegates,
  enqueuePendingDelegate,
  pendingDelegateCount,
  resetDelegateStoreForTests,
  stagePostCompactionDelegate,
  stagedPostCompactionDelegateCount,
} from "./delegate-store.js";

function queueRawPendingFlow(sessionKey: string, stateJson: Record<string, unknown>): string {
  const flowId = `flow-${++flowIdCounter}`;
  mockFlows.set(flowId, {
    flowId,
    syncMode: "managed",
    ownerKey: sessionKey,
    controllerId: CONTINUATION_DELEGATE_CONTROLLER_ID,
    status: "queued",
    stateJson,
    goal: "raw pending delegate",
    currentStep: "Queued for continuation dispatch",
    revision: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return flowId;
}

beforeEach(() => {
  mockFlows.clear();
  flowIdCounter = 0;
  resetDelegateStoreForTests();
});

afterEach(() => {
  mockFlows.clear();
  resetDelegateStoreForTests();
  vi.useRealTimers();
});

describe("delegate store — TaskFlow-backed", () => {
  it("enqueues and consumes a pending delegate", () => {
    enqueuePendingDelegate("session-1", { task: "check CI" });

    expect(pendingDelegateCount("session-1")).toBe(1);
    const delegates = consumePendingDelegates("session-1");
    expect(delegates).toHaveLength(1);
    expect(delegates[0].task).toBe("check CI");
    expect(pendingDelegateCount("session-1")).toBe(0);
  });

  it("handles multi-delegate fan-out (FIFO order)", () => {
    enqueuePendingDelegate("session-1", { task: "task A" });
    enqueuePendingDelegate("session-1", { task: "task B" });
    enqueuePendingDelegate("session-1", { task: "task C" });

    const delegates = consumePendingDelegates("session-1");
    expect(delegates).toHaveLength(3);
    expect(delegates.map((d) => d.task)).toEqual(["task A", "task B", "task C"]);
  });

  it("isolates delegates by session", () => {
    enqueuePendingDelegate("session-1", { task: "for session 1" });
    enqueuePendingDelegate("session-2", { task: "for session 2" });

    expect(pendingDelegateCount("session-1")).toBe(1);
    expect(pendingDelegateCount("session-2")).toBe(1);
    expect(consumePendingDelegates("session-1")).toHaveLength(1);
    expect(consumePendingDelegates("session-2")).toHaveLength(1);
  });

  it("returns empty array when no delegates queued", () => {
    expect(consumePendingDelegates("empty-session")).toEqual([]);
  });

  it("preserves mode flags through TaskFlow round-trip", () => {
    enqueuePendingDelegate("session-1", {
      task: "silent task",
      mode: "silent-wake",
    });

    const delegates = consumePendingDelegates("session-1");
    expect(delegates[0]).toMatchObject({
      task: "silent task",
      mode: "silent-wake",
    });
  });

  it("decodes legacy silent and silentWake dual-flag rows as silent-wake", () => {
    const flowId = queueRawPendingFlow("session-1", {
      kind: "continuation_delegate",
      task: "legacy silent wake task",
      silent: true,
      silentWake: true,
    });

    const delegates = consumePendingDelegates("session-1");
    expect(delegates).toEqual([
      expect.objectContaining({
        task: "legacy silent wake task",
        mode: "silent-wake",
      }),
    ]);
    expect(mockFlows.get(flowId)?.status).toBe("succeeded");
  });

  it("rejects malformed multi-flag rows instead of choosing precedence", () => {
    const flowId = queueRawPendingFlow("session-1", {
      kind: "continuation_delegate",
      task: "malformed mode task",
      silent: true,
      postCompaction: true,
    });

    expect(consumePendingDelegates("session-1")).toEqual([]);
    expect(mockFlows.get(flowId)?.status).toBe("failed");
  });

  it("cancels all delegates (regular + post-compaction)", () => {
    enqueuePendingDelegate("session-1", { task: "regular" });
    stagePostCompactionDelegate("session-1", { task: "post-compact", stagedAt: Date.now() });

    expect(pendingDelegateCount("session-1")).toBe(1);
    expect(stagedPostCompactionDelegateCount("session-1")).toBe(1);

    cancelPendingDelegates("session-1");

    expect(pendingDelegateCount("session-1")).toBe(0);
    expect(stagedPostCompactionDelegateCount("session-1")).toBe(0);
  });

  it("uses correct controller IDs", () => {
    enqueuePendingDelegate("session-1", { task: "regular" });
    stagePostCompactionDelegate("session-1", { task: "post-compact", stagedAt: Date.now() });

    const flows = [...mockFlows.values()];
    expect(flows[0].controllerId).toBe(CONTINUATION_DELEGATE_CONTROLLER_ID);
    expect(flows[1].controllerId).toBe(CONTINUATION_POST_COMPACTION_CONTROLLER_ID);
  });

  it("reports global continuation queue depth and drain-rate diagnostics", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    enqueuePendingDelegate("session-1", { task: "due" });
    enqueuePendingDelegate("session-1", { task: "future", delayMs: 60_000 });
    stagePostCompactionDelegate("session-2", { task: "post-compact", stagedAt: 1_000 });
    queueRawPendingFlow("session-3", {
      kind: "continuation_delegate",
      task: "invalid flags",
      silent: true,
      postCompaction: true,
    });

    const first = getDiagnosticContinuationQueueMetrics(1_000);
    expect(first).toMatchObject({
      totalQueued: 4,
      pendingQueued: 3,
      pendingRunnable: 1,
      pendingScheduled: 1,
      stagedPostCompaction: 1,
      invalidQueued: 1,
      enqueuedSinceLastSample: 0,
      drainedSinceLastSample: 0,
      failedSinceLastSample: 0,
    });
    expect(first?.topQueues[0]).toMatchObject({
      sessionKey: "session-1",
      totalQueued: 2,
    });

    vi.setSystemTime(2_000);
    expect(consumePendingDelegates("session-1")).toHaveLength(1);

    const second = getDiagnosticContinuationQueueMetrics(2_000);
    expect(second).toMatchObject({
      totalQueued: 3,
      pendingQueued: 2,
      pendingRunnable: 0,
      pendingScheduled: 1,
      stagedPostCompaction: 1,
      invalidQueued: 1,
      enqueuedSinceLastSample: 0,
      drainedSinceLastSample: 1,
      failedSinceLastSample: 0,
      drainRatePerMinute: 60,
    });
    expect(second?.queueDepthHistory.map((point) => point.totalQueued)).toEqual([4, 3]);
  });
});

describe("post-compaction delegate staging", () => {
  it("stages and consumes post-compaction delegates", () => {
    stagePostCompactionDelegate("session-1", { task: "rehydrate state", stagedAt: 1000 });

    expect(stagedPostCompactionDelegateCount("session-1")).toBe(1);
    const delegates = consumeStagedPostCompactionDelegates("session-1");
    expect(delegates).toHaveLength(1);
    expect(delegates[0].task).toBe("rehydrate state");
    expect(delegates[0].mode).toBe("post-compaction");
    expect(stagedPostCompactionDelegateCount("session-1")).toBe(0);
  });

  it("preserves firstArmedAt across post-compaction TaskFlow storage", () => {
    stagePostCompactionDelegate("session-1", {
      task: "old shard",
      stagedAt: 20_000,
      firstArmedAt: 10_000,
    });

    const delegates = consumeStagedPostCompactionDelegates("session-1");
    expect(delegates[0]).toMatchObject({
      task: "old shard",
      mode: "post-compaction",
      firstArmedAt: 10_000,
    });
  });

  it("does not mix regular and post-compaction delegates", () => {
    enqueuePendingDelegate("session-1", { task: "regular" });
    stagePostCompactionDelegate("session-1", { task: "post-compact", stagedAt: 1000 });

    const regular = consumePendingDelegates("session-1");
    const postCompact = consumeStagedPostCompactionDelegates("session-1");
    expect(regular).toHaveLength(1);
    expect(regular[0].task).toBe("regular");
    expect(postCompact).toHaveLength(1);
    expect(postCompact[0].task).toBe("post-compact");
  });
});

describe("consumePendingDelegates — delayMs gating (swim-35/A2)", () => {
  it("leaves an unmatured delegate (delayMs in the future) in queued state", () => {
    enqueuePendingDelegate("session-1", { task: "future", delayMs: 60_000 });

    const matured = consumePendingDelegates("session-1");
    expect(matured).toEqual([]);
    expect(pendingDelegateCount("session-1")).toBe(1);
  });

  it("drains a matured delegate (delayMs elapsed)", () => {
    enqueuePendingDelegate("session-1", { task: "due", delayMs: 0 });

    const matured = consumePendingDelegates("session-1");
    expect(matured).toHaveLength(1);
    expect(matured[0].task).toBe("due");
    expect(pendingDelegateCount("session-1")).toBe(0);
  });

  it("drains matured entries and re-parks unmatured entries in the same call", () => {
    enqueuePendingDelegate("session-1", { task: "due", delayMs: 0 });
    enqueuePendingDelegate("session-1", { task: "future", delayMs: 60_000 });

    const matured = consumePendingDelegates("session-1");
    expect(matured.map((d) => d.task)).toEqual(["due"]);
    // The unmatured entry stays queued for the next consume cycle.
    expect(pendingDelegateCount("session-1")).toBe(1);
  });

  it("treats omitted delayMs as zero (matures immediately, preserves legacy behavior)", () => {
    enqueuePendingDelegate("session-1", { task: "no-delay" });

    const matured = consumePendingDelegates("session-1");
    expect(matured).toHaveLength(1);
    expect(matured[0].task).toBe("no-delay");
  });
});

describe("peekSoonestUnmaturedDelegateDueAt (swim-35/A2)", () => {
  it("returns undefined when no entries are queued", async () => {
    const { peekSoonestUnmaturedDelegateDueAt } = await import("./delegate-store.js");
    expect(peekSoonestUnmaturedDelegateDueAt("empty")).toBeUndefined();
  });

  it("returns undefined when all queued entries are already due", async () => {
    const { peekSoonestUnmaturedDelegateDueAt } = await import("./delegate-store.js");
    enqueuePendingDelegate("session-1", { task: "due", delayMs: 0 });
    expect(peekSoonestUnmaturedDelegateDueAt("session-1")).toBeUndefined();
  });

  it("returns the soonest dueAt across multiple unmatured entries", async () => {
    const { peekSoonestUnmaturedDelegateDueAt } = await import("./delegate-store.js");
    const before = Date.now();
    enqueuePendingDelegate("session-1", { task: "far", delayMs: 120_000 });
    enqueuePendingDelegate("session-1", { task: "near", delayMs: 30_000 });
    enqueuePendingDelegate("session-1", { task: "mid", delayMs: 60_000 });

    const soonest = peekSoonestUnmaturedDelegateDueAt("session-1");
    expect(soonest).toBeDefined();
    // Soonest should be the 30s one — within tolerance of `before + 30000`.
    expect(soonest!).toBeGreaterThanOrEqual(before + 30_000);
    expect(soonest!).toBeLessThan(before + 30_000 + 5_000);
  });
});
