// Module mocks shared by restart sentinel continuation-delivery suites. Import this
// module first so its registrations precede the modules they replace.
import { vi } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
import type { SessionAccessScope } from "../config/sessions/session-accessor.sqlite-contract.js";
import type { SessionRecipientAuthority } from "../config/sessions/session-recipient-authority-types.js";

type RestartSentinel = NonNullable<
  Awaited<ReturnType<typeof import("../infra/restart-sentinel.js").readRestartSentinel>>
>;

type LoadedSessionEntryBase = Awaited<
  ReturnType<
    typeof import("./session-utils-store-worker.js").loadGatewaySessionEntryReadOnlyInWorker
  >
>;
type LoadedSessionEntry = Omit<LoadedSessionEntryBase, "agentId"> &
  Partial<Pick<LoadedSessionEntryBase, "agentId">>;
type RecordInboundSessionAndDispatchReplyParams = Parameters<
  typeof import("../channels/turn/lifecycle.js").dispatchAssembledChannelTurn
>[0] & {
  deliver: (payload: { text?: string; replyToId?: string | null }) => Promise<void>;
  onDispatchError: (err: unknown, info: { kind: string }) => void;
};
type InProcessDispatchMock = (
  method: string,
  params: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
type DeferSessionDeliveryMock =
  typeof import("../infra/session-delivery-queue-storage.js").deferSessionDelivery;
type FailSessionDeliveryMock =
  typeof import("../infra/session-delivery-queue-storage.js").failSessionDelivery;
type MergeSessionDeliveryPreparedMediaBlocksMock =
  typeof import("../infra/session-delivery-queue-storage.js").mergeSessionDeliveryPreparedMediaBlocks;
type RecoverPendingSessionDeliveriesMock =
  typeof import("../infra/session-delivery-queue-recovery.js").recoverPendingSessionDeliveries;
type DrainPendingSessionDeliveryMock =
  typeof import("../infra/session-delivery-queue-recovery.js").drainPendingSessionDelivery;
type AppendAssistantMessageToSessionTranscriptMock =
  typeof import("../config/sessions/transcript.js").appendAssistantMessageToSessionTranscript;
type CreateManagedOutgoingMediaBlocksMock =
  typeof import("./managed-image-attachments.js").createManagedOutgoingMediaBlocks;
type AttachManagedOutgoingMediaToMessageMock =
  typeof import("./managed-image-attachments.js").attachManagedOutgoingMediaToMessage;
type EnrichAssistantTranscriptMediaForRunMock =
  typeof import("./server-methods/chat-transcript-persistence.js").enrichAssistantTranscriptMediaForRun;

const mocks = vi.hoisted(() => {
  const state = {
    queuedSessionDeliveries: new Map<string, Record<string, unknown>>(),
    nextSessionDeliveryId: 1,
    initialOutboundDelivery: null as Record<string, unknown> | null,
  };

  const harnessMocks = {
    resolveSessionAgentId: vi.fn(() => "agent-from-key"),
    isSessionRecipientAuthorityCurrent: vi.fn<
      (
        scope: SessionAccessScope,
        authority: SessionRecipientAuthority,
      ) => boolean | Promise<boolean>
    >(() => true),
    get queuedSessionDelivery() {
      return state.queuedSessionDeliveries.values().next().value ?? null;
    },
    set queuedSessionDelivery(value: Record<string, unknown> | null) {
      state.queuedSessionDeliveries.clear();
      state.nextSessionDeliveryId = 1;
      if (value) {
        state.queuedSessionDeliveries.set("session-delivery-1", value);
        state.nextSessionDeliveryId = 2;
      }
    },
    setInitialOutboundDelivery(value: Record<string, unknown> | null) {
      state.initialOutboundDelivery = value;
    },
    takeInitialOutboundDelivery() {
      const value = state.initialOutboundDelivery;
      state.initialOutboundDelivery = null;
      return value;
    },
    dispatchGatewayMethodInProcess: vi.fn<InProcessDispatchMock>(),
    readRestartSentinel: vi.fn<() => Promise<RestartSentinel>>(),
    finalizeUpdateRestartSentinelRunningVersion: vi.fn(async () => null),
    clearSentinel: vi.fn(async () => true),
    formatRestartSentinelMessage: vi.fn(() => "restart message"),
    summarizeRestartSentinel: vi.fn(() => "restart summary"),
    resolveSystemMainSessionTarget: vi.fn(() => ({
      agentId: "ops",
      sessionKey: "agent:ops:main",
    })),
    parseSessionThreadInfo: vi.fn(
      (): { baseSessionKey: string | null | undefined; threadId: string | undefined } => ({
        baseSessionKey: null,
        threadId: undefined,
      }),
    ),
    loadSessionEntry: vi.fn<(sessionKey: string) => LoadedSessionEntry>(),
    resolveSessionTarget:
      vi.fn<
        typeof import("./session-utils-store-worker.js").resolveGatewaySessionStoreTargetInWorker
      >(),
    captureSessionEventTarget:
      vi.fn<
        typeof import("../auto-reply/reply/session-event-handoff.js").captureSessionEventTargetForHost
      >(),
    enqueueSessionEvent:
      vi.fn<
        typeof import("../auto-reply/reply/session-event-handoff.js").enqueueSessionEventForHost
      >(),
    deliveryContextFromSession: vi.fn<
      typeof import("../utils/delivery-context.read.js").deliveryContextFromSession
    >(() => undefined),
    mergeDeliveryContext: vi.fn<
      typeof import("../utils/delivery-context.shared.js").mergeDeliveryContext
    >((a, b) => ({ ...b, ...a })),
    getChannelPlugin: vi.fn((): ChannelPlugin | undefined => undefined),
    normalizeChannelId: vi.fn<(channel?: string | null) => string | null>(),
    resolveOutboundTarget: vi.fn(((_params?: { to?: string }) => ({
      ok: true as const,
      to: "+15550002",
    })) as (params?: { to?: string }) => { ok: true; to: string } | { ok: false; error: Error }),
    deliverOutboundPayloads: vi.fn(async (_params?: Record<string, unknown>) => [
      { channel: "whatsapp", messageId: "msg-1" },
    ]),
    enqueueDeliveryOnce: vi.fn(async (_payload: unknown, id: string) => ({ id, created: true })),
    findDeliveryIntentOwner: vi.fn<
      () => Promise<{
        namespace: "prepared" | "preparing" | "migration" | "legacy-preparing" | "legacy";
        status: "pending" | "failed" | "completed";
      } | null>
    >(async () => null),
    ackDelivery: vi.fn(async (_id: string) => {}),
    failDelivery: vi.fn(async () => {}),
    failDeliveryAfterPlatformSend: vi.fn(async () => {}),
    failDeliveryBeforePlatformSend: vi.fn(async () => {}),
    failPendingDelivery: vi.fn(async () => ({ status: "failed" as const })),
    loadPendingDelivery: vi.fn(async () => null),
    drainPendingDeliveries: vi.fn(async () => {}),
    reserveDeliveryAttempt: vi.fn(async () => ({
      status: "reserved" as const,
      attemptCount: 1,
    })),
    withActiveDeliveryClaim: vi.fn(async (_id: string, fn: () => Promise<unknown>) => ({
      status: "claimed" as const,
      value: await fn(),
    })),
    withStableDeliveryPreparation: vi.fn(),
    // `true` is the queue's admission contract; the replay acts on the result.
    enqueueSystemEvent: vi.fn((..._args: unknown[]) => true),
    requestContinuationWake: vi.fn(),
    enqueueSessionDelivery: vi.fn(),
    deferSessionDelivery: vi.fn<DeferSessionDeliveryMock>(async () => {}),
    failSessionDelivery: vi.fn<FailSessionDeliveryMock>(async () => {}),
    mergeSessionDeliveryPreparedMediaBlocks: vi.fn<MergeSessionDeliveryPreparedMediaBlocksMock>(
      async (_id, _mediaUrl, blocks) => blocks,
    ),
    markSessionDeliveryAttemptStarted: vi.fn(async () => {}),
    markSessionDeliverySettlement: vi.fn(async () => {}),
    appendAssistantMessageToSessionTranscript: vi.fn<AppendAssistantMessageToSessionTranscriptMock>(
      async (params) => {
        const { appendRestartSentinelTranscriptReceipt } =
          await import("./server-restart-sentinel.test-support.js");
        return appendRestartSentinelTranscriptReceipt(params);
      },
    ),
    createManagedOutgoingMediaBlocks: vi.fn<CreateManagedOutgoingMediaBlocksMock>(async (params) =>
      (params.items ?? []).map((item) => ({
        type: item.mimeType?.startsWith("audio/") ? "audio" : "image",
        artifactId: `artifact:${item.url}`,
        url: `/api/chat/media/outgoing/${encodeURIComponent(params.sessionKey)}/${encodeURIComponent(item.url)}/full`,
        openUrl: `/api/chat/media/outgoing/${encodeURIComponent(params.sessionKey)}/${encodeURIComponent(item.url)}/full`,
      })),
    ),
    attachManagedOutgoingMediaToMessage: vi.fn<AttachManagedOutgoingMediaToMessageMock>(
      async () => true,
    ),
    enrichAssistantTranscriptMediaForRun: vi.fn<EnrichAssistantTranscriptMediaForRunMock>(
      async () => null,
    ),
    removeCronRunContinuationSessionIfIdle: vi.fn(async () => {}),
    settleCorrelatedSubagentDelivery: vi.fn(async () => {}),
    loadPendingSessionDelivery: vi.fn(),
    drainPendingSessionDelivery: vi.fn<DrainPendingSessionDeliveryMock>(),
    recoverPendingSessionDeliveries: vi.fn<RecoverPendingSessionDeliveriesMock>(),
    resolveAgentConfig: vi.fn(() => undefined),
    resolveAgentWorkspaceDir: vi.fn(() => "/tmp/openclaw-test-workspace"),
    resolveDefaultAgentId: vi.fn(() => "main"),
    recordInboundSessionAndDispatchReply: vi.fn(
      async (_params: RecordInboundSessionAndDispatchReplyParams) => {},
    ),
    logDebug: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
  };
  return {
    ...harnessMocks,
    // Upstream's restart session-event mocks read entries asynchronously; the fork's cases
    // keep scripting the synchronous loadSessionEntry.
    loadSessionEntryAsync: async (sessionKey: string) => harnessMocks.loadSessionEntry(sessionKey),
  };
});

vi.unmock("./server-restart-sentinel.js");

vi.mock(
  "../agents/subagents/completion/subagent-completion-delivery.js",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../agents/subagents/completion/subagent-completion-delivery.js")
    >()),
    settleCorrelatedSubagentDelivery: mocks.settleCorrelatedSubagentDelivery,
  }),
);

vi.mock("../agents/agent-scope.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agents/agent-scope.js")>()),
  resolveAgentConfig: mocks.resolveAgentConfig,
  resolveAgentWorkspaceDir: mocks.resolveAgentWorkspaceDir,
  resolveDefaultAgentId: mocks.resolveDefaultAgentId,
  resolveSessionAgentId: mocks.resolveSessionAgentId,
}));

vi.mock("../infra/restart-sentinel.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../infra/restart-sentinel.js")>()),
  finalizeUpdateRestartSentinelRunningVersion: mocks.finalizeUpdateRestartSentinelRunningVersion,
  readRestartSentinel: mocks.readRestartSentinel,
  clearRestartSentinelIfRevision: mocks.clearSentinel,
  formatRestartSentinelMessage: mocks.formatRestartSentinelMessage,
  summarizeRestartSentinel: mocks.summarizeRestartSentinel,
}));

vi.mock("../infra/session-delivery-queue-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../infra/session-delivery-queue-storage.js")>();
  mocks.enqueueSessionDelivery.mockImplementation(actual.enqueueSessionDelivery);
  mocks.deferSessionDelivery.mockImplementation(async (id, delayMs, queueContext) => {
    if (await actual.loadPendingSessionDelivery(id, queueContext)) {
      await actual.deferSessionDelivery(id, delayMs, queueContext);
    }
  });
  mocks.failSessionDelivery.mockImplementation(async (id, error, queueContext, options) => {
    if (await actual.loadPendingSessionDelivery(id, queueContext)) {
      await actual.failSessionDelivery(id, error, queueContext, options);
    }
  });
  mocks.mergeSessionDeliveryPreparedMediaBlocks.mockImplementation(
    async (id, mediaUrl, blocks, queueContext) => {
      if (await actual.loadPendingSessionDelivery(id, queueContext)) {
        return await actual.mergeSessionDeliveryPreparedMediaBlocks(
          id,
          mediaUrl,
          blocks,
          queueContext,
        );
      }
      return blocks;
    },
  );
  mocks.loadPendingSessionDelivery.mockImplementation(actual.loadPendingSessionDelivery);
  return {
    ...actual,
    deferSessionDelivery: mocks.deferSessionDelivery,
    failSessionDelivery: mocks.failSessionDelivery,
    mergeSessionDeliveryPreparedMediaBlocks: mocks.mergeSessionDeliveryPreparedMediaBlocks,
    enqueueSessionDelivery: mocks.enqueueSessionDelivery,
    loadPendingSessionDelivery: mocks.loadPendingSessionDelivery,
    markSessionDeliveryAttemptStarted: mocks.markSessionDeliveryAttemptStarted,
    markSessionDeliverySettlement: mocks.markSessionDeliverySettlement,
  };
});

vi.mock("../infra/session-delivery-queue-recovery.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../infra/session-delivery-queue-recovery.js")>();
  mocks.drainPendingSessionDelivery.mockImplementation(actual.drainPendingSessionDelivery);
  mocks.recoverPendingSessionDeliveries.mockImplementation(actual.recoverPendingSessionDeliveries);
  return {
    ...actual,
    drainPendingSessionDelivery: mocks.drainPendingSessionDelivery,
    recoverPendingSessionDeliveries: mocks.recoverPendingSessionDeliveries,
  };
});

// mock-isolation: Cron cleanup is recorded without reading or deleting session-store entries.
vi.mock("../cron/run-continuation-cleanup.js", () => ({
  removeCronRunContinuationSessionIfIdle: mocks.removeCronRunContinuationSessionIfIdle,
}));

// mock-isolation: Transcript appends are recorded without writing session transcripts.
vi.mock("../config/sessions/transcript.js", () => ({
  appendAssistantMessageToSessionTranscript: mocks.appendAssistantMessageToSessionTranscript,
}));

vi.mock("./managed-image-attachments.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./managed-image-attachments.js")>()),
  createManagedOutgoingMediaBlocks: mocks.createManagedOutgoingMediaBlocks,
  attachManagedOutgoingMediaToMessage: mocks.attachManagedOutgoingMediaToMessage,
}));

vi.mock("./server-methods/chat-transcript-persistence.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./server-methods/chat-transcript-persistence.js")>()),
  enrichAssistantTranscriptMediaForRun: mocks.enrichAssistantTranscriptMediaForRun,
}));

vi.mock("../config/sessions/main-session.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/sessions/main-session.js")>()),
  resolveSystemMainSessionTarget: mocks.resolveSystemMainSessionTarget,
}));

// mock-isolation: An empty runtime config stands in for the config file loader.
vi.mock("../config/io.js", () => ({ getRuntimeConfig: vi.fn(() => ({})) }));

vi.mock("../channels/plugins/session-conversation.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../channels/plugins/session-conversation.js")>()),
  resolveSessionThreadInfo: mocks.parseSessionThreadInfo,
}));

// mock-isolation: Thread info comes from the test; the real resolver reads loaded channel plugins.
vi.mock("../channels/plugins/session-thread-info-loaded.js", () => ({
  resolveLoadedSessionThreadInfo: mocks.parseSessionThreadInfo,
}));

// Delivery reads its session target and entry in the worker; both come from loadSessionEntry rows.
// mock-isolation: Worker session reads are scripted; the real worker opens session stores.
vi.mock("./session-utils-store-worker.js", () => ({
  resolveGatewaySessionStoreTargetInWorker: mocks.resolveSessionTarget,
  loadGatewaySessionEntryReadOnlyInWorker: async (params: { key: string }) =>
    mocks.loadSessionEntry(params.key),
}));

// mock-isolation: Observe ordinary event adoption for plain restart notices without a model turn.
vi.mock("../auto-reply/reply/session-event-handoff.js", () => ({
  captureSessionEventTargetForHost: mocks.captureSessionEventTarget,
  enqueueSessionEventForHost: mocks.enqueueSessionEvent,
}));

vi.mock("../utils/delivery-context.read.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/delivery-context.read.js")>()),
  deliveryContextFromSession: mocks.deliveryContextFromSession,
}));
vi.mock("../config/sessions/session-recipient-authority-current.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../config/sessions/session-recipient-authority-current.js")
  >()),
  isSessionRecipientAuthorityCurrentInWorker: async (
    scope: SessionAccessScope,
    authority: SessionRecipientAuthority,
  ) => mocks.isSessionRecipientAuthorityCurrent(scope, authority),
  withCurrentSessionRecipientAuthority: async <T>(
    checks: readonly { scope: SessionAccessScope; authority: SessionRecipientAuthority }[],
    decide: (current: readonly boolean[]) => T,
  ) =>
    decide(
      await Promise.all(
        checks.map(({ scope, authority }) =>
          Promise.resolve(mocks.isSessionRecipientAuthorityCurrent(scope, authority)),
        ),
      ),
    ),
}));

vi.mock("../utils/delivery-context.shared.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/delivery-context.shared.js")>()),
  mergeDeliveryContext: mocks.mergeDeliveryContext,
}));

vi.mock("../channels/plugins/index.js", async () => {
  const actual = await vi.importActual<typeof import("../channels/plugins/index.js")>(
    "../channels/plugins/index.js",
  );
  return {
    ...actual,
    getChannelPlugin: mocks.getChannelPlugin,
    normalizeChannelId: mocks.normalizeChannelId.mockImplementation(
      (channel?: string | null) =>
        actual.normalizeChannelId(channel) ??
        (typeof channel === "string" && channel.trim().length > 0
          ? channel.trim().toLowerCase()
          : null),
    ),
  };
});

// mock-isolation: Channel turns route to a recorded dispatcher instead of the channel reply pipeline.
vi.mock("../channels/turn/lifecycle.js", () => ({
  dispatchAssembledChannelTurn: async (params: {
    delivery: {
      preparePayload?: (payload: { text?: string; replyToId?: string | null }) => {
        text?: string;
        replyToId?: string | null;
      };
      deliver: (payload: { text?: string; replyToId?: string | null }) => Promise<void>;
      onError?: (err: unknown, info: { kind: string }) => void;
    };
  }) => {
    await mocks.recordInboundSessionAndDispatchReply({
      ...params,
      deliver: async (payload: { text?: string; replyToId?: string | null }) =>
        params.delivery.deliver(params.delivery.preparePayload?.(payload) ?? payload),
      onDispatchError: (err: unknown, info: { kind: string }) =>
        params.delivery.onError?.(err, info),
    } as unknown as RecordInboundSessionAndDispatchReplyParams);
    return {
      dispatched: true,
      dispatchResult: { observedReplyDelivery: true },
    };
  },
}));

vi.mock("./server-lifecycle-runtime-context.js", async () => ({
  ...(await vi.importActual<typeof import("./server-lifecycle-runtime-context.js")>(
    "./server-lifecycle-runtime-context.js",
  )),
  dispatchGatewayLifecycleMethod: mocks.dispatchGatewayMethodInProcess,
}));

// mock-isolation: Outbound targets come from the test; the real resolver reads channel plugins.
vi.mock("../infra/outbound/targets.js", () => ({
  resolveOutboundTarget: mocks.resolveOutboundTarget,
}));

// mock-isolation: Outbound sends are recorded; nothing reaches a channel.
vi.mock("../infra/outbound/deliver.js", () => ({
  deliverOutboundPayloads: mocks.deliverOutboundPayloads,
  deliverOutboundPayloadsInternal: mocks.deliverOutboundPayloads,
}));

// mock-isolation: Delivery queue rows are scripted; the real storage opens the state database.
vi.mock("../infra/outbound/delivery-queue-storage.js", () => ({
  ackDelivery: mocks.ackDelivery,
  failDelivery: mocks.failDelivery,
  failDeliveryAfterPlatformSend: mocks.failDeliveryAfterPlatformSend,
  failDeliveryBeforePlatformSend: mocks.failDeliveryBeforePlatformSend,
  findDeliveryIntentOwner: mocks.findDeliveryIntentOwner,
  loadPendingDelivery: async () =>
    mocks.takeInitialOutboundDelivery() ?? (await mocks.loadPendingDelivery()),
  reserveDeliveryAttempt: mocks.reserveDeliveryAttempt,
}));
vi.mock("../infra/outbound/delivery-queue-ack.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../infra/outbound/delivery-queue-ack.js")>()),
  failPendingDelivery: mocks.failPendingDelivery,
}));
// mock-isolation: Queue drains are scripted instead of recovering real pending deliveries.
vi.mock("../infra/outbound/delivery-queue-recovery.js", () => ({
  drainPendingDeliveriesCore: mocks.drainPendingDeliveries,
  withActiveDeliveryClaim: mocks.withActiveDeliveryClaim,
}));

// mock-isolation: Delivery preparation runs through a test hook instead of the real queue claim.
vi.mock("../infra/outbound/delivery-queue-preparation.js", () => ({
  withStableDeliveryPreparation: mocks.withStableDeliveryPreparation,
}));

// mock-isolation: Every payload is accepted as-is; the real preparation runs channel and message hooks.
vi.mock("../infra/outbound/deliver-prepare.js", () => ({
  prepareOutboundPayloadBatch: vi.fn(async (params: { payloads: unknown[] }) => ({
    schemaVersion: 1,
    sourcePayloadCount: params.payloads.length,
    channelNormalized: true,
    entries: params.payloads.map((payload, sourceIndex) => ({
      sourceIndex,
      status: "accepted",
      payload,
      replyHookChanged: false,
      messageHookChanged: false,
      preparedMediaCount: 0,
    })),
  })),
}));

// mock-isolation: Admission enqueues through the test's queue instead of the state database.
vi.mock("../infra/outbound/deliver-queue-admission.js", () => ({
  stageAndEnqueueOutboundDelivery: vi.fn(
    async (
      params: { deliveryIntentId?: string; payloads: unknown[] },
      preparedBatch: Record<string, unknown>,
    ) => {
      const queued = await mocks.enqueueDeliveryOnce(params, params.deliveryIntentId ?? "");
      if (queued.created) {
        mocks.setInitialOutboundDelivery({
          ...params,
          id: queued.id,
          enqueuedAt: 1,
          retryCount: 0,
          attemptCount: 0,
          preparedBatch,
        });
      }
      return queued;
    },
  ),
}));

// mock-isolation: Durable sends route to the recorded outbound sender instead of channel runtimes.
vi.mock("../channels/message/runtime.js", () => ({
  sendDurableMessageBatchCore: vi.fn(async (params: Record<string, unknown>) => {
    try {
      const results = await mocks.deliverOutboundPayloads(params);
      return { status: "sent", results };
    } catch (error) {
      return { status: "failed", error };
    }
  }),
}));

vi.mock("./server-restart-update-run.js", async () => {
  const actual = await vi.importActual<typeof import("./server-restart-update-run.js")>(
    "./server-restart-update-run.js",
  );
  return { ...actual, finalizeRestartUpdateRun: vi.fn(actual.finalizeRestartUpdateRun) };
});

// mock-isolation: System events are captured instead of entering the process-wide event queue.
vi.mock("../infra/system-events.js", () => ({
  enqueueSystemEvent: mocks.enqueueSystemEvent,
  enqueueSystemEventRaw: mocks.enqueueSystemEvent,
}));
// mock-isolation: The system-event queue above is synthetic, so its managed-delivery lookups are too.
vi.mock("../infra/system-event-managed-delivery-queue.js", () => ({
  hasQueuedSystemEventDelivery: () => false,
}));

// mock-isolation: Continuation wakes are recorded without running the session-event handoff.
vi.mock("../auto-reply/continuation/continuation-wake.js", () => ({
  requestContinuationWake: mocks.requestContinuationWake,
}));

vi.mock("../logging/subsystem.js", async () => {
  const actual =
    await vi.importActual<typeof import("../logging/subsystem.js")>("../logging/subsystem.js");
  const logger = {
    debug: mocks.logDebug,
    info: mocks.logInfo,
    warn: mocks.logWarn,
    error: mocks.logError,
    isEnabled: vi.fn(() => false),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return {
    ...actual,
    createSubsystemLogger: vi.fn((subsystem: string) =>
      subsystem === "gateway/restart-sentinel" || subsystem === "gateway/update-run"
        ? logger
        : actual.createSubsystemLogger(subsystem),
    ),
  };
});

export { mocks };
