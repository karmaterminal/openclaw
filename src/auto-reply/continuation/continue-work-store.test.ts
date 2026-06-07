import { beforeEach, describe, expect, it, vi } from "vitest";

// Quiet logger; the decode-failure path emits a warn breadcrumb we don't assert.
vi.mock("../../logging/subsystem.js", () => {
  const noop = () => {};
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
  return { createSubsystemLogger: () => logger };
});

// In-memory stand-in for the TaskFlow registry the store persists through, so
// the test exercises the real store lifecycle without booting SQLite.
type MockFlow = {
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
};

const mockFlows = new Map<string, MockFlow>();
let flowIdCounter = 0;

vi.mock("../../tasks/task-flow-runtime-internal.js", () => ({
  createManagedTaskFlow: vi.fn(
    (params: {
      ownerKey: string;
      controllerId: string;
      stateJson: unknown;
      goal: string;
      currentStep: string;
    }) => {
      const flowId = `flow-${++flowIdCounter}`;
      const flow: MockFlow = {
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
      };
      mockFlows.set(flowId, flow);
      return { ...flow };
    },
  ),
  listTaskFlowsForOwnerKey: vi.fn((ownerKey: string) =>
    [...mockFlows.values()].filter((f) => f.ownerKey === ownerKey),
  ),
  listTaskFlowRecords: vi.fn(() => [...mockFlows.values()]),
  failFlow: vi.fn((params: { flowId: string }) => {
    const flow = mockFlows.get(params.flowId);
    if (flow) {
      flow.status = "failed";
      flow.revision += 1;
    }
    return { applied: Boolean(flow) };
  }),
  deleteTaskFlowRecordById: vi.fn((flowId: string) => {
    mockFlows.delete(flowId);
  }),
}));

import {
  CONTINUATION_WORK_CONTROLLER_ID,
  cancelContinuationWork,
  claimMaturedContinuationWork,
  enqueueContinuationWork,
  finalizeDispatchedContinuationWork,
  hasPendingContinuationWork,
  listPendingContinuationWorkSessionKeysForRecovery,
  peekSoonestUnmaturedContinuationWorkDueAt,
} from "./continue-work-store.js";

const SESSION = "agent:main:subagent:continuation-child";

function flowsFor(sessionKey: string): MockFlow[] {
  return [...mockFlows.values()].filter((f) => f.ownerKey === sessionKey);
}

beforeEach(() => {
  mockFlows.clear();
  flowIdCounter = 0;
});

describe("continue-work-store", () => {
  it("enqueues a queued election that pins the session", () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: 1_000 });
    const flows = flowsFor(SESSION);
    expect(flows).toHaveLength(1);
    expect(flows[0]?.controllerId).toBe(CONTINUATION_WORK_CONTROLLER_ID);
    expect(flows[0]?.status).toBe("queued");
    expect(hasPendingContinuationWork(SESSION)).toBe(true);
  });

  it("upserts: a re-election replaces the prior task (one per session)", () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: 1_000 });
    enqueueContinuationWork(SESSION, { hop: 3, delayMs: 0, electedAt: 2_000 });
    const flows = flowsFor(SESSION);
    expect(flows).toHaveLength(1);
    const state = flows[0]?.stateJson as { hop?: number } | undefined;
    expect(state?.hop).toBe(3);
  });

  it("claims a matured election WITHOUT mutating it (stays queued, lossless)", () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: 1_000 });
    const claimed = claimMaturedContinuationWork(SESSION, { now: 1_000 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.hop).toBe(2);
    // The election stays queued so a busy retry / crash / restart can re-drive it.
    expect(flowsFor(SESSION)[0]?.status).toBe("queued");
    expect(hasPendingContinuationWork(SESSION)).toBe(true);
    // Re-claiming returns it again (idempotent peek) until finalized.
    expect(claimMaturedContinuationWork(SESSION, { now: 1_000 })).toHaveLength(1);
  });

  it("does not claim an unmatured election; peek reports its dueAt", () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 60_000, electedAt: 1_000 });
    expect(claimMaturedContinuationWork(SESSION, { now: 1_000 })).toHaveLength(0);
    expect(flowsFor(SESSION)[0]?.status).toBe("queued");
    expect(peekSoonestUnmaturedContinuationWorkDueAt(SESSION, 1_000)).toBe(61_000);
  });

  it("finalize deletes the dispatched election and clears the pin", () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: 1_000 });
    const [claimed] = claimMaturedContinuationWork(SESSION, { now: 1_000 });
    finalizeDispatchedContinuationWork(claimed.flowId);
    expect(flowsFor(SESSION)).toHaveLength(0);
    expect(hasPendingContinuationWork(SESSION)).toBe(false);
    // Finalizing a stale id (e.g. after a re-election replaced it) is a safe no-op.
    enqueueContinuationWork(SESSION, { hop: 3, delayMs: 0, electedAt: 2_000 });
    finalizeDispatchedContinuationWork(claimed.flowId);
    expect(flowsFor(SESSION)).toHaveLength(1);
  });

  it("lists recovery session keys (deduped, sorted, queued only) and cancels all", () => {
    enqueueContinuationWork("agent:main:b", { hop: 2, delayMs: 0, electedAt: 1_000 });
    enqueueContinuationWork("agent:main:a", { hop: 2, delayMs: 60_000, electedAt: 1_000 });
    expect(listPendingContinuationWorkSessionKeysForRecovery()).toEqual([
      "agent:main:a",
      "agent:main:b",
    ]);
    cancelContinuationWork("agent:main:a");
    expect(listPendingContinuationWorkSessionKeysForRecovery()).toEqual(["agent:main:b"]);
  });
});
