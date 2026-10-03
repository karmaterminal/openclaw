/**
 * Startup recovery for claimed post-compaction delegates over real continuation
 * custody (RFC docs/design/continue-work-signal-v2.md §4.4, §5.4.4).
 *
 * A post-compaction record a crash left claimed (`running`) before its release
 * committed has no queue entry, so no spawn can have begun for it. Recovery
 * releases it into the session-delivery queue in the same commit as its
 * handoff and drains only the entries it released; the queue drain is the only
 * post-compaction spawn path. Outcomes are observed at the spawn owner, the
 * custody record, the session-delivery queue, and the owner's session entry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enqueueSystemEventMock = vi.fn();
const loggerRecords: Array<{ level: string; message: string }> = [];
// Observable persisted session entries for recovery persist assertions.
const recoveryStoreByPath = new Map<string, Record<string, unknown>>();
const spawnSubagentDirectMock = vi.fn();
const {
  admittedRuns,
  assertDelegateArtifactPolicyPreparedMock,
  beforeAdmissionReadHook,
  hasRecordedDelegateArtifactCompletionForProducerMock,
  markSpawnAcceptedFailure,
  removeUnacceptedDelegateArtifactPolicyMock,
} = vi.hoisted(() => ({
  // subagent_runs rows by run ID: the registry evidence the drain reads.
  admittedRuns: new Map<string, { requesterSessionKey: string; childSessionKey: string }>(),
  assertDelegateArtifactPolicyPreparedMock: vi.fn(),
  // Runs inside the drain's registry read, before its spawn fence: the point
  // where a concurrent writer (session reset) can race the release.
  beforeAdmissionReadHook: { current: undefined as (() => Promise<void>) | undefined },
  hasRecordedDelegateArtifactCompletionForProducerMock: vi.fn(() => false),
  markSpawnAcceptedFailure: { enabled: false },
  removeUnacceptedDelegateArtifactPolicyMock: vi.fn(),
}));
let patchSessionEntryShouldThrow = false;
// Recovery derives the release source lifecycle and the drain its chain cost
// basis from the PERSISTED session entry, so tests inject the persisted store.
const loadSessionStoreForRecoveryMock = vi.fn(
  (_storePath: string) => ({}) as Record<string, unknown>,
);
const patchSessionEntryOptions: Array<Record<string, unknown> | undefined> = [];

// Dispatch revalidates the owner session before spawning a delegate, so the
// default store must resolve every owner key with a stable lifecycle identity
// (mirrors delegate-dispatch.test.ts). Tests that need an absent owner set {}.
const loadOwnerSession = (_target: object, sessionKey: string | symbol) =>
  typeof sessionKey === "string"
    ? { sessionId: `session-${sessionKey}`, lifecycleRevision: "revision-1" }
    : undefined;
const ownerSessionStore = new Proxy<Record<string, unknown>>({}, { get: loadOwnerSession });

function loadRecoverySessionEntry(
  storePath: string,
  sessionKey: string,
): Record<string, unknown> | undefined {
  const persisted = recoveryStoreByPath.get(storePath)?.[sessionKey];
  if (persisted) {
    return persisted as Record<string, unknown>;
  }
  return loadSessionStoreForRecoveryMock(storePath)[sessionKey] as
    | Record<string, unknown>
    | undefined;
}

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

// Admission evidence (RFC §5.4.4) is a subagent_runs row under a recorded
// child run ID whose requester is the owner.
vi.mock("../../agents/subagents/registry/subagent-registry.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../agents/subagents/registry/subagent-registry.js")
  >()),
  prepareSubagentRunsByRunIds: async (runIds: readonly string[]) => {
    await beforeAdmissionReadHook.current?.();
    return {
      consume: <T>(consume: (runs: Map<string, unknown>) => T) => ({
        ready: true as const,
        value: consume(
          new Map(
            runIds.flatMap((runId) => {
              const run = admittedRuns.get(runId);
              return run ? [[runId, { runId, ...run }] as const] : [];
            }),
          ),
        ),
      }),
    };
  },
}));

vi.mock("./delegate-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./delegate-store.js")>();
  return {
    ...actual,
    markPendingDelegateSpawnAccepted: async (
      ...args: Parameters<typeof actual.markPendingDelegateSpawnAccepted>
    ) =>
      markSpawnAcceptedFailure.enabled
        ? false
        : await actual.markPendingDelegateSpawnAccepted(...args),
  };
});

vi.mock("../../infra/system-events.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../infra/system-events.js")>()),
  enqueueSystemEventRaw: (text: string, options: unknown) => enqueueSystemEventMock(text, options),
}));

vi.mock("../../config/sessions/session-accessor.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/sessions/session-accessor.js")>();
  const writeEntry = async (
    { sessionKey, storePath }: { sessionKey: string; storePath: string },
    patchFor: (
      entry: Record<string, unknown>,
    ) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> => {
    patchSessionEntryOptions.push(options);
    if (options?.requireWriteSuccess === true && patchSessionEntryShouldThrow) {
      throw new Error("session store write failed");
    }
    const sourceEntry = loadRecoverySessionEntry(storePath, sessionKey);
    if (!sourceEntry) {
      return null;
    }
    const entry = { ...sourceEntry };
    const patch = await patchFor(entry);
    if (!patch) {
      return entry;
    }
    const persisted = { ...entry, ...patch };
    const store = recoveryStoreByPath.get(storePath) ?? {};
    recoveryStoreByPath.set(storePath, store);
    store[sessionKey] = persisted;
    return persisted;
  };
  return {
    ...actual,
    loadSessionEntry: ({ sessionKey, storePath }: { sessionKey: string; storePath: string }) =>
      loadRecoverySessionEntry(storePath, sessionKey),
    updateSessionEntry: writeEntry,
    patchSessionEntryCore: writeEntry,
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

import { expectDefined } from "@openclaw/normalization-core";
import {
  MissingDelegateArtifactPolicyError,
  UnavailableDelegateArtifactPolicyError,
} from "../../agents/delegate-artifacts.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import { resetContinuationTracer } from "../../infra/continuation-tracer.js";
import { loadPendingSessionDeliveries } from "../../infra/session-delivery-queue-storage.js";
import { resetGatewayWorkAdmission } from "../../process/gateway-work-admission.js";
import { formatContinuationChildRunId } from "../../shared/continuation-run-key.js";
import { drainPostCompactionDelegateDeliveries } from "../reply/post-compaction-delegate-dispatch.js";
import { updateContinuationRecords } from "./custody/custody-store.js";
import {
  custodyStateForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import {
  recoverAndReleaseStagedPostCompactionDelegates,
  requeueAwaitingNextCompactionDelegates,
} from "./delegate-dispatch-recovery.js";
import { resetDelegateDispatchHedgesForTests } from "./delegate-dispatch.js";
import {
  claimStagedPostCompactionDelegates,
  listRecoverableStagedPostCompactionDelegates,
  releaseStagedPostCompactionDelegateToQueue,
  requeueReleasedPostCompactionDelegate,
  stagePostCompactionCustodyDelegate,
  stagedPostCompactionDelegateCount,
  toSessionPostCompactionDelegate,
} from "./delegate-store-post-compaction.js";
import { captureContinuationQueueContext } from "./queue-context.js";
import { cancelSessionContinuations } from "./session-reset.js";
import { resetContinuationStateForTests } from "./state.js";

useContinuationCustodyTestState();

const INTERRUPTED_NOTICE = "[continuation:delegate-spawn-interrupted]";
const ATTACHMENT_CONFIG = { tools: { sessions_spawn: { attachments: { enabled: true } } } };

function findPersistedRecoveryEntry(sessionKey: string): Record<string, unknown> | undefined {
  for (const store of recoveryStoreByPath.values()) {
    const entry = store[sessionKey];
    if (entry) {
      return entry as Record<string, unknown>;
    }
  }
  return undefined;
}

async function custodyRecord(flowId: string) {
  return expectDefined(await readCustodyRecordForTest(flowId), `custody record ${flowId}`);
}

/** The accepted child custody recorded for a record, if any. */
async function acceptedChildOf(flowId: string): Promise<unknown> {
  return custodyStateForTest(await custodyRecord(flowId)).childSessionKey;
}

async function pendingPostCompactionEntries(sessionKey: string) {
  return (await loadPendingSessionDeliveries(captureContinuationQueueContext())).flatMap((entry) =>
    entry.kind === "postCompactionDelegate" && entry.sessionKey === sessionKey ? [entry] : [],
  );
}

async function interruptedNoticeRows(sessionKey: string): Promise<string[]> {
  return (await loadPendingSessionDeliveries(captureContinuationQueueContext())).flatMap((entry) =>
    entry.kind === "systemEvent" &&
    entry.sessionKey === sessionKey &&
    entry.text.includes(INTERRUPTED_NOTICE)
      ? [entry.text]
      : [],
  );
}

function spawnedTasks(): string[] {
  return spawnSubagentDirectMock.mock.calls.map((call) => (call[0] as { task: string }).task ?? "");
}

/** Spawn outcome chosen by the task text, independent of queue order. */
function spawnOutcomesByTask(outcomes: Record<string, () => Promise<unknown>>): void {
  spawnSubagentDirectMock.mockImplementation(async (params: { task: string }) => {
    for (const [fragment, outcome] of Object.entries(outcomes)) {
      if (params.task.includes(fragment)) {
        return await outcome();
      }
    }
    throw new Error(`unexpected spawn for task ${params.task}`);
  });
}

beforeEach(() => {
  enqueueSystemEventMock.mockClear();
  loggerRecords.length = 0;
  spawnSubagentDirectMock.mockReset().mockResolvedValue({ status: "accepted" });
  assertDelegateArtifactPolicyPreparedMock.mockReset();
  hasRecordedDelegateArtifactCompletionForProducerMock.mockReset().mockReturnValue(false);
  removeUnacceptedDelegateArtifactPolicyMock.mockReset();
  loadSessionStoreForRecoveryMock.mockReset().mockReturnValue(ownerSessionStore);
  admittedRuns.clear();
  beforeAdmissionReadHook.current = undefined;
  markSpawnAcceptedFailure.enabled = false;
  recoveryStoreByPath.clear();
  patchSessionEntryOptions.length = 0;
  patchSessionEntryShouldThrow = false;
  resetGatewayWorkAdmission();
  // Custody commands run through the shared-state worker; fake only the clock
  // and timer APIs so the worker round-trips still settle.
  vi.useFakeTimers({
    toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
});

afterEach(() => {
  resetDelegateDispatchHedgesForTests();
  resetContinuationStateForTests();
  resetContinuationTracer();
  clearRuntimeConfigSnapshot();
  admittedRuns.clear();
  beforeAdmissionReadHook.current = undefined;
  markSpawnAcceptedFailure.enabled = false;
  patchSessionEntryOptions.length = 0;
  patchSessionEntryShouldThrow = false;
  resetGatewayWorkAdmission();
  vi.useRealTimers();
});

describe("recoverAndReleaseStagedPostCompactionDelegates", () => {
  beforeEach(() => {
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
  });

  async function stageAndClaimRunning(
    sessionKey: string,
    task: string,
    extra: Partial<Parameters<typeof stagePostCompactionCustodyDelegate>[1]> = {},
  ): Promise<string> {
    // Stage (queued) then claim (running) to model a delegate that was
    // mid-release when the gateway crashed before the release committed.
    await stagePostCompactionCustodyDelegate(
      sessionKey,
      { task, stagedAt: Date.now(), ...extra },
      extra.attachments ? { attachmentConfig: ATTACHMENT_CONFIG as never } : {},
    );
    const claimed = await claimStagedPostCompactionDelegates(sessionKey);
    expect(claimed).toHaveLength(1);
    const flowId = claimed[0]?.flowId;
    expect(flowId).toBeDefined();
    return flowId as string;
  }

  function seedOwnerSession(sessionKey: string, entry: Record<string, unknown>): void {
    loadSessionStoreForRecoveryMock.mockReturnValue({ [sessionKey]: entry });
  }

  // Contract change (RFC §4.4): the direct staged spawn from recovery
  // (post-compaction-staged-dispatch.ts) is gone. Every outcome now comes
  // from the queue drain of the entries recovery released.
  it("partitions accepted, forbidden, error, and thrown outcomes of released rows without advancing transient hops", async () => {
    const sessionKey = "agent:main:subagent:pc-direct-partitions";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const flowIds: Record<string, string> = {};
    for (const task of ["accepted", "forbidden", "error", "thrown"]) {
      flowIds[task] = await stageAndClaimRunning(sessionKey, `outcome ${task}`, {
        returnOptions: { artifacts: "optional" },
      });
    }
    spawnOutcomesByTask({
      "outcome accepted": async () => ({ status: "accepted" }),
      "outcome forbidden": async () => ({ status: "forbidden", error: "blocked" }),
      "outcome error": async () => ({ status: "error", error: "busy" }),
      "outcome thrown": async () => {
        throw new Error("transport unavailable");
      },
    });

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    // `dispatched` counts records released to the queue (RFC §4.4).
    expect(result).toEqual({ sessions: 1, dispatched: 4, failed: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(4);
    const acceptedCall = spawnSubagentDirectMock.mock.calls.find(([params]) =>
      (params as { task: string }).task.includes("outcome accepted"),
    );
    expect(acceptedCall?.[0]).toMatchObject({
      task: expect.stringContaining("[Managed delegate return]"),
      continuationChildRunId: formatContinuationChildRunId(flowIds.accepted!, 1),
    });
    // Only the accepted child is charged a hop.
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({ continuationChainCount: 1 });
    expect(await acceptedChildOf(flowIds.accepted!)).toEqual(expect.any(String));
    // Every released record keeps its permanent handoff; the forbidden one
    // records the rejection on the record and loses its artifact policy.
    for (const task of ["forbidden", "error", "thrown"]) {
      const record = await custodyRecord(flowIds[task]!);
      expect(record).toMatchObject({
        status: "succeeded",
        handoff: expect.objectContaining({ target: "session_delivery_queue" }),
      });
      expect(custodyStateForTest(record).childSessionKey).toBeUndefined();
    }
    expect((await custodyRecord(flowIds.forbidden!)).phase).toContain(
      "Post-compaction delegate spawn forbidden: blocked.",
    );
    expect(removeUnacceptedDelegateArtifactPolicyMock).toHaveBeenCalledTimes(1);
    expect(removeUnacceptedDelegateArtifactPolicyMock).toHaveBeenCalledWith(flowIds.forbidden);
    // The never-dispatched error keeps its entry for a retry with attempt
    // ownership released; the thrown spawn may have been admitted, so it ends
    // in exactly one interrupted notice instead of a retry (RFC §5.4.4).
    const pending = await pendingPostCompactionEntries(sessionKey);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ sourceFlowId: flowIds.error, retryCount: 1 });
    expect(pending[0]?.deliveryStartedAt).toBeUndefined();
    const notices = await interruptedNoticeRows(sessionKey);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("outcome thrown");
  });

  // Contract change (RFC §4.4, §5.4.4): the finalization hook of the deleted
  // direct dispatch is replaced by the drain's post-accept commit; a reset
  // racing the release rolls the accepted child back instead of failing
  // recovery with the finalization error.
  it("rolls back an accepted recovery child when a session reset races its acceptance", async () => {
    const sessionKey = "agent:main:subagent:pc-finalization-race";
    seedOwnerSession(sessionKey, {
      sessionId: "session-child",
      lifecycleRevision: "revision-1",
      continuationChainCount: 0,
    });
    const flowId = await stageAndClaimRunning(sessionKey, "recover exact child");
    const rollbackAccepted = vi.fn(async () => undefined);
    spawnSubagentDirectMock.mockImplementationOnce(async () => {
      // A reset lands while the spawn is in flight: the owner session gets a
      // new lifecycle and custody fences the handed-off record.
      seedOwnerSession(sessionKey, {
        sessionId: "session-child-after-reset",
        lifecycleRevision: "revision-2",
        continuationChainCount: 0,
      });
      await cancelSessionContinuations(sessionKey);
      return {
        status: "accepted",
        childSessionKey: "agent:main:subagent:pc-finalization-child",
        runId: formatContinuationChildRunId(flowId, 1),
        rollbackAccepted,
      };
    });

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ sessions: 1, dispatched: 1, failed: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(rollbackAccepted).toHaveBeenCalledOnce();
    const record = await custodyRecord(flowId);
    expect(record.cancelRequestedAt).toEqual(expect.any(Number));
    expect(custodyStateForTest(record).childSessionKey).toBeUndefined();
    const pending = await pendingPostCompactionEntries(sessionKey);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      sourceFlowId: flowId,
      retryCount: 1,
      lastError: expect.stringContaining("lifecycle changed"),
    });
  });

  it("requeues awaiting-next-compaction running rows on startup recovery", async () => {
    const sessionKey = "agent:main:subagent:pc-next-seam-startup-requeue";
    await stagePostCompactionCustodyDelegate(sessionKey, {
      task: "rehydrate after crash before session-store persist",
      stagedAt: Date.now(),
    });
    const claimed = await claimStagedPostCompactionDelegates(sessionKey, {
      claimFor: "next-seam-persist",
    });
    expect(claimed).toHaveLength(1);
    const flowId = claimed[0]?.flowId;
    expect(flowId).toBeDefined();
    if (!flowId) {
      throw new Error("expected claimed flow id");
    }
    expect(await custodyRecord(flowId)).toMatchObject({ status: "running" });

    const result = await requeueAwaitingNextCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ requeued: 1 });
    expect(await custodyRecord(flowId)).toMatchObject({ status: "queued" });
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(1);
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
  });

  it("does not recover a next-seam persist claim before the next compaction", async () => {
    const sessionKey = "agent:main:subagent:pc-next-seam-persist";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    await stagePostCompactionCustodyDelegate(sessionKey, {
      task: "rehydrate at the next compaction seam",
      stagedAt: Date.now(),
    });
    const claimed = await claimStagedPostCompactionDelegates(sessionKey, {
      claimFor: "next-seam-persist",
    });
    expect(claimed).toHaveLength(1);
    const flowId = claimed[0]?.flowId;
    expect(flowId).toBeDefined();
    expect(await custodyRecord(flowId as string)).toMatchObject({ status: "running" });

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toMatchObject({ sessions: 0, dispatched: 0, failed: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
    expect(await custodyRecord(flowId as string)).toMatchObject({ status: "running" });
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
  });

  it("requeues a next-seam persist claim on session-store persist failure", async () => {
    const sessionKey = "agent:main:subagent:pc-next-seam-requeue";
    await stagePostCompactionCustodyDelegate(sessionKey, {
      task: "rehydrate after failed persist",
      stagedAt: Date.now(),
    });
    const claimed = await claimStagedPostCompactionDelegates(sessionKey, {
      claimFor: "next-seam-persist",
    });
    expect(claimed).toHaveLength(1);

    const delegate = claimed[0];
    expect(delegate).toBeDefined();
    if (!delegate) {
      throw new Error("expected claimed post-compaction delegate");
    }
    expect(await requeueReleasedPostCompactionDelegate(delegate)).toBe("requeued");

    const flowId = delegate.flowId;
    expect(flowId).toBeDefined();
    if (!flowId) {
      throw new Error("expected claimed delegate flow id");
    }
    expect(await custodyRecord(flowId)).toMatchObject({ status: "queued" });
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(1);
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
  });

  it("releases a crash-orphaned running row without a new compaction and drains it once", async () => {
    const sessionKey = "agent:main:subagent:pc-recover";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const flowId = await stageAndClaimRunning(sessionKey, "rehydrate after compaction");
    // Queued lane is empty — the row is `running` (mid-release), not awaiting a seam.
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(0);
    spawnSubagentDirectMock.mockResolvedValue({ status: "accepted" });

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    // Handed off WITHOUT waiting for another compaction seam.
    expect(result).toEqual({ sessions: 1, dispatched: 1, failed: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    const spawnParams = spawnSubagentDirectMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(spawnParams).toMatchObject({
      task: expect.stringContaining("[continuation:post-compaction] [continuation:chain-hop:1]"),
      silentAnnounce: true,
      wakeOnReturn: true,
      drainsContinuationDelegateQueue: true,
      continuationDelegateFlowId: flowId,
      continuationChildRunId: formatContinuationChildRunId(flowId, 1),
    });
    expect(spawnParams.task).toEqual(expect.stringContaining("rehydrate after compaction"));
    const persisted = findPersistedRecoveryEntry(sessionKey);
    expect(persisted).toMatchObject({
      continuationChainCount: 1,
      continuationChainTokens: 0,
    });
    // The record is permanently handed off with its accepted child, and the
    // released entry is settled, so nothing can replay it.
    const record = await custodyRecord(flowId);
    expect(record).toMatchObject({
      status: "succeeded",
      handoff: expect.objectContaining({ target: "session_delivery_queue" }),
    });
    expect(custodyStateForTest(record).childSessionKey).toEqual(expect.any(String));
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("[continuation:compaction-delegate-spawned]"),
      expect.objectContaining({ sessionKey }),
    );
  });

  // Contract change (RFC §4.4, §5.4.4): cancellation after the release is a
  // reset fence on the handed-off record, which the drain's spawn fence
  // refuses; the record keeps its handoff (handoffs are permanent).
  it("dead-letters a released delegate a reset fenced before its spawn", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { enabled: true, maxDelegatesPerTurn: 5 } } },
      ...ATTACHMENT_CONFIG,
    });
    const sessionKey = "agent:main:subagent:pc-cancelled-before-spawn";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const secret = "RECOVERY_CANCELLED_SECRET";
    const flowId = await stageAndClaimRunning(sessionKey, "must not rehydrate after cancellation", {
      returnOptions: { artifacts: "required" },
      attachments: [{ name: "private.md", content: secret, encoding: "utf8" }],
      attachAs: { mountPath: "handoff" },
    });
    beforeAdmissionReadHook.current = async () => {
      beforeAdmissionReadHook.current = undefined;
      await cancelSessionContinuations(sessionKey);
    };

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ sessions: 1, dispatched: 1, failed: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    const record = await custodyRecord(flowId);
    expect(record).toMatchObject({
      status: "succeeded",
      cancelRequestedAt: expect.any(Number),
    });
    expect(record.attachmentId).toBeUndefined();
    const state = custodyStateForTest(record);
    expect(state).not.toHaveProperty("attachments");
    expect(state).not.toHaveProperty("attachAs");
    expect(state.childSessionKey).toBeUndefined();
    expect(record.stateJson).not.toContain(secret);
    expect(removeUnacceptedDelegateArtifactPolicyMock).toHaveBeenCalledWith(flowId);
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
  });

  // Suspected product gap (reported to the lead): recovery used to terminalize
  // a claimed managed row whose accepted policy is missing or expired. Routed
  // through the queue drain (RFC §4.4), the policy error is charged as an
  // ordinary retry instead, so the policy is never removed and the entry is
  // redriven. These keep the old invariant: no spawn, policy removed, no retry.
  it("terminalizes a crash-orphaned artifact row whose accepted policy is missing", async () => {
    const sessionKey = "agent:main:subagent:pc-recover-policy-missing";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const flowId = await stageAndClaimRunning(sessionKey, "rehydrate artifact return after crash", {
      returnOptions: { artifacts: "optional" },
    });
    assertDelegateArtifactPolicyPreparedMock.mockImplementationOnce(() => {
      throw new MissingDelegateArtifactPolicyError();
    });

    await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await acceptedChildOf(flowId)).toBeUndefined();
    expect(removeUnacceptedDelegateArtifactPolicyMock).toHaveBeenCalledWith(flowId);
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
  });

  it("terminalizes a crash-orphaned artifact row whose accepted policy expired", async () => {
    const sessionKey = "agent:main:subagent:pc-recover-policy-expired";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const flowId = await stageAndClaimRunning(
      sessionKey,
      "reject expired artifact return after crash",
      { returnOptions: { artifacts: "required" } },
    );
    assertDelegateArtifactPolicyPreparedMock.mockImplementationOnce(() => {
      throw new UnavailableDelegateArtifactPolicyError();
    });

    await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await acceptedChildOf(flowId)).toBeUndefined();
    expect(removeUnacceptedDelegateArtifactPolicyMock).toHaveBeenCalledWith(flowId);
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
  });

  // Contract change (RFC §4.4): a claim whose release never committed has no
  // queue entry, so no spawn can have begun and no child can have produced an
  // artifact; the producer-completion shortcut is not consulted. The registry
  // row under the entry's attempt key is the only admission proof.
  it("releases a crash-orphaned artifact row without consulting producer artifact completion", async () => {
    const sessionKey = "agent:main:subagent:pc-recover-policy-terminal";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const flowId = await stageAndClaimRunning(
      sessionKey,
      "already produced artifact return before the crash",
      { returnOptions: { artifacts: "required" } },
    );
    hasRecordedDelegateArtifactCompletionForProducerMock.mockReturnValue(true);

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ sessions: 1, dispatched: 1, failed: 0 });
    expect(hasRecordedDelegateArtifactCompletionForProducerMock).not.toHaveBeenCalled();
    expect(assertDelegateArtifactPolicyPreparedMock).toHaveBeenCalledWith(flowId);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(spawnSubagentDirectMock.mock.calls[0]?.[0]).toMatchObject({
      continuationChildRunId: formatContinuationChildRunId(flowId, 1),
    });
    expect(removeUnacceptedDelegateArtifactPolicyMock).not.toHaveBeenCalled();
    expect(await acceptedChildOf(flowId)).toEqual(expect.any(String));
  });

  // Contract change (RFC §4.4): recovery no longer defers on a queue entry
  // for a running record. Release and queue insert are one commit, so a
  // record with an entry is already handed off; its entry belongs to the
  // session-delivery drain, which alone spawns it.
  it("leaves a released record to its queue entry and never re-releases it", async () => {
    const sessionKey = "agent:main:subagent:pc-recover-delivery-owned";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    await stagePostCompactionCustodyDelegate(sessionKey, {
      task: "rehydrate via queued delivery",
      stagedAt: Date.now(),
    });
    const [claimed] = await claimStagedPostCompactionDelegates(sessionKey);
    const flowId = expectDefined(claimed?.flowId, "claimed flow id");
    const release = await releaseStagedPostCompactionDelegateToQueue({
      sessionKey,
      delegate: toSessionPostCompactionDelegate(expectDefined(claimed, "claimed delegate")),
      sourceSessionId: "session-child",
      sequence: 0,
    });
    expect(release).toMatchObject({ released: true });

    const deferred = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(deferred).toEqual({ sessions: 0, dispatched: 0, failed: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await custodyRecord(flowId)).toMatchObject({
      status: "succeeded",
      handoff: expect.objectContaining({ target: "session_delivery_queue" }),
    });
    expect(await pendingPostCompactionEntries(sessionKey)).toHaveLength(1);

    await drainPostCompactionDelegateDeliveries({ sessionKey });

    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(await acceptedChildOf(flowId)).toEqual(expect.any(String));
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
    const again = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });
    expect(again).toEqual({ sessions: 0, dispatched: 0, failed: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
  });

  // Contract change (RFC §4.4, §5.4.4): the chain-state persist failure is
  // recorded on the released entry (recovery no longer rethrows it); the
  // redelivery settles the admitted child from subagent_runs without a second
  // spawn and charges the same reserved hop.
  it("keeps an accepted child's entry for redelivery when the required chain-state persist fails", async () => {
    const sessionKey = "agent:main:subagent:pc-recover-persist-fail";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const flowId = await stageAndClaimRunning(sessionKey, "rehydrate then persist fails");
    spawnSubagentDirectMock.mockResolvedValue({ status: "accepted" });
    patchSessionEntryShouldThrow = true;

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ sessions: 1, dispatched: 1, failed: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(patchSessionEntryOptions).toContainEqual(
      expect.objectContaining({ requireWriteSuccess: true }),
    );
    expect(await acceptedChildOf(flowId)).toBeUndefined();
    expect(findPersistedRecoveryEntry(sessionKey)).toBeUndefined();
    const [pending] = await pendingPostCompactionEntries(sessionKey);
    expect(pending).toMatchObject({
      sourceFlowId: flowId,
      retryCount: 1,
      lastError: expect.stringContaining("store write failed"),
      deliveryStartedAt: expect.any(Number),
    });

    const childSessionKey = "agent:main:subagent:pc-recover-persist-fail-child";
    admittedRuns.set(formatContinuationChildRunId(flowId, 1), {
      requesterSessionKey: sessionKey,
      childSessionKey,
    });
    patchSessionEntryShouldThrow = false;
    spawnSubagentDirectMock.mockClear();

    await drainPostCompactionDelegateDeliveries({
      sessionKey,
      entryIds: [expectDefined(pending?.id, "pending entry id")],
    });

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await acceptedChildOf(flowId)).toBe(childSessionKey);
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({
      continuationChainCount: 1,
      continuationChainTokens: 0,
    });
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
  });

  // Contract change (RFC §4.4): an acceptance that cannot commit fails the
  // released entry (kept for redelivery) instead of throwing out of recovery.
  it("does not settle a released entry as delivered when accepted-record finalization fails", async () => {
    const sessionKey = "agent:main:subagent:pc-recover-finalize-fail";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const flowId = await stageAndClaimRunning(sessionKey, "rehydrate then finalize fails");
    const rollbackAccepted = vi.fn(async () => undefined);
    spawnSubagentDirectMock.mockResolvedValue({ status: "accepted", rollbackAccepted });
    markSpawnAcceptedFailure.enabled = true;

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ sessions: 1, dispatched: 1, failed: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(rollbackAccepted).toHaveBeenCalledOnce();
    expect(await acceptedChildOf(flowId)).toBeUndefined();
    const pending = await pendingPostCompactionEntries(sessionKey);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      sourceFlowId: flowId,
      retryCount: 1,
      lastError: expect.stringContaining("post-compaction-source-accept-not-committed"),
    });
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
  });

  // Contract change (RFC §5.4.4): admission is read from subagent_runs under
  // the entry's attempt key, not from the derived child session key.
  it("settles a crash-orphaned row whose attempt child the registry already admitted", async () => {
    const sessionKey = "agent:main:subagent:pc-recover-accepted-child";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const flowId = await stageAndClaimRunning(sessionKey, "rehydrate already accepted child");
    const childSessionKey = "agent:main:subagent:pc-recover-accepted-child-run";
    admittedRuns.set(formatContinuationChildRunId(flowId, 1), {
      requesterSessionKey: sessionKey,
      childSessionKey,
    });

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ sessions: 1, dispatched: 1, failed: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await acceptedChildOf(flowId)).toBe(childSessionKey);
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({ continuationChainCount: 1 });
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
  });

  it("reconciles an accepted managed child before disabled runtime and policy gates", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { enabled: false } } },
    });
    const sessionKey = "agent:main:subagent:pc-recover-accepted-managed-disabled";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const flowId = await stageAndClaimRunning(
      sessionKey,
      "finalize accepted managed child while disabled",
      { returnOptions: { artifacts: "required" } },
    );
    const childSessionKey = "agent:main:subagent:pc-recover-accepted-managed-child";
    admittedRuns.set(formatContinuationChildRunId(flowId, 1), {
      requesterSessionKey: sessionKey,
      childSessionKey,
    });
    assertDelegateArtifactPolicyPreparedMock.mockImplementation(() => {
      throw new UnavailableDelegateArtifactPolicyError();
    });

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ sessions: 1, dispatched: 1, failed: 0 });
    expect(assertDelegateArtifactPolicyPreparedMock).not.toHaveBeenCalled();
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await acceptedChildOf(flowId)).toBe(childSessionKey);
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({
      continuationChainCount: 1,
    });
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
  });

  // Suspected product gap (reported to the lead), same family as the policy
  // tests above: the drain defers while continuation is disabled before its
  // policy gate, so an expired policy is kept until re-enable.
  it("terminalizes an expired managed policy before disabled-runtime deferral", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { enabled: false } } },
    });
    const sessionKey = "agent:main:subagent:pc-recover-expired-disabled";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const flowId = await stageAndClaimRunning(
      sessionKey,
      "reject expired managed policy while disabled",
      { returnOptions: { artifacts: "optional" } },
    );
    assertDelegateArtifactPolicyPreparedMock.mockImplementation(() => {
      throw new UnavailableDelegateArtifactPolicyError();
    });

    await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await acceptedChildOf(flowId)).toBeUndefined();
    expect(removeUnacceptedDelegateArtifactPolicyMock).toHaveBeenCalledWith(flowId);
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
  });

  // Contract change (RFC §4.4, §5.4.4): a never-dispatched spawn failure keeps
  // the released entry for retry (attempt ownership released) instead of
  // leaving the record `running`; the record is handed off to that entry.
  it("keeps a transient spawn failure's entry for retry — no terminalize, no silent drop", async () => {
    const sessionKey = "agent:main:subagent:pc-recover-fail";
    seedOwnerSession(sessionKey, { sessionId: "session-child" });
    const flowId = await stageAndClaimRunning(sessionKey, "rehydrate that fails");
    // Spawn/handoff fails before any dispatch.
    spawnSubagentDirectMock.mockResolvedValue({ status: "error", error: "gateway unavailable" });

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ sessions: 1, dispatched: 1, failed: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(await custodyRecord(flowId)).toMatchObject({
      status: "succeeded",
      handoff: expect.objectContaining({ target: "session_delivery_queue" }),
    });
    expect(await acceptedChildOf(flowId)).toBeUndefined();
    const stillQueued = await pendingPostCompactionEntries(sessionKey);
    expect(stillQueued).toHaveLength(1);
    expect(stillQueued[0]).toMatchObject({
      sourceFlowId: flowId,
      task: "rehydrate that fails",
      retryCount: 1,
    });
    expect(stillQueued[0]?.deliveryStartedAt).toBeUndefined();
    expect(await interruptedNoticeRows(sessionKey)).toEqual([]);
  });

  // Contract change (RFC §4.4): a forbidden spawn of a released record keeps
  // its permanent handoff and records the rejection on the record; transient
  // failures are retried from the queue entry.
  it("accepts released rows, rejects forbidden rows, and keeps transient errors queued", async () => {
    setRuntimeConfigSnapshot({
      agents: {
        defaults: {
          continuation: {
            enabled: true,
            maxChainLength: 10,
            maxDelegatesPerTurn: 3,
            costCapTokens: 500_000,
          },
        },
      },
    });
    const sessionKey = "agent:main:subagent:pc-spawn-statuses";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const acceptedFlowId = await stageAndClaimRunning(sessionKey, "accepted post-compaction row");
    const forbiddenFlowId = await stageAndClaimRunning(sessionKey, "forbidden post-compaction row");
    const transientFlowId = await stageAndClaimRunning(sessionKey, "transient post-compaction row");
    spawnOutcomesByTask({
      "accepted post-compaction row": async () => ({ status: "accepted" }),
      "forbidden post-compaction row": async () => ({
        status: "forbidden",
        error: "max children reached",
      }),
      "transient post-compaction row": async () => ({
        status: "error",
        error: "gateway unavailable",
      }),
    });

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ sessions: 1, dispatched: 3, failed: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(3);
    expect(await acceptedChildOf(acceptedFlowId)).toEqual(expect.any(String));
    const forbidden = await custodyRecord(forbiddenFlowId);
    expect(forbidden).toMatchObject({ status: "succeeded" });
    expect(forbidden.phase).toContain("max children reached");
    expect(custodyStateForTest(forbidden).childSessionKey).toBeUndefined();
    expect(await acceptedChildOf(transientFlowId)).toBeUndefined();
    expect(
      (await pendingPostCompactionEntries(sessionKey)).map((entry) => entry.sourceFlowId),
    ).toEqual([transientFlowId]);
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
  });

  it("accepts released rows, fails per-turn cap rejections, and keeps transient failures queued", async () => {
    setRuntimeConfigSnapshot({
      agents: {
        defaults: {
          continuation: {
            enabled: true,
            maxChainLength: 10,
            maxDelegatesPerTurn: 2,
            costCapTokens: 500_000,
          },
        },
      },
    });
    const sessionKey = "agent:main:subagent:pc-mixed-recover";
    seedOwnerSession(sessionKey, { sessionId: "session-child", continuationChainCount: 0 });
    const acceptedFlowId = await stageAndClaimRunning(sessionKey, "accepted rehydrate");
    const transientFlowId = await stageAndClaimRunning(sessionKey, "transient spawn outage");
    const rejectedFlowId = await stageAndClaimRunning(sessionKey, "over per-turn cap");
    spawnOutcomesByTask({
      "accepted rehydrate": async () => ({ status: "accepted" }),
      "transient spawn outage": async () => ({ status: "error", error: "gateway unavailable" }),
    });

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ sessions: 1, dispatched: 2, failed: 1 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(2);
    expect(spawnedTasks().some((task) => task.includes("over per-turn cap"))).toBe(false);
    expect(await acceptedChildOf(acceptedFlowId)).toEqual(expect.any(String));
    expect(await custodyRecord(rejectedFlowId)).toMatchObject({
      status: "failed",
      failureReason: expect.stringContaining("maxDelegatesPerTurn exceeded (2)"),
    });
    expect(
      (await pendingPostCompactionEntries(sessionKey)).map((entry) => entry.sourceFlowId),
    ).toEqual([transientFlowId]);
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
  });

  it("leaves staged post-compaction rows recoverable when the session store cannot load", async () => {
    const sessionKey = "agent:main:subagent:pc-store-load-fail";
    const flowId = await stageAndClaimRunning(sessionKey, "rehydrate after failed load");
    loadSessionStoreForRecoveryMock.mockImplementation(() => {
      throw new Error("store unreadable");
    });

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toMatchObject({ sessions: 0, dispatched: 0, failed: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await custodyRecord(flowId)).toMatchObject({ status: "running" });
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(1);
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
    expect(loggerRecords).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("leaving staged delegates recoverable"),
      }),
    );
  });

  it("leaves staged post-compaction rows recoverable when the session row is missing", async () => {
    const sessionKey = "agent:main:subagent:pc-missing-session-row";
    const flowId = await stageAndClaimRunning(sessionKey, "rehydrate after missing row");
    loadSessionStoreForRecoveryMock.mockReturnValue({});

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toMatchObject({ sessions: 0, dispatched: 0, failed: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await custodyRecord(flowId)).toMatchObject({ status: "running" });
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(1);
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
    expect(loggerRecords).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("post-compaction-recovery-session-missing"),
      }),
    );
  });

  it("does not touch queued (awaiting-seam) rows — only crash-orphaned running rows", async () => {
    const sessionKey = "agent:main:subagent:pc-awaiting-seam";
    seedOwnerSession(sessionKey, { sessionId: "session-child" });
    // A queued post-compaction row staged for a compaction that has NOT happened.
    await stagePostCompactionCustodyDelegate(sessionKey, {
      task: "await compaction",
      stagedAt: Date.now(),
    });
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(1);

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    // Nothing dispatched: releasing it now would fire before its compaction.
    expect(result).toMatchObject({ sessions: 0, dispatched: 0, failed: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(1);
    expect(await pendingPostCompactionEntries(sessionKey)).toEqual([]);
  });

  // Contract change (RFC §4.4): recovery releases the valid claim while
  // continuation is disabled; the queue drain's disabled gate defers its
  // spawn, so the entry waits in the queue instead of the record in `running`.
  it("rejects corrupt stale rows but defers valid rows when continuation is disabled", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { enabled: false } } },
    });
    const validSessionKey = "agent:main:subagent:pc-disabled-valid";
    const corruptSessionKey = "agent:main:subagent:pc-disabled-corrupt";
    const validFlowId = await stageAndClaimRunning(
      validSessionKey,
      "should not fire while disabled",
    );
    const corruptFlowId = await stageAndClaimRunning(
      corruptSessionKey,
      "must be scrubbed while disabled",
    );
    const secret = "DISABLED_POST_COMPACTION_ROOT_SECRET_MUST_NOT_RETAIN";
    const corrupt = await custodyRecord(corruptFlowId);
    const corrupted = await updateContinuationRecords(
      [
        {
          recordId: corrupt.recordId,
          ownerSessionKey: corrupt.ownerSessionKey,
          expectedRevision: corrupt.revision,
          patch: {
            stateJson: JSON.stringify({ ...custodyStateForTest(corrupt), extra: secret }),
          },
        },
      ],
      { now: Date.now() },
    );
    expect(corrupted.outcome).toBe("applied");

    const result = await recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: Date.now(),
    });

    // The corrupt row is scrubbed at listing time, so only the valid owner
    // session reaches recovery; it is released, then its spawn is deferred.
    expect(result).toEqual({ sessions: 1, dispatched: 1, failed: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await custodyRecord(validFlowId)).toMatchObject({
      status: "succeeded",
      handoff: expect.objectContaining({ target: "session_delivery_queue" }),
    });
    const deferred = await pendingPostCompactionEntries(validSessionKey);
    expect(deferred).toHaveLength(1);
    expect(deferred[0]).toMatchObject({ sourceFlowId: validFlowId, retryCount: 0 });
    const scrubbed = await custodyRecord(corruptFlowId);
    expect(scrubbed).toMatchObject({ status: "failed" });
    expect(custodyStateForTest(scrubbed)).toEqual({});
    expect(scrubbed.stateJson).not.toContain(secret);
    expect(await pendingPostCompactionEntries(corruptSessionKey)).toEqual([]);
  });
});
