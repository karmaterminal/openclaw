import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enqueueSystemEventMock = vi.fn();
const loggerRecords: Array<{ level: string; message: string }> = [];
// Observable persisted session entries for recovery persist assertions.
const recoveryStoreByPath = new Map<string, Record<string, unknown>>();
const spawnSubagentDirectMock = vi.fn();
// `subagent_runs` rows keyed by run ID. Admission evidence for a claimed
// delegate is read under its recorded child run IDs (RFC §5.4.4); a row whose
// requester is the owner proves the Gateway admitted that attempt.
const subagentRunsByRunId = new Map<
  string,
  { requesterSessionKey: string; childSessionKey: string }
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

vi.mock("../../agents/subagents/registry/subagent-registry.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../agents/subagents/registry/subagent-registry.js")
  >()),
  prepareSubagentRunsByRunIds: async (runIds: readonly string[]) => ({
    consume: <T>(consume: (runs: ReadonlyMap<string, unknown>) => T) => ({
      ready: true as const,
      value: consume(
        new Map(
          runIds.flatMap((runId) => {
            const run = subagentRunsByRunId.get(runId);
            return run ? [[runId, { runId, ...run }] as const] : [];
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

import { deriveContinuationDelegateChildSessionKeyFromParent } from "../../agents/subagent-continuation-ids.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import { resetContinuationTracer } from "../../infra/continuation-tracer.js";
import { loadPendingSessionDeliveries } from "../../infra/session-delivery-queue-storage.js";
import { resetGatewayWorkAdmission } from "../../process/gateway-work-admission.js";
import {
  claimContinuationSpawnAttempt,
  updateContinuationRecords,
} from "./custody/custody-store.js";
import type { ContinuationRecord } from "./custody/custody-store.types.js";
import {
  custodyStateForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import { CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG } from "./custody/spawn-interrupted-notice.js";
import { recoverPendingContinuationDelegates } from "./delegate-dispatch-recovery.js";
import { resetDelegateDispatchHedgesForTests } from "./delegate-dispatch.js";
import { enqueuePendingDelegate, resetDelegateStoreForTests } from "./delegate-store.js";
import { hasLiveContinuationTimerRefs, resetContinuationStateForTests } from "./state.js";

useContinuationCustodyTestState();

function findPersistedRecoveryEntry(sessionKey: string): Record<string, unknown> | undefined {
  for (const store of recoveryStoreByPath.values()) {
    const entry = store[sessionKey];
    if (entry) {
      return entry as Record<string, unknown>;
    }
  }
  return undefined;
}

/** Advance to a hedge deadline and wait for every dispatch it started to settle. */
async function fireHedgesAfter(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  while (detachedGatewayWork.length > 0) {
    await Promise.allSettled(detachedGatewayWork.splice(0));
    // Let a failed run's `.catch` re-arm before the caller advances again.
    await vi.advanceTimersByTimeAsync(0);
  }
}

async function readRecord(recordId: string): Promise<ContinuationRecord> {
  return expectDefined(await readCustodyRecordForTest(recordId), `custody record ${recordId}`);
}

/**
 * Leave a queued delegate claimed the way a dispatch that died between the
 * claim commit and the acceptance commit leaves it: `running`, with one
 * recorded spawn attempt (RFC §5.4.4 boundaries 2-4).
 */
async function claimAsCrashedDispatch(
  record: ContinuationRecord,
  now = Date.now(),
): Promise<{ record: ContinuationRecord; childRunId: string }> {
  const current = await readRecord(record.recordId);
  const claimed = await claimContinuationSpawnAttempt({
    recordId: current.recordId,
    ownerSessionKey: current.ownerSessionKey,
    expectedRevision: current.revision,
    now,
  });
  if (claimed.outcome !== "claimed") {
    throw new Error(`expected to claim ${record.recordId}, got ${claimed.outcome}`);
  }
  return { record: claimed.record, childRunId: claimed.attempt.childRunId };
}

/** Record the Gateway's admission of an attempt in `subagent_runs`. */
function admitChildRun(params: { childRunId: string; ownerSessionKey: string; recordId: string }) {
  subagentRunsByRunId.set(params.childRunId, {
    requesterSessionKey: params.ownerSessionKey,
    childSessionKey: deriveContinuationDelegateChildSessionKeyFromParent(
      params.ownerSessionKey,
      params.recordId,
    ),
  });
}

async function interruptedNoticeRows(sessionKey: string) {
  return (await loadPendingSessionDeliveries()).filter(
    (entry) =>
      entry.sessionKey === sessionKey &&
      entry.kind === "systemEvent" &&
      entry.text.includes(CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG),
  );
}

function interruptedNoticeEvents(): unknown[][] {
  return enqueueSystemEventMock.mock.calls.filter(
    ([text]) =>
      typeof text === "string" && text.includes(CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG),
  );
}

/** Q3 settlement: failed, never spawned again, exactly one durable notice. */
async function expectInterruptedClaim(record: ContinuationRecord): Promise<void> {
  const settled = await readRecord(record.recordId);
  expect(settled).toMatchObject({
    status: "failed",
    failureReason: "spawn-interrupted",
  });
  expect(settled.terminalNoticePending).toBeUndefined();
  expect(settled.handoff).toBeUndefined();
  const rows = await interruptedNoticeRows(record.ownerSessionKey);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    text: expect.stringContaining(`Delegate record ${record.recordId} was claimed`),
  });
  expect(interruptedNoticeEvents()).toHaveLength(1);
}

beforeEach(() => {
  enqueueSystemEventMock.mockClear();
  loggerRecords.length = 0;
  spawnSubagentDirectMock.mockReset().mockResolvedValue({ status: "accepted" });
  loadSessionStoreForRecoveryMock.mockReset().mockReturnValue(ownerSessionStore);
  subagentRunsByRunId.clear();
  detachedGatewayWork.length = 0;
  recoveryStoreByPath.clear();
  updateSessionStoreForRecoveryOptions.length = 0;
  updateSessionStoreForRecoveryShouldThrow = false;
  updateSessionStoreForRecoveryRequiredWriteCalls = 0;
  updateSessionStoreForRecoveryThrowOnRequiredWriteCall = undefined;
  resetGatewayWorkAdmission();
  // Custody commands run on the shared-state worker, which needs real
  // setImmediate/microtask scheduling; only wall-clock timers are faked.
  vi.useFakeTimers({
    toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
});

afterEach(() => {
  resetDelegateDispatchHedgesForTests();
  resetContinuationStateForTests();
  resetContinuationTracer();
  clearRuntimeConfigSnapshot();
  subagentRunsByRunId.clear();
  updateSessionStoreForRecoveryOptions.length = 0;
  updateSessionStoreForRecoveryShouldThrow = false;
  updateSessionStoreForRecoveryRequiredWriteCalls = 0;
  updateSessionStoreForRecoveryThrowOnRequiredWriteCall = undefined;
  resetGatewayWorkAdmission();
  vi.useRealTimers();
});

describe("recoverPendingContinuationDelegates", () => {
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
      // Durable delegate encode applies the sessions_spawn attachment policy, so
      // positive-path recovery fixtures must opt in or enqueue throws before recovery
      // runs. Disabled-policy rejection stays owned by the attachment validator tests.
      tools: { sessions_spawn: { attachments: { enabled: true } } },
    });
  });

  it("uses the recovered session key even when caller ctx has a stale sessionKey", async () => {
    // Recovery derives the store path from the recovered key's agent id, which is
    // required explicitly since the implicit-main fallback was removed. Real owner
    // keys are agent-scoped; the stale ctx key below is what must lose.
    const sessionKey = "agent:main:recovered-ctx";
    await enqueuePendingDelegate(sessionKey, { task: "recover ctx" });

    await recoverPendingContinuationDelegates({
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      ctx: { sessionKey: "stale-session" },
      maxChainLength: 10,
    });

    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );
  });

  it("spawns a queued delegate when the registry only knows a foreign run under its child session key", async () => {
    // RFC §5.4.4: admission evidence is read under the record's recorded child
    // run IDs, never by child-session liveness. A stale registry row that shares
    // the deterministic child session key but not a recorded run ID proves
    // nothing, so the queued delegate still spawns exactly once.
    const sessionKey = "agent:main:stale-registry-parent";
    const record = await enqueuePendingDelegate(sessionKey, { task: "stale registry recovery" });
    const deterministicChildKey = deriveContinuationDelegateChildSessionKeyFromParent(
      sessionKey,
      record.recordId,
    );
    subagentRunsByRunId.set("run-stale", {
      requesterSessionKey: sessionKey,
      childSessionKey: deterministicChildKey,
    });

    await recoverPendingContinuationDelegates({
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      maxChainLength: 10,
    });

    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    const settled = await readRecord(record.recordId);
    const childRunId = expectDefined(settled.spawnAttempts[0]?.childRunId, "spawn attempt");
    expect(childRunId).toBe(
      `continuation:${record.recordId}:${settled.spawnAttempts[0]?.attemptId}`,
    );
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ continuationChildRunId: childRunId }),
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );
    expect(settled).toMatchObject({
      status: "succeeded",
      handoff: {
        target: "subagent_runs",
        childRunId,
        childSessionKey: deterministicChildKey,
      },
    });
  });

  it("settles a claim crashed before accept with one interrupted notice and never replays it (RFC §5.4.4 Q3)", async () => {
    const sessionKey = "agent:main:boot-replay-parent";
    const record = await enqueuePendingDelegate(sessionKey, { task: "boot replay once" });
    const { childRunId } = await claimAsCrashedDispatch(record);

    const recovered = await recoverPendingContinuationDelegates({
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      maxChainLength: 10,
    });

    expect(recovered).toMatchObject({ sessions: 1, dispatched: 0, rejected: 1 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    await expectInterruptedClaim(record);
    const [row] = await interruptedNoticeRows(sessionKey);
    expect(row).toMatchObject({ text: expect.stringContaining(childRunId) });

    // A second recovery pass neither spawns nor notifies again.
    await recoverPendingContinuationDelegates({
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      maxChainLength: 10,
    });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    await expectInterruptedClaim(record);
  });

  it("settles a force-claimed not-yet-due running delegate instead of stranding it by due time", async () => {
    const sessionKey = "agent:main:force-claim-crash";
    // A delayed delegate force-claimed to `running` pre-due (ignoreDelay), then
    // orphaned by a crash before spawn accept — its dueAt is still in the future.
    const record = await enqueuePendingDelegate(sessionKey, {
      task: "delayed hop",
      delayMs: 60_000,
    });
    await claimAsCrashedDispatch(record);

    await recoverPendingContinuationDelegates({
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      maxChainLength: 10,
    });

    // The delay gate applies only to queued rows, so recovery decides this
    // running claim despite its future dueAt rather than skipping it (which
    // would strand it `running` with no hedge to re-arm it). Without admission
    // evidence it is interrupted, never re-spawned (RFC §5.4.4 Q3).
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    await expectInterruptedClaim(record);
  });

  it("preserves delayed attachment input when restart recovery arms the hedge", async () => {
    const sessionKey = "agent:main:delayed-attachment-recovery";
    const attachments = [{ name: "restart.txt", content: "durable child input" }];
    await enqueuePendingDelegate(sessionKey, {
      task: "recover delayed attachments",
      delayMs: 60_000,
      attachments,
      attachAs: { mountPath: "recovered" },
    });
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 0,
        continuationChainStartedAt: Date.now(),
        continuationChainTokens: 0,
      },
    });
    resetDelegateStoreForTests();

    await recoverPendingContinuationDelegates({});
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    await fireHedgesAfter(60_000);

    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments,
        attachMountPath: "recovered",
      }),
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );
  });

  it("keeps empty delayed attachment input equivalent to omission after restart recovery", async () => {
    const sessionKey = "agent:main:delayed-empty-attachment-recovery";
    await enqueuePendingDelegate(sessionKey, {
      task: "recover without an attachment snapshot",
      delayMs: 60_000,
      attachments: [],
      attachAs: { mountPath: "unused" },
    });
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 0,
        continuationChainStartedAt: Date.now(),
        continuationChainTokens: 0,
      },
    });

    await recoverPendingContinuationDelegates({});
    await fireHedgesAfter(60_000);

    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    const spawnParams = expectDefined(spawnSubagentDirectMock.mock.calls[0]?.[0], "spawn params");
    expect(spawnParams).not.toHaveProperty("attachments");
    expect(spawnParams).not.toHaveProperty("attachMountPath");
    expect(spawnSubagentDirectMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );
  });

  it("reconciles a claimed continuation child admitted before the acceptance commit", async () => {
    const sessionKey = "agent:main:parent";
    const record = await enqueuePendingDelegate(sessionKey, {
      task: "recover without duplicate spawn",
    });

    // Simulate a crash after Gateway admission but before the acceptance commit:
    // custody stays `running` at the claimed attempt, while `subagent_runs`
    // already holds the attempt's child run under the owner. Recovery must
    // commit the handoff and skip a second spawn (RFC §5.4.4).
    const { childRunId } = await claimAsCrashedDispatch(record);
    admitChildRun({ childRunId, ownerSessionKey: sessionKey, recordId: record.recordId });
    const deterministicChildKey = deriveContinuationDelegateChildSessionKeyFromParent(
      sessionKey,
      record.recordId,
    );

    await recoverPendingContinuationDelegates({
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      maxChainLength: 10,
    });

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    const settled = await readRecord(record.recordId);
    expect(settled).toMatchObject({
      status: "succeeded",
      handoff: { target: "subagent_runs", childRunId, childSessionKey: deterministicChildKey },
    });
    expect(custodyStateForTest(settled)).toMatchObject({ childSessionKey: deterministicChildKey });
    expect(await interruptedNoticeRows(sessionKey)).toEqual([]);
  });

  it("does not replay running delegates claimed after recovery starts", async () => {
    const sessionKey = "agent:main:recovery-race";
    const record = await enqueuePendingDelegate(sessionKey, {
      task: "skip live-claimed running row",
    });
    await claimAsCrashedDispatch(record, Date.now() + 2_000);

    await recoverPendingContinuationDelegates({
      chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
      maxChainLength: 10,
    });

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect((await readRecord(record.recordId)).status).toBe("running");
    expect(await interruptedNoticeRows(sessionKey)).toEqual([]);
  });

  it("does not replay queued delegates created after recovery was armed", async () => {
    const sessionKey = "agent:main:startup-live-queued-race";
    vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
    const first = await enqueuePendingDelegate(sessionKey, { task: "pre-start recovery row" });
    const recoveryArmedAt = Date.now();
    vi.setSystemTime(new Date(recoveryArmedAt + 1));
    const second = await enqueuePendingDelegate(sessionKey, {
      task: "live request row",
      delayMs: 60_000,
    });
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: { sessionId: "session-child", continuationChainCount: 0 },
    });

    const recovered = await recoverPendingContinuationDelegates({
      queuedCreatedAtOrBefore: recoveryArmedAt,
      includeRunningUpdatedAtOrBefore: recoveryArmedAt,
    });

    expect(recovered).toMatchObject({ sessions: 1, dispatched: 1, rejected: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ task: expect.stringContaining("pre-start recovery row") }),
      expect.objectContaining({ agentSessionKey: sessionKey }),
    );
    expect(await readRecord(first.recordId)).toMatchObject({ status: "succeeded" });
    expect(await readRecord(second.recordId)).toMatchObject({ status: "queued" });
    expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(false);
  });

  it("enforces the cost cap against the persisted child chain cost on recovery", async () => {
    // The finding: a delayed delegate queued under a child session is re-driven
    // on restart by recoverPendingContinuationDelegates, which derives the chain
    // cost from the PERSISTED child entry (no in-memory fold survives a restart).
    // The child's own run cost is folded into the child entry's durable
    // continuationChainTokens at settle (subagent-announce accumulation), so a
    // child run that already blew past costCapTokens cannot launch the delayed
    // hop after a restart. Recovery is invoked WITHOUT an explicit chainState
    // (as the gateway startup path does), forcing the derive-from-store path.
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
    const sessionKey = "agent:main:subagent:cost-recovery";
    const record = await enqueuePendingDelegate(sessionKey, { task: "delayed hop after restart" });
    // Persisted child chain cost already over the cap (post-run accumulation).
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 1,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 555_000,
      },
    });

    await recoverPendingContinuationDelegates({});

    // Cost cap enforced from the persisted basis → no spawn, delegate failed.
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readRecord(record.recordId)).toMatchObject({ status: "failed" });
  });

  it("recovery applies the delegate's durable chainTokensFold over a stale child entry", async () => {
    // When the settle-time child chain-cost persist FAILED, the child entry is
    // permanently stale (missing this run's tokens) and the in-memory fold does
    // not survive a restart. The fold is instead recorded durably on the delegate
    // (chainTokensFold); recovery must add it to the stale child-entry cost so the
    // cost cap still holds — otherwise a child over costCapTokens launches the hop.
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
    const sessionKey = "agent:main:subagent:fold-recovery";
    // A delegate carrying the durable fold that survived the restart still
    // queued. (An orphaned `running` claim is never re-spawned, so it would not
    // reach the budget check at all — RFC §5.4.4 Q3.)
    const record = await enqueuePendingDelegate(sessionKey, {
      task: "delayed hop",
      chainTokensFold: 250_000,
    });
    // The persisted child entry is stale: UNDER the cap without the fold.
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 1,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 300_000,
      },
    });

    await recoverPendingContinuationDelegates({});

    // 300_000 (stale entry) + 250_000 (durable fold) = 550_000 > costCapTokens
    // (500_000) → rejected. Without the durable fold recovery would read 300_000
    // and wrongly launch the over-budget hop.
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    const settled = await readRecord(record.recordId);
    expect(settled).toMatchObject({ status: "failed" });
    expect(settled.failureReason).toContain("Tool delegate rejected");
    expect(settled.failureReason).not.toBe("spawn-interrupted");
  });

  it("leaves pending delegates recoverable when the session store cannot load", async () => {
    const sessionKey = "agent:main:store-load-fail";
    const queued = await enqueuePendingDelegate(sessionKey, { task: "queued remains recoverable" });
    const running = await enqueuePendingDelegate(sessionKey, {
      task: "running remains recoverable",
    });
    await claimAsCrashedDispatch(running);
    loadSessionStoreForRecoveryMock.mockImplementation(() => {
      throw new Error("permission denied");
    });

    const result = await recoverPendingContinuationDelegates({});

    expect(result).toMatchObject({ sessions: 0, dispatched: 0, rejected: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readRecord(queued.recordId)).toMatchObject({ status: "queued" });
    expect(await readRecord(running.recordId)).toMatchObject({ status: "running" });
  });

  it("leaves pending delegates recoverable when the session row is missing", async () => {
    const sessionKey = "agent:main:missing-session-row";
    const queued = await enqueuePendingDelegate(sessionKey, { task: "queued remains recoverable" });
    const running = await enqueuePendingDelegate(sessionKey, {
      task: "running remains recoverable",
    });
    await claimAsCrashedDispatch(running);
    loadSessionStoreForRecoveryMock.mockReturnValue({});

    const result = await recoverPendingContinuationDelegates({});

    expect(result).toMatchObject({ sessions: 0, dispatched: 0, rejected: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readRecord(queued.recordId)).toMatchObject({ status: "queued" });
    expect(await readRecord(running.recordId)).toMatchObject({ status: "running" });
    expect(loggerRecords).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("delegate-recovery-session-missing"),
      }),
    );
    expect(loggerRecords).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("leaving queued/running delegates recoverable"),
      }),
    );
  });

  it("keeps regular accepted rows recoverable when recovered chain-state persist fails", async () => {
    const sessionKey = "agent:main:subagent:delegate-recover-persist-fail";
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: { sessionId: "session-child", continuationChainCount: 0 },
    });
    const record = await enqueuePendingDelegate(sessionKey, {
      task: "accepted before persist failure",
    });
    updateSessionStoreForRecoveryShouldThrow = true;

    const first = await recoverPendingContinuationDelegates({});

    expect(first).toMatchObject({ sessions: 1, dispatched: 0, rejected: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(updateSessionStoreForRecoveryOptions).toContainEqual({ requireWriteSuccess: true });
    const claimed = await readRecord(record.recordId);
    expect(claimed).toMatchObject({ status: "running" });
    expect(findPersistedRecoveryEntry(sessionKey)).toBeUndefined();
    expect(loggerRecords).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("delegate-recovery-chain-persist-failed"),
      }),
    );

    // The accepted child is in `subagent_runs` under the claimed attempt.
    const childRunId = expectDefined(claimed.spawnAttempts.at(-1)?.childRunId, "spawn attempt");
    admitChildRun({ childRunId, ownerSessionKey: sessionKey, recordId: record.recordId });
    updateSessionStoreForRecoveryShouldThrow = false;
    spawnSubagentDirectMock.mockClear();

    const reconciled = await recoverPendingContinuationDelegates({});

    expect(reconciled).toMatchObject({ sessions: 1, dispatched: 1, rejected: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readRecord(record.recordId)).toMatchObject({
      status: "succeeded",
      handoff: { target: "subagent_runs", childRunId },
    });
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({
      continuationChainCount: 1,
      continuationChainTokens: 0,
    });
  });

  it("persists the folded chain state when a recovered delayed delegate's hedge fires", async () => {
    // The finding: recovery opts into applyDelegateChainTokensFold but, for a
    // still-unmatured delayed delegate, only ARMS a hedge. Without a
    // persistChainState callback the hedge folds the cost in memory and loses it
    // on the next hop. Recovery must supply the callback so the hedge durably
    // advances the folded chain state — otherwise the cost cap is bypassed after
    // restart.
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
    const sessionKey = "agent:main:subagent:hedge-fold-persist";
    // A queued delayed delegate carrying a durable fold that survived a restart.
    await enqueuePendingDelegate(sessionKey, {
      task: "delayed hop after restart",
      delayMs: 60_000,
      chainTokensFold: 50_000,
    });
    // Persisted child entry is UNDER the cap without the fold.
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 1,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 100_000,
      },
    });

    // Recovery arms the hedge (delegate not yet due); nothing dispatched yet.
    await recoverPendingContinuationDelegates({});
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    // Hedge fires: 100_000 (persisted) + 50_000 (fold) = 150_000 < cap → spawn,
    // and the advanced folded state is persisted durably.
    await fireHedgesAfter(60_000);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);

    const persisted = findPersistedRecoveryEntry(sessionKey);
    expect(persisted).toBeDefined();
    // Chain advanced to hop 2 and the folded post-run cost (150_000) is durable,
    // so a later hop enforces the cap against the folded basis, not stale 100_000.
    expect(persisted?.continuationChainCount).toBe(2);
    expect(persisted?.continuationChainTokens).toBe(150_000);
  });

  it("recovers a hedge-claimed row after recovered chain-state persist fails", async () => {
    const sessionKey = "agent:main:subagent:hedge-persist-fail-retry";
    const record = await enqueuePendingDelegate(sessionKey, {
      task: "delayed hop with transient persist failure",
      delayMs: 60_000,
      chainTokensFold: 50_000,
    });
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 1,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 100_000,
      },
    });

    await recoverPendingContinuationDelegates({});
    updateSessionStoreForRecoveryShouldThrow = true;

    await fireHedgesAfter(60_000);

    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    const claimed = await readRecord(record.recordId);
    expect(claimed).toMatchObject({ status: "running" });
    expect(findPersistedRecoveryEntry(sessionKey)).toBeUndefined();

    const childRunId = expectDefined(claimed.spawnAttempts.at(-1)?.childRunId, "spawn attempt");
    admitChildRun({ childRunId, ownerSessionKey: sessionKey, recordId: record.recordId });
    updateSessionStoreForRecoveryShouldThrow = false;
    spawnSubagentDirectMock.mockClear();

    // The failed hedge dispatch re-armed itself with a recovery cutoff at the
    // failure. When it fires, it decides the claim from `subagent_runs` rather
    // than spawning again (RFC §5.4.4): the child was admitted, so custody hands
    // off and the folded chain state becomes durable.
    await fireHedgesAfter(30_000);

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readRecord(record.recordId)).toMatchObject({
      status: "succeeded",
      handoff: { target: "subagent_runs", childRunId },
    });
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({
      continuationChainCount: 2,
      continuationChainTokens: 150_000,
    });
  });

  it("does not reapply a shared fold after a later recovered row persist fails", async () => {
    const sessionKey = "agent:main:subagent:shared-fold-partial-persist";
    const first = await enqueuePendingDelegate(sessionKey, {
      task: "first shared fold",
      chainTokensFold: 50_000,
    });
    const second = await enqueuePendingDelegate(sessionKey, {
      task: "second shared fold",
      chainTokensFold: 50_000,
    });
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 1,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 100_000,
      },
    });
    updateSessionStoreForRecoveryThrowOnRequiredWriteCall = 2;

    const firstPass = await recoverPendingContinuationDelegates({});

    expect(firstPass).toMatchObject({ sessions: 1, dispatched: 0, rejected: 0 });
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(2);
    expect(await readRecord(first.recordId)).toMatchObject({ status: "succeeded" });
    const retried = await readRecord(second.recordId);
    expect(retried).toMatchObject({ status: "running" });
    expect(custodyStateForTest(retried).chainTokensFold).toBe(undefined);
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({
      continuationChainCount: 2,
      continuationChainTokens: 150_000,
    });

    const childRunId = expectDefined(retried.spawnAttempts.at(-1)?.childRunId, "spawn attempt");
    admitChildRun({ childRunId, ownerSessionKey: sessionKey, recordId: second.recordId });
    updateSessionStoreForRecoveryThrowOnRequiredWriteCall = undefined;
    spawnSubagentDirectMock.mockClear();

    const reconciled = await recoverPendingContinuationDelegates({});

    expect(reconciled).toMatchObject({ sessions: 1, dispatched: 1, rejected: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readRecord(second.recordId)).toMatchObject({ status: "succeeded" });
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({
      continuationChainCount: 3,
      continuationChainTokens: 150_000,
    });
  });

  it("does not advance a recovered row whose planned chain state is already durable", async () => {
    const sessionKey = "agent:main:subagent:planned-chain-state-recovery";
    const record = await enqueuePendingDelegate(sessionKey, {
      task: "accepted after planned persist",
      chainTokensFold: 50_000,
    });
    const { record: claimed, childRunId } = await claimAsCrashedDispatch(record);
    const { chainTokensFold: _fold, ...state } = custodyStateForTest(claimed);
    const planned = await updateContinuationRecords(
      [
        {
          recordId: claimed.recordId,
          ownerSessionKey: sessionKey,
          expectedRevision: claimed.revision,
          patch: {
            stateJson: JSON.stringify({
              ...state,
              persistedChainState: {
                currentChainCount: 2,
                chainStartedAt: 1_700_000_000_000,
                accumulatedChainTokens: 150_000,
                chainId: "chain-planned",
              },
            }),
          },
        },
      ],
      { now: Date.now() },
    );
    expect(planned).toMatchObject({ outcome: "applied" });
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 2,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 150_000,
        continuationChainId: "chain-planned",
      },
    });
    admitChildRun({ childRunId, ownerSessionKey: sessionKey, recordId: record.recordId });

    const recovered = await recoverPendingContinuationDelegates({});

    expect(recovered).toMatchObject({ sessions: 1, dispatched: 1, rejected: 0 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readRecord(record.recordId)).toMatchObject({ status: "succeeded" });
    expect(findPersistedRecoveryEntry(sessionKey)).toMatchObject({
      continuationChainCount: 2,
      continuationChainTokens: 150_000,
      continuationChainId: "chain-planned",
    });
  });

  it("keeps budget checks for planned chain-state rows without an accepted child", async () => {
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
    const sessionKey = "agent:main:subagent:planned-chain-state-over-budget";
    const record = await enqueuePendingDelegate(sessionKey, { task: "planned but not accepted" });
    // A spawnable (queued) row that carries a planned chain state. An orphaned
    // `running` claim never reaches the budget check (RFC §5.4.4 Q3).
    const current = await readRecord(record.recordId);
    const planned = await updateContinuationRecords(
      [
        {
          recordId: current.recordId,
          ownerSessionKey: sessionKey,
          expectedRevision: current.revision,
          patch: {
            stateJson: JSON.stringify({
              ...custodyStateForTest(current),
              persistedChainState: {
                currentChainCount: 2,
                chainStartedAt: 1_700_000_000_000,
                accumulatedChainTokens: 600_000,
                chainId: "chain-planned-over-budget",
              },
            }),
          },
        },
      ],
      { now: Date.now() },
    );
    expect(planned).toMatchObject({ outcome: "applied" });
    loadSessionStoreForRecoveryMock.mockReturnValue({
      [sessionKey]: {
        sessionId: "session-child",
        continuationChainCount: 2,
        continuationChainStartedAt: 1_700_000_000_000,
        continuationChainTokens: 600_000,
        continuationChainId: "chain-planned-over-budget",
      },
    });

    const recovered = await recoverPendingContinuationDelegates({});

    expect(recovered).toMatchObject({ sessions: 1, dispatched: 0, rejected: 1 });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    const settled = await readRecord(record.recordId);
    expect(settled).toMatchObject({ status: "failed" });
    expect(settled.failureReason).toContain("Tool delegate rejected");
  });
});
