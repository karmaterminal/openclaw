import { describe, expect, it, vi } from "vitest";
import { resetGatewayWorkAdmission } from "../../../process/gateway-work-admission.js";
import { AsyncWorkScope } from "../../../shared/async-work-scope.js";
import { settleRequesterCompletionBatch } from "../completion/subagent-completion-admission.store.js";
import {
  SubagentLifecycleController,
  type SubagentLifecycleOptions,
} from "./subagent-registry-lifecycle.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { requesterCompletionSettlementNeedsTask } from "./subagent-requester-settlement-task-owner.js";

// Keep completion, session cleanup, and transport outside this settlement proof.
vi.mock("./subagent-registry-lifecycle-completion.js", () => ({
  completeSubagentRunAttempt: vi.fn(),
}));
vi.mock("./subagent-registry-lifecycle-announce-cleanup.js", () => ({
  finalizeResumedAnnounceGiveUp: vi.fn(),
  resumeAncestorCleanup: vi.fn(),
  startSubagentAnnounceCleanupFlow: vi.fn(),
}));
vi.mock("./subagent-registry-requester-yield.js", () => ({
  settleRequesterTurnAfterSessionSpawns: vi.fn(),
}));
vi.mock("./subagent-registry-lifecycle-delivery.js", () => ({
  buildSafeLifecycleErrorMeta: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
  clearSubagentPendingDelivery: vi.fn(),
  markRequesterSettleWakePending: vi.fn(),
  maskLifecycleIdentifier: () => "synthetic",
  refreshFrozenResultFromSession: vi.fn(),
  safeSetSubagentTaskDeliveryStatus: vi.fn(),
}));
vi.mock("../completion/subagent-completion-admission.store.js", () => ({
  blockSubagentCompletionDelivery: vi.fn(),
  settleRequesterCompletionBatch: vi.fn(),
}));
vi.mock("../../agent-bundle-mcp-tools.js", () => ({
  retireSessionMcpRuntimeForSessionKey: vi.fn(),
}));
vi.mock("../../internal-session-effects.js", () => ({
  removeInternalSessionEffectsSession: vi.fn(),
}));
vi.mock("../requester-cron-authority.js", () => ({
  revokeRequesterCronAuthorityBatch: vi.fn(),
}));
vi.mock("./subagent-registry-memory.js", () => ({
  subagentRuns: { confirmRetirement: vi.fn() },
}));
vi.mock("../../../runtime.js", () => ({ defaultRuntime: { log: vi.fn() } }));
vi.mock("../../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

type Harness = {
  readonly controller: SubagentLifecycleController;
  readonly entry: SubagentRunRecord;
  readonly warn: ReturnType<typeof vi.fn>;
  readonly resolveSubagentTask: ReturnType<typeof vi.fn>;
  readonly persisted: string[][];
  readonly origin: AsyncWorkScope;
};

function buildHarness(
  taskLookup: "available" | "unavailable",
  wakeFailure: Error,
  options: {
    expectsCompletionMessage?: boolean;
    delivery?: SubagentRunRecord["delivery"];
  } = {},
): Harness {
  const entry: SubagentRunRecord = {
    runId: "rejection-run",
    childSessionKey: "agent:main:subagent:rejection-child",
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "return the child result",
    cleanup: "keep",
    createdAt: 1_000,
    execution: { status: "terminal", endedAt: 4_000 },
    expectsCompletionMessage: options.expectsCompletionMessage ?? false,
    delivery: options.delivery,
    requesterSettleWake: {
      status: "pending",
      attemptCount: 0,
      rearmGeneration: 1,
    },
  };
  const runs = new Map([[entry.runId, entry]]);
  const persisted: string[][] = [];
  const warn = vi.fn();
  const unexpected = async (): Promise<never> => {
    throw new Error("unexpected completion, cleanup, or transport effect");
  };
  const wake: SubagentLifecycleOptions["maybeWakeRequesterAfterAllChildrenSettled"] = async () => {
    throw wakeFailure;
  };
  const resolveSubagentTask = vi.fn<SubagentLifecycleOptions["resolveSubagentTask"]>(() =>
    taskLookup === "available"
      ? { lookup: "available", task: { taskId: "completion-task" } as never }
      : { lookup: "unavailable" },
  );
  const controller = new SubagentLifecycleController({
    runs,
    resumedRuns: new Set(),
    subagentAnnounceTimeoutMs: 1_000,
    getRuntimeConfig: () => ({}),
    persist: vi.fn(),
    persistOrThrow: (...runIds: string[]) => persisted.push(runIds),
    clearPendingLifecycleError: vi.fn(),
    countPendingDescendantRuns: () => 0,
    getLatestRunForChildSession: () => null,
    suppressAnnounceForSteerRestart: () => false,
    resolveSubagentTask,
    shouldEmitEndedHookForRun: () => false,
    emitSubagentEndedHookForRun: unexpected,
    emitSubagentProgressEndedForRun: unexpected,
    notifyContextEngineSubagentEnded: unexpected,
    retireSupersededRun: unexpected,
    resumeSubagentRun: vi.fn(),
    callGateway: unexpected,
    captureSubagentCompletionReply: unexpected,
    cleanupBrowserSessionsForLifecycleEnd: unexpected,
    runSubagentAnnounceFlow: unexpected,
    maybeWakeRequesterAfterAllChildrenSettled: wake,
    warn,
  });
  return { controller, entry, warn, resolveSubagentTask, persisted, origin: new AsyncWorkScope() };
}

function warnedMessages(warn: ReturnType<typeof vi.fn>): string[] {
  return warn.mock.calls.map((call) => String(call[0]));
}

describe("requester completion settlement task ownership", () => {
  const subagent = (input: Partial<SubagentRunRecord>): SubagentRunRecord =>
    ({
      runId: "settlement-owner-test",
      childSessionKey: "agent:main:subagent:settlement-owner-test",
      requesterSessionKey: "agent:main:main",
      task: "test settlement ownership",
      cleanup: "keep",
      createdAt: 1,
      execution: { status: "terminal", endedAt: 2 },
      requesterSettleWake: { status: "pending", attemptCount: 0 },
      ...input,
    }) as SubagentRunRecord;

  it.each([
    {
      name: "no completion message",
      entry: subagent({ expectsCompletionMessage: false }),
      outcome: { delivered: false, path: "none" as const },
      expected: false,
    },
    {
      name: "yielded requester",
      entry: subagent({ pauseReason: "sessions_yield", expectsCompletionMessage: true }),
      outcome: { delivered: false, path: "none" as const },
      expected: false,
    },
    {
      name: "pending completion delivery",
      entry: subagent({ expectsCompletionMessage: true, delivery: { status: "pending" } }),
      outcome: { delivered: false, path: "none" as const },
      expected: true,
    },
    {
      name: "failed completion delivery",
      entry: subagent({ expectsCompletionMessage: true, delivery: { status: "failed" } }),
      outcome: { delivered: false, path: "none" as const },
      expected: false,
    },
    {
      name: "expiry acknowledgement",
      entry: subagent({
        expectsCompletionMessage: true,
        delivery: { status: "suspended", suspendedReason: "expiry" },
      }),
      outcome: { delivered: true, path: "session" as const },
      expected: true,
    },
    {
      name: "failed expiry redrive",
      entry: subagent({
        expectsCompletionMessage: true,
        delivery: { status: "suspended", suspendedReason: "expiry" },
      }),
      outcome: { delivered: false, path: "none" as const },
      expected: false,
    },
  ])("returns $expected for $name", ({ entry, outcome, expected }) => {
    expect(requesterCompletionSettlementNeedsTask(entry, outcome)).toBe(expected);
  });
});

// karmaterminal/openclaw#1363. A requester settle wake that fails must be able to
// record its own rejection. It records that rejection through
// completeRequesterSettleWakeBatch with an outcome, which resolves the owning
// detached task FIRST and throws "subagent completion owner unavailable before
// settlement" when the lookup is not available. A task that has gone away does
// not come back, so that write throws on every later attempt and the row is never
// given a terminal state: it stays armed and re-fires for the life of the process.
//
// Observed on the silas seat as an exact 1:1 pair of "requester settle wake failed"
// and "failed to persist requester settle wake rejection" at a rigid 60s cadence
// (360 of each over three hours). The rigid 60s is itself the proof that
// deferWakeCommit's 30s/60s/120s backoff is NOT driving the loop, so
// pending.failures never accumulates across cycles and a ceiling on it could
// never fire.
//
// The unavailable-owner case must settle an ordinary no-completion-message wake
// without resolving a task owner: that settlement never reads a task record. A
// completion-message delivery still requires an available owner and remains
// protected by the first case's ordinary settlement contract.
describe("requester settle wake rejection write", () => {
  it("records the rejection through settlement when the completion owner is available", async () => {
    vi.clearAllMocks();
    resetGatewayWorkAdmission();
    const { controller, entry, warn, resolveSubagentTask, origin } = buildHarness(
      "available",
      new Error("wake transport refused"),
      {
        expectsCompletionMessage: true,
        delivery: { status: "pending", generation: 1 },
      },
    );
    try {
      origin.run(() => controller.resumeRequesterSettleWake(entry.runId, entry));
      await vi.waitFor(() => {
        expect(warnedMessages(warn)).toContain("requester settle wake failed");
      });
      // The rejection write succeeds, so the caller never observes a rethrow.
      expect(warnedMessages(warn)).not.toContain(
        "failed to persist requester settle wake rejection",
      );
      // The rejection reached settlement carrying the failed outcome. Disarming the
      // row is settleRequesterCompletionBatch's job and is mocked out of this proof;
      // what matters here is that the write was ATTEMPTED and did not throw.
      expect(settleRequesterCompletionBatch).toHaveBeenCalledTimes(1);
      const settled = vi.mocked(settleRequesterCompletionBatch).mock.calls[0]?.[0];
      expect(resolveSubagentTask).toHaveBeenCalledWith(entry);
      expect(settled?.outcome).toMatchObject({ delivered: false, path: "none" });
      expect(settled?.entries).toEqual([{ subagent: entry, taskId: "completion-task" }]);
    } finally {
      controller.clearScheduledResumeTimers();
      await origin.drain();
      resetGatewayWorkAdmission();
    }
  });

  it("still rejects a task-owned completion when its owner is gone", async () => {
    vi.clearAllMocks();
    resetGatewayWorkAdmission();
    const { controller, entry, warn, resolveSubagentTask, origin } = buildHarness(
      "unavailable",
      new Error("wake transport refused"),
      {
        expectsCompletionMessage: true,
        delivery: { status: "pending", generation: 1 },
      },
    );
    try {
      origin.run(() => controller.resumeRequesterSettleWake(entry.runId, entry));
      await vi.waitFor(() => {
        expect(warnedMessages(warn)).toContain("failed to persist requester settle wake rejection");
      });
      expect(resolveSubagentTask).toHaveBeenCalledWith(entry);
      expect(settleRequesterCompletionBatch).not.toHaveBeenCalled();
    } finally {
      controller.clearScheduledResumeTimers();
      await origin.drain();
      resetGatewayWorkAdmission();
    }
  });

  it("records a no-completion-message rejection when the task owner is gone", async () => {
    vi.clearAllMocks();
    resetGatewayWorkAdmission();
    const { controller, entry, warn, resolveSubagentTask, origin } = buildHarness(
      "unavailable",
      new Error("wake transport refused"),
    );
    try {
      origin.run(() => controller.resumeRequesterSettleWake(entry.runId, entry));
      await vi.waitFor(() => {
        expect(settleRequesterCompletionBatch).toHaveBeenCalledTimes(1);
      });
      const messages = warnedMessages(warn);
      expect(messages.filter((m) => m === "requester settle wake failed")).toHaveLength(1);
      expect(messages).not.toContain("failed to persist requester settle wake rejection");
      // This row does not have completion delivery semantics, so settlement
      // neither needs nor may require a task owner that has already gone away.
      expect(resolveSubagentTask).not.toHaveBeenCalled();
      const settled = vi.mocked(settleRequesterCompletionBatch).mock.calls[0]?.[0];
      expect(settled?.entries).toEqual([{ subagent: entry }]);
    } finally {
      controller.clearScheduledResumeTimers();
      await origin.drain();
      resetGatewayWorkAdmission();
    }
  });
});
