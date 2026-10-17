/**
 * Orphaned continuation custody (karmaterminal/openclaw#1469).
 *
 * Queued delegate and staged post-compaction rows that lose their dispatcher
 * must end in a terminal status with an owner-visible notice, and the leaks
 * that strand them must close at their source. Every scenario runs over a real
 * temporary state directory: custody rows, session rows and the
 * session-delivery queue are the real owners. Only the spawn owner is
 * replaced, so a spawn is observable without starting a child run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnSubagentDirectMock = vi.hoisted(() => vi.fn());

// mock-isolation: Spawn requests are recorded without starting real subagent runs.
vi.mock("../../agents/subagents/spawn/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

// A fired hedge dispatches as detached work that awaits real custody worker
// round trips, which advancing the fake clock cannot flush. Record each run so
// a test awaits the fired dispatch itself instead of polling.
const detachedWork = vi.hoisted(() => new Set<Promise<unknown>>());
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

// Runs once after the reaper lists its candidates, standing in for another
// path that settles a row between the reaper's list and its fail.
const afterDelegateList = vi.hoisted(() => ({
  run: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("./delegate-flow-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./delegate-flow-store.js")>();
  return {
    ...actual,
    listDelegateRecords: async (
      ...args: Parameters<typeof actual.listDelegateRecords>
    ): ReturnType<typeof actual.listDelegateRecords> => {
      const records = await actual.listDelegateRecords(...args);
      const run = afterDelegateList.run;
      afterDelegateList.run = undefined;
      await run?.();
      return records;
    },
  };
});

import { createOpenClawContinuationTools } from "../../agents/openclaw-tools.continuation.js";
import { coordinateSubagentContinuation } from "../../agents/subagent-announce.continuation.runtime.js";
import { subagentRuns } from "../../agents/subagents/registry/subagent-registry-memory.js";
import { seedSubagentRunForReadTest } from "../../agents/subagents/registry/subagent-registry.test-helpers.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import { loadSessionEntry, replaceSessionEntry } from "../../config/sessions/session-accessor.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { loadPendingSessionDeliveries } from "../../infra/session-delivery-queue-storage.js";
import { peekSystemEventEntries, resetSystemEventsForTest } from "../../infra/system-events.js";
import { runContinuationCustodyBoot } from "./custody-boot.js";
import {
  claimContinuationSpawnAttempt,
  createContinuationRecord,
  newContinuationRecordId,
} from "./custody/custody-store.js";
import {
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import {
  armDelegateDispatchHedge,
  hasDelegateDispatchHedge,
  resetDelegateDispatchHedgesForTests,
} from "./delegate-dispatch-hedge.js";
import { createDelegateRecord } from "./delegate-flow-store.js";
import { markPendingDelegateFailed } from "./delegate-store.js";
import { captureContinuationQueueContext } from "./queue-context.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const REAPED_NOTICE = "[continuation:delegate-orphan-reaped]";
const REAPED_PHASE = "Reaped: no dispatcher";
const CONFIG = {
  agents: { defaults: { continuation: { enabled: true } } },
} satisfies OpenClawConfig;

const MAIN = "agent:main:discord:channel:orphan-reaper";
const PARENT = "agent:main:discord:channel:orphan-reaper-parent";
const MISSING_SUBAGENT = "agent:main:subagent:orphan-reaper-missing";
const NON_CHAIN_CHILD = "agent:main:subagent:orphan-reaper-non-chain";
const CRON_RUN = "agent:main:cron:orphan-reaper-job:run:orphan-reaper-run";
const LONG_SUBAGENT = "agent:main:subagent:orphan-reaper-long-running";
const INTERRUPTED_SUBAGENT = "agent:main:subagent:orphan-reaper-interrupted";

useContinuationCustodyTestState();

const seededRunIds: string[] = [];

beforeEach(() => {
  setRuntimeConfigSnapshot(CONFIG);
  spawnSubagentDirectMock.mockReset();
  spawnSubagentDirectMock.mockImplementation(async () => ({
    status: "accepted",
    childSessionKey: "agent:main:subagent:orphan-reaper-unexpected-child",
    runId: "orphan-reaper-unexpected-child-run",
  }));
  resetSystemEventsForTest();
});

afterEach(() => {
  resetDelegateDispatchHedgesForTests();
  vi.useRealTimers();
  detachedWork.clear();
  afterDelegateList.run = undefined;
  for (const runId of seededRunIds.splice(0)) {
    subagentRuns.delete(runId);
  }
  resetSystemEventsForTest();
  clearRuntimeConfigSnapshot();
});

function storePath(): string {
  return resolveSessionStorePathCore(undefined, { agentId: "main" });
}

async function seedSession(sessionKey: string, fields: Partial<SessionEntry> = {}): Promise<void> {
  await replaceSessionEntry({ storePath: storePath(), sessionKey }, {
    sessionId: `${sessionKey.replaceAll(":", "-")}-session`,
    updatedAt: Date.now(),
    ...fields,
  } as SessionEntry);
}

function loadEntry(sessionKey: string): SessionEntry | undefined {
  return loadSessionEntry({
    hydrateSkillPromptRefs: false,
    readConsistency: "latest",
    sessionKey,
    storePath: storePath(),
  });
}

async function queueDelegate(params: {
  owner: string;
  createdAt: number;
  delayMs?: number;
  task?: string;
}) {
  return await createDelegateRecord({
    ownerKey: params.owner,
    controller: "pending",
    delegate: {
      task: params.task ?? "summarize the overnight logs",
      ...(params.delayMs !== undefined ? { delayMs: params.delayMs } : {}),
    },
    phase: "Queued for continuation dispatch",
    now: params.createdAt,
  });
}

async function stagePostCompaction(params: { owner: string; createdAt: number }) {
  return await createDelegateRecord({
    ownerKey: params.owner,
    controller: "post-compaction",
    delegate: {
      task: "re-read the design notes after compaction",
      mode: "post-compaction",
      firstArmedAt: params.createdAt,
    },
    phase: "Staged for release after compaction",
    now: params.createdAt,
  });
}

/**
 * Reaped notices a session has been given, by identity: a durable row and the
 * in-memory event that fast-paths it (carrying the row's ack id) are one notice.
 */
async function noticesFor(sessionKey: string): Promise<string[]> {
  const notices = new Map<string, string>();
  for (const entry of await loadPendingSessionDeliveries(captureContinuationQueueContext())) {
    if (entry.sessionKey === sessionKey && entry.kind === "systemEvent") {
      notices.set(entry.id, entry.text);
    }
  }
  for (const event of peekSystemEventEntries(sessionKey)) {
    notices.set(event.sessionDeliveryAckId ?? event.id ?? event.text, event.text);
  }
  return [...notices.values()].filter((text) => text.includes(REAPED_NOTICE));
}

async function announceNonChainChild(): Promise<void> {
  await coordinateSubagentContinuation({
    cfg: CONFIG,
    childSessionKey: NON_CHAIN_CHILD,
    childRunId: "orphan-reaper-non-chain-run",
    targetRequesterSessionKey: PARENT,
    task: "check the build and report back",
    findings: "build is green",
    skipAnnounceDelivery: false,
    loadEntry: (sessionKey) => loadEntry(sessionKey),
    invalidateSessionEntry: () => {},
  });
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

async function loadReaper() {
  // The periodic reaper is the owner under test; import it per call so a
  // missing export fails each scenario on its own line.
  return await import("./custody-orphan-reaper.js");
}

async function bootGateway(armedAt = Date.now()) {
  return await runContinuationCustodyBoot({
    armedAt,
    whenSubagentRegistryActivated: async () => {},
  });
}

describe("orphaned continuation custody is terminalized", () => {
  it("1: boot fails a long-due delegate whose owner session is missing and notifies the parent", async () => {
    await seedSession(PARENT);
    seedSubagentRunForReadTest({
      runId: "orphan-reaper-missing-run",
      childSessionKey: MISSING_SUBAGENT,
      requesterSessionKey: PARENT,
      createdAt: Date.now() - 4 * HOUR_MS,
      execution: {
        status: "done",
        startedAt: Date.now() - 4 * HOUR_MS,
        endedAt: Date.now() - 3 * HOUR_MS,
      },
    } as never);
    seededRunIds.push("orphan-reaper-missing-run");
    const record = await queueDelegate({
      owner: MISSING_SUBAGENT,
      createdAt: Date.now() - 3 * HOUR_MS,
    });
    expect(loadEntry(MISSING_SUBAGENT)).toBeUndefined();

    await bootGateway();

    const after = await readCustodyRecordForTest(record.recordId);
    expect(after?.status).toBe("failed");
    expect(after?.phase).toBe(REAPED_PHASE);
    expect(after?.failureReason).toMatch(/owner session is missing/);
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await noticesFor(PARENT)).toHaveLength(1);
  });

  it("2: the periodic reaper fails an overdue delegate queued after boot with no hedge armed", async () => {
    await seedSession(MAIN);
    const armedAt = Date.now() - 3 * DAY_MS;
    await bootGateway(armedAt);
    const record = await queueDelegate({ owner: MAIN, createdAt: Date.now() - 30 * HOUR_MS });
    expect(record.createdAt).toBeGreaterThan(armedAt);

    const { reapOrphanedContinuationCustody } = await loadReaper();
    const result = await reapOrphanedContinuationCustody();

    const after = await readCustodyRecordForTest(record.recordId);
    expect(result.reaped).toBe(1);
    expect(after?.status).toBe("failed");
    expect(after?.phase).toBe(REAPED_PHASE);
    expect(after?.failureReason).toMatch(/overdue/);
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await noticesFor(MAIN)).toHaveLength(1);
  });

  it("3: the periodic reaper fails a staged post-compaction row older than seven days", async () => {
    await seedSession(MAIN);
    const record = await stagePostCompaction({ owner: MAIN, createdAt: Date.now() - 8 * DAY_MS });

    const { reapOrphanedContinuationCustody } = await loadReaper();
    await reapOrphanedContinuationCustody();

    const after = await readCustodyRecordForTest(record.recordId);
    expect(after?.status).toBe("failed");
    expect(after?.phase).toBe(REAPED_PHASE);
    expect(after?.failureReason).toMatch(/stale/);
    expect(await noticesFor(MAIN)).toHaveLength(1);
  });

  it("4: the periodic reaper fails a staged post-compaction row whose owner session is missing", async () => {
    await seedSession(PARENT);
    seedSubagentRunForReadTest({
      runId: "orphan-reaper-missing-staged-run",
      childSessionKey: MISSING_SUBAGENT,
      requesterSessionKey: PARENT,
      createdAt: Date.now() - 4 * HOUR_MS,
    } as never);
    seededRunIds.push("orphan-reaper-missing-staged-run");
    const record = await stagePostCompaction({
      owner: MISSING_SUBAGENT,
      createdAt: Date.now() - 2 * HOUR_MS,
    });

    const { reapOrphanedContinuationCustody } = await loadReaper();
    await reapOrphanedContinuationCustody();

    const after = await readCustodyRecordForTest(record.recordId);
    expect(after?.status).toBe("failed");
    expect(after?.phase).toBe(REAPED_PHASE);
    expect(after?.failureReason).toMatch(/owner session is missing/);
    expect(await noticesFor(PARENT)).toHaveLength(1);
  });

  it("5: a cron run is not offered continue_delegate, because nothing drains its queue", () => {
    const tools = createOpenClawContinuationTools({
      config: CONFIG,
      agentSessionKey: CRON_RUN,
      runSessionKey: CRON_RUN,
      runId: "orphan-reaper-cron-run",
    });
    expect(tools.map((tool) => tool.name)).not.toContain("continue_delegate");
  });

  it("6a: a live non-chain subagent's delayed delegate dispatches at its due time through the hedge", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    await seedSession(PARENT);
    await seedSession(NON_CHAIN_CHILD, { spawnedBy: PARENT, status: "done" });
    const record = await queueDelegate({
      owner: NON_CHAIN_CHILD,
      createdAt: Date.now(),
      delayMs: 10 * 60 * 1000,
    });

    await announceNonChainChild();

    expect((await readCustodyRecordForTest(record.recordId))?.status).toBe("queued");
    expect(hasDelegateDispatchHedge(NON_CHAIN_CHILD)).toBe(true);
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();

    await advanceAndSettleHedges(10 * 60 * 1000);

    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(spawnSubagentDirectMock.mock.calls[0]?.[0]).toMatchObject({
      task: expect.stringContaining("summarize the overnight logs"),
    });
    expect((await readCustodyRecordForTest(record.recordId))?.status).toBe("succeeded");
    expect(await noticesFor(PARENT)).toHaveLength(0);
  });

  it("6b: a non-chain subagent's delayed delegate stranded across a restart is failed by the reaper", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await seedSession(PARENT);
    await seedSession(NON_CHAIN_CHILD, { spawnedBy: PARENT, status: "done" });
    const record = await queueDelegate({
      owner: NON_CHAIN_CHILD,
      createdAt: Date.now(),
      delayMs: 10 * 60 * 1000,
    });
    await announceNonChainChild();
    expect(hasDelegateDispatchHedge(NON_CHAIN_CHILD)).toBe(true);

    // A restart loses the in-memory hedge; nothing else drains this queue.
    resetDelegateDispatchHedgesForTests();
    vi.setSystemTime(Date.now() + 2 * HOUR_MS);
    const { reapOrphanedContinuationCustody } = await loadReaper();
    const result = await reapOrphanedContinuationCustody();

    const after = await readCustodyRecordForTest(record.recordId);
    expect(result.reaped).toBe(1);
    expect(after?.status).toBe("failed");
    expect(after?.phase).toBe(REAPED_PHASE);
    expect(after?.failureReason).toMatch(/owner run has ended/);
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await noticesFor(PARENT)).toHaveLength(1);
  });

  it("7: boot rejects a delegate overdue past the cutoff instead of spawning it", async () => {
    await seedSession(MAIN);
    const record = await queueDelegate({ owner: MAIN, createdAt: Date.now() - 6 * DAY_MS });

    await bootGateway();

    const after = await readCustodyRecordForTest(record.recordId);
    expect(after?.status).toBe("failed");
    expect(after?.phase).toBe(REAPED_PHASE);
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
  });
});

describe("live continuation custody is left alone", () => {
  it("does not count or notify a row another path failed between the reaper's list and its fail", async () => {
    await seedSession(MAIN);
    const record = await queueDelegate({ owner: MAIN, createdAt: Date.now() - 30 * HOUR_MS });
    afterDelegateList.run = async () => {
      expect(
        await markPendingDelegateFailed(
          { flowId: record.recordId, expectedRevision: record.revision, task: "" },
          "Cancelled by its owner.",
          "Delegate rejected",
        ),
      ).toBe(true);
    };

    const { reapOrphanedContinuationCustody } = await loadReaper();
    const result = await reapOrphanedContinuationCustody();

    const after = await readCustodyRecordForTest(record.recordId);
    expect(afterDelegateList.run).toBeUndefined();
    expect(result.reaped).toBe(0);
    expect(after?.status).toBe("failed");
    expect(after?.phase).toBe("Delegate rejected");
    expect(after?.failureReason).toBe("Cancelled by its owner.");
    expect(await noticesFor(MAIN)).toHaveLength(0);
  });

  it("keeps the queue of a subagent still running hours later, and of an interrupted one", async () => {
    await seedSession(PARENT);
    await seedSession(LONG_SUBAGENT, { spawnedBy: PARENT });
    await seedSession(INTERRUPTED_SUBAGENT, { spawnedBy: PARENT, status: "interrupted" });
    // No timeout and no recorded end: age alone says nothing about this run.
    seedSubagentRunForReadTest({
      runId: "orphan-reaper-long-running-run",
      childSessionKey: LONG_SUBAGENT,
      requesterSessionKey: PARENT,
      createdAt: Date.now() - 5 * HOUR_MS,
      execution: { status: "running", startedAt: Date.now() - 5 * HOUR_MS },
    } as never);
    seededRunIds.push("orphan-reaper-long-running-run");
    // Restart recovery can resume an interrupted child even though its run ended.
    seedSubagentRunForReadTest({
      runId: "orphan-reaper-interrupted-run",
      childSessionKey: INTERRUPTED_SUBAGENT,
      requesterSessionKey: PARENT,
      createdAt: Date.now() - 5 * HOUR_MS,
      execution: {
        status: "interrupted",
        startedAt: Date.now() - 5 * HOUR_MS,
        endedAt: Date.now() - 4 * HOUR_MS,
      },
    } as never);
    seededRunIds.push("orphan-reaper-interrupted-run");
    const longRunning = await queueDelegate({
      owner: LONG_SUBAGENT,
      createdAt: Date.now() - 3 * HOUR_MS,
    });
    const interrupted = await queueDelegate({
      owner: INTERRUPTED_SUBAGENT,
      createdAt: Date.now() - 3 * HOUR_MS,
    });

    const { reapOrphanedContinuationCustody } = await loadReaper();
    const result = await reapOrphanedContinuationCustody();

    expect(result.reaped).toBe(0);
    expect((await readCustodyRecordForTest(longRunning.recordId))?.status).toBe("queued");
    expect((await readCustodyRecordForTest(interrupted.recordId))?.status).toBe("queued");
    expect(await noticesFor(PARENT)).toHaveLength(0);
  });

  it("keeps a live queued delegate whose hedge is armed", async () => {
    await seedSession(MAIN);
    const record = await queueDelegate({ owner: MAIN, createdAt: Date.now() - 30 * HOUR_MS });
    armDelegateDispatchHedge(
      MAIN,
      Date.now() + HOUR_MS,
      {
        chainState: { currentChainCount: 0, chainStartedAt: 0, accumulatedChainTokens: 0 },
        ctx: { sessionKey: MAIN },
        maxChainLength: 10,
      },
      async (params) => ({ dispatched: 0, rejected: 0, chainState: params.chainState }),
    );

    const { reapOrphanedContinuationCustody } = await loadReaper();
    const result = await reapOrphanedContinuationCustody();

    expect(result.reaped).toBe(0);
    expect((await readCustodyRecordForTest(record.recordId))?.status).toBe("queued");
  });

  it("keeps a staged post-compaction row under seven days old on a live main session", async () => {
    await seedSession(MAIN);
    const record = await stagePostCompaction({ owner: MAIN, createdAt: Date.now() - 2 * DAY_MS });

    const { reapOrphanedContinuationCustody } = await loadReaper();
    const result = await reapOrphanedContinuationCustody();

    expect(result.reaped).toBe(0);
    expect((await readCustodyRecordForTest(record.recordId))?.status).toBe("queued");
  });

  it("keeps running delegate rows and work rows", async () => {
    await seedSession(PARENT);
    const running = await queueDelegate({
      owner: MISSING_SUBAGENT,
      createdAt: Date.now() - 3 * DAY_MS,
    });
    const claimed = await claimContinuationSpawnAttempt({
      recordId: running.recordId,
      ownerSessionKey: running.ownerSessionKey,
      expectedRevision: running.revision,
      now: Date.now() - 3 * DAY_MS,
    });
    expect(claimed.outcome).toBe("claimed");
    const workId = newContinuationRecordId();
    const work = await createContinuationRecord({
      recordId: workId,
      kind: "work",
      ownerSessionKey: MISSING_SUBAGENT,
      status: "queued",
      phase: "Queued for continuation work",
      createdAt: Date.now() - 3 * DAY_MS,
      dueAt: Date.now() - 3 * DAY_MS,
      stateJson: "{}",
    });
    expect(work.outcome).toBe("created");

    const { reapOrphanedContinuationCustody } = await loadReaper();
    const result = await reapOrphanedContinuationCustody();

    expect(result.reaped).toBe(0);
    expect((await readCustodyRecordForTest(running.recordId))?.status).toBe("running");
    expect((await readCustodyRecordForTest(workId))?.status).toBe("queued");
  });
});
