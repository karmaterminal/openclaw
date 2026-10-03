// Tests session reset cleanup for stale files and persisted state.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearEmbeddedSessionPromptStates,
  getEmbeddedSessionPromptState,
} from "../../agents/embedded-agent-runner/session-prompt-state.js";
import {
  captureSessionRecipientAuthority,
  isSessionRecipientAuthorityCurrent,
  upsertSessionEntryCore,
} from "../../config/sessions/session-accessor.js";
import { withSystemEventOwner } from "../../infra/system-event-ownership.js";
import {
  enqueueSystemEventRaw as enqueueSystemEvent,
  peekSystemEvents,
  resetSystemEventsForTest,
} from "../../infra/system-events.js";
import { resetDiagnosticRunActivityForTest } from "../../logging/diagnostic-run-activity.js";
import { closeOpenClawStateDatabaseAsync } from "../../state/openclaw-state-db.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { registerContinuationDispatchClaim } from "../continuation/continuation-dispatch-claims.js";
import { resetContinuationCustodyProjection } from "../continuation/custody/custody-projection.js";
import {
  hydrateContinuationCustody,
  updateContinuationRecords,
} from "../continuation/custody/custody-store.js";
import {
  custodyStateForTest,
  listCustodyRecordsForTest,
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "../continuation/custody/custody.test-support.js";
import { readAcceptedDelegateChildSessionKey } from "../continuation/delegate-flow-store.js";
import {
  claimStagedPostCompactionDelegates,
  releaseStagedPostCompactionDelegateToQueue,
  stagePostCompactionCustodyDelegate,
  toSessionPostCompactionDelegate,
} from "../continuation/delegate-store-post-compaction.js";
import {
  consumePendingDelegates,
  enqueuePendingDelegate,
  markPendingDelegateSpawnAccepted,
} from "../continuation/delegate-store.js";
import {
  hasLiveContinuationTimerRefs,
  registerContinuationTimerHandle,
  releaseContinuationTimerRef,
  retainContinuationTimerRef,
} from "../continuation/state.js";
import { enqueueContinuationReturnDeliveries } from "../continuation/targeting.js";
import type { PendingContinuationWork } from "../continuation/work-flow-state.js";
import { enqueuePendingWorkReplacing } from "../continuation/work-replacement-store.js";
import { consumePendingWork } from "../continuation/work-store.js";
import { createReplyOperation, replyRunRegistry } from "./reply-run-registry.js";
import { testing as replyRunTesting } from "./reply-run-registry.test-support.js";
import { clearSessionResetRuntimeState } from "./session-reset-cleanup.js";

useContinuationCustodyTestState();

// Seed queued work through the real custody election path.
async function enqueuePendingWork(work: PendingContinuationWork): Promise<PendingContinuationWork> {
  const result = await enqueuePendingWorkReplacing({
    work,
    summary: "seeded reset test work",
    maxPendingWork: Number.MAX_SAFE_INTEGER,
    replaceParkedWork: false,
    expectedRunningFlowIds: [],
  });
  if (!result.applied) {
    throw new Error("expected seeded continuation work to be elected");
  }
  return result.work;
}

// Stage, claim and release one post-compaction delegate into the session
// delivery queue: the release is the permanent durable handoff.
async function handOffPostCompactionDelegate(sessionKey: string, task: string) {
  await stagePostCompactionCustodyDelegate(sessionKey, { task, stagedAt: Date.now() });
  const claimed = (await claimStagedPostCompactionDelegates(sessionKey))[0];
  if (!claimed?.flowId) {
    throw new Error("expected claimed post-compaction delegate");
  }
  expect(
    await releaseStagedPostCompactionDelegateToQueue({
      sessionKey,
      delegate: toSessionPostCompactionDelegate(claimed),
      sequence: 0,
    }),
  ).toMatchObject({ released: true });
  return { ...claimed, flowId: claimed.flowId };
}

afterEach(() => {
  clearEmbeddedSessionPromptStates(["old-session"]);
  replyRunTesting.resetReplyRunRegistry();
  resetDiagnosticRunActivityForTest();
  resetSystemEventsForTest();
});

describe("clearSessionResetRuntimeState", () => {
  it("disposes prompt projections with the archived session", async () => {
    const state = getEmbeddedSessionPromptState("old-session");
    state.sentUserTurnIds.add("sent-user-turn");

    await clearSessionResetRuntimeState(["old-session"], {
      agentId: "main",
      reason: "reset",
      sessionKey: "agent:main:slack:room:1",
      activeReplySessionId: "old-session",
      assertCurrent: () => {},
    });

    expect(getEmbeddedSessionPromptState("old-session")).not.toBe(state);
  });

  it("clears reset queues and drains system events for normalized keys", async () => {
    enqueueSystemEvent("stale alpha", withSystemEventOwner({ sessionKey: "alpha" }, "main"));
    enqueueSystemEvent("stale beta", withSystemEventOwner({ sessionKey: "beta" }, "main"));
    enqueueSystemEvent("fresh gamma", withSystemEventOwner({ sessionKey: "gamma" }, "main"));

    const result = await clearSessionResetRuntimeState(
      [" alpha ", undefined, " ", "alpha", "beta"],
      {
        agentId: "main",
        reason: "reset",
        sessionKey: "alpha",
        assertCurrent: () => {},
      },
    );

    expect(result.keys).toEqual(["alpha", "beta"]);
    expect(result.systemEventsCleared).toBe(2);
    expect(peekSystemEvents("agent:main:alpha")).toStrictEqual([]);
    expect(peekSystemEvents("agent:main:beta")).toStrictEqual([]);
    expect(peekSystemEvents("agent:main:gamma")).toEqual(["fresh gamma"]);
  });

  it("preserves events owned by other agents during an agent-scoped reset", async () => {
    enqueueSystemEvent("main", withSystemEventOwner({ sessionKey: "global" }, "main"));
    enqueueSystemEvent("alpha", withSystemEventOwner({ sessionKey: "global" }, "alpha"));
    enqueueSystemEvent("beta", withSystemEventOwner({ sessionKey: "global" }, "beta"));

    const result = await clearSessionResetRuntimeState(["global", "agent:beta:global"], {
      agentId: " Alpha ",
      reason: "reset",
      sessionKey: "global",
      assertCurrent: () => {},
    });

    expect(result.systemEventsCleared).toBe(1);
    expect(peekSystemEvents("agent:alpha:global")).toEqual([]);
    expect(peekSystemEvents("agent:main:global")).toEqual(["main"]);
    expect(peekSystemEvents("agent:beta:global")).toEqual(["beta"]);
  });

  it("releases active reply work owned by the archived reset session id", async () => {
    const cancel = vi.fn();
    const operation = createReplyOperation({
      sessionKey: "agent:main:slack:room:1",
      sessionId: "old-session",
      resetTriggered: false,
    });
    operation.attachBackend({
      kind: "embedded",
      cancel,
      isStreaming: () => false,
    });
    operation.setPhase("running");

    await clearSessionResetRuntimeState(["agent:main:slack:room:1", "old-session"], {
      agentId: "main",
      activeReplySessionId: "old-session",
      reason: "reset",
      sessionKey: "agent:main:slack:room:1",
      assertCurrent: () => {},
    });

    expect(cancel).toHaveBeenCalledWith("restart");
    expect(replyRunRegistry.isActive("agent:main:slack:room:1")).toBe(false);
    const nextOperation = createReplyOperation({
      sessionKey: "agent:main:slack:room:1",
      sessionId: "new-session",
      resetTriggered: false,
    });
    expect(nextOperation.sessionId).toBe("new-session");
  });

  it("does not clear a fresh active reply under the same key when only the archived id is reset", async () => {
    const operation = createReplyOperation({
      sessionKey: "agent:main:slack:room:1",
      sessionId: "new-session",
      resetTriggered: false,
    });
    operation.setPhase("running");

    await clearSessionResetRuntimeState(["agent:main:slack:room:1", "old-session"], {
      agentId: "main",
      activeReplySessionId: "old-session",
      reason: "reset",
      sessionKey: "agent:main:slack:room:1",
      assertCurrent: () => {},
    });

    expect(replyRunRegistry.get("agent:main:slack:room:1")).toBe(operation);
  });

  it("does not clear a replacement admitted while the archived run is cancelling", async () => {
    let replacement: ReturnType<typeof createReplyOperation> | undefined;
    const operation = createReplyOperation({
      sessionKey: "agent:main:slack:room:1",
      sessionId: "old-session",
      resetTriggered: false,
    });
    operation.attachBackend({
      kind: "embedded",
      cancel() {
        operation.complete();
        replacement = createReplyOperation({
          sessionKey: "agent:main:slack:room:1",
          sessionId: "old-session",
          resetTriggered: false,
        });
        replacement.setPhase("running");
      },
      isStreaming: () => false,
    });
    operation.setPhase("running");

    await clearSessionResetRuntimeState(["agent:main:slack:room:1", "old-session"], {
      agentId: "main",
      activeReplySessionId: "old-session",
      reason: "reset",
      sessionKey: "agent:main:slack:room:1",
      assertCurrent: () => {},
    });

    expect(replacement).toBeDefined();
    expect(replyRunRegistry.get("agent:main:slack:room:1")).toBe(replacement);
  });

  it("leaves queued reservations for the archived id so session init can rebind them", async () => {
    const operation = createReplyOperation({
      sessionKey: "agent:main:slack:room:1",
      sessionId: "old-session",
      resetTriggered: false,
    });

    await clearSessionResetRuntimeState(["agent:main:slack:room:1", "old-session"], {
      agentId: "main",
      activeReplySessionId: "old-session",
      reason: "reset",
      sessionKey: "agent:main:slack:room:1",
      assertCurrent: () => {},
    });

    expect(operation.phase).toBe("queued");
    expect(replyRunRegistry.get("agent:main:slack:room:1")).toBe(operation);
  });

  it.each(["new", "reset"] as const)(
    "terminalizes pending %s-session work while preserving accepted return authority",
    async (reason) => {
      await withOpenClawTestState(
        { layout: "state-only", prefix: "openclaw-session-reset-continuation-" },
        async () => {
          // The fixture moved the state directory; hydrate its custody projection.
          await hydrateContinuationCustody();
          vi.useFakeTimers();
          const sessionKey = "agent:main:slack:room:reset";
          const unrelatedSessionKey = "agent:main:slack:room:unrelated";
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await upsertSessionEntryCore(
              { agentId: "main", sessionKey },
              { sessionId: "accepted-mailbox", updatedAt: 1 },
            );
            const recipientAuthority = await captureSessionRecipientAuthority({
              agentId: "main",
              sessionKey,
            });
            const work = await enqueuePendingWork({
              sessionKey,
              hop: 1,
              delayMs: 60_000,
              electedAt: Date.now(),
              dueAt: Date.now() + 60_000,
              maxChainLength: 8,
            });
            const delegate = await enqueuePendingDelegate(sessionKey, {
              task: "continue after reset",
              delayMs: 60_000,
            });
            const unrelatedWork = await enqueuePendingWork({
              sessionKey: unrelatedSessionKey,
              hop: 1,
              delayMs: 60_000,
              electedAt: Date.now(),
              dueAt: Date.now() + 60_000,
              maxChainLength: 8,
            });
            const terminalWork = await enqueuePendingWork({
              sessionKey,
              hop: 1,
              delayMs: 0,
              electedAt: Date.now(),
              dueAt: Date.now(),
              maxChainLength: 8,
            });
            const handedOffDelegate = await handOffPostCompactionDelegate(
              sessionKey,
              "do not replay handed-off work",
            );
            const acceptedPostCompaction = await handOffPostCompactionDelegate(
              sessionKey,
              "already accepted post-compaction work",
            );
            const acceptedRecord = await readCustodyRecordForTest(acceptedPostCompaction.flowId);
            if (!acceptedRecord) {
              throw new Error("expected handed-off post-compaction record");
            }
            expect(
              await markPendingDelegateSpawnAccepted(
                {
                  ...acceptedPostCompaction,
                  expectedRevision: acceptedRecord.revision,
                },
                "agent:main:subagent:accepted",
              ),
            ).toBe(true);
            const acceptedAfterRecording = await readCustodyRecordForTest(
              acceptedPostCompaction.flowId,
            );
            if (!acceptedAfterRecording) {
              throw new Error("expected accepted post-compaction record");
            }
            expect(custodyStateForTest(acceptedAfterRecording)).toMatchObject({
              childSessionKey: "agent:main:subagent:accepted",
            });
            expect(readAcceptedDelegateChildSessionKey(acceptedAfterRecording)).toBe(
              "agent:main:subagent:accepted",
            );
            if (!work.flowId || !unrelatedWork.flowId || !terminalWork.flowId) {
              throw new Error("expected durable continuation records");
            }
            const activeDelegate = registerContinuationDispatchClaim({
              sessionKey,
              flowId: delegate.recordId,
            });
            const terminalized = await updateContinuationRecords(
              [
                {
                  recordId: terminalWork.flowId,
                  ownerSessionKey: sessionKey,
                  expectedRevision: terminalWork.expectedRevision!,
                  patch: { status: "succeeded", phase: "Already completed" },
                },
              ],
              { now: Date.now() },
            );
            expect(terminalized.outcome).toBe("applied");

            retainContinuationTimerRef(sessionKey);
            timer = setTimeout(() => {}, 60_000);
            registerContinuationTimerHandle(sessionKey, timer);
            expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(true);

            await clearSessionResetRuntimeState([sessionKey], {
              agentId: "main",
              reason,
              sessionKey,
              assertCurrent: () => {},
            });
            await vi.advanceTimersByTimeAsync(0);

            const records = new Map(
              (await listCustodyRecordsForTest()).map((record) => [record.recordId, record]),
            );
            expect(records.get(work.flowId)?.status).toBe("cancelled");
            expect(records.get(delegate.recordId)?.status).toBe("cancelled");
            expect(activeDelegate.controller.signal.aborted).toBe(true);
            expect(records.get(unrelatedWork.flowId)?.status).toBe("queued");
            expect(records.get(terminalWork.flowId)?.status).toBe("succeeded");
            // Handoffs are permanent (RFC §5.4.4): reset fences the unaccepted
            // handed-off record instead of cancelling it, and leaves the
            // accepted one untouched.
            expect(records.get(handedOffDelegate.flowId)).toMatchObject({
              status: "succeeded",
              cancelRequestedAt: expect.any(Number),
            });
            expect(records.get(acceptedPostCompaction.flowId)?.status).toBe("succeeded");
            expect(records.get(acceptedPostCompaction.flowId)?.cancelRequestedAt).toBeUndefined();
            expect(await consumePendingWork(sessionKey, { includeRunning: true })).toEqual([]);
            expect(await consumePendingDelegates(sessionKey)).toEqual([]);
            expect(
              await listCustodyRecordsForTest({
                ownerSessionKey: sessionKey,
                statuses: ["queued", "running"],
              }),
            ).toEqual([]);
            expect(hasLiveContinuationTimerRefs(sessionKey)).toBe(false);
            expect(
              isSessionRecipientAuthorityCurrent(
                { agentId: "main", sessionKey },
                recipientAuthority,
              ),
            ).toBe(true);
            const delivered = await enqueueContinuationReturnDeliveries({
              targetSessionKeys: [sessionKey],
              text: "[continuation:enrichment-return] accepted child completed",
              idempotencyKeyBase: `accepted-after-${reason}`,
              recipientAuthorities: new Map([[sessionKey, recipientAuthority]]),
              ownerAgentId: "main",
            });
            expect(delivered).toMatchObject({ enqueued: 1, delivered: 1 });
            expect(peekSystemEvents(sessionKey)).toContain(
              "[continuation:enrichment-return] accepted child completed",
            );

            // Restart: reopen the state database and rehydrate custody from
            // committed rows only.
            resetContinuationCustodyProjection();
            await closeOpenClawStateDatabaseAsync();
            await hydrateContinuationCustody();
            expect(await consumePendingWork(sessionKey, { includeRunning: true })).toEqual([]);
            expect(await consumePendingDelegates(sessionKey)).toEqual([]);
            expect(
              await listCustodyRecordsForTest({
                ownerSessionKey: sessionKey,
                statuses: ["queued", "running"],
              }),
            ).toEqual([]);
            expect(await readCustodyRecordForTest(handedOffDelegate.flowId)).toMatchObject({
              status: "succeeded",
              cancelRequestedAt: expect.any(Number),
            });
            expect((await readCustodyRecordForTest(unrelatedWork.flowId))?.status).toBe("queued");
          } finally {
            if (timer) {
              clearTimeout(timer);
            }
            releaseContinuationTimerRef(sessionKey);
            vi.useRealTimers();
          }
        },
      );
    },
  );
});
