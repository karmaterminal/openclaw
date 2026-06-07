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

// In-memory TaskFlow registry so the real store survives a "restart".
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

// The FULLY-DIRECT executor: dispatch must drive getReplyFromConfig, never
// runHeartbeatOnce / requestHeartbeatNow. Mock the universal executor.
const replyMocks = vi.hoisted(() => ({
  getReplyFromConfig: vi.fn(
    async (_ctx: unknown, _opts: unknown): Promise<{ text: string } | undefined> => ({
      text: "hop ran",
    }),
  ),
}));
vi.mock("../reply/get-reply.js", () => ({
  getReplyFromConfig: replyMocks.getReplyFromConfig,
}));

// Concurrency guard is the SESSION's own active reply run only.
const replyRunMocks = vi.hoisted(() => ({ isActive: vi.fn((_key: string) => false) }));
vi.mock("../reply/reply-run-registry.js", () => ({
  replyRunRegistry: { isActive: replyRunMocks.isActive },
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
  replyMocks.getReplyFromConfig.mockReset();
  replyMocks.getReplyFromConfig.mockResolvedValue({ text: "hop ran" });
  replyRunMocks.isActive.mockReset();
  replyRunMocks.isActive.mockReturnValue(false);
  systemEventMocks.enqueueSystemEvent.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("dispatchContinuationWork (fully-direct, off heartbeat substrate #952)", () => {
  it("drives getReplyFromConfig for the subagent, injects the wake event, finalizes on completion", async () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0, reason: "keep going" });
    const fired = dispatchContinuationWork({ sessionKey: SESSION, parentRunId: "run-1" });
    expect(fired).toBe(1);

    // BLOCKING3: the [continuation:wake] context is injected at dispatch.
    expect(systemEventMocks.enqueueSystemEvent).toHaveBeenCalledTimes(1);
    const [wakeText, wakeOpts] = systemEventMocks.enqueueSystemEvent.mock.calls[0];
    expect(wakeText).toContain("[continuation:wake] Turn 2/200");
    expect(wakeText).toContain("Reason: keep going");
    expect(wakeOpts).toEqual({ sessionKey: SESSION, trusted: true });

    await vi.advanceTimersByTimeAsync(0);
    // Drove the UNIVERSAL executor for the SUBAGENT session (not runHeartbeatOnce).
    expect(replyMocks.getReplyFromConfig).toHaveBeenCalledTimes(1);
    const [ctx, opts] = replyMocks.getReplyFromConfig.mock.calls[0] as [
      { SessionKey?: string; Body?: string },
      { continuationTrigger?: string; parentRunId?: string },
    ];
    expect(ctx.SessionKey).toBe(SESSION);
    expect(opts.continuationTrigger).toBe("work-wake");
    expect(opts.parentRunId).toBe("run-1");
    // Finalized on completion.
    expect(flowCount(SESSION)).toBe(0);
  });

  it("runs hop-2 even when the PARENT main lane is busy (no CommandLane gate — distinguishes the cut)", async () => {
    // The fully-direct path has NO CommandLane.Main check; only the session's own
    // reply run matters. A busy parent lane must NOT block hop-2.
    replyRunMocks.isActive.mockImplementation((key: string) => key !== SESSION && false);
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 });
    dispatchContinuationWork({ sessionKey: SESSION });
    await vi.advanceTimersByTimeAsync(0);
    expect(replyMocks.getReplyFromConfig).toHaveBeenCalledTimes(1);
    expect(flowCount(SESSION)).toBe(0);
  });

  it("does not drive when the election has not matured", () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 60_000, electedAt: T0 });
    expect(dispatchContinuationWork({ sessionKey: SESSION })).toBe(0);
    expect(replyMocks.getReplyFromConfig).not.toHaveBeenCalled();
  });

  it("is LOSSLESS while the session's OWN run is active: election stays queued, retries, then runs", async () => {
    replyRunMocks.isActive
      .mockReturnValueOnce(true) // first drive: session busy with its own turn
      .mockReturnValue(false); // retry: idle
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 });

    dispatchContinuationWork({ sessionKey: SESSION });
    await vi.advanceTimersByTimeAsync(0);
    // Busy => not driven yet; election stays durably queued (restart-safe).
    expect(replyMocks.getReplyFromConfig).not.toHaveBeenCalled();
    expect(statusOf(SESSION)).toBe("queued");

    await vi.advanceTimersByTimeAsync(2_000);
    expect(replyMocks.getReplyFromConfig).toHaveBeenCalledTimes(1);
    expect(flowCount(SESSION)).toBe(0);
  });

  it("keeps the election durably queued after the busy-retry budget (never silently lost)", async () => {
    replyRunMocks.isActive.mockReturnValue(true);
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 });
    dispatchContinuationWork({ sessionKey: SESSION });
    await vi.advanceTimersByTimeAsync(2_000 * 35);
    expect(replyMocks.getReplyFromConfig).not.toHaveBeenCalled();
    expect(statusOf(SESSION)).toBe("queued");
  });

  it("retries on admission-skip (undefined result + session now active), not finalize", async () => {
    // Drive #1: session idle at pre-check, but getReplyFromConfig returns
    // undefined AND the session is now active => admission-skipped, not run.
    // Drive #2: idle and runs.
    replyRunMocks.isActive
      .mockReturnValueOnce(false) // pre-check #1: idle -> drive
      .mockReturnValueOnce(true) // post-call #1: active -> admission-skip
      .mockReturnValue(false); // pre-check #2: idle -> drive + run
    replyMocks.getReplyFromConfig
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue({ text: "hop ran" });
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 });

    dispatchContinuationWork({ sessionKey: SESSION });
    await vi.advanceTimersByTimeAsync(0);
    // Admission-skipped => NOT finalized; election stays durably queued.
    expect(statusOf(SESSION)).toBe("queued");

    await vi.advanceTimersByTimeAsync(2_000);
    expect(replyMocks.getReplyFromConfig).toHaveBeenCalledTimes(2);
    expect(flowCount(SESSION)).toBe(0);
  });
});

describe("recoverPendingContinuationWork (restart durability, #952)", () => {
  it("re-drives a matured election and re-injects its wake event on boot", async () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 - 5_000 });
    const summary = recoverPendingContinuationWork({ now: T0 });
    expect(summary.dispatched).toBe(1);
    expect(systemEventMocks.enqueueSystemEvent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(replyMocks.getReplyFromConfig).toHaveBeenCalledTimes(1);
    expect(flowCount(SESSION)).toBe(0);
  });

  it("re-arms a delayed election so it still fires on time after a restart", async () => {
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 60 * 60_000, electedAt: T0 });
    const summary = recoverPendingContinuationWork({ now: T0 });
    expect(summary.sessions).toBe(1);
    expect(summary.dispatched).toBe(0);
    expect(replyMocks.getReplyFromConfig).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(replyMocks.getReplyFromConfig).toHaveBeenCalledTimes(1);
  });

  it("honors the continuation deny-gate (disabled => no replay)", () => {
    configMocks.enabled = false;
    enqueueContinuationWork(SESSION, { hop: 2, delayMs: 0, electedAt: T0 - 5_000 });
    const summary = recoverPendingContinuationWork({ now: T0 });
    expect(summary).toEqual({ sessions: 0, dispatched: 0 });
    expect(replyMocks.getReplyFromConfig).not.toHaveBeenCalled();
  });
});
