import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the TaskFlow registry before importing the store.
const mockFlows = new Map<string, Record<string, unknown>>();
let flowIdCounter = 0;

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
  listTaskFlowsForOwnerKey: vi.fn((ownerKey: string) =>
    [...mockFlows.values()].filter((f) => f.ownerKey === ownerKey),
  ),
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

import {
  CONTINUATION_DELEGATE_CONTROLLER_ID,
  CONTINUATION_POST_COMPACTION_CONTROLLER_ID,
  cancelPendingDelegates,
  consumePendingDelegates,
  consumeStagedPostCompactionDelegates,
  enqueuePendingDelegate,
  pendingDelegateCount,
  stagePostCompactionDelegate,
  stagedPostCompactionDelegateCount,
} from "./delegate-store.js";

beforeEach(() => {
  mockFlows.clear();
  flowIdCounter = 0;
});

afterEach(() => {
  mockFlows.clear();
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
      delayMs: 5000,
    });

    const delegates = consumePendingDelegates("session-1");
    expect(delegates[0]).toMatchObject({
      task: "silent task",
      silentWake: true,
      mode: "silent-wake",
    });
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
});

// Swim-34 row A2 — TaskFlow-backed pending delegate persistence.
// Row: swims/swim-34-formal-matrix/rows/A2-taskflow-pending-delegate-persistence.md
// Anchors: delegate-store.ts:131-148 (enqueue), 156-187 (consume + revision/decode guards),
//          190-192 (count). A2.5 FIFO already covered by 'handles multi-delegate fan-out'.
describe("row A2 — TaskFlow persistence sub-invariants", () => {
  it("A2.1b enqueuePendingDelegate({mode:'post-compaction'}) writes with POST_COMPACTION controller", () => {
    enqueuePendingDelegate("session-1", { task: "alt-flag", mode: "post-compaction" });
    const flows = [...mockFlows.values()];
    expect(flows).toHaveLength(1);
    expect(flows[0].controllerId).toBe(CONTINUATION_POST_COMPACTION_CONTROLLER_ID);
  });

  it("A2.1c enqueuePendingDelegate({postCompaction:true}) writes with POST_COMPACTION controller", () => {
    enqueuePendingDelegate("session-1", { task: "alt-flag-2", postCompaction: true });
    const flows = [...mockFlows.values()];
    expect(flows).toHaveLength(1);
    expect(flows[0].controllerId).toBe(CONTINUATION_POST_COMPACTION_CONTROLLER_ID);
  });

  it("A2.2 pendingDelegateCount stable across repeat calls (no consumption)", () => {
    enqueuePendingDelegate("session-1", { task: "a" });
    enqueuePendingDelegate("session-1", { task: "b" });
    enqueuePendingDelegate("session-1", { task: "c" });
    const c1 = pendingDelegateCount("session-1");
    const c2 = pendingDelegateCount("session-1");
    const c3 = pendingDelegateCount("session-1");
    expect(c1).toBe(3);
    expect(c2).toBe(3);
    expect(c3).toBe(3);
  });

  it("A2.3 consume skips flows where finishFlow.applied is false (revision conflict)", async () => {
    const taskFlowReg = await import("../../tasks/task-flow-registry.js");
    const finishFlowSpy = vi.mocked(taskFlowReg.finishFlow);
    const realImpl = finishFlowSpy.getMockImplementation();
    if (!realImpl) {
      throw new Error("finishFlow mock impl missing");
    }

    enqueuePendingDelegate("session-1", { task: "will-conflict" });
    enqueuePendingDelegate("session-1", { task: "will-apply" });

    let callCount = 0;
    finishFlowSpy.mockImplementation((params) => {
      callCount += 1;
      if (callCount === 1) {
        return { applied: false, reason: "revision_conflict" };
      }
      return realImpl(params);
    });

    const consumed = consumePendingDelegates("session-1");
    expect(consumed).toHaveLength(1);
    expect(consumed[0].task).toBe("will-apply");

    finishFlowSpy.mockImplementation(realImpl);
  });

  it("A2.4 consume marks corrupt-payload flows via failFlow with exact blockedSummary, omits from return", async () => {
    const taskFlowReg = await import("../../tasks/task-flow-registry.js");
    const failFlowSpy = vi.mocked(taskFlowReg.failFlow);
    failFlowSpy.mockClear();

    enqueuePendingDelegate("session-1", { task: "good" });
    enqueuePendingDelegate("session-1", { task: "will-corrupt" });
    enqueuePendingDelegate("session-1", { task: "good-2" });

    // Corrupt the middle flow's stateJson so decodeDelegateState returns null/undefined.
    const flows = [...mockFlows.values()];
    (flows[1] as { stateJson: string }).stateJson = "{not valid delegate state";

    const consumed = consumePendingDelegates("session-1");
    expect(consumed).toHaveLength(2);
    expect(consumed.map((d) => d.task)).toEqual(["good", "good-2"]);

    // failFlow called exactly once with the exact blockedSummary string from impl.
    expect(failFlowSpy).toHaveBeenCalledTimes(1);
    expect(failFlowSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        blockedSummary: "Pending continuation delegate payload could not be decoded.",
      }),
    );
    expect(flows[1].status).toBe("failed");
  });

  // A2.5 FIFO order: covered by existing 'handles multi-delegate fan-out (FIFO order)'.
});

describe("post-compaction delegate staging", () => {
  it("stages and consumes post-compaction delegates", () => {
    stagePostCompactionDelegate("session-1", { task: "rehydrate state", stagedAt: 1000 });

    expect(stagedPostCompactionDelegateCount("session-1")).toBe(1);
    const delegates = consumeStagedPostCompactionDelegates("session-1");
    expect(delegates).toHaveLength(1);
    expect(delegates[0].task).toBe("rehydrate state");
    expect(delegates[0].postCompaction).toBe(true);
    expect(stagedPostCompactionDelegateCount("session-1")).toBe(0);
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
