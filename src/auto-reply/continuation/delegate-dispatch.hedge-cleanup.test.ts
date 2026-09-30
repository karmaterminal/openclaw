import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enqueueSystemEventMock = vi.fn();
const loggerRecords: Array<{ level: string; message: string }> = [];
const spawnSubagentDirectMock = vi.fn();
let listQueuedPendingFlowsShouldThrow = false;
// subagent_runs rows by run ID: the admission evidence a claimed delegate is
// decided from (RFC docs/design/continue-work-signal-v2.md §5.4.4).
const admittedChildRuns = new Map<
  string,
  { runId: string; requesterSessionKey: string; childSessionKey: string }
>();

// Dispatch revalidates the owner session before claiming a delegate, so every
// owner key resolves with a stable lifecycle identity (mirrors
// delegate-dispatch.test.ts).
const loadOwnerSession = (sessionKey: string) => ({
  sessionId: `session-${sessionKey}`,
  lifecycleRevision: "revision-1",
});

vi.mock("../../agents/subagents/spawn/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

vi.mock("../../agents/subagents/registry/subagent-registry.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../agents/subagents/registry/subagent-registry.js")
  >()),
  prepareSubagentRunsByRunIds: async (runIds: readonly string[]) => ({
    consume: <T>(consume: (runs: Map<string, unknown>) => T) => ({
      ready: true as const,
      value: consume(
        new Map(
          runIds.flatMap((runId) => {
            const run = admittedChildRuns.get(runId);
            return run ? [[runId, run] as const] : [];
          }),
        ),
      ),
    }),
  }),
}));

// A fired hedge dispatches as detached Gateway work (`void`-ed by the timer).
// Tracking those runs lets a test await the whole delayed dispatch, whose
// custody commands complete on the shared-state worker, instead of polling.
const detachedGatewayWork: Promise<unknown>[] = [];
vi.mock("../../process/gateway-work-admission.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../process/gateway-work-admission.js")>();
  return {
    ...actual,
    runWithGatewayDetachedWorkAdmission: <T>(
      run: () => Promise<T>,
      origin?: string,
      signal?: AbortSignal,
    ): Promise<T> => {
      const work = actual.runWithGatewayDetachedWorkAdmission(run, origin, signal);
      detachedGatewayWork.push(work);
      return work;
    },
  };
});

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEventRaw: (text: string, options: unknown) => enqueueSystemEventMock(text, options),
}));

vi.mock("../../config/sessions/session-accessor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config/sessions/session-accessor.js")>()),
  loadSessionEntry: ({ sessionKey }: { sessionKey: string }) => loadOwnerSession(sessionKey),
}));

// The delegate store's queued-record read: a failure here is the hedge
// dispatch failing before it can claim anything.
vi.mock("./delegate-flow-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./delegate-flow-store.js")>();
  return {
    ...actual,
    listQueuedPendingFlows: async (sessionKey: string) => {
      if (listQueuedPendingFlowsShouldThrow) {
        throw new Error("custody unavailable");
      }
      return await actual.listQueuedPendingFlows(sessionKey);
    },
  };
});

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
  return {
    createSubsystemLogger: () => logger,
  };
});

import { clearRuntimeConfigSnapshot } from "../../config/config.js";
import {
  noopTracer,
  resetContinuationTracer,
  setContinuationTracer,
} from "../../infra/continuation-tracer.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import {
  isGatewaySubordinateWorkAdmissionClosed,
  resetGatewayWorkAdmission,
} from "../../process/gateway-work-admission.js";
import { runWithGatewayRootWorkAdmissionForTest as runWithGatewayRootWorkAdmission } from "../../process/gateway-work-admission.test-helpers.js";
import {
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import { armDelegateDispatchHedge } from "./delegate-dispatch-hedge.js";
import { dispatchToolDelegates, resetDelegateDispatchHedgesForTests } from "./delegate-dispatch.js";
import { continuationConfig } from "./delegate-dispatch.test-support.js";
import {
  cancelPendingDelegates,
  enqueuePendingDelegate,
  pendingDelegateCount,
} from "./delegate-store.js";
import { hasLiveContinuationTimerRefs, resetContinuationStateForTests } from "./state.js";

useContinuationCustodyTestState();

/** Advance to a hedge deadline and wait for every dispatch it started to settle. */
async function fireHedgesAfter(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  while (detachedGatewayWork.length > 0) {
    await Promise.allSettled(detachedGatewayWork.splice(0));
    // Let a failed run's `.catch` re-arm before the caller advances again.
    await vi.advanceTimersByTimeAsync(0);
  }
}

beforeEach(() => {
  enqueueSystemEventMock.mockClear();
  loggerRecords.length = 0;
  spawnSubagentDirectMock.mockReset().mockResolvedValue({ status: "accepted" });
  listQueuedPendingFlowsShouldThrow = false;
  admittedChildRuns.clear();
  resetGatewayWorkAdmission();
  // Custody commands run on the shared-state worker; fake only the clocks and
  // timers the dispatch owns so worker round trips still settle.
  vi.useFakeTimers({
    toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
});

afterEach(() => {
  resetDelegateDispatchHedgesForTests();
  resetContinuationStateForTests();
  resetContinuationTracer();
  clearRuntimeConfigSnapshot();
  listQueuedPendingFlowsShouldThrow = false;
  admittedChildRuns.clear();
  detachedGatewayWork.length = 0;
  resetGatewayWorkAdmission();
  vi.useRealTimers();
});

describe("hedge timer ref/handle cleanup", () => {
  it("arms an immediate hedge when a deadline crosses after the consume snapshot", async () => {
    const sessionKey = "session-hedge-crossed-deadline";
    vi.setSystemTime(0);
    await enqueuePendingDelegate(sessionKey, { task: "crossed deadline work", delayMs: 100 });
    vi.setSystemTime(99);
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(99)
      .mockReturnValueOnce(99)
      .mockReturnValue(101);

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);

    vi.setSystemTime(101);
    now.mockRestore();
    // Advance only the hedge; draining every process timer also consumes unrelated recurring work.
    await fireHedgesAfter(0);

    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ task: expect.stringContaining("crossed deadline work") }),
      expect.objectContaining({
        continuationDelegateAdmission: expect.any(Object),
      }),
    );
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(false);
  });

  it("enters fresh gateway admission when a delayed delegate outlives its request", async () => {
    const sessionKey = "session-hedge-released-parent";
    const observedAdmissionClosed: boolean[] = [];
    spawnSubagentDirectMock.mockImplementation(async () => {
      observedAdmissionClosed.push(isGatewaySubordinateWorkAdmissionClosed());
      return { status: "accepted" };
    });

    await runWithGatewayRootWorkAdmission(async () => {
      await enqueuePendingDelegate(sessionKey, { task: "deferred work", delayMs: 30_000 });
      await dispatchToolDelegates({
        sessionKey,
        chainState: {
          currentChainCount: 0,
          chainStartedAt: Date.now(),
          accumulatedChainTokens: 0,
        },
        ctx: { sessionKey },
        maxChainLength: 10,
      });
    });

    await fireHedgesAfter(30_100);

    expect(observedAdmissionClosed).toEqual([false]);
  });

  it("forwards the resolved persisted traceparent to delayed delegate fire and dispatch spans", async () => {
    const sessionKey = "session-hedge-traceparent";
    const persistedTraceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const exportedTraceparent = "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01";
    const started: Array<{ name: string; traceparent?: string }> = [];
    setContinuationTracer({
      formatTraceparent: () => exportedTraceparent,
      startSpan: (name, options) => {
        started.push({
          name,
          ...(options?.traceparent ? { traceparent: options.traceparent } : {}),
        });
        return noopTracer.startSpan(name, options);
      },
    });
    await enqueuePendingDelegate(sessionKey, {
      task: "deferred traced work",
      delayMs: 30_000,
      traceparent: persistedTraceparent,
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });
    await fireHedgesAfter(30_100);

    expect(started).toEqual(
      expect.arrayContaining([
        { name: "continuation.delegate.fire", traceparent: exportedTraceparent },
        { name: "continuation.delegate.dispatch", traceparent: exportedTraceparent },
      ]),
    );
  });

  it("releases the timer ref + handle after a natural hedge fire", async () => {
    const sessionKey = "session-hedge-natural";

    // Queue an unmatured delegate so `dispatchToolDelegates` arms a hedge.
    await enqueuePendingDelegate(sessionKey, { task: "deferred work", delayMs: 30_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);

    // Cancel the delegate before the hedge fires so the re-dispatch hits
    // the empty-queue / no-unmatured path — isolates the natural-fire
    // cleanup we're asserting.
    await cancelPendingDelegates(sessionKey);

    // Fire the hedge and drain the fire-and-forget re-dispatch promise.
    await fireHedgesAfter(30_000 + 100);

    // The natural-fire branch must mirror clearHedgeTimer cleanup: delete the
    // hedgeTimers entry and unregister the continuation timer handle so the ref
    // count returns to zero.
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(false);
  });

  it("releases the timer ref + handle on explicit clearHedgeTimer", async () => {
    const sessionKey = "session-hedge-cancel";

    await enqueuePendingDelegate(sessionKey, { task: "deferred", delayMs: 30_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);

    // Cancel then re-dispatch: the follow-up call sees no unmatured
    // delegate and takes the clearHedgeTimer branch, which should drop
    // the ref to zero.
    await cancelPendingDelegates(sessionKey);
    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(false);
  });

  it("atomically replaces an existing hedge without leaking its timer ref", async () => {
    const sessionKey = "session-hedge-replace";
    await enqueuePendingDelegate(sessionKey, { task: "later deferred work", delayMs: 60_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    await enqueuePendingDelegate(sessionKey, { task: "earlier deferred work", delayMs: 10_000 });
    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    await fireHedgesAfter(10_100);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ task: expect.stringContaining("earlier deferred work") }),
      expect.anything(),
    );
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);

    await fireHedgesAfter(48_900);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(2);
    expect(spawnSubagentDirectMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ task: expect.stringContaining("later deferred work") }),
      expect.anything(),
    );
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(false);
  });

  it("surfaces hedge dispatch failures and re-arms a retry instead of orphaning queued delegates", async () => {
    const sessionKey = "session-hedge-failure";

    const queued = await enqueuePendingDelegate(sessionKey, {
      task: "deferred work",
      delayMs: 30_000,
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);

    listQueuedPendingFlowsShouldThrow = true;
    await fireHedgesAfter(30_000 + 100);

    expect(loggerRecords).toContainEqual({
      level: "error",
      message: `[continuation:delegate-hedge-error] error=custody unavailable session=${sessionKey}`,
    });
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("Hedge-timer dispatch failed; queued delegates may be orphaned."),
      { sessionKey, trusted: true },
    );
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);

    listQueuedPendingFlowsShouldThrow = false;
    await fireHedgesAfter(30_000);

    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(await readCustodyRecordForTest(queued.recordId)).toMatchObject({
      status: "succeeded",
    });
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(false);
  });
  it("persists advanced chain state after hedge-fired dispatch when a callback is provided", async () => {
    const sessionKey = "session-hedge-persist-chain";
    const persistChainState = vi.fn();
    await enqueuePendingDelegate(sessionKey, { task: "deferred persisted work", delayMs: 30_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: 123, accumulatedChainTokens: 456 },
      ctx: { sessionKey },
      maxChainLength: 10,
      loadFreshChainState: () => ({
        currentChainCount: 0,
        chainStartedAt: 123,
        accumulatedChainTokens: 456,
      }),
      persistChainState,
    });

    await fireHedgesAfter(30_000);

    expect(persistChainState).toHaveBeenCalledWith(
      expect.objectContaining({
        currentChainCount: 1,
        chainStartedAt: 123,
        accumulatedChainTokens: 456,
      }),
    );
  });

  it("retries hedge accepted-row persistence before later delegates can use a stale chain basis", async () => {
    const sessionKey = "session-hedge-retry-persist-before-next";
    const firstRecordId = (
      await enqueuePendingDelegate(sessionKey, { task: "first hop", delayMs: 30_000 })
    ).recordId;
    const secondRecordId = (
      await enqueuePendingDelegate(sessionKey, { task: "second hop", delayMs: 60_000 })
    ).recordId;
    let persisted = { currentChainCount: 0, chainStartedAt: 123, accumulatedChainTokens: 0 };
    let persistAttempts = 0;
    const persistChainState = vi.fn(async (next: typeof persisted) => {
      persistAttempts++;
      if (persistAttempts === 1) {
        throw new Error("session store write failed");
      }
      persisted = { ...next };
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: 123, accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 1,
      config: continuationConfig({ maxChainLength: 1 }),
      loadFreshChainState: () => ({ ...persisted }),
      persistChainState,
    });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    await fireHedgesAfter(30_000);

    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    const claimedFirst = await readCustodyRecordForTest(firstRecordId);
    expect(claimedFirst).toMatchObject({ status: "running" });

    // The spawn owner registered the child under the claim's precomputed run
    // ID; the next dispatch decides the claim from that subagent_runs row.
    const childRunId = expectDefined(
      claimedFirst?.spawnAttempts.at(-1)?.childRunId,
      "first hop child run id",
    );
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ continuationChildRunId: childRunId }),
      expect.anything(),
    );
    admittedChildRuns.set(childRunId, {
      runId: childRunId,
      requesterSessionKey: sessionKey,
      childSessionKey: "agent:main:subagent:continuation-first-hop",
    });

    await fireHedgesAfter(30_000);

    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(persisted.currentChainCount).toBe(1);
    expect(await readCustodyRecordForTest(firstRecordId)).toMatchObject({ status: "succeeded" });
    expect(await readCustodyRecordForTest(secondRecordId)).toMatchObject({ status: "failed" });
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("chain-capped"),
      expect.objectContaining({ sessionKey: resolveSystemEventQueueKey(sessionKey, "main") }),
    );
  });

  it("advances + persists chain state across sequential hedge fires for multiple delayed delegates", async () => {
    // Multiple delayed delegates must advance the chain
    // count durably across hedge fires. With the loadFresh/persist callbacks the
    // second hedge reads the PERSISTED count (1) advanced by the first, so it
    // spawns at hop 2 — not re-using the stale pre-spawn count (0) and bypassing
    // maxChainLength.
    const sessionKey = "session-hedge-sequential";
    await enqueuePendingDelegate(sessionKey, { task: "hop A", delayMs: 30_000 });
    await enqueuePendingDelegate(sessionKey, { task: "hop B", delayMs: 60_000 });

    // A shared chain-state cell the loader reads and the persister writes,
    // mimicking the child session entry the drain advances across fires.
    let persisted = { currentChainCount: 0, chainStartedAt: 123, accumulatedChainTokens: 0 };
    const persistChainState = vi.fn((next: typeof persisted) => {
      persisted = { ...next };
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { ...persisted },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig(),
      loadFreshChainState: () => ({ ...persisted }),
      persistChainState,
    });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    // First hedge fires (hop A matured) → count 0 → 1, persisted.
    await fireHedgesAfter(30_000);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(persisted.currentChainCount).toBe(1);

    // Second hedge fires (hop B matured) → reads persisted count 1 → advances to 2.
    await fireHedgesAfter(30_000);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(2);
    expect(persisted.currentChainCount).toBe(2);
  });

  it("carries applyDelegateChainTokensFold across the hedge for a recovered delayed delegate", async () => {
    const sessionKey = "session-hedge-fold";
    // A delayed delegate annotated with a durable fold after a child chain-cost
    // persist failure, recovered as not-yet-due so it arms the hedge.
    await enqueuePendingDelegate(sessionKey, {
      task: "delayed hop",
      delayMs: 60_000,
      chainTokensFold: 250_000,
    });

    // Recovery supplies persistChainState (see recoverPendingContinuationDelegates),
    // so the fold is safe to defer to a hedge rather than force-dispatched.
    const persistChainState = vi.fn();
    const armed = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 0,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 300_000,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig({ costCapTokens: 500_000 }),
      recoverRunningDelegates: true,
      includeRunningUpdatedAtOrBefore: Date.now(),
      applyDelegateChainTokensFold: true,
      persistChainState,
      loadFreshChainState: () => ({
        currentChainCount: 0,
        chainStartedAt: 123,
        accumulatedChainTokens: 300_000,
      }),
    });
    expect(armed.dispatched).toBe(0);
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    // When the hedge fires, the fold flag is carried through: 300_000 (stale
    // basis) + 250_000 (durable fold) = 550_000 > costCapTokens (500_000) →
    // rejected. Without forwarding the flag the hedge would check 300_000 and
    // wrongly launch the over-budget hop.
    await fireHedgesAfter(60_000);
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
  });

  it("force-dispatches a folded delayed delegate instead of arming a lossy hedge when no persist path exists", async () => {
    // Fail-closed: applyDelegateChainTokensFold WITHOUT a persistChainState
    // callback means an armed hedge would fold the cost only in memory and lose
    // it (later hops rebuild from the stale entry and bypass the cost cap).
    // dispatchToolDelegates must consume the not-yet-due delegate immediately so
    // the fold is enforced synchronously against the current basis, not deferred.
    const sessionKey = "session-fold-no-persist";
    await enqueuePendingDelegate(sessionKey, {
      task: "delayed hop",
      delayMs: 60_000,
      chainTokensFold: 250_000,
    });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 0,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 100_000,
      },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig({ costCapTokens: 500_000 }),
      recoverRunningDelegates: true,
      includeRunningUpdatedAtOrBefore: Date.now(),
      applyDelegateChainTokensFold: true,
    });

    // Consumed + dispatched now (100_000 + 250_000 fold = 350_000 < cap), NOT
    // left queued behind a hedge that could not persist the folded basis.
    expect(result.dispatched).toBe(1);
    expect(result.chainState.accumulatedChainTokens).toBe(350_000);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    // No hedge left pending after the process-local dispatch completed.
    await fireHedgesAfter(60_000);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the recovery persistence contract when a later arm omits its callbacks", async () => {
    // A merged hedge may never end up claiming `applyDelegateChainTokensFold`
    // while its persist/load callbacks were dropped: dispatchToolDelegates
    // reads that pair as `foldWithoutPersist` and force-claims every queued
    // delegate with `ignoreDelay`, running not-yet-due work early AND losing
    // the folded chain cost (cost-cap bypass on later hops).
    const sessionKey = "agent:main:hedge-merge-keeps-persist";
    const chainState = {
      currentChainCount: 0,
      chainStartedAt: Date.now(),
      accumulatedChainTokens: 0,
    };
    const persistChainState = vi.fn(async () => {});
    const loadFreshChainState = vi.fn(() => chainState);
    const dispatch = vi.fn().mockResolvedValue({ dispatched: 0, rejected: 0, chainState });

    armDelegateDispatchHedge(
      sessionKey,
      Date.now() + 10_000,
      {
        chainState,
        ctx: { sessionKey },
        maxChainLength: 10,
        applyDelegateChainTokensFold: true,
        persistChainState,
        loadFreshChainState,
      },
      dispatch,
    );
    armDelegateDispatchHedge(
      sessionKey,
      Date.now() + 30_000,
      {
        chainState,
        ctx: { sessionKey },
        maxChainLength: 10,
        persistChainState: undefined,
        loadFreshChainState: undefined,
      },
      dispatch,
    );

    await fireHedgesAfter(10_000);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
      applyDelegateChainTokensFold: true,
      persistChainState,
      loadFreshChainState,
    });
    expect(loadFreshChainState).toHaveBeenCalled();
  });

  it("does not leak one chain's inherited silent mode onto a later normal delegate", async () => {
    // Inherited silent/wake policy belongs to each queued delegate (annotated
    // at arm time), not to the per-session hedge. Unioning it at the hedge made
    // an unrelated normal-mode delayed delegate spawn silently, so its result
    // was never announced.
    const sessionKey = "agent:main:hedge-inherited-mode-scope";
    const chainState = {
      currentChainCount: 0,
      chainStartedAt: Date.now(),
      accumulatedChainTokens: 0,
    };
    await enqueuePendingDelegate(sessionKey, { task: "silent chain hop", delayMs: 60_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState,
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig(),
      inheritedSilent: true,
      inheritedWake: true,
    });

    // A later, unrelated turn on the same session queues a normal delegate and
    // dispatches without any inherited policy of its own.
    await enqueuePendingDelegate(sessionKey, { task: "normal announced hop", delayMs: 60_000 });
    await dispatchToolDelegates({
      sessionKey,
      chainState,
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig(),
    });

    await fireHedgesAfter(60_000);

    const spawnedByTask = new Map(
      spawnSubagentDirectMock.mock.calls.map(([request]) => [
        (request as { task: string }).task,
        request as Record<string, unknown>,
      ]),
    );
    const silentHop = [...spawnedByTask.entries()].find(([task]) =>
      task.includes("silent chain hop"),
    )?.[1];
    const normalHop = [...spawnedByTask.entries()].find(([task]) =>
      task.includes("normal announced hop"),
    )?.[1];
    expect(silentHop).toMatchObject({ silentAnnounce: true, wakeOnReturn: true });
    expect(normalHop).toBeDefined();
    expect(normalHop?.silentAnnounce).toBeUndefined();
    expect(normalHop?.wakeOnReturn).toBeUndefined();
  });

  it("does not let an armed hedge claim a delegate queued after it was armed", async () => {
    const sessionKey = "agent:main:hedge-created-at-scope";
    const chainState = {
      currentChainCount: 0,
      chainStartedAt: Date.now(),
      accumulatedChainTokens: 0,
    };
    await enqueuePendingDelegate(sessionKey, { task: "silent chain hop", delayMs: 60_000 });
    await dispatchToolDelegates({
      sessionKey,
      chainState,
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig(),
      inheritedSilent: true,
      inheritedWake: true,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await enqueuePendingDelegate(sessionKey, { task: "immediate silent hop" });

    await fireHedgesAfter(60_000);

    expect(pendingDelegateCount(sessionKey)).toBe(1);
    expect(
      spawnSubagentDirectMock.mock.calls.some(([request]) =>
        (request as { task: string }).task.includes("immediate silent hop"),
      ),
    ).toBe(false);
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(false);

    await dispatchToolDelegates({
      sessionKey,
      chainState,
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig(),
      inheritedSilent: true,
      inheritedWake: true,
    });

    const spawnedByTask = new Map(
      spawnSubagentDirectMock.mock.calls.map(([request]) => [
        (request as { task: string }).task,
        request as Record<string, unknown>,
      ]),
    );
    const silentHop = [...spawnedByTask.entries()].find(([task]) =>
      task.includes("silent chain hop"),
    )?.[1];
    const immediateHop = [...spawnedByTask.entries()].find(([task]) =>
      task.includes("immediate silent hop"),
    )?.[1];
    expect(silentHop).toMatchObject({
      silentAnnounce: true,
      wakeOnReturn: true,
    });
    expect(immediateHop).toMatchObject({
      silentAnnounce: true,
      wakeOnReturn: true,
    });
  });
});
