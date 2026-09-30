import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubagentRunRecord } from "../../agents/subagents/registry/subagent-registry.types.js";

const enqueueSystemEventMock = vi.fn();
const loggerRecords: Array<{ level: string; message: string }> = [];
// Observable persisted session entries for recovery persist assertions.
const recoveryStoreByPath = new Map<string, Record<string, unknown>>();
const spawnSubagentDirectMock = vi.fn();
const {
  assertDelegateArtifactPolicyPreparedMock,
  hasRecordedDelegateArtifactCompletionForProducerMock,
  removeUnacceptedDelegateArtifactPolicyMock,
} = vi.hoisted(() => ({
  assertDelegateArtifactPolicyPreparedMock: vi.fn(),
  hasRecordedDelegateArtifactCompletionForProducerMock: vi.fn(
    (_params: { flowId: string; producerSessionKey: string }) => false,
  ),
  removeUnacceptedDelegateArtifactPolicyMock: vi.fn(),
}));
// Admission evidence (RFC §5.4.4): `subagent_runs` rows keyed by the child run
// ID the spawn owner used, with the requester that owns them.
const registeredChildRuns = new Map<
  string,
  Pick<SubagentRunRecord, "requesterSessionKey" | "childSessionKey">
>();
let updateSessionStoreForRecoveryShouldThrow = false;
let updateSessionStoreForRecoveryRequiredWriteCalls = 0;
let updateSessionStoreForRecoveryThrowOnRequiredWriteCall: number | undefined;
// recovery derives the chain cost basis from the PERSISTED session entry
// (no explicit chainState survives a restart), so tests inject the persisted
// store here to prove the cost cap is enforced against the post-run child total.
const loadSessionStoreForRecoveryMock = vi.fn(
  (_storePath: string) => ({}) as Record<string, unknown>,
);
const pendingSessionDeliveriesForRecovery: Record<string, unknown>[] = [];
const updateSessionStoreForRecoveryOptions: Array<Record<string, unknown> | undefined> = [];

// Dispatch revalidates the owner session before claiming a delegate, so the
// default store must resolve every owner key with a stable lifecycle identity
// (mirrors delegate-dispatch.test.ts). Tests that need an absent owner set {}.
const loadOwnerSession = (_target: object, sessionKey: string | symbol) =>
  typeof sessionKey === "string"
    ? { sessionId: `session-${sessionKey}`, lifecycleRevision: "revision-1" }
    : undefined;
const ownerSessionStore = new Proxy<Record<string, unknown>>({}, { get: loadOwnerSession });

vi.mock("../../agents/subagents/spawn/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

vi.mock("../../agents/delegate-artifacts.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../agents/delegate-artifacts.js")>()),
  assertDelegateArtifactPolicyPrepared: assertDelegateArtifactPolicyPreparedMock,
  hasRecordedDelegateArtifactCompletionForProducer:
    hasRecordedDelegateArtifactCompletionForProducerMock,
  removeUnacceptedDelegateArtifactPolicy: removeUnacceptedDelegateArtifactPolicyMock,
}));

vi.mock("../../agents/subagents/registry/subagent-registry.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../agents/subagents/registry/subagent-registry.js")
  >()),
  prepareSubagentRunsByRunIds: async (runIds: readonly string[]) => {
    const { createSubagentRunRecord } =
      await import("../../agents/subagent-test-fixtures.test-helpers.js");
    const runs = new Map<string, SubagentRunRecord>();
    for (const runId of runIds) {
      const run = registeredChildRuns.get(runId);
      if (run) {
        runs.set(runId, createSubagentRunRecord({ runId, ...run }));
      }
    }
    return {
      consume: <T>(read: (runs: ReadonlyMap<string, SubagentRunRecord>) => T) => ({
        ready: true as const,
        value: read(runs),
      }),
    };
  },
}));

// A fired hedge runs its dispatch as detached work that awaits real custody
// worker round trips, which advancing the fake clock cannot flush. Record each
// detached run so a test awaits the fired dispatch itself instead of polling.
const detachedWork = new Set<Promise<unknown>>();
vi.mock("../../process/gateway-work-admission.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../process/gateway-work-admission.js")>();
  return {
    ...actual,
    runWithGatewayDetachedWorkAdmission: <T>(
      ...args: Parameters<typeof actual.runWithGatewayDetachedWorkAdmission<T>>
    ): Promise<T> => {
      const run = actual.runWithGatewayDetachedWorkAdmission(...args);
      detachedWork.add(run);
      return run;
    },
  };
});

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEventRaw: (text: string, options: unknown) => enqueueSystemEventMock(text, options),
}));

vi.mock("../../config/sessions/session-accessor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config/sessions/session-accessor.js")>()),
  loadSessionEntry: ({ sessionKey, storePath }: { sessionKey: string; storePath: string }) => {
    const store = loadSessionStoreForRecoveryMock(storePath);
    return store[sessionKey];
  },
  updateSessionEntry: async (
    { sessionKey, storePath }: { sessionKey: string; storePath: string },
    update: (
      entry: Record<string, unknown>,
    ) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> => {
    updateSessionStoreForRecoveryOptions.push(options);
    if (options?.requireWriteSuccess === true) {
      updateSessionStoreForRecoveryRequiredWriteCalls++;
      if (
        updateSessionStoreForRecoveryShouldThrow ||
        updateSessionStoreForRecoveryRequiredWriteCalls ===
          updateSessionStoreForRecoveryThrowOnRequiredWriteCall
      ) {
        throw new Error("session store write failed");
      }
    }
    const sourceStore = loadSessionStoreForRecoveryMock(storePath);
    const sourceEntry = recoveryStoreByPath.get(storePath)?.[sessionKey] ?? sourceStore[sessionKey];
    if (!sourceEntry) {
      return null;
    }
    const entry = { ...(sourceEntry as Record<string, unknown>) };
    const patch = await update(entry);
    if (!patch) {
      return entry;
    }
    const persisted = { ...entry, ...patch };
    const store = recoveryStoreByPath.get(storePath) ?? {};
    recoveryStoreByPath.set(storePath, store);
    store[sessionKey] = persisted;
    return persisted;
  },
}));

vi.mock("../../infra/session-delivery-queue-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../infra/session-delivery-queue-storage.js")>()),
  loadPendingSessionDeliveries: vi.fn(async () => pendingSessionDeliveriesForRecovery),
}));

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

import { UnavailableDelegateArtifactPolicyError } from "../../agents/delegate-artifacts.js";
import { deriveContinuationDelegateChildSessionKeyFromParent } from "../../agents/subagent-continuation-ids.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import { resetContinuationTracer } from "../../infra/continuation-tracer.js";
import { resetGatewayWorkAdmission } from "../../process/gateway-work-admission.js";
import { updateContinuationRecords } from "./custody/custody-store.js";
import type { ContinuationRecord } from "./custody/custody-store.types.js";
import {
  custodyStateForTest,
  listCustodyRecordsForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import { CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG } from "./custody/spawn-interrupted-notice.js";
import { armDelegateDispatchHedge } from "./delegate-dispatch-hedge.js";
import { recoverPendingContinuationDelegates } from "./delegate-dispatch-recovery.js";
import { dispatchToolDelegates, resetDelegateDispatchHedgesForTests } from "./delegate-dispatch.js";
import { enqueuePendingDelegate } from "./delegate-store.js";
import { resetContinuationStateForTests } from "./state.js";
import type { ContinuationRuntimeConfig } from "./types.js";

useContinuationCustodyTestState();

function continuationConfig(
  overrides: Partial<ContinuationRuntimeConfig> = {},
): ContinuationRuntimeConfig {
  return {
    enabled: true,
    defaultDelayMs: 15_000,
    minDelayMs: 5_000,
    maxDelayMs: 300_000,
    maxChainLength: 10,
    costCapTokens: 500_000,
    maxDelegatesPerTurn: 5,
    maxPendingWork: 32,
    crossSessionTargeting: "disabled",
    earlyWarningBand: 0.3125,
    ...overrides,
  };
}

function findPersistedRecoveryEntry(sessionKey: string): Record<string, unknown> | undefined {
  for (const store of recoveryStoreByPath.values()) {
    const entry = store[sessionKey];
    if (entry) {
      return entry as Record<string, unknown>;
    }
  }
  return undefined;
}

async function readRecord(recordId: string): Promise<ContinuationRecord> {
  const record = await readCustodyRecordForTest(recordId);
  if (!record) {
    throw new Error(`expected custody record ${recordId}`);
  }
  return record;
}

/** Fire due timers, then await every detached hedge dispatch they started. */
async function advanceAndSettleHedges(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  while (detachedWork.size > 0) {
    const started = [...detachedWork];
    detachedWork.clear();
    await Promise.allSettled(started);
  }
}

/** The in-memory fast-path events of the durable interrupted-spawn notice. */
function interruptedNoticeEvents(): Array<[string, Record<string, unknown>]> {
  return enqueueSystemEventMock.mock.calls.filter(
    ([text]) =>
      typeof text === "string" && text.startsWith(CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG),
  ) as Array<[string, Record<string, unknown>]>;
}

beforeEach(() => {
  enqueueSystemEventMock.mockClear();
  loggerRecords.length = 0;
  spawnSubagentDirectMock.mockReset().mockResolvedValue({ status: "accepted" });
  assertDelegateArtifactPolicyPreparedMock.mockReset();
  hasRecordedDelegateArtifactCompletionForProducerMock.mockClear().mockReturnValue(false);
  removeUnacceptedDelegateArtifactPolicyMock.mockClear();
  loadSessionStoreForRecoveryMock.mockReset().mockReturnValue(ownerSessionStore);
  registeredChildRuns.clear();
  detachedWork.clear();
  recoveryStoreByPath.clear();
  pendingSessionDeliveriesForRecovery.length = 0;
  updateSessionStoreForRecoveryOptions.length = 0;
  updateSessionStoreForRecoveryShouldThrow = false;
  updateSessionStoreForRecoveryRequiredWriteCalls = 0;
  updateSessionStoreForRecoveryThrowOnRequiredWriteCall = undefined;
  resetGatewayWorkAdmission();
  // Custody commands round-trip through the shared-state worker, so only the
  // clock and timer queues are faked; the worker's message and immediate
  // scheduling stay real.
  vi.useFakeTimers({
    toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
});

afterEach(() => {
  resetDelegateDispatchHedgesForTests();
  resetContinuationStateForTests();
  resetContinuationTracer();
  clearRuntimeConfigSnapshot();
  registeredChildRuns.clear();
  pendingSessionDeliveriesForRecovery.length = 0;
  updateSessionStoreForRecoveryOptions.length = 0;
  updateSessionStoreForRecoveryShouldThrow = false;
  updateSessionStoreForRecoveryRequiredWriteCalls = 0;
  updateSessionStoreForRecoveryThrowOnRequiredWriteCall = undefined;
  resetGatewayWorkAdmission();
  vi.useRealTimers();
});

describe("recoverPendingContinuationDelegates", () => {
  it("accepts a re-driven managed child whose terminal policy proves it already ran", async () => {
    // The child was accepted, its acceptance commit failed, and it finished
    // before the row was re-driven. The live registry cannot answer for an
    // ended child, so without the durable producer binding this genuinely
    // completed delegate is re-spawned or reported as a spawn failure.
    const sessionKey = "agent:main:managed-terminal-producer";
    const delegate = await enqueuePendingDelegate(sessionKey, {
      task: "produce completed report",
      returnOptions: { artifacts: "required" },
    });
    hasRecordedDelegateArtifactCompletionForProducerMock.mockReturnValue(true);
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { enabled: true } } },
    });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 0,
        chainStartedAt: Date.now(),
        accumulatedChainTokens: 0,
      },
      ctx: { sessionKey },
      maxChainLength: 8,
      config: continuationConfig({ enabled: true, crossSessionTargeting: "enabled" }),
    });

    expect(hasRecordedDelegateArtifactCompletionForProducerMock).toHaveBeenCalledWith({
      flowId: delegate.recordId,
      producerSessionKey: deriveContinuationDelegateChildSessionKeyFromParent(
        sessionKey,
        delegate.recordId,
      ),
    });
    expect(result).toMatchObject({ rejected: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readRecord(delegate.recordId)).toMatchObject({ status: "succeeded" });
    expect(assertDelegateArtifactPolicyPreparedMock).not.toHaveBeenCalled();
    expect(removeUnacceptedDelegateArtifactPolicyMock).not.toHaveBeenCalled();
    expect(
      enqueueSystemEventMock.mock.calls.filter(([text]) =>
        String(text).includes("accepted artifact policy is"),
      ),
    ).toEqual([]);
  });

  beforeEach(() => {
    setRuntimeConfigSnapshot({
      agents: {
        defaults: {
          continuation: {
            enabled: true,
            maxChainLength: 10,
            maxDelegatesPerTurn: 5,
          },
        },
      },
    });
  });

  it("does not reapply a folded cost-cap rejection after the first persist fails", async () => {
    setRuntimeConfigSnapshot({
      agents: {
        defaults: {
          continuation: {
            enabled: true,
            maxChainLength: 10,
            maxDelegatesPerTurn: 5,
            costCapTokens: 500_000,
          },
        },
      },
    });
    const sessionKey = "agent:main:subagent:folded-rejection-persist-fail";
    const delegate = await enqueuePendingDelegate(sessionKey, {
      task: "folded rejection retry",
      chainTokensFold: 250_000,
    });
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 1,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 300_000,
      },
    });
    updateSessionStoreForRecoveryShouldThrow = true;

    const first = await recoverPendingContinuationDelegates({});

    expect(first).toMatchObject({ sessions: 1, dispatched: 0, rejected: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    const retryRecord = await readRecord(delegate.recordId);
    expect(retryRecord).toMatchObject({ status: "running" });
    const retryState = custodyStateForTest(retryRecord);
    expect(retryState.chainTokensFold).toBe(undefined);
    expect(retryState.persistedChainState).toMatchObject({
      currentChainCount: 1,
      accumulatedChainTokens: 550_000,
    });

    updateSessionStoreForRecoveryShouldThrow = false;
    const retried = await recoverPendingContinuationDelegates({});

    // The claim the failed pass left `running` is decided from subagent_runs
    // and never re-driven (RFC §5.4.4, Q3): no child exists, so it ends in the
    // interrupted notice while the durable cost from the planned marker holds.
    expect(retried).toMatchObject({ sessions: 1, dispatched: 0, rejected: 1 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readRecord(delegate.recordId)).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
    });
    expect(interruptedNoticeEvents()).toHaveLength(1);
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({
      continuationChainCount: 1,
      continuationChainTokens: 550_000,
    });
  });

  it("persists a recovered chain-token fold before rejecting an expired artifact policy", async () => {
    const sessionKey = "agent:main:subagent:expired-policy-chain-fold";
    const delegate = await enqueuePendingDelegate(sessionKey, {
      task: "reject expired artifact policy with durable cost",
      chainTokensFold: 250_000,
      returnOptions: { artifacts: "required" },
    });
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 1,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 300_000,
      },
    });
    assertDelegateArtifactPolicyPreparedMock.mockImplementationOnce(() => {
      throw new UnavailableDelegateArtifactPolicyError();
    });

    const result = await recoverPendingContinuationDelegates({});

    expect(result).toMatchObject({ sessions: 1, dispatched: 0, rejected: 1 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readRecord(delegate.recordId)).toMatchObject({ status: "failed" });
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({
      continuationChainCount: 1,
      continuationChainTokens: 550_000,
    });
  });

  it("reconciles an accepted managed child before rechecking its completed policy", async () => {
    const sessionKey = "agent:main:parent";
    const delegate = await enqueuePendingDelegate(sessionKey, {
      task: "recover accepted managed child",
      returnOptions: { artifacts: "required" },
    });
    const childSessionKey = deriveContinuationDelegateChildSessionKeyFromParent(
      sessionKey,
      delegate.recordId,
    );
    // The Gateway admits the child under the claimed attempt's run ID, then a
    // concurrent custody write lands before the acceptance commit, so the
    // acceptance is stale and the claim stays `running` for recovery.
    spawnSubagentDirectMock.mockImplementationOnce(
      async (spawnParams: { continuationChildRunId?: string }) => {
        const childRunId = spawnParams.continuationChildRunId;
        if (!childRunId) {
          throw new Error("expected the spawn to carry the claimed child run ID");
        }
        registeredChildRuns.set(childRunId, { requesterSessionKey: sessionKey, childSessionKey });
        const claimed = await readRecord(delegate.recordId);
        const bumped = await updateContinuationRecords(
          [
            {
              recordId: claimed.recordId,
              ownerSessionKey: claimed.ownerSessionKey,
              expectedRevision: claimed.revision,
              patch: { phase: "Concurrent writer" },
            },
          ],
          { now: Date.now() },
        );
        expect(bumped).toMatchObject({ outcome: "applied" });
        return { status: "accepted", childSessionKey, runId: childRunId };
      },
    );

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(await readRecord(delegate.recordId)).toMatchObject({ status: "running" });

    assertDelegateArtifactPolicyPreparedMock.mockReset().mockImplementation(() => {
      throw new UnavailableDelegateArtifactPolicyError();
    });

    await recoverPendingContinuationDelegates({
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      maxChainLength: 10,
    });

    expect(assertDelegateArtifactPolicyPreparedMock).not.toHaveBeenCalled();
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(await readRecord(delegate.recordId)).toMatchObject({
      status: "succeeded",
      handoff: { target: "subagent_runs", childSessionKey },
    });
    expect(removeUnacceptedDelegateArtifactPolicyMock).not.toHaveBeenCalled();
    expect(interruptedNoticeEvents()).toEqual([]);
  });

  it("does not reapply a shared fold after a later expired-policy persist fails", async () => {
    const sessionKey = "agent:main:subagent:expired-policy-shared-fold-persist-fail";
    const recordIds: string[] = [];
    for (const task of ["first expired", "second expired", "third expired"]) {
      const delegate = await enqueuePendingDelegate(sessionKey, {
        task,
        chainTokensFold: 50_000,
        returnOptions: { artifacts: "required" },
      });
      recordIds.push(delegate.recordId);
    }
    const [firstId, secondId, thirdId] = recordIds as [string, string, string];
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 1,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 300_000,
      },
    });
    assertDelegateArtifactPolicyPreparedMock.mockImplementation(() => {
      throw new UnavailableDelegateArtifactPolicyError();
    });
    updateSessionStoreForRecoveryThrowOnRequiredWriteCall = 2;

    const first = await recoverPendingContinuationDelegates({});

    expect(first).toMatchObject({ sessions: 1, dispatched: 0, rejected: 0 });
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({
      continuationChainTokens: 350_000,
    });
    expect(await readRecord(firstId)).toMatchObject({ status: "failed" });
    const second = await readRecord(secondId);
    const third = await readRecord(thirdId);
    expect(second).toMatchObject({ status: "running" });
    expect(third).toMatchObject({ status: "running" });
    expect(custodyStateForTest(second).chainTokensFold).toBeUndefined();
    expect(custodyStateForTest(third).chainTokensFold).toBeUndefined();

    updateSessionStoreForRecoveryThrowOnRequiredWriteCall = undefined;
    const retried = await recoverPendingContinuationDelegates({});

    // The two claims left `running` are never re-driven (RFC §5.4.4, Q3): each
    // ends in one interrupted notice without re-adding the shared fold.
    expect(retried).toMatchObject({ sessions: 1, dispatched: 0, rejected: 2 });
    expect(await readRecord(secondId)).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
    });
    expect(await readRecord(thirdId)).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
    });
    expect(interruptedNoticeEvents()).toHaveLength(2);
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({
      continuationChainTokens: 350_000,
    });
  });

  it("clears persisted chain-token folds so later delayed hedges do not reapply them", async () => {
    setRuntimeConfigSnapshot({
      agents: {
        defaults: {
          continuation: {
            enabled: true,
            maxChainLength: 10,
            maxDelegatesPerTurn: 5,
            costCapTokens: 500_000,
          },
        },
      },
    });
    const sessionKey = "agent:main:subagent:hedge-fold-clear";
    await enqueuePendingDelegate(sessionKey, {
      task: "delayed hop one",
      delayMs: 30_000,
      chainTokensFold: 50_000,
    });
    await enqueuePendingDelegate(sessionKey, {
      task: "delayed hop two",
      delayMs: 60_000,
      chainTokensFold: 50_000,
    });
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 0,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 100_000,
      },
    });

    await recoverPendingContinuationDelegates({});

    await advanceAndSettleHedges(30_000);
    await Promise.resolve();
    await advanceAndSettleHedges(0);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    let persisted = findPersistedRecoveryEntry(sessionKey);
    expect(persisted?.continuationChainTokens).toBe(150_000);
    const remainingRecord = (await listCustodyRecordsForTest()).find(
      (record) => record.status === "queued",
    );
    expect(remainingRecord ? custodyStateForTest(remainingRecord).chainTokensFold : undefined).toBe(
      undefined,
    );

    await advanceAndSettleHedges(30_000);
    await Promise.resolve();
    await advanceAndSettleHedges(0);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(2);
    persisted = findPersistedRecoveryEntry(sessionKey);
    expect(persisted?.continuationChainCount).toBe(2);
    // Still 150_000: the second hedge reloaded an already-folded basis and did
    // not add the same durable fold a second time.
    expect(persisted?.continuationChainTokens).toBe(150_000);
  });

  it("recovers delayed default delegates with durable inherited silent/wake policy", async () => {
    const sessionKey = "agent:main:subagent:recover-inherited-silent";
    await enqueuePendingDelegate(sessionKey, { task: "delayed inherited child", delayMs: 60_000 });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      inheritedSilent: true,
      inheritedWake: true,
    });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    resetDelegateDispatchHedgesForTests();
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 0,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 0,
      },
    });
    await recoverPendingContinuationDelegates({});
    await advanceAndSettleHedges(60_000);
    await Promise.resolve();
    await advanceAndSettleHedges(0);

    const spawnParams = spawnSubagentDirectMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(spawnParams).toMatchObject({
      task: expect.stringContaining("delayed inherited child"),
      silentAnnounce: true,
      wakeOnReturn: true,
    });
  });

  it("retries managed delegates when runtime artifact support becomes enabled", async () => {
    const sessionKey = "agent:main:managed-runtime-retry";
    await enqueuePendingDelegate(sessionKey, {
      task: "managed retry",
      returnOptions: { artifacts: "optional" },
    });
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { enabled: false } } },
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig(),
    });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { enabled: true } } },
    });
    await advanceAndSettleHedges(30_000);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
  });

  it("retries cross-session managed delegates when runtime targeting becomes enabled", async () => {
    const sessionKey = "agent:main:managed-cross-session-retry";
    await enqueuePendingDelegate(sessionKey, {
      task: "managed cross-session retry",
      targetSessionKey: "agent:main:other",
      targetSessionKeys: ["agent:main:other"],
      returnOptions: { artifacts: "optional" },
      recipientContext: { purpose: "Return the managed report" },
    });
    setRuntimeConfigSnapshot({
      agents: {
        defaults: {
          continuation: { enabled: true, crossSessionTargeting: "disabled" },
        },
      },
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig({ crossSessionTargeting: "enabled" }),
    });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    setRuntimeConfigSnapshot({
      agents: {
        defaults: {
          continuation: { enabled: true, crossSessionTargeting: "enabled" },
        },
      },
    });
    await advanceAndSettleHedges(30_000);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
  });

  it("widens a preserved recovery hedge to include newly queued delegates", async () => {
    const sessionKey = "agent:main:managed-cutoff-merge";
    const chainState = {
      currentChainCount: 0,
      chainStartedAt: Date.now(),
      accumulatedChainTokens: 0,
    };
    const recoveryCutoff = Date.now();
    const dispatch = vi.fn().mockResolvedValue({
      dispatched: 0,
      rejected: 0,
      chainState,
    });

    armDelegateDispatchHedge(
      sessionKey,
      Date.now() + 10_000,
      {
        chainState,
        ctx: { sessionKey },
        maxChainLength: 10,
        recoverRunningDelegates: true,
        queuedCreatedAtOrBefore: recoveryCutoff,
        includeRunningUpdatedAtOrBefore: recoveryCutoff,
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
      },
      dispatch,
    );

    await advanceAndSettleHedges(10_000);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey,
        recoverRunningDelegates: true,
        includeRunningUpdatedAtOrBefore: recoveryCutoff,
      }),
    );
    expect(dispatch.mock.calls[0]?.[0]).not.toHaveProperty("queuedCreatedAtOrBefore");
  });

  it("preserves a newer live hedge when bounded recovery finds no eligible delayed row", async () => {
    const sessionKey = "agent:main:bounded-recovery-preserves-live-hedge";
    const chainState = {
      currentChainCount: 0,
      chainStartedAt: Date.now(),
      accumulatedChainTokens: 0,
    };
    const recoveryCutoff = Date.now();
    vi.setSystemTime(recoveryCutoff + 1);
    await enqueuePendingDelegate(sessionKey, {
      task: "newer live delayed child",
      delayMs: 10_000,
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState,
      ctx: { sessionKey },
      maxChainLength: 10,
      config: continuationConfig(),
    });
    await dispatchToolDelegates({
      sessionKey,
      chainState,
      ctx: { sessionKey },
      maxChainLength: 10,
      recoverRunningDelegates: true,
      queuedCreatedAtOrBefore: recoveryCutoff,
      includeRunningUpdatedAtOrBefore: recoveryCutoff,
      config: continuationConfig(),
    });

    await advanceAndSettleHedges(10_000);

    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(spawnSubagentDirectMock.mock.calls[0]?.[0]).toMatchObject({
      task: expect.stringContaining("newer live delayed child"),
    });
  });

  it("preserves an earlier hedge and inherited policy across managed deferral", async () => {
    const sessionKey = "agent:main:managed-earliest-hedge";
    await enqueuePendingDelegate(sessionKey, {
      task: "earlier delayed child",
      delayMs: 10_000,
    });
    const managed = await enqueuePendingDelegate(sessionKey, {
      task: "managed restart child",
      mode: "normal",
      returnOptions: { artifacts: "optional" },
    });
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { enabled: false } } },
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      inheritedSilent: true,
      inheritedWake: true,
      config: continuationConfig(),
    });
    expect(custodyStateForTest(await readRecord(managed.recordId))).toMatchObject({
      inheritedSilent: true,
      inheritedWake: true,
    });

    await advanceAndSettleHedges(10_000);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(spawnSubagentDirectMock.mock.calls[0]?.[0]).toMatchObject({
      task: expect.stringContaining("earlier delayed child"),
    });

    resetDelegateDispatchHedgesForTests();
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { enabled: true } } },
    });
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 0,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 0,
      },
    });
    await recoverPendingContinuationDelegates({});

    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(2);
    expect(spawnSubagentDirectMock.mock.calls[1]?.[0]).toMatchObject({
      task: expect.stringContaining("managed restart child"),
      silentAnnounce: true,
      wakeOnReturn: true,
    });
  });
});
