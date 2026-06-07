// Continuation-cleanup gate tests cover #952: while a same-session continue_work
// continuation is pending, subagent cleanup must defer so the child session
// store entry survives for the continuation wake (hop 2+). Once the chain ends,
// the normal announce/cleanup runs exactly once.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearContinuationWakeDispatching,
  hasContinuationWakeDispatching,
  hasLiveContinuationWorkWakeTimerRefs,
  markContinuationWakeDispatching,
  registerContinuationTimerHandle,
  resetContinuationStateForTests,
  unregisterContinuationTimerHandle,
} from "../auto-reply/continuation/state.js";
import type { CallGatewayOptions } from "../gateway/call.js";
import { SUBAGENT_ENDED_REASON_COMPLETE } from "./subagent-lifecycle-events.js";
import { buildContinuationCleanupDeferralResolver } from "./subagent-registry-cleanup.js";
import { createSubagentRegistryLifecycleController } from "./subagent-registry-lifecycle.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

type LifecycleControllerParams = Parameters<typeof createSubagentRegistryLifecycleController>[0];

const gatewayMocks = vi.hoisted(() => ({
  callGateway: vi.fn(async (_opts: CallGatewayOptions) => ({})),
}));

const helperMocks = vi.hoisted(() => ({
  persistSubagentSessionTiming: vi.fn(async () => {}),
  safeRemoveAttachmentsDir: vi.fn(async () => {}),
  logAnnounceGiveUp: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
  log: vi.fn(),
}));

vi.mock("../tasks/detached-task-runtime.js", () => ({
  completeTaskRunByRunId: vi.fn(),
  failTaskRunByRunId: vi.fn(),
  setDetachedTaskDeliveryStatusByRunId: vi.fn(),
}));

vi.mock("../sessions/session-lifecycle-events.js", () => ({
  emitSessionLifecycleEvent: vi.fn(),
}));

vi.mock("../browser-lifecycle-cleanup.js", () => ({
  cleanupBrowserSessionsForLifecycleEnd: vi.fn(async () => {}),
}));

vi.mock("./agent-bundle-mcp-tools.js", () => ({
  retireSessionMcpRuntimeForSessionKey: vi.fn(async () => true),
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime: {
    log: runtimeMocks.log,
  },
}));

vi.mock("../utils/delivery-context.js", () => ({
  normalizeDeliveryContext: (origin: unknown) => origin ?? "agent",
}));

vi.mock("./subagent-announce.js", () => ({
  captureSubagentCompletionReply: vi.fn(async () => undefined),
  runSubagentAnnounceFlow: vi.fn(async () => true),
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

const CHILD_SESSION_KEY = "agent:main:subagent:child";

function createRunEntry(overrides: Partial<SubagentRunRecord> = {}): SubagentRunRecord {
  return {
    runId: "run-1",
    childSessionKey: CHILD_SESSION_KEY,
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "continue working",
    cleanup: "keep",
    createdAt: 1_000,
    startedAt: 2_000,
    endedAt: 3_000,
    endedReason: SUBAGENT_ENDED_REASON_COMPLETE,
    expectsCompletionMessage: true,
    ...overrides,
  };
}

function createController({
  entry,
  runs = new Map([[entry.runId, entry]]),
  ...overrides
}: {
  entry: SubagentRunRecord;
  runs?: Map<string, SubagentRunRecord>;
} & Partial<LifecycleControllerParams>) {
  const params: LifecycleControllerParams = {
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
    captureSubagentCompletionReply: vi.fn(async () => "final completion reply"),
    runSubagentAnnounceFlow: vi.fn(async () => true),
    warn: vi.fn(),
  };
  Object.assign(params, overrides);
  return { controller: createSubagentRegistryLifecycleController(params), params };
}

function calledSessionsDelete(): boolean {
  return gatewayMocks.callGateway.mock.calls.some(([opts]) => opts?.method === "sessions.delete");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetContinuationStateForTests();
});

afterEach(() => {
  vi.useRealTimers();
  resetContinuationStateForTests();
});

describe("startSubagentAnnounceCleanupFlow continuation gate (#952)", () => {
  it("(a) does not clean up an already-announced run while a continuation is pending", () => {
    const entry = createRunEntry({
      delivery: { status: "delivered", announcedAt: 100 },
    });
    const { controller } = createController({
      entry,
      resolveContinuationCleanupDeferral: () => ({ kind: "defer-continuation", delayMs: 5_000 }),
    });

    const handled = controller.startSubagentAnnounceCleanupFlow(entry.runId, entry);

    expect(handled).toBe(true);
    // Gate returns before begin/finalize: the run is neither marked handled nor
    // completed, and the announced-delivery fast path never fires.
    expect(entry.cleanupHandled).toBeUndefined();
    expect(entry.cleanupCompletedAt).toBeUndefined();
    expect(gatewayMocks.callGateway).not.toHaveBeenCalled();
  });

  it('(b) retains a cleanup:"delete" subagent session while a continuation is pending', () => {
    const runs = new Map<string, SubagentRunRecord>();
    const entry = createRunEntry({
      cleanup: "delete",
      expectsCompletionMessage: false,
    });
    runs.set(entry.runId, entry);
    const { controller } = createController({
      entry,
      runs,
      resolveContinuationCleanupDeferral: () => ({ kind: "defer-continuation", delayMs: 5_000 }),
    });

    controller.startSubagentAnnounceCleanupFlow(entry.runId, entry);

    // The session store entry must survive for the continuation wake: no
    // sessions.delete is issued and the run record stays in the registry.
    expect(calledSessionsDelete()).toBe(false);
    expect(runs.has(entry.runId)).toBe(true);
    expect(entry.cleanupHandled).toBeUndefined();
    expect(entry.cleanupCompletedAt).toBeUndefined();
  });

  it("(d) runs cleanup exactly once after the continuation chain ends", async () => {
    vi.useFakeTimers();
    const runs = new Map<string, SubagentRunRecord>();
    const entry = createRunEntry({
      cleanup: "delete",
      expectsCompletionMessage: false,
    });
    runs.set(entry.runId, entry);
    let pending = true;
    const { controller } = createController({
      entry,
      runs,
      resolveContinuationCleanupDeferral: () =>
        pending ? { kind: "defer-continuation", delayMs: 5_000 } : undefined,
    });

    controller.startSubagentAnnounceCleanupFlow(entry.runId, entry);
    expect(calledSessionsDelete()).toBe(false);
    expect(runs.has(entry.runId)).toBe(true);

    // Chain ends: the recheck timer re-enters the flow, which now proceeds to
    // delete the session and remove the run record exactly once.
    pending = false;
    await vi.advanceTimersByTimeAsync(5_000);

    const deleteCalls = gatewayMocks.callGateway.mock.calls.filter(
      ([opts]) => opts?.method === "sessions.delete",
    );
    expect(deleteCalls).toHaveLength(1);
    expect(runs.has(entry.runId)).toBe(false);

    // No further rechecks remain scheduled.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(
      gatewayMocks.callGateway.mock.calls.filter(([opts]) => opts?.method === "sessions.delete"),
    ).toHaveLength(1);
  });

  it("(f) headline: a live continue_work wake ref defers cleanup, and re-entry runs once the ref clears", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const runs = new Map<string, SubagentRunRecord>();
    const entry = createRunEntry({
      cleanup: "delete",
      expectsCompletionMessage: false,
      endedAt: Date.now(),
    });
    runs.set(entry.runId, entry);

    // Hop 1's continue_work arms a real work-wake timer for the child session.
    const workWakeHandle = setTimeout(() => {}, 5_000);
    registerContinuationTimerHandle(CHILD_SESSION_KEY, workWakeHandle, "work-wake");
    expect(hasLiveContinuationWorkWakeTimerRefs(CHILD_SESSION_KEY)).toBe(true);

    // The wake is still in flight (queued, then a hop reply running) after the
    // timer ref releases — model that via the heartbeat/reply signals.
    let heartbeatWakePending = false;
    let replyRunActive = false;
    const resolver = buildContinuationCleanupDeferralResolver({
      hasLiveWorkWakeTimer: (sessionKey) => hasLiveContinuationWorkWakeTimerRefs(sessionKey),
      hasPendingHeartbeatWake: () => heartbeatWakePending,
      isReplyRunActive: () => replyRunActive,
      hasContinuationWakeDispatching: (sessionKey) => hasContinuationWakeDispatching(sessionKey),
      resolveRetentionHardExpiryMs: () => 360_000,
      recheckDelayMs: 5_000,
    });
    const { controller } = createController({
      entry,
      runs,
      resolveContinuationCleanupDeferral: resolver,
    });

    // Subagent reports done; cleanup must defer because the work-wake ref is live.
    controller.startSubagentAnnounceCleanupFlow(entry.runId, entry);
    expect(calledSessionsDelete()).toBe(false);
    expect(runs.has(entry.runId)).toBe(true);

    // The timer fires: ref releases, but the wake is now queued (race window).
    unregisterContinuationTimerHandle(CHILD_SESSION_KEY, workWakeHandle);
    clearTimeout(workWakeHandle);
    heartbeatWakePending = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calledSessionsDelete()).toBe(false);
    expect(runs.has(entry.runId)).toBe(true);

    // Hop 2's heartbeat turn starts running (still defers).
    heartbeatWakePending = false;
    replyRunActive = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calledSessionsDelete()).toBe(false);
    expect(runs.has(entry.runId)).toBe(true);

    // Chain ends: nothing pending, so cleanup finally proceeds exactly once.
    replyRunActive = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(
      gatewayMocks.callGateway.mock.calls.filter(([opts]) => opts?.method === "sessions.delete"),
    ).toHaveLength(1);
    expect(runs.has(entry.runId)).toBe(false);
  });

  it("(g) gap: the dispatching marker alone defers across the real pendingWakes.clear→active window (#952)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const runs = new Map<string, SubagentRunRecord>();
    const entry = createRunEntry({
      cleanup: "delete",
      expectsCompletionMessage: false,
      endedAt: Date.now(),
    });
    runs.set(entry.runId, entry);

    // Wire the resolver to the REAL continuation-state singleton — the exact
    // predicate the production registry composes. No stubbed booleans and no
    // manufactured heartbeatWakePending→replyRunActive overlap (the prior
    // headline masked the gap that way): the only signal exercised here is the
    // genuine dispatching marker the heartbeat wake handler sets synchronously.
    const resolver = buildContinuationCleanupDeferralResolver({
      hasLiveWorkWakeTimer: (sessionKey) => hasLiveContinuationWorkWakeTimerRefs(sessionKey),
      hasPendingHeartbeatWake: () => false,
      isReplyRunActive: () => false,
      hasContinuationWakeDispatching: (sessionKey) => hasContinuationWakeDispatching(sessionKey),
      resolveRetentionHardExpiryMs: () => 360_000,
      recheckDelayMs: 5_000,
    });
    const { controller } = createController({
      entry,
      runs,
      resolveContinuationCleanupDeferral: resolver,
    });

    // The exact tick the residual race fires in: the continue_work timer already
    // fired (no work-wake ref), `pendingWakes.clear()` already ran (no queued
    // wake), and the reply run is not active yet. The wake handler's first
    // synchronous statement set the dispatching marker — replicate that here.
    markContinuationWakeDispatching(CHILD_SESSION_KEY);
    expect(hasLiveContinuationWorkWakeTimerRefs(CHILD_SESSION_KEY)).toBe(false);
    expect(hasContinuationWakeDispatching(CHILD_SESSION_KEY)).toBe(true);

    // A recheck poll landing in the gap must STILL defer (pre-fix: deleted the
    // child session mid-chain, reintroducing #952).
    controller.startSubagentAnnounceCleanupFlow(entry.runId, entry);
    expect(calledSessionsDelete()).toBe(false);
    expect(runs.has(entry.runId)).toBe(true);

    // Still dispatching on the next recheck → still defers.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calledSessionsDelete()).toBe(false);
    expect(runs.has(entry.runId)).toBe(true);

    // Handler returns and this turn armed no hop N+1 timer: the marker clears and
    // every signal is false, so cleanup proceeds exactly once.
    clearContinuationWakeDispatching(CHILD_SESSION_KEY);
    expect(hasContinuationWakeDispatching(CHILD_SESSION_KEY)).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(
      gatewayMocks.callGateway.mock.calls.filter(([opts]) => opts?.method === "sessions.delete"),
    ).toHaveLength(1);
    expect(runs.has(entry.runId)).toBe(false);
  });
});
