// #952 fix-surface proof: while a durable `continue_work` continuation is still
// pending for a delegate subagent, the announce-cleanup flow must NOT delete the
// child session (deleting it strands the wake's hop-2 re-entry). Once the
// election clears, cleanup proceeds and the session is deleted normally.
//
// This drives `startSubagentAnnounceCleanupFlow` directly (the load-bearing
// surface per #952: the successful-announce/expectsCompletionMessage:false path
// deletes the session BEFORE `resolveDeferredCleanupDecision` is consulted). On
// pristine `a179` there is no gate, so cleanup deletes immediately even while a
// continuation is pending — these tests are RED there and GREEN with the fix.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallGatewayOptions } from "../gateway/call.js";
import { buildContinuationCleanupDeferralResolver } from "./subagent-registry-cleanup.js";
import { createSubagentRegistryLifecycleController } from "./subagent-registry-lifecycle.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

const taskExecutorMocks = vi.hoisted(() => ({
  completeTaskRunByRunId: vi.fn(),
  failTaskRunByRunId: vi.fn(),
  setDetachedTaskDeliveryStatusByRunId: vi.fn(),
}));
const gatewayMocks = vi.hoisted(() => ({
  callGateway: vi.fn(async (_opts: CallGatewayOptions) => ({})),
}));
const helperMocks = vi.hoisted(() => ({
  persistSubagentSessionTiming: vi.fn(async () => {}),
  safeRemoveAttachmentsDir: vi.fn(async () => {}),
  logAnnounceGiveUp: vi.fn(),
}));
const runtimeMocks = vi.hoisted(() => ({ log: vi.fn() }));

vi.mock("../tasks/detached-task-runtime.js", () => ({
  completeTaskRunByRunId: taskExecutorMocks.completeTaskRunByRunId,
  failTaskRunByRunId: taskExecutorMocks.failTaskRunByRunId,
  setDetachedTaskDeliveryStatusByRunId: taskExecutorMocks.setDetachedTaskDeliveryStatusByRunId,
}));
vi.mock("../sessions/session-lifecycle-events.js", () => ({ emitSessionLifecycleEvent: vi.fn() }));
vi.mock("../browser-lifecycle-cleanup.js", () => ({
  cleanupBrowserSessionsForLifecycleEnd: vi.fn(async () => {}),
}));
vi.mock("./agent-bundle-mcp-tools.js", () => ({
  retireSessionMcpRuntimeForSessionKey: vi.fn(async () => true),
}));
vi.mock("../runtime.js", () => ({ defaultRuntime: { log: runtimeMocks.log } }));
vi.mock("../utils/delivery-context.js", () => ({
  normalizeDeliveryContext: (origin: unknown) => origin ?? "agent",
}));
vi.mock("./subagent-announce.js", () => ({
  captureSubagentCompletionReply: vi.fn(async () => undefined),
  runSubagentAnnounceFlow: vi.fn(async () => false),
}));
vi.mock("./subagent-registry-helpers.js", () => ({
  ANNOUNCE_COMPLETION_HARD_EXPIRY_MS: 30 * 60_000,
  ANNOUNCE_EXPIRY_MS: 5 * 60_000,
  MAX_ANNOUNCE_RETRY_COUNT: 3,
  MIN_ANNOUNCE_RETRY_DELAY_MS: 1_000,
  capFrozenResultText: (text: string) => text.trim(),
  logAnnounceGiveUp: helperMocks.logAnnounceGiveUp,
  persistSubagentSessionTiming: helperMocks.persistSubagentSessionTiming,
  resolveAnnounceRetryDelayMs: (retryCount: number) =>
    Math.min(1_000 * 2 ** Math.max(0, retryCount - 1), 8_000),
  safeRemoveAttachmentsDir: helperMocks.safeRemoveAttachmentsDir,
}));

const CHILD_SESSION = "agent:main:subagent:continuation-child";
const RECHECK_MS = 5_000;

let continuationPending = true;
const finalizeContinuationCleanup = vi.fn();

function createDeleteModeEntry(): SubagentRunRecord {
  // delete-mode + no completion message => the announce-cleanup flow deletes the
  // session directly (the #952 strand path).
  return {
    runId: "run-1",
    childSessionKey: CHILD_SESSION,
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "self-chain via continue_work",
    cleanup: "delete",
    expectsCompletionMessage: false,
    createdAt: 1_000,
    startedAt: 2_000,
    endedAt: 3_000,
  };
}

function makeController(entry: SubagentRunRecord, runs: Map<string, SubagentRunRecord>) {
  return createSubagentRegistryLifecycleController({
    runs,
    resumedRuns: new Set(),
    subagentAnnounceTimeoutMs: 1_000,
    persist: vi.fn(),
    clearPendingLifecycleError: vi.fn(),
    countPendingDescendantRuns: () => 0,
    suppressAnnounceForSteerRestart: () => false,
    shouldEmitEndedHookForRun: () => false,
    emitSubagentEndedHookForRun: vi.fn(async () => {}),
    notifyContextEngineSubagentEnded: vi.fn(async () => {}),
    resumeSubagentRun: vi.fn(),
    callGateway: async <T = Record<string, unknown>>(opts: CallGatewayOptions): Promise<T> =>
      (await gatewayMocks.callGateway(opts)) as T,
    captureSubagentCompletionReply: vi.fn(async () => undefined),
    runSubagentAnnounceFlow: vi.fn(async () => false),
    // Real builder + controllable predicates: exercises the production resolver
    // wired in subagent-registry.ts, not a hand-rolled stub.
    resolveContinuationCleanupDeferral: buildContinuationCleanupDeferralResolver({
      hasPendingContinuationWork: () => continuationPending,
      isReplyRunActive: () => false,
      recheckDelayMs: RECHECK_MS,
    }),
    finalizeContinuationCleanup,
    warn: vi.fn(),
  });
}

function deleteCalls(): number {
  return gatewayMocks.callGateway.mock.calls.filter(
    ([opts]) => (opts as { method?: string } | undefined)?.method === "sessions.delete",
  ).length;
}

beforeEach(() => {
  vi.useFakeTimers();
  continuationPending = true;
  gatewayMocks.callGateway.mockClear();
  finalizeContinuationCleanup.mockClear();
  helperMocks.safeRemoveAttachmentsDir.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("subagent announce-cleanup continuation gate (#952)", () => {
  it("defers session deletion while a continue_work continuation is pending", async () => {
    const entry = createDeleteModeEntry();
    const runs = new Map([[entry.runId, entry]]);
    const controller = makeController(entry, runs);

    const handled = controller.startSubagentAnnounceCleanupFlow(entry.runId, entry);
    await vi.advanceTimersByTimeAsync(0);

    expect(handled).toBe(true);
    expect(deleteCalls()).toBe(0); // session-store entry survives => hop-2 can re-enter
    expect(entry.cleanupCompletedAt).toBeUndefined();
    expect(runs.has(entry.runId)).toBe(true);
    expect(finalizeContinuationCleanup).not.toHaveBeenCalled();
  });

  it("deletes the session once the continuation clears", async () => {
    continuationPending = false;
    const entry = createDeleteModeEntry();
    const runs = new Map([[entry.runId, entry]]);
    const controller = makeController(entry, runs);

    controller.startSubagentAnnounceCleanupFlow(entry.runId, entry);
    await vi.advanceTimersByTimeAsync(0);

    expect(deleteCalls()).toBe(1);
    expect(finalizeContinuationCleanup).toHaveBeenCalledWith(CHILD_SESSION);
  });

  it("auto-proceeds on the recheck timer after the chain settles", async () => {
    const entry = createDeleteModeEntry();
    const runs = new Map([[entry.runId, entry]]);
    const controller = makeController(entry, runs);

    controller.startSubagentAnnounceCleanupFlow(entry.runId, entry);
    await vi.advanceTimersByTimeAsync(0);
    expect(deleteCalls()).toBe(0);

    // Chain ends: the durable election is gone. The pending recheck re-attempts
    // cleanup and now proceeds to delete the (still-alive) session.
    continuationPending = false;
    await vi.advanceTimersByTimeAsync(RECHECK_MS);

    expect(deleteCalls()).toBe(1);
    expect(finalizeContinuationCleanup).toHaveBeenCalledWith(CHILD_SESSION);
  });
});
