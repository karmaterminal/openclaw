import crypto from "node:crypto";
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enqueueSystemEventMock = vi.fn();
const loggerRecords: Array<{ level: string; message: string }> = [];
// Observable persisted session entries for recovery persist assertions.
const recoveryStoreByPath = new Map<string, Record<string, unknown>>();
const spawnSubagentDirectMock = vi.fn();
// Admission evidence (RFC §5.4.4): `subagent_runs` rows keyed by child run ID.
// A claimed delegate is decided only from a row under one of its recorded
// child run IDs whose requester is the delegate's owner.
const admittedChildRuns = new Map<
  string,
  { requesterSessionKey: string; childSessionKey: string }
>();
// recovery derives the chain cost basis from the PERSISTED session entry
// (no explicit chainState survives a restart), so tests inject the persisted
// store here to prove the cost cap is enforced against the post-run child total.
const loadSessionStoreForRecoveryMock = vi.fn(
  (_storePath: string) => ({}) as Record<string, unknown>,
);
const pendingSessionDeliveriesForRecovery: Record<string, unknown>[] = [];
const updateSessionStoreForRecoveryOptions: Array<Record<string, unknown> | undefined> = [];
let updateSessionStoreForRecoveryShouldThrow = false;
let updateSessionStoreForRecoveryRequiredWriteCalls = 0;
let updateSessionStoreForRecoveryThrowOnRequiredWriteCall: number | undefined;

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

vi.mock("../../agents/subagents/registry/subagent-registry.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  prepareSubagentRunsByRunIds: async (runIds: readonly string[]) => ({
    consume: <T>(consume: (runs: Map<string, Record<string, unknown>>) => T) => ({
      ready: true as const,
      value: consume(
        new Map(
          runIds.flatMap((runId) => {
            const run = admittedChildRuns.get(runId);
            return run ? [[runId, { runId, ...run }] as const] : [];
          }),
        ),
      ),
    }),
  }),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEventRaw: (text: string, options: unknown) => enqueueSystemEventMock(text, options),
  removeSystemEvents: vi.fn(),
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

import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import {
  noopTracer,
  resetContinuationTracer,
  setContinuationTracer,
} from "../../infra/continuation-tracer.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import { resetGatewayWorkAdmission } from "../../process/gateway-work-admission.js";
import { createContinuationRecord, updateContinuationRecords } from "./custody/custody-store.js";
import {
  custodyStateForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import { CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG } from "./custody/spawn-interrupted-notice.js";
import { recoverPendingContinuationDelegates } from "./delegate-dispatch-recovery.js";
import { dispatchToolDelegates, resetDelegateDispatchHedgesForTests } from "./delegate-dispatch.js";
import { consumePendingDelegates, enqueuePendingDelegate } from "./delegate-store.js";
import { captureContinuationQueueContext } from "./queue-context.js";
import { resetContinuationStateForTests } from "./state.js";

useContinuationCustodyTestState();

async function readRecord(recordId: string) {
  return expectDefined(await readCustodyRecordForTest(recordId), `custody record ${recordId}`);
}

beforeEach(() => {
  enqueueSystemEventMock.mockClear();
  loggerRecords.length = 0;
  spawnSubagentDirectMock.mockReset().mockResolvedValue({ status: "accepted" });
  loadSessionStoreForRecoveryMock.mockReset().mockReturnValue(ownerSessionStore);
  admittedChildRuns.clear();
  recoveryStoreByPath.clear();
  pendingSessionDeliveriesForRecovery.length = 0;
  updateSessionStoreForRecoveryOptions.length = 0;
  updateSessionStoreForRecoveryShouldThrow = false;
  updateSessionStoreForRecoveryRequiredWriteCalls = 0;
  updateSessionStoreForRecoveryThrowOnRequiredWriteCall = undefined;
  resetGatewayWorkAdmission();
  vi.useFakeTimers();
});

afterEach(() => {
  resetDelegateDispatchHedgesForTests();
  resetContinuationStateForTests();
  resetContinuationTracer();
  clearRuntimeConfigSnapshot();
  admittedChildRuns.clear();
  pendingSessionDeliveriesForRecovery.length = 0;
  updateSessionStoreForRecoveryOptions.length = 0;
  updateSessionStoreForRecoveryShouldThrow = false;
  updateSessionStoreForRecoveryRequiredWriteCalls = 0;
  updateSessionStoreForRecoveryThrowOnRequiredWriteCall = undefined;
  resetGatewayWorkAdmission();
  vi.useRealTimers();
});

describe("tool delegate dispatch contract", () => {
  it("classifies corrupt cutoff-eligible recovery rows while disabled without loading or dispatching valid rows", async () => {
    const sessionKey = "agent:main:disabled-recovery";
    const valid = await enqueuePendingDelegate(sessionKey, { task: "valid held delegate" });
    const corrupt = await enqueuePendingDelegate(sessionKey, { task: "corrupt held delegate" });
    const secret = "DISABLED_PENDING_RECOVERY_SECRET_MUST_NOT_RETAIN";
    const corrupted = await updateContinuationRecords(
      [
        {
          recordId: corrupt.recordId,
          ownerSessionKey: sessionKey,
          expectedRevision: corrupt.revision,
          patch: {
            stateJson: JSON.stringify({ ...custodyStateForTest(corrupt), extra: secret }),
          },
        },
      ],
      { now: Date.now() },
    );
    expect(corrupted.outcome).toBe("applied");
    setRuntimeConfigSnapshot({ agents: { defaults: { continuation: { enabled: false } } } });

    const result = await recoverPendingContinuationDelegates({
      queuedCreatedAtOrBefore: Date.now(),
      includeRunningUpdatedAtOrBefore: Date.now(),
    });

    expect(result).toEqual({ sessions: 0, dispatched: 0, rejected: 0 });
    expect(await readRecord(valid.recordId)).toMatchObject({ status: "queued" });
    const corruptAfter = await readRecord(corrupt.recordId);
    expect(corruptAfter).toMatchObject({ status: "failed", stateJson: "{}" });
    expect(custodyStateForTest(corruptAfter)).toEqual({});
    expect(corruptAfter.stateJson).not.toContain(secret);
    expect(loadSessionStoreForRecoveryMock).not.toHaveBeenCalled();
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
  });

  it("recovers a running delegate by reconciling the admitted child under its recorded child run id", async () => {
    // RFC §5.4.4 (Q3): a claim left `running` by a dead dispatch is decided
    // from subagent_runs under its recorded child run ID, never re-spawned.
    const sessionKey = "agent:main:root";
    const record = await enqueuePendingDelegate(sessionKey, {
      task: "recover already spawned child",
    });
    const [claimed] = await consumePendingDelegates(sessionKey);
    const attempt = expectDefined(claimed?.spawnAttempt, "claimed spawn attempt");
    expect(attempt.childRunId).toBe(`continuation:${record.recordId}:${attempt.attemptId}`);
    expect(await readRecord(record.recordId)).toMatchObject({ status: "running" });
    const digest = crypto.createHash("sha256").update(record.recordId).digest("hex").slice(0, 32);
    const childSessionKey = `agent:main:subagent:continuation-${digest}`;
    admittedChildRuns.set(attempt.childRunId, { requesterSessionKey: sessionKey, childSessionKey });

    const first = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      recoverRunningDelegates: true,
      includeRunningUpdatedAtOrBefore: Date.now(),
    });

    expect(first.dispatched).toBe(1);
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    const recovered = await readRecord(record.recordId);
    expect(recovered.status).toBe("succeeded");
    expect(custodyStateForTest(recovered)).toMatchObject({ childSessionKey });
  });

  it("derives deterministic child session keys from canonical agent session parsing", async () => {
    const sessionKey = "AGENT:Work:root";
    const record = await enqueuePendingDelegate(sessionKey, { task: "mixed-case parent key" });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    const expectedChildSessionKey =
      "agent:work:subagent:continuation-" +
      crypto.createHash("sha256").update(record.recordId).digest("hex").slice(0, 32);
    expect(custodyStateForTest(await readRecord(record.recordId))).toMatchObject({
      childSessionKey: expectedChildSessionKey,
    });
  });

  it("caps dispatch at maxDelegatesPerTurn and surfaces over-limit delegates", async () => {
    const sessionKey = "session-delegate-cap";
    for (let index = 0; index < 6; index++) {
      await enqueuePendingDelegate(sessionKey, { task: `delegate-${index}` });
    }

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.dispatched).toBe(5);
    expect(result.rejected).toBe(1);
    expect(result.chainState.currentChainCount).toBe(5);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(5);
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("maxDelegatesPerTurn exceeded (5). Task: delegate-5"),
      { sessionKey: resolveSystemEventQueueKey(sessionKey, "main"), trusted: true },
    );
  });

  it("dispatchQueuedRegardlessOfDelay force-dispatches a not-yet-due delegate (fail-closed persist-failure path)", async () => {
    const sessionKey = "session-force-dispatch-delayed";
    await enqueuePendingDelegate(sessionKey, { task: "delayed hop", delayMs: 60_000 });

    // Without the override, an unmatured delegate is left queued (not dispatched).
    const held = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });
    expect(held.dispatched).toBe(0);
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    // With the override, it dispatches immediately despite the unelapsed delay —
    // used when the child chain-cost persist failed so a delayed delegate is not
    // left durably queued to recover on a stale cost basis.
    const forced = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      dispatchQueuedRegardlessOfDelay: true,
    });
    expect(forced.dispatched).toBe(1);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
  });

  it("honors the resolved run delegate cap", async () => {
    const sessionKey = "session-delegate-cap";
    for (let index = 0; index < 3; index++) {
      await enqueuePendingDelegate(sessionKey, { task: `delegate-${index}` });
    }

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      config: {
        enabled: true,
        defaultDelayMs: 15_000,
        minDelayMs: 5_000,
        maxDelayMs: 300_000,
        maxChainLength: 10,
        costCapTokens: 500_000,
        maxDelegatesPerTurn: 2,
        maxPendingWork: 32,
        crossSessionTargeting: "disabled",
        earlyWarningBand: 0.3125,
      },
    });

    expect(result.dispatched).toBe(2);
    expect(result.rejected).toBe(1);
    expect(result.chainState.currentChainCount).toBe(2);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(2);
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("maxDelegatesPerTurn exceeded (2). Task: delegate-2"),
      { sessionKey: resolveSystemEventQueueKey(sessionKey, "main"), trusted: true },
    );
  });

  it("maps delegate modes into spawn flags without changing normal delegates", async () => {
    const sessionKey = "session-delegate-modes";
    await enqueuePendingDelegate(sessionKey, { task: "normal" });
    await enqueuePendingDelegate(sessionKey, { task: "silent", mode: "silent" });
    await enqueuePendingDelegate(sessionKey, { task: "wake", mode: "silent-wake" });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    const spawnParams = spawnSubagentDirectMock.mock.calls.map(
      (call) => call[0] as Record<string, unknown>,
    );
    expect(spawnParams[0]).toMatchObject({
      task: expect.stringContaining("normal"),
      drainsContinuationDelegateQueue: true,
    });
    expect(spawnParams[0]).not.toHaveProperty("silentAnnounce");
    expect(spawnParams[0]).not.toHaveProperty("wakeOnReturn");
    expect(spawnParams[1]).toMatchObject({
      task: expect.stringContaining("silent"),
      silentAnnounce: true,
      drainsContinuationDelegateQueue: true,
    });
    expect(spawnParams[1]).not.toHaveProperty("wakeOnReturn");
    expect(spawnParams[2]).toMatchObject({
      task: expect.stringContaining("wake"),
      silentAnnounce: true,
      wakeOnReturn: true,
      drainsContinuationDelegateQueue: true,
    });
  });

  it("inherits parent silent policy for a default-mode delegate", async () => {
    // A delegate queued by a silent parent chain must stay
    // internal even though its own mode is unset. inheritedSilent (no wake) →
    // silentAnnounce, no wakeOnReturn.
    const sessionKey = "session-inherit-silent";
    await enqueuePendingDelegate(sessionKey, { task: "default child" });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      inheritedSilent: true,
    });

    const spawnParams = spawnSubagentDirectMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(spawnParams).toMatchObject({
      task: expect.stringContaining("default child"),
      silentAnnounce: true,
    });
    expect(spawnParams).not.toHaveProperty("wakeOnReturn");
  });

  it("inherits parent silent+wake policy for a default-mode delegate", async () => {
    const sessionKey = "session-inherit-wake";
    await enqueuePendingDelegate(sessionKey, { task: "default child" });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      inheritedSilent: true,
      inheritedWake: true,
    });

    const spawnParams = spawnSubagentDirectMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(spawnParams).toMatchObject({
      task: expect.stringContaining("default child"),
      silentAnnounce: true,
      wakeOnReturn: true,
    });
  });

  it("does not upgrade an explicit silent delegate to silent-wake via inheritance", async () => {
    const sessionKey = "session-explicit-silent-inherit-wake";
    await enqueuePendingDelegate(sessionKey, { task: "explicit silent child", mode: "silent" });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      inheritedSilent: true,
      inheritedWake: true,
    });

    const spawnParams = spawnSubagentDirectMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(spawnParams).toMatchObject({
      task: expect.stringContaining("explicit silent child"),
      silentAnnounce: true,
    });
    expect(spawnParams).not.toHaveProperty("wakeOnReturn");
  });

  it("keeps a default-mode delegate visible without inherited policy", async () => {
    // Normal (non-silent) parent: the default-mode delegate stays visible.
    const sessionKey = "session-no-inherit";
    await enqueuePendingDelegate(sessionKey, { task: "default child" });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    const spawnParams = spawnSubagentDirectMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(spawnParams).toMatchObject({ task: expect.stringContaining("default child") });
    expect(spawnParams).not.toHaveProperty("silentAnnounce");
    expect(spawnParams).not.toHaveProperty("wakeOnReturn");
  });

  it("wake inheritance only applies when the parent was also silent", async () => {
    // inheritedWake without inheritedSilent must NOT wake — mirrors the guard
    // semantics (parentWasSilent && wakeOnReturn), so a non-silent parent stays visible.
    const sessionKey = "session-inherit-wake-only";
    await enqueuePendingDelegate(sessionKey, { task: "default child" });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
      inheritedWake: true,
    });

    const spawnParams = spawnSubagentDirectMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(spawnParams).not.toHaveProperty("silentAnnounce");
    expect(spawnParams).not.toHaveProperty("wakeOnReturn");
  });

  it("dispatches silent and silent-wake default returns without target fields", async () => {
    const sessionKey = "session-delegate-default-return-modes";
    await enqueuePendingDelegate(sessionKey, { task: "silent default", mode: "silent" });
    await enqueuePendingDelegate(sessionKey, { task: "wake default", mode: "silent-wake" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result).toMatchObject({ dispatched: 2, rejected: 0 });
    const spawnParams = spawnSubagentDirectMock.mock.calls.map(
      (call) => call[0] as Record<string, unknown>,
    );
    expect(spawnParams[0]).toMatchObject({
      task: expect.stringContaining("silent default"),
      silentAnnounce: true,
    });
    expect(spawnParams[0]).not.toHaveProperty("continuationTargetSessionKey");
    expect(spawnParams[0]).not.toHaveProperty("continuationTargetSessionKeys");
    expect(spawnParams[0]).not.toHaveProperty("continuationFanoutMode");
    expect(spawnParams[0]).toMatchObject({
      continuationRecipientAuthorityBinding: {
        version: 1,
        selection: "selected",
        recipients: [
          {
            sessionKey,
            authority: expect.objectContaining({ state: "bound", epoch: expect.any(String) }),
          },
        ],
      },
    });
    expect(spawnParams[1]).toMatchObject({
      task: expect.stringContaining("wake default"),
      silentAnnounce: true,
      wakeOnReturn: true,
      continuationRecipientAuthorityBinding: {
        version: 1,
        selection: "selected",
        recipients: [
          {
            sessionKey,
            authority: expect.objectContaining({ state: "bound", epoch: expect.any(String) }),
          },
        ],
      },
    });
    expect(spawnParams[1]).not.toHaveProperty("continuationTargetSessionKey");
    expect(spawnParams[1]).not.toHaveProperty("continuationTargetSessionKeys");
    expect(spawnParams[1]).not.toHaveProperty("continuationFanoutMode");
  });

  it("threads cross-session targeting metadata into spawned continuation runs", async () => {
    setRuntimeConfigSnapshot({
      agents: { defaults: { continuation: { crossSessionTargeting: "enabled" } } },
    });
    const sessionKey = "session-delegate-targeting";
    await enqueuePendingDelegate(sessionKey, {
      task: "targeted fanout",
      mode: "silent-wake",
      targetSessionKeys: ["agent:main:root", "agent:main:sibling"],
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("targeted fanout"),
        silentAnnounce: true,
        wakeOnReturn: true,
        continuationTargetSessionKeys: ["agent:main:root", "agent:main:sibling"],
        continuationRecipientAuthorityBinding: {
          version: 1,
          selection: "selected",
          recipients: [
            {
              sessionKey: "agent:main:root",
              authority: expect.objectContaining({ state: "bound", epoch: expect.any(String) }),
            },
            {
              sessionKey: "agent:main:sibling",
              authority: expect.objectContaining({ state: "bound", epoch: expect.any(String) }),
            },
          ],
        },
      }),
      expect.objectContaining({
        agentSessionKey: sessionKey,
      }),
    );
  });

  it("rebinds a stored requester override to the child owner when a delayed row fires", async () => {
    const sessionKey = "agent:main:subagent:delayed-bracket-owner";
    const now = Date.now();
    const seeded = await createContinuationRecord({
      recordId: "legacy-requester-flow",
      kind: "delegate",
      ownerSessionKey: sessionKey,
      status: "queued",
      phase: "Queued for continuation dispatch",
      createdAt: now,
      dueAt: now,
      stateJson: JSON.stringify({
        kind: "continuation_delegate",
        task: "delayed bracket with requester context",
        spawnRequesterSessionKey: "agent:main:main",
        spawnRequesterChannel: "discord",
        spawnRequesterAccountId: "acct",
        spawnRequesterTo: "channel",
        spawnRequesterThreadId: "thread",
      }),
    });
    expect(seeded.outcome).toBe("created");

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result).toMatchObject({ dispatched: 1, rejected: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("delayed bracket with requester context"),
      }),
      expect.objectContaining({
        agentSessionKey: sessionKey,
        agentChannel: undefined,
        agentAccountId: undefined,
        agentTo: undefined,
        agentThreadId: undefined,
      }),
    );
  });

  it("threads persisted traceparent into spawned continuation runs", async () => {
    const sessionKey = "session-delegate-traceparent";
    const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    await enqueuePendingDelegate(sessionKey, {
      task: "continue traced work",
      traceparent,
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("continue traced work"),
        traceparent,
      }),
      expect.objectContaining({
        agentSessionKey: sessionKey,
      }),
    );
  });

  it("threads the persisted model override into spawned continuation runs", async () => {
    const sessionKey = "session-delegate-model";
    await enqueuePendingDelegate(sessionKey, {
      task: "continue on a specific model",
      model: "github-copilot/gpt-5.4-nano",
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("continue on a specific model"),
        model: "github-copilot/gpt-5.4-nano",
      }),
      expect.objectContaining({
        agentSessionKey: sessionKey,
      }),
    );
  });

  it("omits model from spawned continuation runs when the delegate inherits the parent model", async () => {
    const sessionKey = "session-delegate-inherited-model";
    await enqueuePendingDelegate(sessionKey, { task: "continue with inherited model" });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    const spawnParams = expectDefined(
      spawnSubagentDirectMock.mock.calls.at(0)?.at(0),
      "spawn params",
    ) as Record<string, unknown>;
    expect(spawnParams.task).toEqual(expect.stringContaining("continue with inherited model"));
    expect(spawnParams).not.toHaveProperty("model");
  });

  it("resolves persisted logical traceparents before spawning continuation runs", async () => {
    const sessionKey = "session-delegate-exported-traceparent";
    const logicalTraceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const exportedTraceparent = "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01";
    setContinuationTracer({
      startSpan: () => noopTracer.startSpan("x"),
      formatTraceparent: (traceContext) =>
        traceContext.traceId === "4bf92f3577b34da6a3ce929d0e0e4736"
          ? exportedTraceparent
          : undefined,
    });
    await enqueuePendingDelegate(sessionKey, {
      task: "continue traced work",
      traceparent: logicalTraceparent,
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("continue traced work"),
        traceparent: exportedTraceparent,
      }),
      expect.objectContaining({
        agentSessionKey: sessionKey,
      }),
    );
  });

  it("carries the exported dispatch span traceparent into spawned continuation runs", async () => {
    const sessionKey = "session-delegate-dispatch-carrier";
    const persistedTraceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const dispatchTraceparent = "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01";
    const dispatchSpan = {
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      traceparent: vi.fn(() => dispatchTraceparent),
      end: vi.fn(),
    };
    const startSpan = vi.fn(() => dispatchSpan);
    setContinuationTracer({
      startSpan,
      formatTraceparent: () => undefined,
    });
    await enqueuePendingDelegate(sessionKey, {
      task: "continue traced work from dispatch",
      traceparent: persistedTraceparent,
    });

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(startSpan).toHaveBeenCalledWith(
      "continuation.delegate.dispatch",
      expect.objectContaining({
        traceparent: persistedTraceparent,
      }),
    );
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("continue traced work from dispatch"),
        traceparent: dispatchTraceparent,
      }),
      expect.objectContaining({
        agentSessionKey: sessionKey,
      }),
    );
    expect(dispatchSpan.setStatus).toHaveBeenCalledWith("OK");
    expect(dispatchSpan.end).toHaveBeenCalledTimes(1);
  });

  it("advances chain state and prefixes spawned tasks with the next hop", async () => {
    const sessionKey = "session-delegate-chain";
    await enqueuePendingDelegate(sessionKey, { task: "inspect logs" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: {
        currentChainCount: 2,
        chainStartedAt: 1_700_000_000_000,
        accumulatedChainTokens: 123,
      },
      ctx: { sessionKey, agentChannel: "discord", agentTo: "channel" },
      maxChainLength: 10,
    });

    expect(result.chainState).toEqual({
      currentChainCount: 3,
      chainStartedAt: 1_700_000_000_000,
      accumulatedChainTokens: 123,
      chainId: expect.any(String),
    });
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "[continuation:chain-hop:3] Delegated task (turn 3/10): inspect logs",
      }),
      expect.objectContaining({
        agentSessionKey: sessionKey,
        agentChannel: "discord",
        agentAccountId: undefined,
        agentTo: "channel",
        agentThreadId: undefined,
      }),
    );
  });

  it("marks rejected/thrown delegates failed without aborting later delegates", async () => {
    const sessionKey = "session-delegate-spawn-failure";
    const rejectedRecord = await enqueuePendingDelegate(sessionKey, { task: "rejected" });
    const thrownRecord = await enqueuePendingDelegate(sessionKey, { task: "throws" });
    const acceptedRecord = await enqueuePendingDelegate(sessionKey, { task: "accepted" });
    spawnSubagentDirectMock
      .mockResolvedValueOnce({ status: "forbidden" })
      .mockRejectedValueOnce(new Error("spawn unavailable"))
      .mockResolvedValueOnce({ status: "accepted" });

    const result = await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    expect(result.dispatched).toBe(1);
    expect(result.rejected).toBe(2);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(3);
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("DELEGATE spawn forbidden"),
      { sessionKey: resolveSystemEventQueueKey(sessionKey, "main"), trusted: true },
    );
    // RFC §5.4.4: a spawn that threw after the call began has unproven
    // admission, so it ends in exactly one durable interrupted notice (a
    // session-delivery row plus its fast-path event) and is never requeued.
    const interruptedEvents = enqueueSystemEventMock.mock.calls.filter(
      ([text]) =>
        typeof text === "string" && text.includes(CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG),
    );
    expect(interruptedEvents).toHaveLength(1);
    const [interruptedText, interruptedOptions] = expectDefined(
      interruptedEvents[0],
      "interrupted notice event",
    );
    expect(interruptedText).toContain(`Delegate record ${thrownRecord.recordId}`);
    expect(interruptedText).toContain("Task: throws");
    expect(interruptedOptions).toMatchObject({
      sessionKey: resolveSystemEventQueueKey(sessionKey, "main"),
      trusted: true,
    });
    const { loadPendingSessionDeliveries } = await vi.importActual<
      typeof import("../../infra/session-delivery-queue-storage.js")
    >("../../infra/session-delivery-queue-storage.js");
    const noticeRows = (
      await loadPendingSessionDeliveries(captureContinuationQueueContext())
    ).filter(
      (entry) =>
        entry.kind === "systemEvent" &&
        entry.text.includes(CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG),
    );
    expect(noticeRows).toHaveLength(1);
    expect(noticeRows[0]).toMatchObject({ sessionKey, text: interruptedText });
    expect(
      enqueueSystemEventMock.mock.calls.some(
        ([text]) => typeof text === "string" && text.includes("DELEGATE spawn failed"),
      ),
    ).toBe(false);
    expect(await readRecord(rejectedRecord.recordId)).toMatchObject({
      status: "failed",
      failureReason: expect.stringContaining("DELEGATE spawn forbidden"),
    });
    expect(await readRecord(thrownRecord.recordId)).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
    });
    expect((await readRecord(thrownRecord.recordId)).terminalNoticePending).toBeUndefined();
    expect((await readRecord(acceptedRecord.recordId)).status).toBe("succeeded");
  });

  it("marks over-limit delegates failed instead of leaving them as silent success", async () => {
    const sessionKey = "session-delegate-over-limit-status";
    const records = [];
    for (let index = 0; index < 6; index++) {
      records.push(await enqueuePendingDelegate(sessionKey, { task: `delegate-${index}` }));
    }

    await dispatchToolDelegates({
      sessionKey,
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey },
      maxChainLength: 10,
    });

    const sixth = expectDefined(records.at(5), "sixth record");
    expect((await readRecord(sixth.recordId)).status).toBe("failed");
  });
});
