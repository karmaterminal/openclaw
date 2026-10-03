import { expectDefined } from "@openclaw/normalization-core";
import { describe, expect, it, vi } from "vitest";
import type { SessionEntry, SessionPostCompactionDelegate } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  deleteContinuationRecord,
  updateContinuationRecords,
} from "../continuation/custody/custody-store.js";
import {
  listCustodyRecordsForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "../continuation/custody/custody.test-support.js";
import {
  consumeStagedPostCompactionDelegates,
  releaseStagedPostCompactionDelegateToQueue,
  requeueReleasedPostCompactionDelegate,
  stagePostCompactionDelegate,
} from "../continuation/delegate-store-post-compaction.js";
import type { ContinuationRuntimeConfig } from "../continuation/types.js";
import {
  dispatchPostCompactionDelegates,
  type PostCompactionDelegateDispatchDeps,
} from "./post-compaction-delegate-dispatch.js";
import type { FollowupRun } from "./queue/types.js";

const cfg: OpenClawConfig = {};
const runtimeConfig: ContinuationRuntimeConfig = {
  enabled: true,
  defaultDelayMs: 0,
  minDelayMs: 0,
  maxDelayMs: 1_000,
  maxChainLength: 4,
  costCapTokens: 500_000,
  maxDelegatesPerTurn: 5,
  maxPendingWork: 32,
  crossSessionTargeting: "disabled",
};

useContinuationCustodyTestState();

function delegate(task: string): SessionPostCompactionDelegate {
  return { task, createdAt: 1 };
}

function followupRun(abortSignal?: AbortSignal): FollowupRun {
  return {
    prompt: "hello",
    enqueuedAt: 1,
    ...(abortSignal ? { abortSignal } : {}),
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: "main",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp/workspace",
      config: cfg,
      provider: "anthropic",
      model: "claude",
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  };
}

/**
 * A concurrent owner's write on the claimed record: one real custody commit at
 * the claim revision. Returns the revision the record advanced to.
 */
async function advanceClaimedRecord(
  claimed: Pick<SessionPostCompactionDelegate, "flowId" | "expectedRevision">,
  ownerSessionKey: string,
  phase: string,
): Promise<number> {
  const expectedRevision = expectDefined(claimed.expectedRevision, "claimed revision");
  const advanced = await updateContinuationRecords(
    [
      {
        recordId: expectDefined(claimed.flowId, "claimed flow id"),
        ownerSessionKey,
        expectedRevision,
        patch: { phase },
      },
    ],
    { now: Date.now() },
  );
  if (advanced.outcome !== "applied") {
    throw new Error(`concurrent owner write did not apply: ${advanced.outcome}`);
  }
  const revision = expectDefined(advanced.records[0], "advanced record").revision;
  expect(revision).toBe(expectedRevision + 1);
  return revision;
}

function createOwnerDeps(params?: {
  abortDuringContext?: AbortController;
}): PostCompactionDelegateDispatchDeps {
  return {
    consumeStagedPostCompactionDelegates,
    requeueReleasedPostCompactionDelegate,
    stagePostCompactionDelegate,
    releasePostCompactionDelegateToQueue: vi.fn(releaseStagedPostCompactionDelegateToQueue),
    drainPostCompactionDelegateDeliveries: vi.fn(async () => undefined),
    enqueuePostCompactionDelegateDelivery: vi.fn(async ({ sequence }) => `queue-${sequence}`),
    enqueueSystemEvent: vi.fn(),
    log: vi.fn(),
    now: vi.fn(() => 1),
    readPostCompactionContext: vi.fn(async () => {
      params?.abortDuringContext?.abort("originating turn cancelled");
      return null;
    }),
    resolveAgentWorkspaceDir: vi.fn(() => "/tmp/workspace"),
    resolveContinuationRuntimeConfig: vi.fn(() => runtimeConfig),
    resolveSessionAgentId: vi.fn(() => "main"),
  };
}

describe("post-compaction delegate cancellation ownership", () => {
  it("keeps a delegate exclusively custody-owned after a revision advance", async () => {
    const sessionKey = "agent:main:revision-advance";
    const recordId = (
      await stagePostCompactionDelegate(
        sessionKey,
        delegate("keep the advanced custody record authoritative"),
      )
    ).recordId;
    const abort = new AbortController();
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const deps = createOwnerDeps({ abortDuringContext: abort });
    let advancedRevision: number | undefined;
    deps.requeueReleasedPostCompactionDelegate = async (claimed) => {
      advancedRevision = await advanceClaimedRecord(
        claimed,
        sessionKey,
        "Concurrent owner advanced the record",
      );
      return await requeueReleasedPostCompactionDelegate(claimed);
    };

    await expect(
      dispatchPostCompactionDelegates(
        {
          cfg,
          compactionCount: 1,
          followupRun: followupRun(abort.signal),
          postCompactionDelegatesToPreserve: [],
          sessionEntry,
          sessionKey,
        },
        deps,
      ),
    ).resolves.toEqual({ queuedDelegates: 0, droppedDelegates: 0 });

    expect(sessionEntry.pendingPostCompactionDelegates).toBeUndefined();
    // A cancelled release hands nothing off.
    expect(deps["releasePostCompactionDelegateToQueue"]).not.toHaveBeenCalled();
    expect(await listCustodyRecordsForTest({ ownerSessionKey: sessionKey })).toEqual([
      expect.objectContaining({
        recordId,
        status: "running",
        revision: expectDefined(advancedRevision, "advanced revision"),
        phase: "Concurrent owner advanced the record",
      }),
    ]);

    const retryDeps = createOwnerDeps();
    const retryEnqueue = vi.fn(async () => "queue");
    retryDeps.enqueuePostCompactionDelegateDelivery = retryEnqueue;
    await expect(
      dispatchPostCompactionDelegates(
        {
          cfg,
          compactionCount: 2,
          followupRun: followupRun(),
          postCompactionDelegatesToPreserve: [],
          sessionEntry,
          sessionKey,
        },
        retryDeps,
      ),
    ).resolves.toEqual({ queuedDelegates: 0, droppedDelegates: 0 });
    expect(retryEnqueue).not.toHaveBeenCalled();
    expect(retryDeps["releasePostCompactionDelegateToQueue"]).not.toHaveBeenCalled();
    expect(await readCustodyRecordForTest(recordId)).toMatchObject({
      status: "running",
      revision: advancedRevision,
      phase: "Concurrent owner advanced the record",
    });
  });

  // Contract change (RFC §4.4): the release is one commit (queue insert plus
  // handoff), so the separate finalization step, and its failure point, no
  // longer exist. The remaining failure point after a revision advance is the
  // preserve owner itself; a throw there must not leave a duplicate either.
  it("cannot leave a pending duplicate when preservation throws after a revision advance", async () => {
    const sessionKey = "agent:main:revision-advance-preserve-error";
    const recordId = (
      await stagePostCompactionDelegate(
        sessionKey,
        delegate("keep one owner across preservation failure"),
      )
    ).recordId;
    const abort = new AbortController();
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const deps = createOwnerDeps({ abortDuringContext: abort });
    let advancedRevision: number | undefined;
    deps.requeueReleasedPostCompactionDelegate = async (claimed) => {
      advancedRevision = await advanceClaimedRecord(
        claimed,
        sessionKey,
        "Concurrent owner advanced before preservation",
      );
      throw new Error("preservation failed");
    };

    await expect(
      dispatchPostCompactionDelegates(
        {
          cfg,
          compactionCount: 1,
          followupRun: followupRun(abort.signal),
          postCompactionDelegatesToPreserve: [],
          sessionEntry,
          sessionKey,
        },
        deps,
      ),
    ).rejects.toThrow("preservation failed");

    expect(sessionEntry.pendingPostCompactionDelegates).toBeUndefined();
    expect(deps["releasePostCompactionDelegateToQueue"]).not.toHaveBeenCalled();
    expect(await readCustodyRecordForTest(recordId)).toMatchObject({
      status: "running",
      revision: expectDefined(advancedRevision, "advanced revision"),
      phase: "Concurrent owner advanced before preservation",
    });
  });

  it("preserves a delegate when its custody record is truly missing", async () => {
    const sessionKey = "agent:main:missing-source";
    const source = delegate("preserve work after source loss");
    const recordId = (await stagePostCompactionDelegate(sessionKey, source)).recordId;
    const abort = new AbortController();
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const deps = createOwnerDeps({ abortDuringContext: abort });
    deps.requeueReleasedPostCompactionDelegate = async (claimed) => {
      const deleted = await deleteContinuationRecord({
        recordId: expectDefined(claimed.flowId, "claimed flow id"),
        ownerSessionKey: sessionKey,
        expectedRevision: expectDefined(claimed.expectedRevision, "claimed revision"),
      });
      expect(deleted.outcome).toBe("deleted");
      return await requeueReleasedPostCompactionDelegate(claimed);
    };

    await expect(
      dispatchPostCompactionDelegates(
        {
          cfg,
          compactionCount: 1,
          followupRun: followupRun(abort.signal),
          postCompactionDelegatesToPreserve: [],
          sessionEntry,
          sessionKey,
        },
        deps,
      ),
    ).resolves.toEqual({ queuedDelegates: 0, droppedDelegates: 0 });

    expect(await readCustodyRecordForTest(recordId)).toBeUndefined();
    expect(sessionEntry.pendingPostCompactionDelegates).toEqual([
      expect.objectContaining({
        task: source.task,
        recipientAuthorityBinding: expect.objectContaining({
          recipients: [
            expect.objectContaining({
              sessionKey,
              authority: expect.objectContaining({ state: "bound" }),
            }),
          ],
        }),
      }),
    ]);
    expect(sessionEntry.pendingPostCompactionDelegates?.[0]).not.toHaveProperty("flowId");
    expect(sessionEntry.pendingPostCompactionDelegates?.[0]).not.toHaveProperty("expectedRevision");
  });
});
