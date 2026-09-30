// Chat send must not re-broadcast a status notice once lifecycle has broadcast the run terminal.
import fs from "node:fs";
import path from "node:path";
import { asOptionalRecord, expectDefined } from "@openclaw/normalization-core";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CronCreatorAuthorityCapability } from "../../agents/cron-creator-authority-context.js";
import type { ModelCatalogEntry } from "../../agents/model-catalog.types.js";
import type { ReplyDispatchRun } from "../../auto-reply/get-reply-options.types.js";
import type { ReplyPayload } from "../../auto-reply/reply-payload.js";
import { getTotalPendingReplies } from "../../auto-reply/reply/dispatcher-registry.js";
import { testing as replyRunRegistryTesting } from "../../auto-reply/reply/reply-run-registry.test-support.js";
import type { MsgContext } from "../../auto-reply/templating.js";
import {
  appendTranscriptMessage,
  type SessionAccessScope,
  type SessionTranscriptReadScope,
} from "../../config/sessions/session-accessor.js";
import { waitForSessionTranscriptIndexReconcile } from "../../config/sessions/session-transcript-reconcile.js";
import { withOwnedSessionTranscriptWrites } from "../../config/sessions/transcript-write-context.js";
import { getActiveSessionWorkAdmissionCount } from "../../sessions/session-lifecycle-admission.js";
import { createChatRunState } from "../server-chat-state.js";
import { handleChatSend } from "./chat-send-handler.js";
import { readChatSendDedupeResponse } from "./chat-send-pre-admission.js";
import {
  createChatDirectiveSuiteResources,
  readChatDirectiveConfig,
  seedChatDirectiveFileTranscript,
} from "./chat.directive-tags.test-support.js";
import type { GatewayRequestContext, RespondFn } from "./types.js";

type ProjectedDispatchParams = Parameters<
  typeof import("../../auto-reply/dispatch.js").dispatchInboundMessageWithProjectedDispatcher
>[0];
type TestReplyDispatcher = ReturnType<
  typeof import("../../auto-reply/reply/reply-dispatcher.js").createReplyDispatcher
>;
type TestDispatchParams = Omit<ProjectedDispatchParams, "dispatcherOptions"> & {
  dispatcher: TestReplyDispatcher;
};
type TranscriptUpdate = Parameters<
  typeof import("../../sessions/transcript-events.js").emitSessionTranscriptUpdate
>[0];

const mockState = vi.hoisted(() => {
  const createTestState = () => ({
    config: {} as Record<string, unknown>,
    mainSessionKey: "main",
    finalText: "[[reply_to_current]]",
    finalPayload: null as ReplyPayload | null,
    dispatchedReplies: [] as Array<{
      kind: "tool" | "block" | "final";
      payload: ReplyPayload;
    }>,
    dispatchError: null as Error | null,
    dispatchWait: null as Promise<void> | null,
    dispatchErrorAfterAgentRunStart: null as Error | null,
    dispatchErrorAfterDelivery: null as Error | null,
    sessionMetadataChanges: [] as Array<{
      sessionKey: string;
      agentId?: string;
      reason: "command-metadata";
    }>,
    triggerAgentRunStart: false,
    replyDispatchRun: undefined as ReplyDispatchRun | undefined,
    triggerUserMessagePersisted: false,
    runtimeUserMessagePersistencePending: null as Promise<void> | null,
    onAfterAgentRunStart: null as (() => void) | null,
    agentRunId: "run-agent-1",
    sessionEntry: {} as Record<string, unknown>,
    sessionIdsByKey: new Map<string, string>(),
    sessionMissing: false,
    loadSessionEntryCalls: [] as Array<{ rawKey: string; opts?: { agentId?: string } }>,
    lastDispatchCtx: undefined as MsgContext | undefined,
    lastDispatchImages: undefined as Array<{ mimeType: string; data: string }> | undefined,
    lastDispatchImageOrder: undefined as string[] | undefined,
    lastDispatchThinkingLevelOverride: undefined as string | undefined,
    lastDispatchOriginatingLeafEntryId: undefined as string | null | undefined,
    lastTaskSuggestionDeliveryMode: undefined as "gateway" | undefined,
    lastMessageInjectionDisposition: undefined as "none" | "accepted" | "rejected" | undefined,
    lastDispatchUserTurnInput: undefined as unknown,
    modelCatalog: null as ModelCatalogEntry[] | null,
    emittedTranscriptUpdates: [] as TranscriptUpdate[],
    savedMediaResults: [] as Array<{ id?: string; path: string; contentType?: string }>,
    saveMediaError: null as Error | null,
    steerDocumentRenderError: null as Error | null,
    savedMediaCalls: [] as Array<{ contentType?: string; subdir?: string; size: number }>,
    saveMediaWait: null as Promise<void> | null,
    activeSaveMediaCalls: 0,
    maxActiveSaveMediaCalls: 0,
    replyContextCalls: 0,
    replyContextResult: null as {
      ReplyToId?: string;
      ReplyToBody?: string;
      ReplyToSender?: string;
    } | null,
    replyContextWait: null as Promise<void> | null,
    sandboxWorkspace: null as { workspaceDir: string; containerWorkdir?: string } | null,
    stageSandboxMediaError: null as Error | null,
    stagedRelativePaths: null as string[] | null,
    hasBeforeAgentRunHooks: false,
    hasMessageReceivedHooks: false,
    messageReceivedCalls: [] as Array<{ event: unknown; context: unknown }>,
    beforeMessageWriteBlock: false,
    beforeMessageWriteContent: null as string | null,
    beforeMessageWriteCalls: [] as Array<{ message: unknown; ctx: unknown }>,
    dispatchBlockedByBeforeAgentRun: false,
    disposedTranscriptWriteContext: false,
    disposedTranscriptWriteAttempts: 0,
    runtimeAssistantContentBeforeDelivery: null as Array<Record<string, unknown>> | null,
    runtimeAssistantTextsBeforeDelivery: [] as string[],
    cronAuthorityProbe: undefined as
      | ((
          runId: string | undefined,
          capability: CronCreatorAuthorityCapability | undefined,
        ) => Promise<void> | void)
      | undefined,
    // `unstagedSources` lets tests simulate partial staging failure: absolute
    // source paths listed here are excluded from the returned `staged` map even
    // though ctx still carries their rewritten paths. This mirrors how the real
    // stageSandboxMedia silently skips over-cap files.
    unstagedSources: null as string[] | null,
    deleteMediaBufferCalls: [] as Array<{ id: string; subdir?: string }>,
  });
  const state = {
    storePath: "",
    transcriptPath: "",
    sessionId: "sess-1",
    ...createTestState(),
  };
  return Object.assign(state, {
    reset: () => Object.assign(state, createTestState()),
  });
});

type TestReply = (typeof mockState.dispatchedReplies)[number];

let suiteResources: ReturnType<typeof createChatDirectiveSuiteResources>;
let suiteFixtureRoot = "";
let suiteDatabasePath = "";
let suiteFixtureEnv: NodeJS.ProcessEnv = {};
let suiteFixtureSeq = 0;

const bindingMocks = vi.hoisted(() => ({
  resolveByConversation: vi.fn(
    (_ref: unknown) =>
      null as { metadata?: Record<string, unknown>; targetSessionKey?: string } | null,
  ),
}));

vi.mock("../../media-understanding/file-context.js", async () => {
  const actual = await vi.importActual<typeof import("../../media-understanding/file-context.js")>(
    "../../media-understanding/file-context.js",
  );
  return {
    ...actual,
    renderInboundDocumentContext: (
      params: Parameters<typeof actual.renderInboundDocumentContext>[0],
    ) => {
      if (mockState.steerDocumentRenderError) {
        return Promise.reject(mockState.steerDocumentRenderError);
      }
      return actual.renderInboundDocumentContext(params);
    },
  };
});

vi.mock("../session-utils.js", async () => {
  const original =
    await vi.importActual<typeof import("../session-utils.js")>("../session-utils.js");
  const loadSessionEntry = (rawKey: string, opts?: { agentId?: string }) => {
    mockState.loadSessionEntryCalls.push({ rawKey, opts });
    return suiteResources.loadSessionEntry(mockState, rawKey, opts);
  };
  return {
    ...original,
    loadSessionEntry,
    loadGatewaySessionEntryReadOnly: loadSessionEntry,
  };
});

const dispatchInboundMessageMock = vi.hoisted(() => vi.fn());

vi.mock("../../auto-reply/dispatch.js", async () => {
  const { createReplyDispatcher } = await vi.importActual<
    typeof import("../../auto-reply/reply/reply-dispatcher.js")
  >("../../auto-reply/reply/reply-dispatcher.js");
  const { withReplyDispatcher } = await vi.importActual<
    typeof import("../../auto-reply/dispatch-dispatcher.js")
  >("../../auto-reply/dispatch-dispatcher.js");
  return {
    dispatchInboundMessage: dispatchInboundMessageMock,
    dispatchInboundMessageWithProjectedDispatcher: vi.fn(
      async (params: ProjectedDispatchParams) => {
        const { dispatcherOptions, ...dispatchParams } = params;
        const dispatcher = createReplyDispatcher(dispatcherOptions);
        return await withReplyDispatcher({
          dispatcher,
          run: () => dispatchInboundMessageMock({ ...dispatchParams, dispatcher }),
        });
      },
    ),
  };
});

dispatchInboundMessageMock.mockImplementation(
  vi.fn(async (params: TestDispatchParams) => {
    mockState.lastDispatchCtx = params.ctx;
    mockState.lastDispatchImages = params.replyOptions?.images;
    mockState.lastDispatchImageOrder = params.replyOptions?.imageOrder;
    mockState.lastDispatchThinkingLevelOverride = params.replyOptions?.thinkingLevelOverride;
    mockState.lastDispatchOriginatingLeafEntryId =
      params.replyOptions?.turnAdoptionLifecycle?.originatingLeafEntryId;
    mockState.lastTaskSuggestionDeliveryMode = params.replyOptions?.taskSuggestionDeliveryMode;
    mockState.lastMessageInjectionDisposition = params.replyOptions?.messageInjectionDisposition;
    await mockState.cronAuthorityProbe?.(
      params.replyOptions?.runId,
      params.replyOptions?.cronCreatorAuthorityCapability,
    );
    const recorder = params.replyOptions?.userTurnTranscriptRecorder;
    mockState.lastDispatchUserTurnInput = recorder?.resolveMessage
      ? await recorder.resolveMessage()
      : recorder?.message;
    if (mockState.dispatchError) {
      throw mockState.dispatchError;
    }
    if (mockState.dispatchWait) {
      await mockState.dispatchWait;
    }
    if (mockState.triggerAgentRunStart) {
      params.replyOptions?.onAgentRunStart?.(
        mockState.agentRunId,
        undefined,
        mockState.replyDispatchRun,
      );
      mockState.onAfterAgentRunStart?.();
    }
    if (mockState.triggerUserMessagePersisted) {
      params.replyOptions?.userTurnTranscriptRecorder?.markRuntimePersisted({
        role: "user",
        content: "persisted by runtime",
        timestamp: Date.now(),
      });
    }
    if (mockState.runtimeUserMessagePersistencePending) {
      params.replyOptions?.userTurnTranscriptRecorder?.markRuntimePersistencePending(
        mockState.runtimeUserMessagePersistencePending,
      );
    }
    if (mockState.dispatchErrorAfterAgentRunStart) {
      throw mockState.dispatchErrorAfterAgentRunStart;
    }
    if (mockState.runtimeAssistantContentBeforeDelivery) {
      await appendSourceReplyMirrorEntry({
        content: mockState.runtimeAssistantContentBeforeDelivery,
        text: "",
        provider: "openai",
        model: "gpt-5.6-luna",
        now: Date.now(),
      });
    }
    for (const text of mockState.runtimeAssistantTextsBeforeDelivery) {
      await appendSourceReplyMirrorEntry({
        text,
        provider: "openai",
        model: "gpt-5.6-luna",
        now: Date.now(),
      });
    }
    if (mockState.sessionMetadataChanges.length > 0) {
      params.onSessionMetadataChanges?.(mockState.sessionMetadataChanges);
    }
    const deliverReplies = async () => {
      if (mockState.dispatchedReplies.length > 0) {
        for (const reply of mockState.dispatchedReplies) {
          if (reply.kind === "tool") {
            params.dispatcher.sendToolResult(reply.payload);
            continue;
          }
          if (reply.kind === "block") {
            params.dispatcher.sendBlockReply(reply.payload);
            continue;
          }
          params.dispatcher.sendFinalReply(reply.payload);
        }
      } else {
        params.dispatcher.sendFinalReply(mockState.finalPayload ?? { text: mockState.finalText });
      }
      params.dispatcher.markComplete();
      await params.dispatcher.waitForIdle();
    };
    if (mockState.disposedTranscriptWriteContext) {
      const sessionKey = mockState.mainSessionKey;
      const storePath = mockState.storePath;
      await withOwnedSessionTranscriptWrites(
        {
          sessionKey,
          sessionTarget: {
            agentId: "main",
            sessionId: mockState.sessionId,
            sessionKey,
            storePath,
          },
          withTranscriptWrite: async () => {
            mockState.disposedTranscriptWriteAttempts += 1;
            throw new Error("attempt disposed before transcript write");
          },
        },
        deliverReplies,
      );
    } else {
      await deliverReplies();
    }
    if (mockState.dispatchErrorAfterDelivery) {
      throw mockState.dispatchErrorAfterDelivery;
    }
    return {
      ok: true,
      queuedFinal: true,
      counts: { tool: 0, block: 0, final: 1 },
      ...(mockState.dispatchBlockedByBeforeAgentRun ? { beforeAgentRunBlocked: true } : {}),
    };
  }),
);

vi.mock("../../infra/outbound/session-binding-service.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../infra/outbound/session-binding-service.js")
  >("../../infra/outbound/session-binding-service.js");
  return {
    ...actual,
    getSessionBindingService: () => ({
      ...actual.getSessionBindingService(),
      resolveByConversation: (ref: unknown) => bindingMocks.resolveByConversation(ref),
    }),
  };
});

vi.mock("./chat-send-reply-context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat-send-reply-context.js")>();
  return {
    ...actual,
    resolveChatSendReplyContext: async (
      ...args: Parameters<typeof actual.resolveChatSendReplyContext>
    ) => {
      mockState.replyContextCalls += 1;
      if (mockState.replyContextWait) {
        await mockState.replyContextWait;
      }
      return mockState.replyContextResult ?? actual.resolveChatSendReplyContext(...args);
    },
  };
});

vi.mock("../../plugins/hook-runner-global.js", () => {
  const hasHooks = (hookName: string) =>
    (hookName === "before_agent_run" && mockState.hasBeforeAgentRunHooks) ||
    (hookName === "message_received" && mockState.hasMessageReceivedHooks) ||
    (hookName === "before_message_write" &&
      (mockState.beforeMessageWriteBlock || mockState.beforeMessageWriteContent !== null));
  return {
    getGlobalHookRunner: () => ({
      hasHooks,
      runBeforeMessageWrite: (event: { message: unknown }, ctx: unknown) => {
        mockState.beforeMessageWriteCalls.push({ message: event.message, ctx });
        if (mockState.beforeMessageWriteBlock) {
          return { block: true };
        }
        if (mockState.beforeMessageWriteContent !== null) {
          return {
            message: {
              ...(typeof event.message === "object" && event.message !== null ? event.message : {}),
              role: "user",
              content: mockState.beforeMessageWriteContent,
            },
          };
        }
        return undefined;
      },
      runMessageReceived: async (event: unknown, context: unknown) => {
        mockState.messageReceivedCalls.push({ event, context });
      },
    }),
    hasGlobalHooks: hasHooks,
  };
});

vi.mock("../../sessions/transcript-events.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../sessions/transcript-events.js")>();
  return {
    ...actual,
    emitSessionTranscriptUpdate: vi.fn((update: TranscriptUpdate) => {
      mockState.emittedTranscriptUpdates.push(update);
    }),
  };
});

vi.mock("../../agents/sandbox/context.js", async () => {
  const original = await vi.importActual<typeof import("../../agents/sandbox/context.js")>(
    "../../agents/sandbox/context.js",
  );
  return {
    ...original,
    ensureSandboxWorkspaceForSession: vi.fn(async () => mockState.sandboxWorkspace),
  };
});

vi.mock("../../auto-reply/reply/stage-sandbox-media.js", () => ({
  SANDBOX_MEDIA_MAX_BYTES: 50 * 1024 * 1024,
  stageSandboxMedia: vi.fn(
    async (params: {
      ctx: { media?: Array<{ path?: string; contentType?: string; workspaceDir?: string }> };
    }) => {
      if (mockState.stageSandboxMediaError) {
        throw mockState.stageSandboxMediaError;
      }
      const staged = new Map<number, string>();
      const originalPaths = params.ctx.media?.map((fact) => fact.path) ?? [];
      if (mockState.stagedRelativePaths) {
        const mapping = mockState.stagedRelativePaths;
        params.ctx.media = (params.ctx.media ?? []).map((fact, index) => ({
          path: mapping[index] ?? fact.path,
          contentType: fact.contentType,
          workspaceDir: mockState.sandboxWorkspace?.workspaceDir,
        }));
        for (let i = 0; i < mapping.length; i += 1) {
          const source = originalPaths[i];
          const dest = mapping[i];
          if (source && dest) {
            staged.set(i, dest);
          }
        }
      }
      if (mockState.unstagedSources) {
        for (const source of mockState.unstagedSources) {
          const index = originalPaths.indexOf(source);
          if (index >= 0) {
            staged.delete(index);
          }
        }
      }
      return { staged };
    },
  ),
}));

vi.mock("../../media/store.js", async () => {
  const original =
    await vi.importActual<typeof import("../../media/store.js")>("../../media/store.js");
  return {
    ...original,
    deleteMediaBuffer: vi.fn(async (id: string, subdir?: string) => {
      mockState.deleteMediaBufferCalls.push({ id, subdir });
    }),
    saveMediaBuffer: vi.fn(async (...args: Parameters<typeof original.saveMediaBuffer>) => {
      const [buffer, contentType, subdir] = args;
      mockState.activeSaveMediaCalls += 1;
      mockState.maxActiveSaveMediaCalls = Math.max(
        mockState.maxActiveSaveMediaCalls,
        mockState.activeSaveMediaCalls,
      );
      if (mockState.saveMediaWait) {
        await mockState.saveMediaWait;
      }
      if (mockState.saveMediaError) {
        mockState.activeSaveMediaCalls -= 1;
        throw mockState.saveMediaError;
      }
      mockState.savedMediaCalls.push({ contentType, subdir, size: buffer.byteLength });
      const next = mockState.savedMediaResults.shift();
      try {
        if (subdir === "outgoing/originals") {
          return await original.saveMediaBuffer(...args);
        }
        return {
          id: next?.id ?? "saved-media",
          path: next?.path ?? `/tmp/${mockState.savedMediaCalls.length}.png`,
          size: buffer.byteLength,
          contentType: next?.contentType ?? contentType,
        };
      } finally {
        mockState.activeSaveMediaCalls -= 1;
      }
    }),
  };
});

const { chatHandlers } = await import("./chat.js");
const { handleDirectExternalChatSend } = await import("./chat-send-external-entry.js");

// Multi-media transcript mirroring can exceed 1s on loaded CI before the async broadcast lands.
async function waitForAssertion(assertion: () => void, timeoutMs = 5_000, stepMs = 2) {
  await vi.waitFor(assertion, { interval: stepMs, timeout: timeoutMs });
}

function createFixturePaths(prefix: string): { dir: string; transcriptPath: string } {
  const dir = fs.mkdtempSync(path.join(suiteFixtureRoot, `${suiteFixtureSeq++}-${prefix}`));
  const transcriptPath = path.join(dir, "sess.jsonl");
  mockState.sessionId = `chat-directive-${suiteFixtureSeq}`;
  mockState.transcriptPath = transcriptPath;
  return { dir, transcriptPath };
}

async function createTranscriptFixture(
  prefix: string,
  owner: Pick<SessionAccessScope, "agentId" | "sessionKey"> = {
    agentId: "main",
    sessionKey: "main",
  },
) {
  const { dir, transcriptPath } = createFixturePaths(prefix);
  await seedChatDirectiveFileTranscript(
    { ...owner, storePath: mockState.storePath },
    mockState.sessionId,
    transcriptPath,
  );
  return dir;
}

function transcriptScope(): SessionTranscriptReadScope {
  return {
    agentId: "main",
    sessionId: mockState.sessionId,
    sessionKey: "main",
    storePath: mockState.storePath,
  };
}

async function appendSourceReplyMirrorEntry(params: {
  content?: Array<Record<string, unknown>>;
  idempotencyKey?: string;
  openclawDelivery?: Record<string, unknown>;
  text: string;
  provider?: string;
  model?: string;
  now?: number;
}) {
  const now = params.now ?? 0;
  await appendTranscriptMessage(transcriptScope(), {
    idempotencyLookup: "scan",
    now,
    message: {
      role: "assistant",
      content: params.content ?? [{ type: "text", text: params.text }],
      api: "openai-responses",
      provider: params.provider ?? "openclaw",
      model: params.model ?? "delivery-mirror",
      ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
      ...(params.openclawDelivery ? { openclawDelivery: params.openclawDelivery } : {}),
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
      stopReason: "stop",
      timestamp: now,
    },
  });
}

function createChatContext() {
  const context = {
    broadcast: vi.fn<GatewayRequestContext["broadcast"]>(),
    nodeSendToSession: vi.fn<GatewayRequestContext["nodeSendToSession"]>(),
    agentRunSeq: new Map<string, number>(),
    chatAbortControllers: new Map(),
    chatQueuedTurns: new Map(),
    chatRunState: createChatRunState(),
    addChatRun: vi.fn(),
    removeChatRun: vi.fn(),
    dedupe: new Map(),
    loadGatewayModelCatalog: async () =>
      mockState.modelCatalog ?? [
        // Keep the default model image-capable here; otherwise attachment tests
        // exercise the unsupported-model fallback instead of Pi persistence.
        {
          provider: "openai",
          id: "gpt-6-astra",
          name: "GPT-6 Astra",
          input: ["text", "image"],
        },
        {
          provider: "anthropic",
          id: "claude-opus-4-6",
          name: "Claude Opus 4.6",
          input: ["text", "image"],
        },
      ],
    getRuntimeConfig: () => readChatDirectiveConfig(mockState),
    registerToolEventRecipient: vi.fn<GatewayRequestContext["registerToolEventRecipient"]>(),
    broadcastToConnIds: vi.fn<GatewayRequestContext["broadcastToConnIds"]>(),
    getSessionEventSubscriberConnIds: () => new Set(["conn-1"]),
    logGateway: {
      warn: vi.fn<GatewayRequestContext["logGateway"]["warn"]>(),
      debug: vi.fn<GatewayRequestContext["logGateway"]["debug"]>(),
      error: vi.fn<GatewayRequestContext["logGateway"]["error"]>(),
    },
  };
  return context as typeof context & GatewayRequestContext;
}

type ChatContext = ReturnType<typeof createChatContext>;

function createChatRequestFixture() {
  const context = createChatContext();
  const respond = vi.fn<RespondFn>();
  return {
    context,
    respond,
    send: (params: Omit<Parameters<typeof runNonStreamingChatSend>[0], "context" | "respond">) =>
      runNonStreamingChatSend({ context, respond, ...params }),
    inject: (params: Parameters<NonNullable<(typeof chatHandlers)["chat.inject"]>>[0]["params"]) =>
      expectDefined(
        chatHandlers["chat.inject"],
        'chatHandlers["chat.inject"] test invariant',
      )({
        params,
        respond,
        req: {} as never,
        client: null as never,
        isWebchatConnect: () => false,
        context,
      }),
  };
}

type NonStreamingChatSendWaitFor = "broadcast" | "dedupe" | "none";

function setAgentRunReplies(replies: TestReply[]) {
  mockState.triggerAgentRunStart = true;
  mockState.dispatchedReplies = replies;
}

async function runNonStreamingChatSend(params: {
  context: ChatContext;
  respond: RespondFn;
  idempotencyKey: string;
  message?: string;
  sessionKey?: string;
  deliver?: boolean;
  client?: unknown;
  expectBroadcast?: boolean;
  requestParams?: Record<string, unknown>;
  directExternal?: boolean;
  waitForCompletion?: boolean;
  waitForDedupe?: boolean;
  waitFor?: NonStreamingChatSendWaitFor;
}): Promise<Record<string, any> | undefined> {
  const sendParams: {
    sessionKey: string;
    message: string;
    idempotencyKey: string;
    deliver?: boolean;
  } = {
    sessionKey: params.sessionKey ?? "main",
    message: params.message ?? "hello",
    idempotencyKey: params.idempotencyKey,
  };
  if (typeof params.deliver === "boolean") {
    sendParams.deliver = params.deliver;
  }
  const handler = params.directExternal === false ? handleChatSend : handleDirectExternalChatSend;
  const handlerOptions = {
    params: {
      ...sendParams,
      ...params.requestParams,
    },
    respond: params.respond,
    req: {} as never,
    client: (params.client ?? null) as never,
    isWebchatConnect: () => false,
    context: params.context,
  };
  await handler(handlerOptions);

  const waitFor =
    params.waitFor ??
    (params.waitForCompletion === false || params.waitForDedupe === false
      ? "none"
      : params.expectBroadcast === false
        ? "dedupe"
        : "broadcast");
  if (waitFor === "none") {
    return undefined;
  }
  if (waitFor === "dedupe") {
    await waitForAssertion(() => {
      // Admission retains request identity before a terminal response exists.
      expect(
        readChatSendDedupeResponse(params.context.dedupe, params.idempotencyKey),
      ).toBeDefined();
    });
    return undefined;
  }

  const terminalCalls = () =>
    params.context.broadcast.mock.calls.filter(
      ([event, payload]) => event === "chat" && asOptionalRecord(payload)?.state !== "delta",
    );
  await waitForAssertion(() => expect(terminalCalls()).toHaveLength(1));
  return asOptionalRecord(terminalCalls()[0]?.[1]);
}

beforeAll(() => {
  suiteResources = createChatDirectiveSuiteResources();
  suiteFixtureRoot = suiteResources.root;
  suiteDatabasePath = suiteResources.databasePath;
  suiteFixtureEnv = suiteResources.env;
  mockState.storePath = suiteDatabasePath;
  suiteResources.open();
});

afterEach(async () => {
  // ACKs and terminal errors can precede detached transcript cleanup.
  await waitForAssertion(() => expect(getActiveSessionWorkAdmissionCount()).toBe(0));
  replyRunRegistryTesting.resetReplyRunRegistry();
  mockState.reset();
  bindingMocks.resolveByConversation.mockReset();
  bindingMocks.resolveByConversation.mockReturnValue(null);
});

afterAll(async () => {
  try {
    expect(getTotalPendingReplies()).toBe(0);
    await waitForSessionTranscriptIndexReconcile({
      agentId: "main",
      env: suiteFixtureEnv,
      path: suiteDatabasePath,
    });
  } finally {
    await suiteResources.close();
  }
});

describe("chat directive tag stripping for non-streaming final payloads", () => {
  it("does not duplicate status notices after lifecycle broadcasts the terminal", async () => {
    await createTranscriptFixture("openclaw-chat-send-agent-settled-status-notice-");
    const runId = "idem-agent-settled-status-notice";
    setAgentRunReplies([
      {
        kind: "final",
        payload: {
          text: "⚙️ Codex compaction started • Context 2k/200k",
          isStatusNotice: true,
        },
      },
    ]);
    const { context, send } = createChatRequestFixture();
    mockState.onAfterAgentRunStart = () => {
      const entry = expectDefined(context.chatAbortControllers.get(runId), "active chat run");
      entry.chatTerminalBroadcasted = true;
    };

    await send({
      idempotencyKey: runId,
      message: "/compact",
      expectBroadcast: false,
    });

    expect(context.broadcast).not.toHaveBeenCalled();
    expect(context.nodeSendToSession).not.toHaveBeenCalled();
  });
});
