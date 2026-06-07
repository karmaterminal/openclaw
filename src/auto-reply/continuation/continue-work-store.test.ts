import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Logger mock so corrupt-payload breadcrumbs are inspectable.
const loggerRecords: Array<{ level: string; message: string }> = [];
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
  return { createSubsystemLogger: () => logger };
});

// In-memory TaskFlow registry mock — records survive across "restart" because
// we never clear `mockFlows` except in `beforeEach`.
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
  failFlow: vi.fn((params: { flowId: string; updatedAt?: number; endedAt?: number }) => {
    const flow = mockFlows.get(params.flowId);
    if (flow) {
      flow.status = "failed";
      flow.endedAt = params.endedAt ?? params.updatedAt ?? Date.now();
      flow.updatedAt = params.updatedAt ?? flow.endedAt;
      flow.revision = flow.revision + 1;
    }
    return { applied: Boolean(flow) };
  }),
  finishFlow: vi.fn(() => ({ applied: true })),
  deleteTaskFlowRecordById: vi.fn((flowId: string) => {
    mockFlows.delete(flowId);
  }),
}));

import {
  CONTINUATION_WORK_HANDOFF_GRACE_MS,
  cancelContinuationWork,
  consumeMaturedContinuationWork,
  enqueueContinuationWork,
  hasPendingContinuationWork,
  listPendingContinuationWorkSessionKeysForRecovery,
  peekSoonestUnmaturedContinuationWorkDueAt,
} from "./continue-work-store.js";

const SESSION = "subagent:child-1";

beforeEach(() => {
  mockFlows.clear();
  flowIdCounter = 0;
  loggerRecords.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("continue-work-store", () => {
  it("enqueues a queued election that pins the session", () => {
    enqueueContinuationWork(SESSION, { hop: 1, electedAt: 1_000 });
    expect([...mockFlows.values()]).toHaveLength(1);
    const flow = [...mockFlows.values()][0];
    expect(flow.status).toBe("queued");
    expect(flow.controllerId).toBe("core/continuation-work");
    expect(hasPendingContinuationWork(SESSION, 1_000)).toBe(true);
  });

  it("upserts: a re-election replaces the prior task (one task per session)", () => {
    enqueueContinuationWork(SESSION, { hop: 1, electedAt: 1_000 });
    enqueueContinuationWork(SESSION, { hop: 2, electedAt: 2_000 });
    const flows = [...mockFlows.values()];
    expect(flows).toHaveLength(1);
    expect((flows[0].stateJson as { hop: number }).hop).toBe(2);
  });

  it("consumes a matured queued election → running and returns it", () => {
    enqueueContinuationWork(SESSION, { hop: 1, delayMs: 5_000, electedAt: 1_000, reason: "more" });
    // Not matured yet (dueAt = 6_000).
    expect(consumeMaturedContinuationWork(SESSION, { now: 5_999 })).toHaveLength(0);
    const claimed = consumeMaturedContinuationWork(SESSION, { now: 6_000 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].hop).toBe(1);
    expect(claimed[0].reason).toBe("more");
    expect([...mockFlows.values()][0].status).toBe("running");
  });

  it("does not re-claim a running election without includeRunning", () => {
    enqueueContinuationWork(SESSION, { hop: 1, delayMs: 0, electedAt: 1_000 });
    expect(consumeMaturedContinuationWork(SESSION, { now: 1_000 })).toHaveLength(1);
    expect(consumeMaturedContinuationWork(SESSION, { now: 1_000 })).toHaveLength(0);
    expect(
      consumeMaturedContinuationWork(SESSION, { now: 1_000, includeRunning: true }),
    ).toHaveLength(1);
  });

  it("pins a running election only within the handoff grace", () => {
    enqueueContinuationWork(SESSION, { hop: 1, delayMs: 0, electedAt: 1_000 });
    consumeMaturedContinuationWork(SESSION, { now: 1_000 });
    expect(hasPendingContinuationWork(SESSION, 1_000 + CONTINUATION_WORK_HANDOFF_GRACE_MS)).toBe(
      true,
    );
    expect(
      hasPendingContinuationWork(SESSION, 1_000 + CONTINUATION_WORK_HANDOFF_GRACE_MS + 1),
    ).toBe(false);
  });

  it("a queued (unmatured, far-future) election pins for the whole delay", () => {
    enqueueContinuationWork(SESSION, { hop: 1, delayMs: 3_600_000, electedAt: 1_000 });
    expect(hasPendingContinuationWork(SESSION, 1_000)).toBe(true);
    expect(hasPendingContinuationWork(SESSION, 1_000 + 3_599_000)).toBe(true);
    expect(peekSoonestUnmaturedContinuationWorkDueAt(SESSION, 1_000)).toBe(3_601_000);
  });

  it("lists recovery session keys for queued and running elections", () => {
    enqueueContinuationWork("subagent:a", { hop: 1, delayMs: 1_000, electedAt: 1_000 });
    enqueueContinuationWork("subagent:b", { hop: 1, delayMs: 0, electedAt: 1_000 });
    consumeMaturedContinuationWork("subagent:b", { now: 1_000 });
    expect(listPendingContinuationWorkSessionKeysForRecovery()).toEqual([
      "subagent:a",
      "subagent:b",
    ]);
  });

  it("cancel removes all tasks for the session", () => {
    enqueueContinuationWork(SESSION, { hop: 1, electedAt: 1_000 });
    cancelContinuationWork(SESSION);
    expect([...mockFlows.values()]).toHaveLength(0);
    expect(hasPendingContinuationWork(SESSION, 1_000)).toBe(false);
  });

  it("fails (does not pin) a corrupt payload and logs a breadcrumb", () => {
    enqueueContinuationWork(SESSION, { hop: 1, delayMs: 0, electedAt: 1_000 });
    const flow = [...mockFlows.values()][0];
    flow.stateJson = { kind: "continuation_work" }; // missing required fields
    expect(consumeMaturedContinuationWork(SESSION, { now: 1_000 })).toHaveLength(0);
    expect(flow.status).toBe("failed");
    expect(loggerRecords.some((r) => r.message.includes("work-decode-failed"))).toBe(true);
  });
});
