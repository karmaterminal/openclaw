import { describe, expect, it, vi } from "vitest";
import { resetGatewayWorkAdmission } from "../../../process/gateway-work-admission.js";
import { AsyncWorkScope } from "../../../shared/async-work-scope.js";
import { settleRequesterCompletionBatch } from "../completion/subagent-completion-admission.store.js";
import {
  SubagentLifecycleController,
  type SubagentLifecycleOptions,
} from "./subagent-registry-lifecycle.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

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
  // Upstream 10e951e857 reads the settlement's publication receipt.
  settleRequesterCompletionBatch: vi.fn(async () => ({ applied: true, publication: "published" })),
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
  readonly persisted: string[][];
  readonly origin: AsyncWorkScope;
};

function buildHarness(wakeFailure: Error): Harness {
  const entry: SubagentRunRecord = {
    runId: "rejection-run",
    childSessionKey: "agent:main:subagent:rejection-child",
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "return the child result",
    cleanup: "keep",
    createdAt: 1_000,
    execution: { status: "terminal", endedAt: 4_000 },
    expectsCompletionMessage: false,
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
  const controller = new SubagentLifecycleController({
    runs,
    resumedRuns: new Set(),
    subagentAnnounceTimeoutMs: 1_000,
    getRuntimeConfig: () => ({}),
    persist: vi.fn(),
    persistOrThrow: (...runIds: string[]) => persisted.push(runIds),
    persistAsyncOrThrow: async (_context, _publication, ...runIds) => {
      persisted.push(runIds);
    },
    clearPendingLifecycleError: vi.fn(),
    countPendingDescendantRuns: async () => 0,
    getLatestRunForChildSession: () => null,
    suppressAnnounceForSteerRestart: () => false,
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
  return { controller, entry, warn, persisted, origin: new AsyncWorkScope() };
}

function warnedMessages(warn: ReturnType<typeof vi.fn>): string[] {
  return warn.mock.calls.map((call) => String(call[0]));
}

// karmaterminal/openclaw#1363. A requester settle wake that fails must be able to
// record its own rejection through completeRequesterSettleWakeBatch with an
// outcome. The seat defect (the rejection write resolving the owning detached task
// first and throwing "subagent completion owner unavailable before settlement"
// forever once that task was gone) was a Tasks-runtime owner lookup; upstream's
// Tasks/TaskFlow removal (6652f7eac8) deleted that lookup, so only the surviving
// contract is pinned here.
describe("requester settle wake rejection write", () => {
  it("records the rejection through settlement when the completion owner is available", async () => {
    vi.clearAllMocks();
    resetGatewayWorkAdmission();
    const { controller, entry, warn, origin } = buildHarness(new Error("wake transport refused"));
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
      expect(settled?.outcome).toMatchObject({ delivered: false, path: "none" });
      expect(settled?.entries.map((member) => member.subagent.runId)).toEqual(["rejection-run"]);
    } finally {
      controller.clearScheduledResumeTimers();
      await origin.drain();
      resetGatewayWorkAdmission();
    }
  });
});
