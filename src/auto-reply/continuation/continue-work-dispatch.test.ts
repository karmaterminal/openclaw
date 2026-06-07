import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// In-memory TaskFlow registry so the real store survives a "restart" (the map
// stands in for durable SQLite rows that persist across the process boundary).
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
  updateFlowRecordByIdExpectedRevision: vi.fn(
    (params: { flowId: string; expectedRevision: number; patch: Record<string, unknown> }) => {
      const flow = mockFlows.get(params.flowId);
      if (!flow || flow.revision !== params.expectedRevision) {
        return { applied: false, reason: flow ? "revision_conflict" : "not_found" };
      }
      Object.assign(flow, params.patch);
      flow.revision += 1;
      return { applied: true, flow: { ...flow } };
    },
  ),
  failFlow: vi.fn(() => ({ applied: true })),
  deleteTaskFlowRecordById: vi.fn((flowId: string) => {
    mockFlows.delete(flowId);
  }),
}));

const heartbeatMocks = vi.hoisted(() => ({ requestHeartbeatNow: vi.fn() }));
vi.mock("../../infra/heartbeat-wake.js", () => ({
  requestHeartbeatNow: heartbeatMocks.requestHeartbeatNow,
}));

const configMocks = vi.hoisted(() => ({ enabled: true }));
vi.mock("./config.js", () => ({
  resolveContinuationRuntimeConfig: () => ({ enabled: configMocks.enabled }),
}));

import {
  dispatchContinuationWork,
  recoverPendingContinuationWork,
} from "./continue-work-dispatch.js";
import { consumeMaturedContinuationWork, enqueueContinuationWork } from "./continue-work-store.js";

const SESSION = "agent:main:subagent:continuation-child";
const T0 = 1_700_000_000_000;

function statusOf(sessionKey: string): string | undefined {
  return [...mockFlows.values()].find((f) => f.ownerKey === sessionKey)?.status;
}

beforeEach(() => {
  mockFlows.clear();
  flowIdCounter = 0;
  configMocks.enabled = true;
  heartbeatMocks.requestHeartbeatNow.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("dispatchContinuationWork", () => {
  it("fires a single continuation heartbeat wake for a matured election", () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 });
    const fired = dispatchContinuationWork({ sessionKey: SESSION, parentRunId: "run-1" });
    expect(fired).toBe(1);
    expect(heartbeatMocks.requestHeartbeatNow).toHaveBeenCalledTimes(1);
    expect(heartbeatMocks.requestHeartbeatNow).toHaveBeenCalledWith({
      sessionKey: SESSION,
      reason: "continuation",
      parentRunId: "run-1",
    });
    expect(statusOf(SESSION)).toBe("running");
  });

  it("does not fire when the election has not matured", () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 60_000, electedAt: T0 });
    expect(dispatchContinuationWork({ sessionKey: SESSION })).toBe(0);
    expect(heartbeatMocks.requestHeartbeatNow).not.toHaveBeenCalled();
  });
});

describe("recoverPendingContinuationWork (restart durability, #952/#956)", () => {
  it("re-arms a delayed election so it still fires on time after a restart", () => {
    // Elected before the (simulated) restart with an hour delay; its volatile
    // in-process timer is gone, but the durable task survived.
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 60 * 60_000, electedAt: T0 });

    const summary = recoverPendingContinuationWork({ now: T0 });
    expect(summary.sessions).toBe(1);
    expect(summary.dispatched).toBe(0);
    // Not yet due: no wake at recovery time.
    expect(heartbeatMocks.requestHeartbeatNow).not.toHaveBeenCalled();
    expect(statusOf(SESSION)).toBe("queued");

    // Advance to the elected maturity: the re-armed hedge fires the turn.
    vi.advanceTimersByTime(60 * 60_000);
    expect(heartbeatMocks.requestHeartbeatNow).toHaveBeenCalledTimes(1);
    expect(statusOf(SESSION)).toBe("running");
  });

  it("dispatches an election that matured during downtime immediately on boot", () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 - 5_000 });
    const summary = recoverPendingContinuationWork({ now: T0 });
    expect(summary.dispatched).toBe(1);
    expect(heartbeatMocks.requestHeartbeatNow).toHaveBeenCalledTimes(1);
  });

  it("purges an orphaned running election instead of re-firing it (no double-turn)", () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 });
    consumeMaturedContinuationWork(SESSION, { now: T0 }); // -> running (dispatched pre-restart)

    const summary = recoverPendingContinuationWork({ now: T0 });
    expect(summary.purged).toBe(1);
    expect(summary.dispatched).toBe(0);
    expect(heartbeatMocks.requestHeartbeatNow).not.toHaveBeenCalled();
    expect(statusOf(SESSION)).toBeUndefined();
  });

  it("honors the continuation deny-gate (disabled => no replay)", () => {
    configMocks.enabled = false;
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 - 5_000 });
    const summary = recoverPendingContinuationWork({ now: T0 });
    expect(summary).toEqual({ sessions: 0, dispatched: 0, purged: 0 });
    expect(heartbeatMocks.requestHeartbeatNow).not.toHaveBeenCalled();
  });
});
