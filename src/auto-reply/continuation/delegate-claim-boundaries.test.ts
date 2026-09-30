// Claim-before-spawn crash boundaries for continuation delegates (RFC
// docs/design/continue-work-signal-v2.md §5.4.4, crash-boundary table and Q3).
// Custody is real (shared-state worker over a per-test state dir); the spawn
// owner is the observed boundary, and admitted children are registry rows.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnSubagentDirectMock = vi.hoisted(() => vi.fn());
vi.mock("../../agents/subagents/spawn/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

import {
  addSubagentRunForTests,
  resetSubagentRegistryForTests,
} from "../../agents/subagents/registry/subagent-registry.test-helpers.js";
import { setRuntimeConfigSnapshot } from "../../config/config.js";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import { replaceSessionEntry } from "../../config/sessions/session-accessor.js";
import { loadPendingSessionDeliveries } from "../../infra/session-delivery-queue-storage.js";
import { formatContinuationChildRunId } from "../../shared/continuation-run-key.js";
import {
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import { CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG } from "./custody/spawn-interrupted-notice.js";
import { dispatchToolDelegates } from "./delegate-dispatch.js";
import {
  consumePendingDelegates,
  enqueuePendingDelegate,
  requeuePendingDelegate,
} from "./delegate-store.js";

const OWNER = "agent:main:discord:channel:claim-boundaries";
const OTHER_OWNER = "agent:main:discord:channel:someone-else";

useContinuationCustodyTestState();

beforeEach(async () => {
  setRuntimeConfigSnapshot({
    agents: { defaults: { continuation: { enabled: true } } },
  } as never);
  const storePath = resolveSessionStorePathCore(undefined, { agentId: "main" });
  await replaceSessionEntry({ storePath, sessionKey: OWNER }, {
    sessionKey: OWNER,
    sessionId: "claim-boundaries-owner",
    updatedAt: Date.now(),
    status: "done",
  } as never);
  spawnSubagentDirectMock.mockImplementation(
    async (params: { continuationChildRunId?: string }) => ({
      status: "accepted",
      childSessionKey: "agent:main:subagent:claim-boundaries-child",
      runId: params.continuationChildRunId,
    }),
  );
});

afterEach(() => {
  spawnSubagentDirectMock.mockReset();
  resetSubagentRegistryForTests({ persist: false });
});

function dispatch(options: { recover?: boolean } = {}) {
  return dispatchToolDelegates({
    sessionKey: OWNER,
    chainState: { currentChainCount: 0, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
    ctx: { sessionKey: OWNER },
    maxChainLength: 10,
    // Boot recovery: every claim at or before the cutoff belonged to a dead process.
    ...(options.recover
      ? { recoverRunningDelegates: true, includeRunningUpdatedAtOrBefore: Date.now() }
      : {}),
  });
}

async function interruptedNoticeRows() {
  return (await loadPendingSessionDeliveries()).filter(
    (entry) =>
      entry.kind === "systemEvent" &&
      entry.sessionKey === OWNER &&
      entry.text.includes(CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG),
  );
}

/** A claimed delegate whose dispatch never ran: the process died after the claim commit. */
async function claimThenCrash(task = "publish the release notes") {
  const record = await enqueuePendingDelegate(OWNER, { task, delayMs: 0 });
  const [claimed] = await consumePendingDelegates(OWNER);
  if (!claimed?.spawnAttempt) {
    throw new Error("expected a claimed delegate with a spawn attempt");
  }
  return { recordId: record.recordId, claimed };
}

describe("claim before spawn (RFC §5.4.4, Q2)", () => {
  it("records the attempt and its child run id in custody before the spawn owner is called", async () => {
    const record = await enqueuePendingDelegate(OWNER, { task: "summarize", delayMs: 0 });
    const seenAtSpawn: unknown[] = [];
    spawnSubagentDirectMock.mockImplementationOnce(
      async (params: { continuationChildRunId?: string }) => {
        seenAtSpawn.push(await readCustodyRecordForTest(record.recordId));
        return {
          status: "accepted",
          childSessionKey: "agent:main:subagent:claimed-child",
          runId: params.continuationChildRunId,
        };
      },
    );

    await dispatch();

    const childRunId = formatContinuationChildRunId(record.recordId, 1);
    expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(spawnSubagentDirectMock.mock.calls[0]?.[0]).toMatchObject({
      continuationChildRunId: childRunId,
    });
    expect(seenAtSpawn[0]).toMatchObject({
      status: "running",
      spawnAttempts: [{ attemptId: 1, childRunId }],
    });
    expect(await readCustodyRecordForTest(record.recordId)).toMatchObject({
      status: "succeeded",
      handoff: {
        target: "subagent_runs",
        childRunId,
        childSessionKey: "agent:main:subagent:claimed-child",
      },
    });
  });
});

describe("restart with an unresolved claim (RFC §5.4.4 boundaries 2-4, Q3)", () => {
  it("crash after claim, before spawn: no spawn, the record fails with its attempt kept, one notice", async () => {
    const { recordId, claimed } = await claimThenCrash();

    await dispatch({ recover: true });

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readCustodyRecordForTest(recordId)).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
      spawnAttempts: [{ attemptId: 1, childRunId: claimed.spawnAttempt?.childRunId }],
    });
    expect((await readCustodyRecordForTest(recordId))?.terminalNoticePending).toBeUndefined();
    const notices = await interruptedNoticeRows();
    expect(notices).toHaveLength(1);
    expect(notices[0]?.kind === "systemEvent" && notices[0].text).toContain(
      "publish the release notes",
    );

    // A second recovery pass neither spawns nor adds a notice.
    await dispatch({ recover: true });
    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await interruptedNoticeRows()).toHaveLength(1);
  });

  it("crash after admission: the registry row under the recorded child run id is adopted, no notice", async () => {
    const { recordId, claimed } = await claimThenCrash();
    const childRunId = claimed.spawnAttempt?.childRunId ?? "";
    addSubagentRunForTests({
      runId: childRunId,
      childSessionKey: "agent:main:subagent:admitted-child",
      requesterSessionKey: OWNER,
    });

    await dispatch({ recover: true });

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readCustodyRecordForTest(recordId)).toMatchObject({
      status: "succeeded",
      handoff: {
        target: "subagent_runs",
        childRunId,
        childSessionKey: "agent:main:subagent:admitted-child",
      },
    });
    expect(await interruptedNoticeRows()).toEqual([]);
  });

  it("a registry row under the run id owned by another requester is a collision, never adopted", async () => {
    const { recordId, claimed } = await claimThenCrash();
    addSubagentRunForTests({
      runId: claimed.spawnAttempt?.childRunId ?? "",
      childSessionKey: "agent:main:subagent:foreign-child",
      requesterSessionKey: OTHER_OWNER,
    });

    await dispatch({ recover: true });

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    const record = await readCustodyRecordForTest(recordId);
    expect(record).toMatchObject({ status: "failed", failureReason: "spawn-interrupted" });
    expect(record?.handoff).toBeUndefined();
    expect(await interruptedNoticeRows()).toHaveLength(1);
  });
});

describe("attempt ids are never reused (RFC §5.4.4)", () => {
  it("each retry of the same record claims the next attempt id and child run id", async () => {
    const record = await enqueuePendingDelegate(OWNER, { task: "retry me", delayMs: 0 });
    const runIds: string[] = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const [claimed] = await consumePendingDelegates(OWNER);
      runIds.push(claimed?.spawnAttempt?.childRunId ?? "");
      // An initialize-phase failure provably dispatched nothing: back to the queue.
      expect(
        await requeuePendingDelegate(claimed!, "retry", undefined, { failurePhase: "initialize" }),
      ).toBe(true);
    }

    expect(runIds).toEqual([1, 2, 3].map((n) => formatContinuationChildRunId(record.recordId, n)));
    const stored = await readCustodyRecordForTest(record.recordId);
    expect(stored?.spawnAttempts.map((attempt) => attempt.attemptId)).toEqual([1, 2, 3]);
    expect(stored?.spawnAttempts.every((attempt) => attempt.failurePhase === "initialize")).toBe(
      true,
    );
  });

  it("a requeued record whose earlier attempt the registry admitted is handed off, not spawned again", async () => {
    const record = await enqueuePendingDelegate(OWNER, { task: "admitted late", delayMs: 0 });
    const [first] = await consumePendingDelegates(OWNER);
    await requeuePendingDelegate(first!, "retry", undefined, { failurePhase: "initialize" });
    addSubagentRunForTests({
      runId: first?.spawnAttempt?.childRunId ?? "",
      childSessionKey: "agent:main:subagent:late-child",
      requesterSessionKey: OWNER,
    });

    await dispatch();

    expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
    expect(await readCustodyRecordForTest(record.recordId)).toMatchObject({
      status: "succeeded",
      handoff: { target: "subagent_runs", childRunId: first?.spawnAttempt?.childRunId },
    });
  });
});

describe("in-process spawn outcomes (RFC §5.4.4, 'In-process spawn failures')", () => {
  it("a thrown spawn leaves admission unproven: one notice, never requeued", async () => {
    const record = await enqueuePendingDelegate(OWNER, { task: "may have run", delayMs: 0 });
    spawnSubagentDirectMock.mockRejectedValueOnce(new Error("socket closed mid-dispatch"));

    await dispatch();

    expect(await readCustodyRecordForTest(record.recordId)).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
    });
    expect(await interruptedNoticeRows()).toHaveLength(1);
  });

  it("a dispatch-phase failure ends in the notice; an initialize-phase failure keeps C's handling", async () => {
    const uncertain = await enqueuePendingDelegate(OWNER, { task: "dispatch failed", delayMs: 0 });
    spawnSubagentDirectMock.mockResolvedValueOnce({
      status: "error",
      error: "gateway rejected",
      runId: "continuation:x:1",
      failurePhase: "dispatch",
    });
    await dispatch();
    expect(await readCustodyRecordForTest(uncertain.recordId)).toMatchObject({
      status: "failed",
      failureReason: "spawn-interrupted",
    });

    const provable = await enqueuePendingDelegate(OWNER, { task: "never started", delayMs: 0 });
    spawnSubagentDirectMock.mockResolvedValueOnce({
      status: "error",
      error: "workspace unavailable",
      failurePhase: "initialize",
    });
    await dispatch();
    const failed = await readCustodyRecordForTest(provable.recordId);
    expect(failed?.status).toBe("failed");
    expect(failed?.failureReason).toContain("DELEGATE spawn error: workspace unavailable");
    expect(await interruptedNoticeRows()).toHaveLength(1);
  });
});
