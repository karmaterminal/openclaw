import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerContinuationDispatchClaim } from "../../auto-reply/continuation/continuation-dispatch-claims.js";
import { resetContinuationCustodyProjection } from "../../auto-reply/continuation/custody/custody-projection.js";
import { hydrateContinuationCustody } from "../../auto-reply/continuation/custody/custody-store.js";
import type {
  ContinuationRecord,
  ContinuationRecordPatch,
} from "../../auto-reply/continuation/custody/custody-store.types.js";
import {
  custodyStateForTest,
  listCustodyRecordsForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "../../auto-reply/continuation/custody/custody.test-support.js";
import {
  decodeWorkState,
  encodeWorkState,
  workRecordDueAt,
  type PendingContinuationWork,
} from "../../auto-reply/continuation/work-flow-state.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import { replaceSessionEntrySync } from "../../config/sessions/session-accessor.js";
import { clearSessionStoreCacheForTest } from "../../config/sessions/store-writer-state.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resetSystemEventsForTest } from "../../infra/system-events.js";
import { closeOpenClawAgentDatabasesForTest } from "../../state/openclaw-agent-db.js";
import { closeOpenClawStateDatabaseAsync } from "../../state/openclaw-state-db.js";
import type { EmbeddedAgentRunResult } from "../embedded-agent.js";
import { scheduleSpawnInitContinueWorkWake } from "./attempt-execution.continue-work.js";

type CustodyStoreModule = typeof import("../../auto-reply/continuation/custody/custody-store.js");
type StateWorkerStoreModule = typeof import("../../state/openclaw-state-worker-store.js");

// Hooks at the custody writes the spawn-init owner performs. Each hook runs a
// real concurrent custody write at that point; `custodyActual` holds the
// unwrapped store so those concurrent writes are not themselves intercepted.
const custodyRuntimeState = vi.hoisted(() => ({
  beforeFailRecord: undefined as ((recordId: string) => void | Promise<void>) | undefined,
  /**
   * Runs between the election planner's read of the owner's live work and the
   * election commit (both are separate worker commands), with the 1-based
   * index of the election commit.
   */
  beforeElectionCommit: undefined as ((commit: number) => Promise<void>) | undefined,
  electionCommits: 0,
  beforeAtomicUpdate: undefined as (() => Promise<void>) | undefined,
  /** A concurrent writer advances a live record of every direct update first. */
  contendAtomicUpdates: false,
  beforeRequestCancel: undefined as ((recordId: string) => Promise<void>) | undefined,
}));
const custodyActual = vi.hoisted(() => ({ store: undefined as unknown }));
const sessionAccessorState = vi.hoisted(() => ({
  afterPatchCall: undefined as ((call: number) => void | Promise<void>) | undefined,
  failPatchCall: undefined as number | undefined,
  patchCalls: 0,
}));

vi.mock("../../state/openclaw-state-worker-store.js", async (importOriginal) => {
  const actual = await importOriginal<StateWorkerStoreModule>();
  // Custody operations are pure forwarders of one command; replaying one
  // against a recording scope names the command without running it.
  const commandType = async (operation: (scope: never) => Promise<unknown>) => {
    let type: unknown;
    const recorder = {
      execute: async (command: { type?: unknown }) => {
        type = command.type;
        return undefined;
      },
    };
    try {
      // SAFETY: the recorder implements the only scope member custody operations use.
      await operation(recorder as never);
    } catch {
      // Not a custody forwarder; it runs unchanged below.
    }
    return type;
  };
  const run = async (...args: Parameters<typeof actual.runOpenClawStateWorkerOperation>) => {
    const hook = custodyRuntimeState.beforeElectionCommit;
    if (hook && (await commandType(args[1])) === "continuationCustody.elect") {
      custodyRuntimeState.electionCommits += 1;
      await hook(custodyRuntimeState.electionCommits);
    }
    return await actual.runOpenClawStateWorkerOperation(...args);
  };
  return { ...actual, runOpenClawStateWorkerOperation: run };
});

vi.mock("../../auto-reply/continuation/custody/custody-store.js", async (importOriginal) => {
  const actual = await importOriginal<CustodyStoreModule>();
  custodyActual.store = actual;
  return {
    ...actual,
    failContinuationRecord: async (...args: Parameters<typeof actual.failContinuationRecord>) => {
      await custodyRuntimeState.beforeFailRecord?.(args[0].recordId);
      return await actual.failContinuationRecord(...args);
    },
    updateContinuationRecords: async (
      ...args: Parameters<typeof actual.updateContinuationRecords>
    ) => {
      await custodyRuntimeState.beforeAtomicUpdate?.();
      if (custodyRuntimeState.contendAtomicUpdates) {
        const records = await actual.listContinuationRecords({
          recordIds: args[0].map((update) => update.recordId),
          statuses: ["queued", "running"],
        });
        const [contended] = records;
        if (contended) {
          await actual.updateContinuationRecords(
            [
              {
                recordId: contended.recordId,
                ownerSessionKey: contended.ownerSessionKey,
                expectedRevision: contended.revision,
                patch: { phase: "concurrent rollback contention" },
              },
            ],
            { now: Date.now() },
          );
        }
      }
      return await actual.updateContinuationRecords(...args);
    },
    requestContinuationRecordCancel: async (
      ...args: Parameters<typeof actual.requestContinuationRecordCancel>
    ) => {
      await custodyRuntimeState.beforeRequestCancel?.(args[0].recordId);
      return await actual.requestContinuationRecordCancel(...args);
    },
  };
});

function actualCustody(): CustodyStoreModule {
  // SAFETY: the custody-store mock factory stores the real module before any test runs.
  return custodyActual.store as CustodyStoreModule;
}

vi.mock("../../config/sessions/session-accessor.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/sessions/session-accessor.js")>();
  return {
    ...actual,
    patchSessionEntryCore: async (
      ...args: Parameters<typeof actual.patchSessionEntryCore>
    ): ReturnType<typeof actual.patchSessionEntryCore> => {
      sessionAccessorState.patchCalls += 1;
      if (sessionAccessorState.patchCalls === sessionAccessorState.failPatchCall) {
        throw new Error("synthetic continuation persistence failure");
      }
      const result = await actual.patchSessionEntryCore(...args);
      await sessionAccessorState.afterPatchCall?.(sessionAccessorState.patchCalls);
      return result;
    },
  };
});

function makeConfig(maxPendingWork = 8): OpenClawConfig {
  return {
    agents: {
      defaults: {
        continuation: {
          enabled: true,
          maxChainLength: 200,
          defaultDelayMs: 15_000,
          minDelayMs: 5_000,
          maxDelayMs: 86_400_000,
          costCapTokens: 50_000_000,
          maxDelegatesPerTurn: 500,
          maxPendingWork,
        },
      },
    },
  } as unknown as OpenClawConfig;
}

function makeRunResult(): EmbeddedAgentRunResult {
  return {
    payloads: [{ text: "ok" }],
    meta: {
      durationMs: 1,
      finalAssistantVisibleText: "ok",
      agentMeta: {
        sessionId: "session-embedded",
        provider: "anthropic",
        model: "claude-sonnet-4.7",
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          total: 2,
        },
      },
    },
  };
}

type OwnerRecord = ContinuationRecord & { state: Record<string, unknown> };

function findFlowByReason(
  records: readonly OwnerRecord[],
  reason: string,
): OwnerRecord | undefined {
  return records.find((record) => decodeWorkState(record)?.reason === reason);
}

async function listOwnerRecords(ownerKey: string): Promise<OwnerRecord[]> {
  return (await listCustodyRecordsForTest({ ownerSessionKey: ownerKey })).map((record) =>
    Object.assign(record, { state: custodyStateForTest(record) }),
  );
}

/** Read the owner's records from a freshly reopened database and projection. */
async function reloadOwnerRecords(ownerKey: string): Promise<OwnerRecord[]> {
  resetContinuationCustodyProjection();
  await closeOpenClawStateDatabaseAsync();
  await hydrateContinuationCustody();
  return await listOwnerRecords(ownerKey);
}

async function requireRecord(recordId: string): Promise<ContinuationRecord> {
  const record = await readCustodyRecordForTest(recordId);
  if (!record) {
    throw new Error(`expected continuation record ${recordId}`);
  }
  return record;
}

/** A concurrent writer's revision CAS on one record. */
async function concurrentPatch(
  record: ContinuationRecord,
  patch: ContinuationRecordPatch,
): Promise<boolean> {
  const result = await actualCustody().updateContinuationRecords(
    [
      {
        recordId: record.recordId,
        ownerSessionKey: record.ownerSessionKey,
        expectedRevision: record.revision,
        patch,
      },
    ],
    { now: Date.now() },
  );
  return result.outcome === "applied";
}

async function concurrentFinish(record: ContinuationRecord, phase: string): Promise<boolean> {
  const result = await actualCustody().finishContinuationRecord({
    recordId: record.recordId,
    ownerSessionKey: record.ownerSessionKey,
    expectedRevision: record.revision,
    now: Date.now(),
    phase,
  });
  return result.outcome === "applied";
}

/** Seed queued same-session work as a committed election creates it. */
async function enqueuePendingWork(
  work: PendingContinuationWork,
): Promise<ContinuationRecord | null> {
  const state = encodeWorkState(work);
  const result = await actualCustody().createContinuationRecord({
    recordId: crypto.randomUUID(),
    kind: "work",
    ownerSessionKey: work.sessionKey,
    ...(work.chainId ? { chainId: work.chainId } : {}),
    status: "queued",
    phase: "Queued for same-session continuation wake",
    createdAt: work.electedAt,
    dueAt: workRecordDueAt(state),
    stateJson: JSON.stringify(state),
  });
  return result.outcome === "created" ? result.record : null;
}

useContinuationCustodyTestState();

describe("spawn-init continuation cancellation races", () => {
  let tmpDir: string;
  let sessionEntry: SessionEntry;
  let sessionStore: Record<string, SessionEntry>;
  let storePath: string;
  let sessionKey: string;

  beforeEach(async () => {
    const { resetContinuationWorkDispatchForTests } =
      await import("../../auto-reply/continuation/work-dispatch.js");
    resetContinuationWorkDispatchForTests();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-spawn-init-races-"));
    storePath = path.join(tmpDir, "sessions.json");
    sessionEntry = {
      sessionId: "session-embedded",
      updatedAt: Date.now(),
    } as SessionEntry;
    sessionKey = `agent:main:subagent:spawn-init-races:${crypto.randomUUID()}`;
    sessionStore = { [sessionKey]: sessionEntry };
    replaceSessionEntrySync({ storePath, sessionKey }, sessionEntry);
    clearSessionStoreCacheForTest();
    custodyRuntimeState.beforeFailRecord = undefined;
    custodyRuntimeState.beforeElectionCommit = undefined;
    custodyRuntimeState.electionCommits = 0;
    custodyRuntimeState.beforeAtomicUpdate = undefined;
    custodyRuntimeState.contendAtomicUpdates = false;
    custodyRuntimeState.beforeRequestCancel = undefined;
    sessionAccessorState.afterPatchCall = undefined;
    sessionAccessorState.failPatchCall = undefined;
    sessionAccessorState.patchCalls = 0;
    setRuntimeConfigSnapshot(makeConfig());
  });

  afterEach(async () => {
    const { resetContinuationWorkDispatchForTests } =
      await import("../../auto-reply/continuation/work-dispatch.js");
    resetContinuationWorkDispatchForTests();
    resetSystemEventsForTest();
    clearRuntimeConfigSnapshot();
    clearSessionStoreCacheForTest();
    closeOpenClawAgentDatabasesForTest();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function schedule(
    requests: Array<{ reason: string; delaySeconds: number }>,
    options: { abortSignal?: AbortSignal; maxPendingWork?: number } = {},
  ): Promise<void> {
    const cfg = makeConfig(options.maxPendingWork);
    setRuntimeConfigSnapshot(cfg);
    await scheduleSpawnInitContinueWorkWake({
      sessionKey,
      sessionEntry,
      sessionStore,
      storePath,
      requests,
      cfg,
      runResult: makeRunResult(),
      originRunId: "run-spawn-init-races",
      originTurnId: "session-embedded",
      abortSignal: options.abortSignal,
    });
  }

  async function enqueuePriorParkedWork(reason: string): Promise<void> {
    const now = Date.now();
    const work = await enqueuePendingWork({
      sessionKey,
      hop: 1,
      delayMs: 30_000,
      electedAt: now,
      dueAt: now + 60_000,
      maxChainLength: 200,
      chainStartedAt: now,
      accumulatedChainTokens: 2,
      reason,
      anchorPending: true,
      idleRetry: {
        trigger: "reply-run-ended",
        reasonCategory: "follow-up-work",
        armedAt: now,
      },
    });
    expect(work).not.toBeNull();
  }

  function expectRestoredChainState(): void {
    expect(sessionStore[sessionKey]).toMatchObject({
      continuationChainCount: 0,
      continuationChainTokens: 0,
    });
  }

  it("rolls back the finalized partial-batch reservation when cancellation wins", async () => {
    const abort = new AbortController();
    sessionAccessorState.afterPatchCall = (call) => {
      if (call === 2) {
        abort.abort("test cancellation after partial finalization");
      }
    };

    await schedule(
      [
        { reason: "scheduled first election", delaySeconds: 30 },
        { reason: "pending-capped second election", delaySeconds: 30 },
      ],
      { abortSignal: abort.signal, maxPendingWork: 1 },
    );

    const flows = await listOwnerRecords(sessionKey);
    expect(flows).toHaveLength(1);
    expect(flows[0]).toMatchObject({ status: "failed" });
    expectRestoredChainState();
  });

  it("aborts an already-running wake before cancellation terminalizes it", async () => {
    const abort = new AbortController();
    let wakeSignal: AbortSignal | undefined;
    let releaseClaim = () => {};
    sessionAccessorState.afterPatchCall = async (call) => {
      if (call !== 2) {
        return;
      }
      const created = findFlowByReason(
        await listOwnerRecords(sessionKey),
        "zero-delay running wake",
      );
      if (!created) {
        throw new Error("expected created continuation flow");
      }
      if (!(await concurrentPatch(created, { status: "running" }))) {
        throw new Error("expected continuation flow to enter running state");
      }
      const claim = registerContinuationDispatchClaim({
        sessionKey,
        flowId: created.recordId,
      });
      wakeSignal = claim.controller.signal;
      releaseClaim = claim.release;
      abort.abort("test cancellation while replacement wake is running");
    };

    await schedule([{ reason: "zero-delay running wake", delaySeconds: 0 }], {
      abortSignal: abort.signal,
    });

    const postCancelSideEffects = wakeSignal?.aborted ? 0 : 1;
    releaseClaim();
    expect(wakeSignal?.aborted).toBe(true);
    expect(postCancelSideEffects).toBe(0);
    expect(await listOwnerRecords(sessionKey)).toEqual([
      expect.objectContaining({ status: "failed" }),
    ]);
  });

  it("aborts a wake that becomes running during cancellation cleanup", async () => {
    const abort = new AbortController();
    let wakeSignal: AbortSignal | undefined;
    let releaseClaim = () => {};
    custodyRuntimeState.beforeFailRecord = async (recordId) => {
      custodyRuntimeState.beforeFailRecord = undefined;
      const queued = await requireRecord(recordId);
      if (!(await concurrentPatch(queued, { status: "running" }))) {
        throw new Error("expected continuation flow to enter running state");
      }
      const claim = registerContinuationDispatchClaim({ sessionKey, flowId: recordId });
      wakeSignal = claim.controller.signal;
      releaseClaim = claim.release;
    };
    sessionAccessorState.afterPatchCall = (call) => {
      if (call === 2) {
        abort.abort("test cancellation during cleanup claim race");
      }
    };

    await schedule([{ reason: "cleanup-racing wake", delaySeconds: 30 }], {
      abortSignal: abort.signal,
    });

    const postCancelSideEffects = wakeSignal?.aborted ? 0 : 1;
    releaseClaim();
    expect(wakeSignal?.aborted).toBe(true);
    expect(postCancelSideEffects).toBe(0);
    expect(await listOwnerRecords(sessionKey)).toEqual([
      expect.objectContaining({ status: "failed" }),
    ]);
  });

  it("continues multi-wake cleanup and rolls back after one terminalization throws", async () => {
    const abort = new AbortController();
    sessionAccessorState.afterPatchCall = (call) => {
      if (call === 2) {
        abort.abort("test cancellation before multi-wake cleanup");
      }
    };
    custodyRuntimeState.beforeFailRecord = () => {
      custodyRuntimeState.beforeFailRecord = undefined;
      throw new Error("synthetic first-flow cleanup failure");
    };

    await schedule(
      [
        { reason: "first replacement wake", delaySeconds: 30 },
        { reason: "second replacement wake", delaySeconds: 30 },
      ],
      { abortSignal: abort.signal },
    );

    expect(await listOwnerRecords(sessionKey)).toEqual([
      expect.objectContaining({ status: "failed" }),
      expect.objectContaining({ status: "failed" }),
    ]);
    expectRestoredChainState();
  });

  it("replaces a parked wake at the pending cap and preserves the replacement across reload", async () => {
    await enqueuePriorParkedWork("prior parked work");
    let reloadedFlows: OwnerRecord[] = [];
    sessionAccessorState.afterPatchCall = async (call) => {
      if (call !== 2) {
        return;
      }
      reloadedFlows = await reloadOwnerRecords(sessionKey);
    };

    await schedule([{ reason: "replacement work", delaySeconds: 30 }], { maxPendingWork: 1 });

    expect(reloadedFlows.filter((flow) => flow.status === "queued")).toEqual([
      expect.objectContaining({
        state: expect.objectContaining({ reason: "replacement work" }),
      }),
    ]);
    expect(findFlowByReason(reloadedFlows, "prior parked work")).toMatchObject({
      status: "succeeded",
    });
  });

  it("retries around a concurrently cancelled prior wake without reviving it", async () => {
    await enqueuePriorParkedWork("prior parked work");
    custodyRuntimeState.beforeElectionCommit = async () => {
      custodyRuntimeState.beforeElectionCommit = undefined;
      const prior = findFlowByReason(await listOwnerRecords(sessionKey), "prior parked work");
      if (!prior) {
        throw new Error("expected prior parked flow");
      }
      expect(await concurrentPatch(prior, { cancelRequestedAt: Date.now() })).toBe(true);
    };

    await schedule([{ reason: "replacement work", delaySeconds: 30 }]);

    const flows = await listOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "prior parked work")).toMatchObject({
      status: "queued",
      cancelRequestedAt: expect.any(Number),
    });
    expect(findFlowByReason(flows, "replacement work")).toMatchObject({ status: "queued" });
    expect(sessionStore[sessionKey]?.continuationChainCount).toBe(1);
  });

  it("retries the whole replacement transition when one prior CAS advances", async () => {
    await enqueuePriorParkedWork("first prior parked work");
    await enqueuePriorParkedWork("second prior parked work");
    custodyRuntimeState.beforeElectionCommit = async () => {
      custodyRuntimeState.beforeElectionCommit = undefined;
      const prior = findFlowByReason(
        await listOwnerRecords(sessionKey),
        "second prior parked work",
      );
      if (!prior) {
        throw new Error("expected second prior parked flow");
      }
      expect(await concurrentPatch(prior, { phase: "concurrent second prior-wake update" })).toBe(
        true,
      );
    };

    await schedule([{ reason: "replacement work", delaySeconds: 30 }]);

    const flows = await listOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "first prior parked work")).toMatchObject({
      status: "succeeded",
    });
    expect(findFlowByReason(flows, "second prior parked work")).toMatchObject({
      status: "succeeded",
    });
    expect(findFlowByReason(flows, "replacement work")).toMatchObject({ status: "queued" });
    expect(sessionStore[sessionKey]?.continuationChainCount).toBe(1);
  });

  it("fails closed when a parked owner starts running before replacement admission", async () => {
    await enqueuePriorParkedWork("prior parked work");
    custodyRuntimeState.beforeElectionCommit = async () => {
      custodyRuntimeState.beforeElectionCommit = undefined;
      const prior = findFlowByReason(await listOwnerRecords(sessionKey), "prior parked work");
      if (!prior) {
        throw new Error("expected prior parked flow");
      }
      expect(await concurrentPatch(prior, { status: "running" })).toBe(true);
    };

    await expect(
      schedule([{ reason: "rejected replacement work", delaySeconds: 30 }]),
    ).rejects.toThrow("running_owner");

    const flows = await listOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "prior parked work")).toMatchObject({ status: "running" });
    expect(findFlowByReason(flows, "rejected replacement work")).toBeUndefined();
    expectRestoredChainState();
  });

  it("allows a stable running predecessor while replacing a distinct parked wake", async () => {
    await enqueuePriorParkedWork("prior parked work");
    const now = Date.now();
    const predecessor = await enqueuePendingWork({
      sessionKey,
      hop: 1,
      delayMs: 0,
      electedAt: now,
      dueAt: now,
      maxChainLength: 200,
      chainStartedAt: now,
      accumulatedChainTokens: 0,
      reason: "stable running predecessor",
      anchorFinalizedAt: now,
    });
    if (!predecessor) {
      throw new Error("expected running predecessor flow");
    }
    expect(await concurrentPatch(predecessor, { status: "running" })).toBe(true);

    await schedule([{ reason: "replacement work", delaySeconds: 30 }]);

    const flows = await listOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "stable running predecessor")).toMatchObject({
      status: "running",
    });
    expect(findFlowByReason(flows, "prior parked work")).toMatchObject({ status: "succeeded" });
    expect(findFlowByReason(flows, "replacement work")).toMatchObject({ status: "queued" });
  });

  async function supersedeOriginalAndParkNewer(): Promise<void> {
    custodyRuntimeState.beforeElectionCommit = undefined;
    const original = findFlowByReason(
      await listOwnerRecords(sessionKey),
      "original prior parked work",
    );
    if (!original) {
      throw new Error("expected original prior parked flow");
    }
    expect(await concurrentFinish(original, "superseded by concurrent replacement")).toBe(true);
    const now = Date.now();
    expect(
      await enqueuePendingWork({
        sessionKey,
        hop: 2,
        delayMs: 30_000,
        electedAt: now,
        dueAt: now + 60_000,
        maxChainLength: 200,
        chainStartedAt: now,
        accumulatedChainTokens: 2,
        reason: "concurrent newer parked work",
        anchorPending: true,
        idleRetry: {
          trigger: "reply-run-ended",
          reasonCategory: "follow-up-work",
          armedAt: now,
        },
      }),
    ).not.toBeNull();
  }

  it("supersedes a newer parked owner discovered after the first replacement CAS loses", async () => {
    await enqueuePriorParkedWork("original prior parked work");
    custodyRuntimeState.beforeElectionCommit = supersedeOriginalAndParkNewer;

    await schedule([{ reason: "newest replacement work", delaySeconds: 30 }]);

    const flows = await reloadOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "original prior parked work")).toMatchObject({
      status: "succeeded",
    });
    expect(findFlowByReason(flows, "concurrent newer parked work")).toMatchObject({
      status: "succeeded",
    });
    expect(flows.filter((flow) => flow.status === "queued")).toEqual([
      expect.objectContaining({
        state: expect.objectContaining({ reason: "newest replacement work" }),
      }),
    ]);
  });

  it("restores a newer parked owner discovered by retry when finalization fails", async () => {
    await enqueuePriorParkedWork("original prior parked work");
    sessionAccessorState.failPatchCall = 2;
    custodyRuntimeState.beforeElectionCommit = supersedeOriginalAndParkNewer;

    await expect(
      schedule([{ reason: "newest replacement work", delaySeconds: 30 }]),
    ).rejects.toThrow();

    const flows = await reloadOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "original prior parked work")).toMatchObject({
      status: "succeeded",
    });
    expect(findFlowByReason(flows, "concurrent newer parked work")).toMatchObject({
      status: "queued",
    });
    expect(findFlowByReason(flows, "newest replacement work")).toMatchObject({
      status: "failed",
    });
  });

  it("does not restore a stale original when retry superseded an exact empty owner set", async () => {
    await enqueuePriorParkedWork("original prior parked work");
    sessionAccessorState.failPatchCall = 2;
    custodyRuntimeState.beforeElectionCommit = async () => {
      custodyRuntimeState.beforeElectionCommit = undefined;
      const original = findFlowByReason(
        await listOwnerRecords(sessionKey),
        "original prior parked work",
      );
      if (!original) {
        throw new Error("expected original prior parked flow");
      }
      expect(await concurrentFinish(original, "completed independently before retry")).toBe(true);
    };

    await expect(
      schedule([{ reason: "replacement after empty refresh", delaySeconds: 30 }]),
    ).rejects.toThrow();

    const flows = await reloadOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "original prior parked work")).toMatchObject({
      status: "succeeded",
      phase: "completed independently before retry",
    });
    expect(findFlowByReason(flows, "replacement after empty refresh")).toMatchObject({
      status: "failed",
    });
  });

  it("still cancels the replacement when partial prior-wake restoration loses its revision", async () => {
    await enqueuePriorParkedWork("first prior parked work");
    await enqueuePriorParkedWork("second prior parked work");
    sessionAccessorState.failPatchCall = 2;
    custodyRuntimeState.beforeAtomicUpdate = async () => {
      custodyRuntimeState.beforeAtomicUpdate = undefined;
      const prior = findFlowByReason(
        await listOwnerRecords(sessionKey),
        "second prior parked work",
      );
      if (!prior) {
        throw new Error("expected second prior parked flow");
      }
      expect(await concurrentPatch(prior, { phase: "concurrent second prior-wake update" })).toBe(
        true,
      );
    };

    await expect(schedule([{ reason: "replacement work", delaySeconds: 30 }])).rejects.toThrow();

    const flows = await listOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "first prior parked work")).toMatchObject({
      status: "queued",
    });
    expect(findFlowByReason(flows, "second prior parked work")).toMatchObject({
      status: "succeeded",
    });
    expect(findFlowByReason(flows, "replacement work")).toMatchObject({ status: "failed" });
    expect(sessionStore[sessionKey]?.continuationChainCount).toBe(1);
  });

  it("does not credit a concurrently requeued prior with changed rollback state", async () => {
    await enqueuePriorParkedWork("prior parked work");
    sessionAccessorState.failPatchCall = 2;
    custodyRuntimeState.beforeAtomicUpdate = async () => {
      custodyRuntimeState.beforeAtomicUpdate = undefined;
      const prior = findFlowByReason(await listOwnerRecords(sessionKey), "prior parked work");
      if (!prior) {
        throw new Error("expected superseded prior flow");
      }
      expect(
        await concurrentPatch(prior, {
          status: "queued",
          phase: "concurrently requeued with different state",
        }),
      ).toBe(true);
    };

    await expect(schedule([{ reason: "replacement work", delaySeconds: 30 }])).rejects.toThrow(
      "spawn-init chain finalization and wake cleanup both failed",
    );

    const flows = await listOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "prior parked work")).toMatchObject({
      status: "queued",
      phase: "concurrently requeued with different state",
    });
    expect(findFlowByReason(flows, "replacement work")).toMatchObject({ status: "failed" });
    expect(sessionStore[sessionKey]?.continuationChainCount).toBe(1);
  });

  it("aborts a replacement that starts running during atomic rollback", async () => {
    await enqueuePriorParkedWork("prior parked work");
    sessionAccessorState.failPatchCall = 2;
    let wakeSignal: AbortSignal | undefined;
    let releaseClaim = () => {};
    custodyRuntimeState.beforeAtomicUpdate = async () => {
      custodyRuntimeState.beforeAtomicUpdate = undefined;
      const replacement = findFlowByReason(await listOwnerRecords(sessionKey), "replacement work");
      if (!replacement) {
        throw new Error("expected replacement flow");
      }
      if (!(await concurrentPatch(replacement, { status: "running" }))) {
        throw new Error("expected replacement flow to enter running state");
      }
      const claim = registerContinuationDispatchClaim({
        sessionKey,
        flowId: replacement.recordId,
      });
      wakeSignal = claim.controller.signal;
      releaseClaim = claim.release;
    };
    custodyRuntimeState.beforeRequestCancel = async (recordId) => {
      custodyRuntimeState.beforeRequestCancel = undefined;
      const running = await requireRecord(recordId);
      expect(
        await concurrentPatch(running, { phase: "concurrent running cancellation revision" }),
      ).toBe(true);
    };

    await expect(schedule([{ reason: "replacement work", delaySeconds: 30 }])).rejects.toThrow();

    releaseClaim();
    const flows = await listOwnerRecords(sessionKey);
    expect(wakeSignal?.aborted).toBe(true);
    expect(findFlowByReason(flows, "prior parked work")).toMatchObject({ status: "succeeded" });
    expect(findFlowByReason(flows, "replacement work")).toMatchObject({
      status: "running",
      cancelRequestedAt: expect.any(Number),
    });
  });

  it("atomically rolls back every replacement in a partial batch and survives reload", async () => {
    await enqueuePriorParkedWork("prior parked work");
    sessionAccessorState.failPatchCall = 2;

    await expect(
      schedule([
        { reason: "first replacement work", delaySeconds: 30 },
        { reason: "second replacement work", delaySeconds: 30 },
      ]),
    ).rejects.toThrow();

    const flows = await reloadOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "prior parked work")).toMatchObject({ status: "queued" });
    expect(findFlowByReason(flows, "first replacement work")).toMatchObject({ status: "failed" });
    expect(findFlowByReason(flows, "second replacement work")).toMatchObject({ status: "failed" });
  });

  it("rolls back earlier durable work when a later batch enqueue fails", async () => {
    await enqueuePriorParkedWork("prior parked work");
    // The later election keeps losing its commit to a concurrent writer of
    // the owner's live work, so it never commits.
    custodyRuntimeState.beforeElectionCommit = async (commit) => {
      if (commit < 2) {
        return;
      }
      const first = findFlowByReason(await listOwnerRecords(sessionKey), "first replacement work");
      if (!first) {
        throw new Error("expected first replacement flow");
      }
      expect(await concurrentPatch(first, { phase: `concurrent owner write ${commit}` })).toBe(
        true,
      );
    };

    await expect(
      schedule([
        { reason: "first replacement work", delaySeconds: 30 },
        { reason: "failed second replacement work", delaySeconds: 30 },
      ]),
    ).rejects.toThrow("prior parked-wake supersession did not commit");

    const flows = await reloadOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "prior parked work")).toMatchObject({ status: "queued" });
    expect(findFlowByReason(flows, "first replacement work")).toMatchObject({ status: "failed" });
    expect(findFlowByReason(flows, "failed second replacement work")).toBeUndefined();
    expectRestoredChainState();
  });

  it("cleans up safe siblings without restoring prior work after one replacement succeeded", async () => {
    await enqueuePriorParkedWork("prior parked work");
    sessionAccessorState.failPatchCall = 2;
    custodyRuntimeState.beforeAtomicUpdate = async () => {
      custodyRuntimeState.beforeAtomicUpdate = undefined;
      const replacement = findFlowByReason(
        await listOwnerRecords(sessionKey),
        "second replacement work",
      );
      if (!replacement) {
        throw new Error("expected replacement flow");
      }
      expect(await concurrentFinish(replacement, "replacement already delivered")).toBe(true);
    };

    await expect(
      schedule([
        { reason: "first replacement work", delaySeconds: 30 },
        { reason: "second replacement work", delaySeconds: 30 },
      ]),
    ).rejects.toThrow();

    const flows = await reloadOwnerRecords(sessionKey);
    expect(findFlowByReason(flows, "prior parked work")).toMatchObject({ status: "succeeded" });
    expect(findFlowByReason(flows, "first replacement work")).toMatchObject({ status: "failed" });
    expect(findFlowByReason(flows, "second replacement work")).toMatchObject({
      status: "succeeded",
    });
  });

  it("aborts and cancel-marks a queued replacement that starts running during fallback", async () => {
    await enqueuePriorParkedWork("first prior parked work");
    await enqueuePriorParkedWork("second prior parked work");
    sessionAccessorState.failPatchCall = 2;
    custodyRuntimeState.contendAtomicUpdates = true;
    let wakeSignal: AbortSignal | undefined;
    let releaseClaim = () => {};
    custodyRuntimeState.beforeRequestCancel = async (recordId) => {
      custodyRuntimeState.beforeRequestCancel = undefined;
      const flow = await requireRecord(recordId);
      expect(
        await concurrentPatch(flow, {
          status: "running",
          phase: "concurrent cancellation revision",
        }),
      ).toBe(true);
      const claim = registerContinuationDispatchClaim({ sessionKey, flowId: recordId });
      wakeSignal = claim.controller.signal;
      releaseClaim = claim.release;
    };

    await expect(schedule([{ reason: "replacement work", delaySeconds: 30 }])).rejects.toThrow();

    releaseClaim();
    const flows = await listOwnerRecords(sessionKey);
    expect(wakeSignal?.aborted).toBe(true);
    expect(findFlowByReason(flows, "first prior parked work")).toMatchObject({
      status: "succeeded",
    });
    expect(findFlowByReason(flows, "second prior parked work")).toMatchObject({
      status: "succeeded",
    });
    expect(findFlowByReason(flows, "replacement work")).toMatchObject({
      status: "running",
      cancelRequestedAt: expect.any(Number),
    });
    expect(sessionStore[sessionKey]?.continuationChainCount).toBe(1);
  });

  it("marks an unresolved running replacement cancelled when atomic rollback keeps failing", async () => {
    await enqueuePriorParkedWork("prior parked work");
    sessionAccessorState.failPatchCall = 2;
    custodyRuntimeState.contendAtomicUpdates = true;
    custodyRuntimeState.beforeAtomicUpdate = async () => {
      custodyRuntimeState.beforeAtomicUpdate = undefined;
      const replacement = findFlowByReason(await listOwnerRecords(sessionKey), "replacement work");
      if (!replacement) {
        throw new Error("expected replacement flow");
      }
      expect(await concurrentPatch(replacement, { status: "running" })).toBe(true);
    };

    await expect(schedule([{ reason: "replacement work", delaySeconds: 30 }])).rejects.toThrow();

    expect(findFlowByReason(await listOwnerRecords(sessionKey), "replacement work")).toMatchObject({
      status: "running",
      cancelRequestedAt: expect.any(Number),
    });
  });
});
