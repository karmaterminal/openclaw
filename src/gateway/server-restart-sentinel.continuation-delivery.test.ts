// Restart recovery of queued continuation deliveries: managed delegate returns,
// recipient authority, and continuation return ownership.
// Register the shared module mocks before any module they replace is imported.
import "./server-restart-sentinel.mocks.test-harness.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignSessionOwner,
  captureSessionRecipientAuthority,
  deleteSessionEntryLifecycle,
  upsertSessionEntryCore,
} from "../config/sessions/session-accessor.js";
import { isSessionRecipientAuthorityCurrent as isActualSessionRecipientAuthorityCurrent } from "../config/sessions/session-accessor.sqlite-recipient-authority.js";
import { addSessionMember, removeSessionMember } from "../config/sessions/session-sharing-store.js";
import type { RestartSentinelPayload } from "../infra/restart-sentinel.js";
import { resolveSystemEventQueueKey } from "../infra/system-event-ownership.js";
import { openOpenClawAgentDatabase } from "../state/openclaw-agent-db.js";
import { closeOpenClawStateDatabaseAsync } from "../state/openclaw-state-db.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.types.js";
import {
  createGatewaySchedulerClock,
  createTestGatewayScheduler,
} from "../test-utils/gateway-scheduler-clock.js";
import {
  createOpenClawTestState,
  type OpenClawTestState,
} from "../test-utils/openclaw-test-state.js";
import * as restartUpdateRun from "./server-restart-update-run.js";

const { mocks } = await import("./server-restart-sentinel.mocks.test-harness.js");
type LoadedSessionEntry = ReturnType<typeof mocks.loadSessionEntry>;

vi.resetModules();

const { deliverQueuedSessionDelivery, scheduleRestartSentinelWake } =
  await import("./server-restart-sentinel.js");
const { resetGatewayWorkAdmission } = await import("../process/gateway-work-admission.js");
const actualRestartUpdateRun = await vi.importActual<
  typeof import("./server-restart-update-run.js")
>("./server-restart-update-run.js");

function mockRestartContinuation(
  continuation: NonNullable<RestartSentinelPayload["continuation"]>,
  threadId?: string,
  revision?: number,
) {
  mocks.readRestartSentinel.mockResolvedValue({
    ...(revision === undefined ? {} : { version: 1, revision }),
    payload: {
      sessionKey: "agent:main:main",
      deliveryContext: {
        channel: "whatsapp",
        to: "+15550002",
        accountId: "acct-2",
      },
      ...(threadId === undefined ? {} : { threadId }),
      ts: 123,
      continuation,
    },
  } as Awaited<ReturnType<typeof mocks.readRestartSentinel>>);
}

async function getEnqueuedSessionDeliveryId(callIndex: number): Promise<string> {
  const result = mocks.enqueueSessionDelivery.mock.results[callIndex];
  if (!result || result.type !== "return") {
    throw new Error(`missing enqueueSessionDelivery result at index ${callIndex}`);
  }
  const id = await result.value;
  if (typeof id !== "string") {
    throw new Error(`invalid enqueueSessionDelivery result at index ${callIndex}`);
  }
  return id;
}

let clock: ReturnType<typeof createGatewaySchedulerClock>;
let scheduler: ReturnType<typeof createTestGatewayScheduler>;
let testState: OpenClawTestState;

function wakeRestartSentinel() {
  return scheduleRestartSentinelWake({ scheduler, signal: scheduler.signal, deps: {} });
}

describe("scheduleRestartSentinelWake", () => {
  afterEach(async () => {
    await scheduler.stop();
    await closeOpenClawStateDatabaseAsync();
    vi.restoreAllMocks();
    resetGatewayWorkAdmission();
    vi.useRealTimers();
    await testState.cleanup();
  });

  beforeEach(async () => {
    clock = createGatewaySchedulerClock();
    scheduler = createTestGatewayScheduler(clock.clock);
    vi.mocked(restartUpdateRun.finalizeRestartUpdateRun)
      .mockReset()
      .mockImplementation(actualRestartUpdateRun.finalizeRestartUpdateRun);
    testState = await createOpenClawTestState({
      label: "gateway-restart-sentinel",
      layout: "state-only",
    });
    resetGatewayWorkAdmission();
    vi.useRealTimers();
    mocks.queuedSessionDelivery = null;
    mocks.prepareDelegateArtifactDelivery.mockReset();
    mocks.recordDelegateArtifactDeliveryBinding.mockReset();
    mocks.replaceManagedDelegateReturnInPrompt.mockReset();
    mocks.setInitialOutboundDelivery(null);
    mocks.dispatchGatewayMethodInProcess.mockReset();
    mocks.dispatchGatewayMethodInProcess.mockResolvedValue({
      status: "ok",
      result: {
        payloads: [{ text: "ready", mediaUrls: ["/tmp/proof.png"] }],
        deliveryStatus: { status: "sent" },
      },
    });
    mocks.readRestartSentinel.mockReset();
    mocks.readRestartSentinel.mockResolvedValue({
      version: 1,
      revision: 123,
      payload: {
        kind: "restart",
        status: "ok",
        ts: 123,
        sessionKey: "agent:main:main",
        deliveryContext: {
          channel: "whatsapp",
          to: "+15550002",
          accountId: "acct-2",
        },
      },
    });
    mocks.parseSessionThreadInfo.mockReset();
    mocks.parseSessionThreadInfo.mockReturnValue({ baseSessionKey: null, threadId: undefined });
    mocks.loadSessionEntry.mockReset();
    mocks.loadSessionEntry.mockImplementation((sessionKey: string) => ({
      cfg: { commands: { ownerAllowFrom: ["+15550002"] } },
      agentId: "main",
      entry: { sessionId: sessionKey, updatedAt: 0 },
      store: {},
      storePath: "/tmp/sessions.json",
      canonicalKey: sessionKey,
      storeKeys: [sessionKey],
      legacyKey: undefined,
    }));
    mocks.isSessionRecipientAuthorityCurrent.mockReset().mockReturnValue(true);
    mocks.deliveryContextFromSession.mockReset();
    mocks.deliveryContextFromSession.mockReturnValue(undefined);
    mocks.getChannelPlugin.mockReset();
    mocks.getChannelPlugin.mockReturnValue(undefined);
    mocks.normalizeChannelId.mockClear();
    mocks.resolveOutboundTarget.mockReset();
    mocks.resolveOutboundTarget.mockReturnValue({ ok: true as const, to: "+15550002" });
    mocks.deliverOutboundPayloads.mockReset();
    mocks.deliverOutboundPayloads.mockResolvedValue([{ channel: "whatsapp", messageId: "msg-1" }]);
    mocks.enqueueDeliveryOnce.mockReset();
    mocks.enqueueDeliveryOnce.mockImplementation(async (_payload, id) => ({ id, created: true }));
    mocks.findDeliveryIntentOwner.mockReset();
    mocks.findDeliveryIntentOwner.mockResolvedValue(null);
    mocks.withStableDeliveryPreparation.mockReset();
    mocks.withStableDeliveryPreparation.mockImplementation(
      async (params: {
        id: string;
        run: (owner: {
          current: () => Promise<Record<string, unknown>>;
          beforeFirstModifier: () => Promise<void>;
          markPrepared: () => Promise<void>;
          markPublished: () => void;
        }) => Promise<unknown>;
      }) => ({
        status: "claimed",
        value: await params.run({
          current: async () => ({ id: params.id }),
          beforeFirstModifier: async () => {},
          markPrepared: async () => {},
          markPublished: () => {},
        }),
      }),
    );
    mocks.ackDelivery.mockClear();
    mocks.failDelivery.mockClear();
    mocks.failDeliveryAfterPlatformSend.mockClear();
    mocks.failDeliveryBeforePlatformSend.mockClear();
    mocks.failPendingDelivery.mockClear();
    mocks.loadPendingDelivery.mockReset();
    mocks.loadPendingDelivery.mockResolvedValue(null);
    mocks.drainPendingDeliveries.mockClear();
    mocks.reserveDeliveryAttempt.mockClear();
    mocks.withActiveDeliveryClaim.mockClear();
    mocks.enqueueSystemEvent.mockClear();
    mocks.requestHeartbeat.mockClear();
    mocks.enqueueSessionDelivery.mockClear();
    mocks.advanceSessionDeliveryAgentRun.mockClear();
    mocks.deferSessionDelivery.mockClear();
    mocks.failSessionDelivery.mockClear();
    mocks.mergeSessionDeliveryPreparedMediaBlocks.mockClear();
    mocks.markSessionDeliveryAttemptStarted.mockClear();
    mocks.markSessionDeliverySettlement.mockClear();
    mocks.markDelegateArtifactDeliveryUnavailable.mockClear();
    mocks.appendAssistantMessageToSessionTranscript.mockReset();
    mocks.createManagedOutgoingMediaBlocks.mockReset();
    mocks.attachManagedOutgoingMediaToMessage.mockReset();
    mocks.enrichAssistantTranscriptMediaForRun.mockReset();
    mocks.removeCronRunContinuationSessionIfIdle.mockClear();
    mocks.settleCorrelatedSubagentDelivery.mockClear();
    mocks.loadPendingSessionDelivery.mockClear();
    mocks.drainPendingSessionDelivery.mockClear();
    mocks.recoverPendingSessionDeliveries.mockClear();
    mocks.finalizeUpdateRestartSentinelRunningVersion.mockReset();
    mocks.finalizeUpdateRestartSentinelRunningVersion.mockResolvedValue(null);
    mocks.clearSentinel.mockReset();
    mocks.clearSentinel.mockResolvedValue(true);
    mocks.formatRestartSentinelMessage.mockClear();
    mocks.summarizeRestartSentinel.mockClear();
    mocks.resolveSystemMainSessionTarget.mockReset();
    mocks.resolveSystemMainSessionTarget.mockReturnValue({
      agentId: "ops",
      sessionKey: "agent:ops:main",
    });
    mocks.recordInboundSessionAndDispatchReply.mockReset();
    mocks.recordInboundSessionAndDispatchReply.mockResolvedValue(undefined);
    mocks.logInfo.mockClear();
    mocks.logWarn.mockClear();
    mocks.logError.mockClear();
  });

  it("terminalizes a managed system-event receipt when recovery finds a replacement session", async () => {
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      entry: { sessionId: "replacement-session", updatedAt: 0 },
      store: {},
      storePath: "/tmp/sessions.json",
      canonicalKey: "agent:main:main",
      storeKeys: ["agent:main:main"],
      legacyKey: undefined,
    });

    await deliverQueuedSessionDelivery({
      deps: {} as never,
      stateDir: "/tmp/custom-session-delivery-state",
      entry: {
        id: "session-delivery-managed",
        kind: "systemEvent",
        sessionKey: "agent:main:main",
        text: "managed return",
        enqueuedAt: 1,
        retryCount: 0,
        expectedSessionId: "original-session",
        managedDelegateArtifactDelivery: {
          receipt: {
            kind: "delegate-artifact",
            dispatchId: "dispatch-1",
            recipientSessionKey: "agent:main:main",
            recipientSessionId: "original-session",
          },
          projection: {
            artifacts: [],
            arrivalContext: {
              deliveryClass: "delegate result",
              deliveryMode: "announced",
              dispatchId: "dispatch-1",
              producer: { sessionKey: "agent:main:child", runId: "run-1" },
              completionId: "completion-1",
              binding: {
                recipientSessionKey: "agent:main:main",
                recipientSessionId: "original-session",
              },
              dispatchAcceptedAt: 1,
              completedAt: 2,
              deliveredAt: 3,
              policyVersion: 1,
              availability: "available",
            },
          },
        },
      },
    });

    expect(mocks.markDelegateArtifactDeliveryUnavailable).toHaveBeenCalledWith({
      dispatchId: "dispatch-1",
      recipientSessionKey: "agent:main:main",
      recipientSessionId: "original-session",
      reason: "recipient-incarnation-changed",
      options: {
        env: expect.objectContaining({
          OPENCLAW_STATE_DIR: "/tmp/custom-session-delivery-state",
        }),
      },
    });
    expect(mocks.enqueueSystemEvent).not.toHaveBeenCalled();
  });

  it("revalidates and refreshes managed arrival context before replay", async () => {
    const projection = {
      artifacts: [],
      arrivalContext: {
        deliveryClass: "delegate result" as const,
        deliveryMode: "announced" as const,
        dispatchId: "dispatch-1",
        producer: { sessionKey: "agent:main:child", runId: "run-1" },
        completionId: "completion-1",
        binding: {
          recipientSessionKey: "agent:main:main",
          recipientSessionId: "session-1",
        },
        dispatchAcceptedAt: 1,
        completedAt: 2,
        deliveredAt: 3,
        policyVersion: 1 as const,
        availability: "available" as const,
      },
    };
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      entry: { sessionId: "session-1", updatedAt: 0 },
      store: {},
      storePath: "/tmp/sessions.json",
      canonicalKey: "agent:main:main",
      storeKeys: ["agent:main:main"],
      legacyKey: undefined,
    });
    mocks.prepareDelegateArtifactDelivery.mockReturnValue({
      status: "ready",
      projection: {
        ...projection,
        arrivalContext: { ...projection.arrivalContext, replayedAt: 10 },
      },
    });
    mocks.replaceManagedDelegateReturnInPrompt.mockReturnValue("refreshed managed return");

    await expect(
      deliverQueuedSessionDelivery({
        deps: {} as never,
        entry: {
          id: "session-delivery-managed",
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "stored managed return",
          enqueuedAt: 1,
          retryCount: 0,
          expectedSessionId: "session-1",
          managedDelegateArtifactDelivery: {
            receipt: {
              kind: "delegate-artifact",
              dispatchId: "dispatch-1",
              recipientSessionKey: "agent:main:main",
              recipientSessionId: "session-1",
            },
            projection,
          },
        },
      }),
    ).rejects.toThrow("managed delegate return is awaiting durable recipient adoption");

    expect(mocks.prepareDelegateArtifactDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        projection,
        currentRecipientSessionId: "session-1",
      }),
    );
    expect(mocks.enqueueSystemEvent).toHaveBeenCalledWith(
      "refreshed managed return",
      expect.objectContaining({
        sessionKey: "agent:main:main",
      }),
    );
  });

  it("rejects a managed replay whose persisted projection does not match its receipt", async () => {
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      entry: { sessionId: "session-1", updatedAt: 0 },
      store: {},
      storePath: "/tmp/sessions.json",
      canonicalKey: "agent:main:main",
      storeKeys: ["agent:main:main"],
      legacyKey: undefined,
    });

    await deliverQueuedSessionDelivery({
      deps: {} as never,
      entry: {
        id: "session-delivery-managed-mismatch",
        kind: "systemEvent",
        sessionKey: "agent:main:main",
        text: "stored managed return",
        enqueuedAt: 1,
        retryCount: 0,
        expectedSessionId: "session-1",
        managedDelegateArtifactDelivery: {
          receipt: {
            kind: "delegate-artifact",
            dispatchId: "dispatch-1",
            recipientSessionKey: "agent:main:main",
            recipientSessionId: "session-1",
          },
          projection: {
            artifacts: [],
            arrivalContext: {
              deliveryClass: "delegate result",
              deliveryMode: "announced",
              dispatchId: "dispatch-other",
              producer: { sessionKey: "agent:main:child", runId: "run-other" },
              completionId: "completion-other",
              binding: {
                recipientSessionKey: "agent:main:main",
                recipientSessionId: "session-1",
              },
              dispatchAcceptedAt: 1,
              completedAt: 2,
              deliveredAt: 3,
              policyVersion: 1,
              availability: "available",
            },
          },
        },
      },
    });

    expect(mocks.prepareDelegateArtifactDelivery).not.toHaveBeenCalled();
    expect(mocks.markDelegateArtifactDeliveryUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchId: "dispatch-1",
        recipientSessionKey: "agent:main:main",
        recipientSessionId: "session-1",
        reason: "delivery-state-unavailable",
      }),
    );
    expect(mocks.enqueueSystemEvent).not.toHaveBeenCalled();
  });

  it("routes post-compaction queue recovery before generic writable session loading", async () => {
    mocks.loadSessionEntry.mockImplementation(() => {
      throw new Error("generic session store must not be loaded");
    });

    await expect(
      deliverQueuedSessionDelivery({
        deps: {} as never,
        entry: {
          id: "post-compaction-disabled-before-generic-load",
          kind: "postCompactionDelegate",
          sessionKey: "agent:main:main",
          task: "remain pending while continuation is disabled",
          // Every entry this build enqueues carries its launch key (RFC §5.4.4
          // Q2); a keyless entry would end on the no-attempt-key rule instead.
          childRunId: "continuation:post-compaction-disabled-record:1",
          // Freshly armed: an entry stamped at epoch 1 would terminalize on the
          // RFC §4.4 stale gate instead of reaching the disabled deferral.
          createdAt: Date.now(),
          firstArmedAt: Date.now(),
          enqueuedAt: Date.now(),
          retryCount: 0,
        },
      }),
    ).rejects.toThrow("continuation is disabled");
    expect(mocks.loadSessionEntry).not.toHaveBeenCalled();
  });

  it("rejects an adopted turn when its captured queue admission retires", async () => {
    let current = true;
    const captured = captureOpenClawStateWorkerContext();
    const capturedQueueContext = {
      ...captured,
      admission: {
        ...captured.admission,
        assertCurrent: () => {
          if (!current) {
            throw new Error("captured queue admission retired");
          }
        },
      },
    } satisfies OpenClawStateWorkerContext;
    mocks.markSessionDeliveryAttemptStarted.mockImplementationOnce(async () => {
      current = false;
    });
    mocks.recordInboundSessionAndDispatchReply.mockImplementationOnce(async (params) => {
      await params.turnAdoptionLifecycle?.onAdopted();
    });

    await expect(
      deliverQueuedSessionDelivery({
        deps: {} as never,
        queueContext: capturedQueueContext,
        entry: {
          id: "session-delivery-retired-admission",
          kind: "agentTurn",
          sessionKey: "agent:main:main",
          message: "continue",
          messageId: "restart-sentinel:retired-admission",
          enqueuedAt: 1,
          retryCount: 0,
          route: { channel: "discord", to: "channel:123", chatType: "channel" },
        },
      }),
    ).rejects.toThrow("captured queue admission retired");
  });

  it("replays a bound logical recipient after a session id rollover", async () => {
    const recipientAuthority = captureSessionRecipientAuthority({
      agentId: "main",
      env: testState.env,
      sessionKey: "agent:main:main",
    });
    mocks.isSessionRecipientAuthorityCurrent.mockReturnValue(true);
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      agentId: "main",
      entry: {
        sessionId: "new-session-incarnation",
        updatedAt: 2,
      },
      store: {},
      storePath: "/tmp/sessions.json",
      canonicalKey: "agent:main:main",
      storeKeys: ["agent:main:main"],
      legacyKey: undefined,
    });

    await expect(
      deliverQueuedSessionDelivery({
        deps: {} as never,
        stateDir: testState.stateDir,
        entry: {
          id: "delivery-authority-rollover",
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "accepted delegate result",
          enqueuedAt: 1,
          retryCount: 0,
          recipientAuthority,
          awaitPromptAdoption: true,
        },
      }),
    ).rejects.toThrow("system event is awaiting durable prompt adoption");

    expect(mocks.enqueueSystemEvent).toHaveBeenCalledWith("accepted delegate result", {
      sessionKey: "agent:main:main",
      contextKey: "task:restart-sentinel:delivery-authority-rollover",
      sessionDeliveryAckId: "delivery-authority-rollover",
      sessionDeliveryAckStateDir: testState.stateDir,
      sessionDeliveryAwaitsTurnAdoption: true,
      recipientAuthority,
      trusted: true,
    });
    expect(mocks.requestHeartbeat).toHaveBeenCalledWith({
      source: "restart-sentinel",
      intent: "immediate",
      reason: "wake",
      // The wake is agent-qualified: continuation ownership travels with the
      // heartbeat so a replayed recipient cannot wake another agent's session.
      agentId: "main",
      sessionKey: "agent:main:main",
    });
  });

  it.each(["owner reassignment", "member access removal", "explicit revocation"] as const)(
    "rejects a stale recipient after %s before prompt eligibility or wake",
    async (invalidation) => {
      const invalidationSlug = invalidation.replaceAll(" ", "-");
      const sessionKey = `agent:main:revoked-${invalidationSlug}`;
      const ownerA = { type: "human" as const, id: "owner-a", source: "unknown" as const };
      const authorityScope = {
        agentId: "main",
        env: testState.env,
        sessionKey,
      };
      await upsertSessionEntryCore(authorityScope, {
        sessionId: "recipient-before-revocation",
        updatedAt: 1,
        createdActor: ownerA,
      });
      const storePath = openOpenClawAgentDatabase({
        agentId: "main",
        env: testState.env,
      }).path;
      if (invalidation === "member access removal") {
        expect(
          (
            await addSessionMember(authorityScope, {
              identityId: "member-a",
              addedBy: ownerA.id,
              addedAt: 2,
            })
          ).inserted,
        ).toBe(true);
      }
      const recipientAuthority = captureSessionRecipientAuthority(authorityScope);

      if (invalidation === "owner reassignment") {
        expect(
          assignSessionOwner(authorityScope, {
            owner: { type: "human", id: "owner-b" },
            assignedBy: ownerA,
            assignedAt: 3,
          }),
        ).not.toBeNull();
      } else if (invalidation === "member access removal") {
        expect(await removeSessionMember(authorityScope, "member-a")).not.toBeNull();
      } else {
        const deletion = await deleteSessionEntryLifecycle({
          agentId: "main",
          archiveTranscript: false,
          storePath,
          target: { canonicalKey: sessionKey, storeKeys: [sessionKey] },
        });
        expect(deletion.deleted).toBe(true);
      }

      expect(isActualSessionRecipientAuthorityCurrent(authorityScope, recipientAuthority)).toBe(
        false,
      );
      mocks.isSessionRecipientAuthorityCurrent.mockImplementation((scope, authority) =>
        isActualSessionRecipientAuthorityCurrent(scope, authority),
      );
      mocks.loadSessionEntry.mockReturnValue({
        cfg: {},
        agentId: "main",
        entry: {
          sessionId: "replacement-session",
          updatedAt: 4,
        },
        store: {},
        storePath,
        canonicalKey: sessionKey,
        storeKeys: [sessionKey],
        legacyKey: undefined,
      });

      await deliverQueuedSessionDelivery({
        deps: {} as never,
        stateDir: testState.stateDir,
        entry: {
          id: `delivery-stale-${invalidationSlug}`,
          kind: "systemEvent",
          sessionKey,
          text: "stale delegate result",
          enqueuedAt: 1,
          retryCount: 0,
          recipientAuthority,
          awaitPromptAdoption: true,
        },
      });

      expect(mocks.isSessionRecipientAuthorityCurrent).toHaveBeenCalledWith(
        { agentId: "main", sessionKey, storePath },
        recipientAuthority,
      );
      expect(mocks.enqueueSystemEvent).not.toHaveBeenCalled();
      expect(mocks.requestHeartbeat).not.toHaveBeenCalled();
    },
  );

  it("preserves distinct durable identities for identical recovered system events", async () => {
    const createEntry = (id: string) =>
      ({
        id,
        kind: "systemEvent",
        sessionKey: "agent:main:main",
        text: "continue after restart",
        enqueuedAt: 1,
        retryCount: 0,
      }) as const;

    await deliverQueuedSessionDelivery({
      deps: {} as never,
      entry: createEntry("session-delivery-a"),
      stateDir: "/tmp/restart-delivery-state",
    });
    await deliverQueuedSessionDelivery({
      deps: {} as never,
      entry: createEntry("session-delivery-b"),
      stateDir: "/tmp/restart-delivery-state",
    });

    expect(mocks.enqueueSystemEvent).toHaveBeenNthCalledWith(1, "continue after restart", {
      sessionKey: "agent:main:main",
      contextKey: "task:restart-sentinel:session-delivery-a",
      sessionDeliveryAckId: "session-delivery-a",
      sessionDeliveryAckStateDir: "/tmp/restart-delivery-state",
      trusted: true,
    });
    expect(mocks.enqueueSystemEvent).toHaveBeenNthCalledWith(2, "continue after restart", {
      sessionKey: "agent:main:main",
      contextKey: "task:restart-sentinel:session-delivery-b",
      sessionDeliveryAckId: "session-delivery-b",
      sessionDeliveryAckStateDir: "/tmp/restart-delivery-state",
      trusted: true,
    });
  });

  it("replays a main-child continuation return only for its helper recipient", async () => {
    const sessionKey = "agent:helper:return";
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      agentId: "helper",
      entry: undefined,
      store: {},
      storePath: "/tmp/helper-sessions.json",
      canonicalKey: sessionKey,
      storeKeys: [sessionKey],
      legacyKey: undefined,
    });

    await deliverQueuedSessionDelivery({
      deps: {} as never,
      entry: {
        id: "continuation-return-helper-replay",
        kind: "systemEvent",
        sessionKey,
        agentId: "helper",
        text: "main child completed",
        idempotencyKey: "continuation-return:main-child:agent:helper:return",
        enqueuedAt: 1,
        retryCount: 0,
      },
      stateDir: "/tmp/restart-delivery-state",
    });

    const eventOptions = mocks.enqueueSystemEvent.mock.calls[0]?.[1];
    const helperQueueKey = resolveSystemEventQueueKey(sessionKey, "helper");
    expect(eventOptions).toMatchObject({ sessionKey: helperQueueKey });
    // Ownership is the agent-qualified queue key: main cannot derive a queue for this replay.
    expect(() => resolveSystemEventQueueKey(helperQueueKey, "main")).toThrow(
      "System event owner does not match its session key.",
    );
    expect(mocks.requestHeartbeat).toHaveBeenCalledWith({
      source: "restart-sentinel",
      intent: "immediate",
      reason: "wake",
      agentId: "helper",
      sessionKey,
    });
  });

  it.each([
    { name: "missing", agentId: undefined },
    { name: "mismatched", agentId: "main" },
  ])("fails closed when a continuation return recipient owner is $name", async ({ agentId }) => {
    await expect(
      deliverQueuedSessionDelivery({
        deps: {} as never,
        entry: {
          id: `continuation-return-helper-${agentId ?? "missing"}`,
          kind: "systemEvent",
          sessionKey: "agent:helper:return",
          ...(agentId ? { agentId } : {}),
          text: "must not replay",
          idempotencyKey: `continuation-return:invalid-${agentId ?? "missing"}`,
          enqueuedAt: 1,
          retryCount: 0,
        },
      }),
    ).rejects.toThrow(/recipient owner (is unavailable|mismatches)/);
    expect(mocks.enqueueSystemEvent).not.toHaveBeenCalled();
    expect(mocks.requestHeartbeat).not.toHaveBeenCalled();
  });

  it("does not dispatch a queued agentTurn continuation after the session key changes", async () => {
    const activeEntry: LoadedSessionEntry = {
      cfg: { commands: { ownerAllowFrom: ["+15550002"] } },
      entry: {
        sessionId: "old-session-id",
        updatedAt: Date.now(),
      },
      store: {},
      storePath: "/tmp/sessions.json",
      canonicalKey: "agent:main:main",
      storeKeys: ["agent:main:main"],
      legacyKey: undefined,
    };
    const replacementEntry: LoadedSessionEntry = {
      cfg: { commands: { ownerAllowFrom: ["+15550002"] } },
      entry: {
        sessionId: "new-session-id",
        updatedAt: Date.now(),
        status: "done",
        endedAt: Date.now() - 1_000,
      },
      store: {},
      storePath: "/tmp/sessions.json",
      canonicalKey: "agent:main:main",
      storeKeys: ["agent:main:main"],
      legacyKey: undefined,
    };
    mockRestartContinuation(
      {
        kind: "agentTurn",
        message: "continue after restart",
      },
      "thread-42",
    );
    mocks.loadSessionEntry.mockReturnValueOnce(activeEntry).mockReturnValue(replacementEntry);

    await wakeRestartSentinel();

    expect(mocks.enqueueSessionDelivery).toHaveBeenCalledTimes(1);
    expect(mocks.recordInboundSessionAndDispatchReply).not.toHaveBeenCalled();
    const continuationQueueId = await getEnqueuedSessionDeliveryId(0);
    expect(mocks.enqueueSystemEvent).toHaveBeenCalledWith("continue after restart", {
      sessionKey: "agent:main:main",
      contextKey: `task:restart-sentinel:${await mocks.enqueueSessionDelivery.mock.results[0]!.value}`,
      deliveryContext: {
        channel: "whatsapp",
        to: "+15550002",
        accountId: "acct-2",
        threadId: "thread-42",
      },
      sessionDeliveryAckId: continuationQueueId,
      sessionDeliveryAckStateDir: testState.stateDir,
      trusted: true,
    });
    expect(mocks.requestHeartbeat).toHaveBeenCalledWith({
      source: "restart-sentinel",
      intent: "immediate",
      reason: "wake",
      sessionKey: "agent:main:main",
    });
    expect(mocks.logWarn).toHaveBeenCalledWith("restart continuation skipped: session changed", {
      sessionKey: "agent:main:main",
      queueId: expect.any(String),
      expectedSessionId: "old-session-id",
      actualSessionId: "new-session-id",
    });
  });
});
