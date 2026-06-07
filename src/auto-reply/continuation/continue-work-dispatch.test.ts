import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Continuation is enabled for recovery. Isolated: continue-work-dispatch is the
// only module in this graph that imports `resolveContinuationRuntimeConfig`.
vi.mock("./config.js", () => ({
  resolveContinuationRuntimeConfig: () => ({ enabled: true }),
}));

// Capture the heartbeat re-entry wakes the dispatch fires.
const heartbeatCalls: Array<{ sessionKey?: string; reason?: string; parentRunId?: string }> = [];
vi.mock("../../infra/heartbeat-wake.js", () => ({
  requestHeartbeatNow: vi.fn((opts) => {
    heartbeatCalls.push(opts);
  }),
}));

// In-memory TaskFlow registry. Records are NOT cleared between recovery passes,
// so "restart" is modeled by re-running recovery against the surviving records.
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
  getTaskFlowById: vi.fn((flowId: string) => mockFlows.get(flowId)),
  updateFlowRecordByIdExpectedRevision: vi.fn(
    (params: { flowId: string; expectedRevision: number; patch: Record<string, unknown> }) => {
      const flow = mockFlows.get(params.flowId);
      if (!flow || flow.revision !== params.expectedRevision) {
        return { applied: false, reason: flow ? "revision_conflict" : "not_found" };
      }
      Object.assign(flow, params.patch);
      flow.revision = flow.revision + 1;
      return { applied: true, flow: { ...flow } };
    },
  ),
  failFlow: vi.fn(() => ({ applied: true })),
  finishFlow: vi.fn(() => ({ applied: true })),
  deleteTaskFlowRecordById: vi.fn((flowId: string) => {
    mockFlows.delete(flowId);
  }),
}));

import {
  dispatchContinuationWork,
  recoverPendingContinuationWork,
} from "./continue-work-dispatch.js";
import { enqueueContinuationWork } from "./continue-work-store.js";
import { resetContinuationStateForTests } from "./state.js";

const SESSION = "subagent:child-1";

beforeEach(() => {
  mockFlows.clear();
  flowIdCounter = 0;
  heartbeatCalls.length = 0;
  resetContinuationStateForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("dispatchContinuationWork", () => {
  it("fires a continuation heartbeat re-entry wake for a matured election", () => {
    enqueueContinuationWork(SESSION, { hop: 1, delayMs: 0, electedAt: 1_000 });
    const fired = dispatchContinuationWork({
      sessionKey: SESSION,
      now: 1_000,
      parentRunId: "run-1",
    });
    expect(fired).toBe(1);
    expect(heartbeatCalls).toEqual([
      { sessionKey: SESSION, reason: "continuation", parentRunId: "run-1" },
    ]);
  });

  it("does not fire when nothing has matured", () => {
    enqueueContinuationWork(SESSION, { hop: 1, delayMs: 10_000, electedAt: 1_000 });
    expect(dispatchContinuationWork({ sessionKey: SESSION, now: 1_000 })).toBe(0);
    expect(heartbeatCalls).toHaveLength(0);
  });
});

describe("recoverPendingContinuationWork (restart durability)", () => {
  it("replays an election that matured during downtime after a simulated restart", () => {
    // Elected before the crash with a 5s delay (dueAt = 6_000).
    enqueueContinuationWork(SESSION, { hop: 1, delayMs: 5_000, electedAt: 1_000 });

    // Gateway restarts; the volatile timer is gone. The durable record survives
    // (mockFlows is untouched). Recovery runs after downtime — now past dueAt.
    const summary = recoverPendingContinuationWork({ now: 7_000 });

    expect(summary).toEqual({ sessions: 1, dispatched: 1 });
    expect(heartbeatCalls).toEqual([{ sessionKey: SESSION, reason: "continuation" }]);
  });

  it("re-arms a hedge timer for a still-unmatured delayed election so it fires on time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    // Elected with a 10s delay (dueAt = 11_000), not yet matured at restart.
    enqueueContinuationWork(SESSION, { hop: 1, delayMs: 10_000, electedAt: 1_000 });

    const summary = recoverPendingContinuationWork();
    expect(summary).toEqual({ sessions: 1, dispatched: 0 });
    expect(heartbeatCalls).toHaveLength(0);

    // The hedge timer fires at maturity even though the original timer was lost.
    vi.advanceTimersByTime(6_000);
    expect(heartbeatCalls).toEqual([{ sessionKey: SESSION, reason: "continuation" }]);
  });

  it("re-fires a running election orphaned mid-dispatch by the crash", () => {
    enqueueContinuationWork(SESSION, { hop: 1, delayMs: 0, electedAt: 1_000 });
    // Dispatched (queued→running) just before the crash; the wake never re-entered.
    dispatchContinuationWork({ sessionKey: SESSION, now: 1_000 });
    heartbeatCalls.length = 0;

    const summary = recoverPendingContinuationWork({ now: 2_000 });
    expect(summary).toEqual({ sessions: 1, dispatched: 1 });
    expect(heartbeatCalls).toEqual([{ sessionKey: SESSION, reason: "continuation" }]);
  });
});
