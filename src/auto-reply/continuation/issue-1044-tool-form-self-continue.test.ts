// karmaterminal/openclaw#1044 — TOOL-FORM (leg B) regression repro.
//
// A delegate-child session calling `continue_work()` schedules a wake whose
// HOP1 driver run has already terminated by the time the wake matures (that
// is the *expected* state — continue_work is "same session, next turn"). The
// #990 bucket-1 orphan-reap in work-dispatch.ts treats the child's terminated
// HOP1 subagent-run as evidence that no rehydration is possible and culls the
// wake. The wake itself drives the next turn directly via getReplyFromConfig
// (see `driveContinuationTurn`) — there is no spawning-parent that needs to
// re-spawn — so the reap is a false-positive on the self-continue path.
//
// figs's settled intent (#sprites-of-thornfield 1516841690): "a
// continue_delegate child is a session like any other and should
// self-continue." The wake must drive HOP2 in the child's own session.
//
// This file is the GREEN-gate regression guard for the tool surface. The
// matching token-surface repro lives in
// `subagent-announce.continuation-1044-bare-token-self-continue.test.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (mirror work-dispatch.test.ts so the dispatch loop is exercised
// without booting the real config/session/reply stack). ---------------------

const turnGrants: unknown[] = [];
const systemEvents: unknown[] = [];
const activeSessions = new Set<string>();
let mainQueueSize = 0;
let gatewayDraining = false;
const mockSessionStore: Record<string, unknown> = {};

vi.mock("../../config/config.js", () => ({
  getRuntimeConfig: () => ({ session: { store: "test-store" } }),
}));

vi.mock("../../config/sessions/paths.js", () => ({
  resolveStorePath: () => "test-store",
}));

vi.mock("../../config/sessions/store-load.js", () => ({
  loadSessionStore: () => mockSessionStore,
}));

vi.mock("../../config/sessions/store-entry.js", () => ({
  resolveSessionStoreEntry: ({
    store,
    sessionKey,
  }: {
    store: Record<string, unknown>;
    sessionKey: string;
  }) => {
    const normalizedKey = sessionKey.trim();
    return {
      normalizedKey,
      existing: store[normalizedKey] ?? store[sessionKey],
      legacyKeys: normalizedKey === sessionKey ? [] : [sessionKey],
    };
  },
}));

vi.mock("../../sessions/session-key-utils.js", () => ({
  parseAgentSessionKey: (sessionKey: string) => {
    const match = /^agent:([^:]+)/.exec(sessionKey);
    return match ? { agentId: match[1] } : undefined;
  },
}));

vi.mock("../reply/reply-run-registry.js", () => ({
  replyRunRegistry: {
    isActive: (sessionKey: string) => activeSessions.has(sessionKey),
  },
}));

vi.mock("../../process/command-queue.js", () => ({
  getQueueSize: () => mainQueueSize,
  isGatewayDraining: () => gatewayDraining,
}));

vi.mock("../reply/get-reply.js", () => ({
  getReplyFromConfig: vi.fn(async (context: unknown, options: unknown, cfg: unknown) => {
    turnGrants.push({ context, options, cfg });
    return [{ text: "ok" }];
  }),
}));

vi.mock("../../infra/heartbeat-runner.js", () => {
  throw new Error("continuation_work dispatch must not use the heartbeat runner");
});

vi.mock("../../infra/heartbeat-wake.js", () => ({
  isRetryableHeartbeatBusySkipReason: (reason: string) => reason === "requests-in-flight",
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEvent: (text: string, options: unknown) => {
    systemEvents.push({ text, options });
  },
}));

vi.mock("../../infra/continuation-tracer.js", () => ({
  emitContinuationWorkFireSpan: vi.fn(),
  emitContinuationWorkSpan: vi.fn(),
}));

vi.mock("./config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config.js")>();
  return {
    ...actual,
    resolveContinuationRuntimeConfig: () => ({
      enabled: true,
      maxChainLength: 8,
      maxDelegatesPerTurn: 4,
      maxPendingWork: 32,
      defaultDelayMs: 1_000,
      minDelayMs: 1_000,
      maxDelayMs: 60_000,
      costCapTokens: 0,
      crossSessionTargeting: "enabled",
      busySkipBackoff: { baseMs: 1_000, ceilingMs: 60_000, factor: 2 },
    }),
  };
});

vi.mock("../../logging/subsystem.js", () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };
  return { createSubsystemLogger: () => logger };
});

// Minimal task-flow-registry mock matching work-dispatch.test.ts. The work
// store calls the registry when enqueuing/finishing flows.
type MockFlow = {
  flowId: string;
  syncMode: "managed";
  ownerKey: string;
  controllerId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  notifyPolicy: "silent";
  goal: string;
  currentStep?: string;
  stateJson?: unknown;
  revision: number;
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
};

const mockFlows = new Map<string, MockFlow>();
let flowCounter = 0;

function cloneFlow(flow: MockFlow): MockFlow {
  return { ...flow };
}

vi.mock("../../tasks/task-flow-registry.js", () => ({
  createManagedTaskFlow: vi.fn((params: Partial<MockFlow> & { ownerKey: string }) => {
    const now = Date.now();
    const flow: MockFlow = {
      flowId: `flow-${++flowCounter}`,
      syncMode: "managed",
      ownerKey: params.ownerKey,
      controllerId: params.controllerId ?? "tests/controller",
      status: params.status ?? "queued",
      notifyPolicy: "silent",
      goal: params.goal ?? "goal",
      currentStep: params.currentStep,
      stateJson: params.stateJson,
      revision: 0,
      createdAt: params.createdAt ?? now,
      updatedAt: params.updatedAt ?? params.createdAt ?? now,
    };
    mockFlows.set(flow.flowId, flow);
    return cloneFlow(flow);
  }),
  listTaskFlowsForOwnerKey: vi.fn((ownerKey: string) =>
    Array.from(
      [...mockFlows.values()].filter((flow) => flow.ownerKey === ownerKey),
      cloneFlow,
    ),
  ),
  listTaskFlowRecords: vi.fn(() => Array.from(mockFlows.values(), cloneFlow)),
  getTaskFlowById: vi.fn((flowId: string) => {
    const flow = mockFlows.get(flowId);
    return flow ? cloneFlow(flow) : undefined;
  }),
  updateFlowRecordByIdExpectedRevision: vi.fn(
    (params: { flowId: string; expectedRevision: number; patch: Partial<MockFlow> }) => {
      const flow = mockFlows.get(params.flowId);
      if (!flow || flow.revision !== params.expectedRevision) {
        return { applied: false, reason: flow ? "revision_conflict" : "not_found" };
      }
      Object.assign(flow, params.patch, { revision: flow.revision + 1 });
      return { applied: true, flow: cloneFlow(flow) };
    },
  ),
  finishFlow: vi.fn(
    (params: {
      flowId: string;
      expectedRevision: number;
      currentStep?: string;
      stateJson?: unknown;
      updatedAt?: number;
      endedAt?: number;
    }) => {
      const flow = mockFlows.get(params.flowId);
      if (!flow || flow.revision !== params.expectedRevision) {
        return { applied: false, reason: flow ? "revision_conflict" : "not_found" };
      }
      const endedAt = params.endedAt ?? params.updatedAt ?? Date.now();
      flow.status = "succeeded";
      flow.currentStep = params.currentStep;
      flow.stateJson = params.stateJson ?? flow.stateJson;
      flow.updatedAt = params.updatedAt ?? endedAt;
      flow.endedAt = endedAt;
      flow.revision += 1;
      return { applied: true, flow: cloneFlow(flow) };
    },
  ),
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

import { subagentRuns } from "../../agents/subagent-registry-memory.js";
import type { SubagentRunRecord } from "../../agents/subagent-registry.types.js";
import { resetSubagentSessionCleanupForTests } from "../../agents/subagent-session-cleanup.js";
import {
  dispatchPendingContinuationWork,
  resetContinuationWorkDispatchForTests,
} from "./work-dispatch.js";
import { enqueuePendingWork } from "./work-store.js";

function addSubagentRun(childSessionKey: string, overrides: Partial<SubagentRunRecord> = {}): void {
  const runId = overrides.runId ?? `run-${childSessionKey}-${subagentRuns.size + 1}`;
  subagentRuns.set(runId, {
    runId,
    childSessionKey,
    requesterSessionKey: overrides.requesterSessionKey ?? "agent:main:requester",
    requesterDisplayKey: overrides.requesterDisplayKey ?? "requester",
    task: overrides.task ?? "delegated task",
    cleanup: overrides.cleanup ?? "keep",
    createdAt: overrides.createdAt ?? Date.now(),
    ...overrides,
  });
}

function flowFor(sessionKey: string): MockFlow | undefined {
  return [...mockFlows.values()].find((f) => f.ownerKey === sessionKey);
}

describe("#1044 delegate-child self-continue via continue_work TOOL form", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
    turnGrants.length = 0;
    systemEvents.length = 0;
    activeSessions.clear();
    mainQueueSize = 0;
    gatewayDraining = false;
    for (const key of Object.keys(mockSessionStore)) {
      delete mockSessionStore[key];
    }
    mockFlows.clear();
    flowCounter = 0;
    subagentRuns.clear();
    resetContinuationWorkDispatchForTests();
    resetSubagentSessionCleanupForTests();
  });

  afterEach(() => {
    subagentRuns.clear();
    resetContinuationWorkDispatchForTests();
    resetSubagentSessionCleanupForTests();
    vi.useRealTimers();
  });

  // The repro: a delegate-child schedules continue_work on its OWN session. At
  // dispatch time the child's spawn-init HOP1 subagent-run record carries
  // `endedAt` (HOP1 is over — that is BY DESIGN; continue_work fires after the
  // emitting run completes). Force a single busy-skip so the dispatch loop
  // reaches the bucket-1 reaper. Before #1044's fix the reaper culls the wake
  // because `parentLiveness === "confident-terminal"` for the child's session;
  // after the fix the wake survives, requeues, and the next tick drives HOP2.
  it("does NOT reap a tool-form self-continue wake when HOP1 has ended (#1044)", async () => {
    const childSessionKey = "agent:main:subagent:1044-tool-child";
    mockSessionStore[childSessionKey] = { sessionKey: childSessionKey };

    // The spawn-init wrote a subagent-run record for HOP1. The child finished
    // HOP1 — its run record now has endedAt → "confident-terminal" liveness.
    addSubagentRun(childSessionKey, {
      runId: "child-hop1-run",
      endedAt: Date.now() - 1,
    });

    // The continue_work() tool from inside HOP1 enqueued this wake. The
    // parentRunId is the run that scheduled it (the child's own HOP1 runId,
    // per attempt-execution.ts:scheduleSpawnInitContinueWorkWake and
    // agent-runner.ts:scheduleContinuationWorkBatch).
    enqueuePendingWork({
      sessionKey: childSessionKey,
      hop: 2,
      delayMs: 0,
      electedAt: Date.now(),
      dueAt: Date.now(),
      maxChainLength: 8,
      parentRunId: "child-hop1-run",
      reason: "self-continue from delegate-child",
    });

    // Force a single PRE-drive busy-skip — exactly the path #1044 hits in
    // production (parent's announce-of-child is queued in the main lane the
    // instant HOP1 ends, so getQueueSize(main) > 0 trips
    // "requests-in-flight"). Same shape as the existing bucket-1 reap tests.
    activeSessions.add(childSessionKey);

    const result = await dispatchPendingContinuationWork({ sessionKey: childSessionKey });

    // The wake MUST survive the dispatch — never reaped.
    expect(result.reaped).toBe(0);

    // The flow MUST remain queued (rate-cap quiesce) so the next dispatch can
    // drive it.
    const flow = flowFor(childSessionKey);
    expect(flow?.status).toBe("queued");
    expect(flow?.currentStep?.startsWith("reaped:")).toBe(false);

    // Quiet the busy condition and let the rearm fire — HOP2 must execute.
    activeSessions.clear();
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(turnGrants).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          SessionKey: childSessionKey,
          Body: expect.stringContaining("self-continue from delegate-child"),
        }),
        options: expect.objectContaining({
          continuationTrigger: "work-wake",
          parentRunId: "child-hop1-run",
        }),
      }),
    ]);
  });
});
