// Continuation-cleanup gate regression for #952. While a same-session
// `continue_work` continuation is pending for a subagent, cleanup MUST defer so
// the child session store entry survives for the continuation wake (hop 2+).
// Once the chain ends, the normal announce/cleanup runs exactly once.
//
// PORTABLE RED→GREEN: this file imports NO new modules, so it loads on the
// pre-fix a179 basis too. It passes a `resolveContinuationCleanupDeferral` to
// the controller — the durable production resolver has this exact contract
// (`(entry, now) => { kind: "defer-continuation"; delayMs } | undefined`).
//   - a179 (pre-fix): the controller has no continuation gate and ignores the
//     extra param, so `startSubagentAnnounceCleanupFlow` deletes the child
//     session immediately while pending → the "no delete while pending"
//     assertions FAIL (RED), reproducing the stranded-hop bug.
//   - post-fix: the gate honors the resolver and defers → GREEN.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallGatewayOptions } from "../gateway/call.js";
import { SUBAGENT_ENDED_REASON_COMPLETE } from "./subagent-lifecycle-events.js";
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
const runtimeMocks = vi.hoisted(() => ({ log: vi.fn() }));

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
vi.mock("../runtime.js", () => ({ defaultRuntime: { log: runtimeMocks.log } }));
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

// Hand-rolled resolver with the production contract: defer while `isPending()`
// returns true, otherwise proceed. (The production builder ORs the durable
// `hasPendingContinuationWork` store query with `replyRunRegistry.isActive`.)
function makeDeferralResolver(isPending: () => boolean, delayMs = 5_000) {
  return () => (isPending() ? { kind: "defer-continuation" as const, delayMs } : undefined);
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
function sessionsDeleteCount(): number {
  return gatewayMocks.callGateway.mock.calls.filter(([opts]) => opts?.method === "sessions.delete")
    .length;
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("startSubagentAnnounceCleanupFlow continuation gate (#952)", () => {
  it("(a) defers an already-announced run while a continuation is pending", () => {
    const entry = createRunEntry({ delivery: { status: "delivered", announcedAt: 100 } });
    const { controller } = createController({
      entry,
      resolveContinuationCleanupDeferral: makeDeferralResolver(() => true),
    });

    const handled = controller.startSubagentAnnounceCleanupFlow(entry.runId, entry);

    expect(handled).toBe(true);
    expect(entry.cleanupHandled).toBeUndefined();
    expect(entry.cleanupCompletedAt).toBeUndefined();
    expect(gatewayMocks.callGateway).not.toHaveBeenCalled();
  });

  it('(b) retains a cleanup:"delete" subagent session while a continuation is pending', () => {
    const runs = new Map<string, SubagentRunRecord>();
    const entry = createRunEntry({ cleanup: "delete", expectsCompletionMessage: false });
    runs.set(entry.runId, entry);
    const { controller } = createController({
      entry,
      runs,
      resolveContinuationCleanupDeferral: makeDeferralResolver(() => true),
    });

    controller.startSubagentAnnounceCleanupFlow(entry.runId, entry);

    expect(calledSessionsDelete()).toBe(false);
    expect(runs.has(entry.runId)).toBe(true);
    expect(entry.cleanupHandled).toBeUndefined();
    expect(entry.cleanupCompletedAt).toBeUndefined();
  });

  it("(headline) a continue_delegate subagent's continue_work runs >=2 hops, then cleans up once", async () => {
    vi.useFakeTimers();
    const runs = new Map<string, SubagentRunRecord>();
    const entry = createRunEntry({ cleanup: "delete", expectsCompletionMessage: false });
    runs.set(entry.runId, entry);

    // Pending while hop 1's continue_work election is in flight (the durable
    // `continuation_work` task is queued, then running through hop 2's turn).
    let pending = true;
    const { controller } = createController({
      entry,
      runs,
      resolveContinuationCleanupDeferral: makeDeferralResolver(() => pending),
    });

    // Subagent turn-1 ends → announce-cleanup starts. Pre-fix (a179) this deletes
    // the child session here, stranding hop 2 (the #952 bug). The gate defers.
    controller.startSubagentAnnounceCleanupFlow(entry.runId, entry);
    expect(calledSessionsDelete()).toBe(false);
    expect(runs.has(entry.runId)).toBe(true);

    // A recheck while hop 2 is still in flight keeps deferring.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calledSessionsDelete()).toBe(false);
    expect(runs.has(entry.runId)).toBe(true);

    // Chain ends (hop 2 did not re-elect): the next recheck proceeds and cleanup
    // runs exactly once — the session survived long enough for hop 2 to run.
    pending = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sessionsDeleteCount()).toBe(1);
    expect(runs.has(entry.runId)).toBe(false);

    // No further rechecks remain scheduled.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sessionsDeleteCount()).toBe(1);
  });
});
