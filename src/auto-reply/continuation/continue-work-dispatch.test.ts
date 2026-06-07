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
  failFlow: vi.fn(() => ({ applied: true })),
  deleteTaskFlowRecordById: vi.fn((flowId: string) => {
    mockFlows.delete(flowId);
  }),
}));

const heartbeatMocks = vi.hoisted(() => ({
  runHeartbeatOnce: vi.fn(
    async (): Promise<
      | { status: "ran"; durationMs: number }
      | { status: "skipped"; reason: string }
      | { status: "failed"; reason: string }
    > => ({ status: "ran", durationMs: 0 }),
  ),
}));
vi.mock("../../infra/heartbeat-runner.js", () => ({
  runHeartbeatOnce: heartbeatMocks.runHeartbeatOnce,
}));

const systemEventMocks = vi.hoisted(() => ({
  enqueueSystemEvent: vi.fn(
    (_text: string, _opts: { sessionKey?: string; trusted?: boolean }) => true,
  ),
}));
vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEvent: systemEventMocks.enqueueSystemEvent,
}));

const configMocks = vi.hoisted(() => ({ enabled: true }));
vi.mock("./config.js", () => ({
  resolveContinuationRuntimeConfig: () => ({ enabled: configMocks.enabled, maxChainLength: 200 }),
}));

import {
  dispatchContinuationWork,
  recoverPendingContinuationWork,
} from "./continue-work-dispatch.js";
import { enqueueContinuationWork } from "./continue-work-store.js";

const SESSION = "agent:main:subagent:continuation-child";
const T0 = 1_700_000_000_000;

function statusOf(sessionKey: string): string | undefined {
  return [...mockFlows.values()].find((f) => f.ownerKey === sessionKey)?.status;
}

function flowCount(sessionKey: string): number {
  return [...mockFlows.values()].filter((f) => f.ownerKey === sessionKey).length;
}

beforeEach(() => {
  mockFlows.clear();
  flowIdCounter = 0;
  configMocks.enabled = true;
  heartbeatMocks.runHeartbeatOnce.mockReset();
  heartbeatMocks.runHeartbeatOnce.mockResolvedValue({ status: "ran", durationMs: 0 });
  systemEventMocks.enqueueSystemEvent.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("dispatchContinuationWork", () => {
  it("drives the turn directly (not requestHeartbeatNow), injects the wake event, finalizes on ran", async () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0, reason: "keep going" });
    const fired = dispatchContinuationWork({ sessionKey: SESSION, parentRunId: "run-1" });
    expect(fired).toBe(1);
    // BLOCKING3: the [continuation:wake] context is injected at dispatch.
    expect(systemEventMocks.enqueueSystemEvent).toHaveBeenCalledTimes(1);
    const [wakeText, wakeOpts] = systemEventMocks.enqueueSystemEvent.mock.calls[0];
    expect(wakeText).toContain("[continuation:wake] Turn 2/200");
    expect(wakeText).toContain("Reason: keep going");
    expect(wakeOpts).toEqual({ sessionKey: SESSION, trusted: true });
    // Drives the per-session executor directly with intent immediate.
    expect(heartbeatMocks.runHeartbeatOnce).toHaveBeenCalledWith({
      sessionKey: SESSION,
      reason: "continuation",
      intent: "immediate",
      parentRunId: "run-1",
    });
    // On a successful turn the election is finalized (deleted).
    await vi.advanceTimersByTimeAsync(0);
    expect(flowCount(SESSION)).toBe(0);
  });

  it("does not drive when the election has not matured", () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 60_000, electedAt: T0 });
    expect(dispatchContinuationWork({ sessionKey: SESSION })).toBe(0);
    expect(heartbeatMocks.runHeartbeatOnce).not.toHaveBeenCalled();
    expect(systemEventMocks.enqueueSystemEvent).not.toHaveBeenCalled();
  });

  it("is LOSSLESS across a busy retry: election stays queued until the turn runs (#952 BLOCKING2)", async () => {
    heartbeatMocks.runHeartbeatOnce
      .mockResolvedValueOnce({ status: "skipped", reason: "requests-in-flight" })
      .mockResolvedValueOnce({ status: "ran", durationMs: 0 });
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 });

    dispatchContinuationWork({ sessionKey: SESSION });
    await vi.advanceTimersByTimeAsync(0);
    // Busy skip => election NOT consumed; it stays durably queued (restart-safe).
    expect(statusOf(SESSION)).toBe("queued");
    expect(flowCount(SESSION)).toBe(1);

    // The retry fires and the turn runs; only now is the election finalized.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(heartbeatMocks.runHeartbeatOnce).toHaveBeenCalledTimes(2);
    expect(flowCount(SESSION)).toBe(0);
  });

  it("keeps the election durably queued after the busy-retry budget (never silently lost)", async () => {
    heartbeatMocks.runHeartbeatOnce.mockResolvedValue({
      status: "skipped",
      reason: "requests-in-flight",
    });
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 });
    dispatchContinuationWork({ sessionKey: SESSION });
    // Exhaust the retry budget (30 x 2s) plus margin.
    await vi.advanceTimersByTimeAsync(2_000 * 35);
    // Still queued => boot recovery will re-drive it; not silently dropped.
    expect(statusOf(SESSION)).toBe("queued");
    expect(flowCount(SESSION)).toBe(1);
  });
});

describe("recoverPendingContinuationWork (restart durability, #952)", () => {
  it("re-drives a matured election and re-injects its wake event on boot", async () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 - 5_000 });
    const summary = recoverPendingContinuationWork({ now: T0 });
    expect(summary.dispatched).toBe(1);
    expect(heartbeatMocks.runHeartbeatOnce).toHaveBeenCalledTimes(1);
    // BLOCKING3: a recovered turn gets the [continuation:wake] context too.
    expect(systemEventMocks.enqueueSystemEvent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(flowCount(SESSION)).toBe(0);
  });

  it("re-arms a delayed election so it still fires on time after a restart", async () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 60 * 60_000, electedAt: T0 });
    const summary = recoverPendingContinuationWork({ now: T0 });
    expect(summary.sessions).toBe(1);
    expect(summary.dispatched).toBe(0);
    expect(heartbeatMocks.runHeartbeatOnce).not.toHaveBeenCalled();
    expect(statusOf(SESSION)).toBe("queued");

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(heartbeatMocks.runHeartbeatOnce).toHaveBeenCalledTimes(1);
  });

  it("honors the continuation deny-gate (disabled => no replay)", () => {
    configMocks.enabled = false;
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 - 5_000 });
    const summary = recoverPendingContinuationWork({ now: T0 });
    expect(summary).toEqual({ sessions: 0, dispatched: 0 });
    expect(heartbeatMocks.runHeartbeatOnce).not.toHaveBeenCalled();
  });
});
