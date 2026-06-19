import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSubagentAnnounceDeliveryRuntimeMock } from "./subagent-announce.test-support.js";

type ChainState = {
  currentChainCount: number;
  chainStartedAt: number;
  accumulatedChainTokens: number;
  chainId?: string;
};

type ScheduleContinuationWorkBatchParams = { chainState: ChainState };
type UpdateSessionStoreMock = (
  storePath: string,
  mutator: (store: Record<string, Record<string, unknown>>) => void | Promise<void>,
) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  callGateway: vi.fn<(request: unknown) => Promise<unknown>>(async (_request) => ({})),
  consumePendingDelegates: vi.fn<(sessionKey: string) => unknown[]>(() => []),
  deliverSubagentAnnouncement: vi.fn<(params: unknown) => Promise<unknown>>(async () => ({
    delivered: true,
    path: "direct",
  })),
  dispatchToolDelegates: vi.fn<(params: unknown) => Promise<unknown>>(async () => ({
    dispatched: 0,
    rejected: 0,
    chainState: {
      currentChainCount: 1,
      chainStartedAt: 1_700_000_000_000,
      accumulatedChainTokens: 0,
    },
  })),
  enqueueSystemEvent: vi.fn<(text: string, options: unknown) => void>(),
  loadSessionStore: vi.fn<(storePath?: string) => Record<string, unknown>>(
    () => ({}) as Record<string, unknown>,
  ),
  resolveAgentIdFromSessionKey: vi.fn<(sessionKey: string) => string>((sessionKey) => {
    return sessionKey.match(/^agent:([^:]+)/)?.[1] ?? "main";
  }),
  resolveStorePath: vi.fn<(store?: unknown, options?: unknown) => string>(
    () => "/tmp/sessions.json",
  ),
  scheduleContinuationWorkBatch: vi.fn(async (params: ScheduleContinuationWorkBatchParams) => ({
    scheduledCount: 1,
    cappedCount: 0,
    capped: false,
    chainState: {
      ...params.chainState,
      currentChainCount: params.chainState.currentChainCount + 1,
    },
  })),
  updateSessionStore: vi.fn<UpdateSessionStoreMock>(async (_storePath, mutator) => {
    const store = mocks.loadSessionStore() as Record<string, Record<string, unknown>>;
    return await mutator(store);
  }),
}));

let mockConfig: ReturnType<(typeof import("../config/config.js"))["loadConfig"]>;

vi.mock("../auto-reply/continuation-delegate-store.js", () => ({
  consumePendingDelegates: (sessionKey: string) => mocks.consumePendingDelegates(sessionKey),
  markPendingDelegateFailed: vi.fn(),
  stagePostCompactionDelegate: vi.fn(),
}));

vi.mock("../auto-reply/continuation/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auto-reply/continuation/config.js")>()),
  resolveContinuationRuntimeConfig: () => ({
    enabled: true,
    defaultDelayMs: 0,
    minDelayMs: 0,
    maxDelayMs: 60_000,
    maxChainLength: 8,
    costCapTokens: 0,
    maxDelegatesPerTurn: 4,
    maxPendingWork: 32,
    crossSessionTargeting: "enabled",
  }),
}));

vi.mock("../auto-reply/continuation/delegate-dispatch.js", () => ({
  dispatchToolDelegates: (params: unknown) => mocks.dispatchToolDelegates(params),
}));

vi.mock("../auto-reply/continuation/work-dispatch.js", () => ({
  scheduleContinuationWorkBatch: (params: ScheduleContinuationWorkBatchParams) =>
    mocks.scheduleContinuationWorkBatch(params),
}));

vi.mock("../config/config.js", () => ({
  getRuntimeConfig: () => mockConfig,
  loadConfig: () => mockConfig,
}));

vi.mock("../config/sessions.js", () => ({
  loadSessionStore: (storePath: string) => mocks.loadSessionStore(storePath),
  resolveAgentIdFromSessionKey: (sessionKey: string) =>
    mocks.resolveAgentIdFromSessionKey(sessionKey),
  resolveMainSessionKey: () => "agent:main:main",
  resolveStorePath: (store: unknown, options: unknown) => mocks.resolveStorePath(store, options),
  updateSessionStore: (
    storePath: string,
    mutator: (store: Record<string, Record<string, unknown>>) => void | Promise<void>,
  ) => mocks.updateSessionStore(storePath, mutator),
}));

vi.mock("../config/sessions/store-load.js", () => ({
  loadSessionStore: (storePath: string) => mocks.loadSessionStore(storePath),
}));

vi.mock("../config/sessions/store.js", () => ({
  updateSessionStore: (
    storePath: string,
    mutator: (store: Record<string, Record<string, unknown>>) => void | Promise<void>,
  ) => mocks.updateSessionStore(storePath, mutator),
}));

vi.mock("../config/sessions/targets.js", () => ({
  resolveAllAgentSessionStoreTargetsSync: () => [{ storePath: "/tmp/sessions.json" }],
}));

vi.mock("../infra/system-events.js", () => ({
  enqueueSystemEvent: (text: string, options: unknown) => mocks.enqueueSystemEvent(text, options),
}));

vi.mock("../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: () => false,
    runSubagentDeliveryTarget: async () => undefined,
  }),
}));

vi.mock("./embedded-agent.js", () => ({
  isEmbeddedAgentRunActive: () => false,
  isEmbeddedAgentRunStreaming: () => false,
  queueEmbeddedAgentMessage: () => false,
  waitForEmbeddedAgentRunEnd: async () => true,
}));

vi.mock("./subagent-announce.runtime.js", () => ({
  callGateway: (request: unknown) => mocks.callGateway(request),
  dispatchGatewayMethodInProcess: vi.fn(),
  getRuntimeConfig: () => mockConfig,
  isEmbeddedAgentRunActive: () => false,
  loadConfig: () => mockConfig,
  loadSessionStore: (storePath: string) => mocks.loadSessionStore(storePath),
  readSessionEntry: (storePath: string, sessionKey: string) => {
    const store = mocks.loadSessionStore(storePath) as Record<string, unknown> | undefined;
    return store?.[sessionKey];
  },
  readSessionMessagesAsync: vi.fn(async () => []),
  resolveAgentIdFromSessionKey: (sessionKey: string) =>
    mocks.resolveAgentIdFromSessionKey(sessionKey),
  resolveContinuationRuntimeConfig: () => ({
    enabled: true,
    defaultDelayMs: 0,
    minDelayMs: 0,
    maxDelayMs: 60_000,
    maxChainLength: 8,
    costCapTokens: 0,
    maxDelegatesPerTurn: 4,
    maxPendingWork: 32,
    crossSessionTargeting: "enabled",
  }),
  resolveMainSessionKey: () => "agent:main:main",
  resolveStorePath: (store: unknown, options: unknown) => mocks.resolveStorePath(store, options),
  waitForEmbeddedAgentRunEnd: async () => true,
}));

vi.mock("./subagent-announce-delivery.runtime.js", () =>
  createSubagentAnnounceDeliveryRuntimeMock({
    callGateway: (request: unknown) => mocks.callGateway(request),
    getRuntimeConfig: () => mockConfig,
    isEmbeddedAgentRunActive: () => false,
    loadSessionStore: (storePath: string) => mocks.loadSessionStore(storePath),
    queueEmbeddedAgentMessageWithOutcome: (sessionId: string) => ({
      queued: false,
      sessionId,
      reason: "no_active_run",
      gatewayHealth: "live",
    }),
    resolveAgentIdFromSessionKey: (sessionKey: string) =>
      mocks.resolveAgentIdFromSessionKey(sessionKey),
    resolveMainSessionKey: () => "agent:main:main",
    resolveStorePath: (store: unknown, options: unknown) => mocks.resolveStorePath(store, options),
  }),
);

vi.mock("./subagent-announce-delivery.js", () => ({
  deliverSubagentAnnouncement: (params: unknown) => mocks.deliverSubagentAnnouncement(params),
  loadRequesterSessionEntry: (sessionKey: string) => {
    const store = mocks.loadSessionStore("/tmp/sessions.json");
    return { entry: store[sessionKey] };
  },
  loadSessionEntryByKey: (sessionKey: string) => {
    const store = mocks.loadSessionStore("/tmp/sessions.json");
    return store[sessionKey];
  },
  resolveAnnounceOrigin: (
    _entry: unknown,
    requesterOrigin?: { channel?: string; to?: string; accountId?: string; threadId?: string },
  ) => requesterOrigin ?? {},
  resolveSubagentAnnounceTimeoutMs: () => 10_000,
  resolveSubagentCompletionOrigin: async (params: { requesterOrigin?: unknown }) =>
    params.requesterOrigin,
  runAnnounceDeliveryWithRetry: async <T>(params: { run: () => Promise<T> }) => await params.run(),
}));

vi.mock("./subagent-announce.registry.runtime.js", () => ({
  countActiveDescendantRuns: () => 0,
  countPendingDescendantRuns: () => 0,
  countPendingDescendantRunsExcludingRun: () => 0,
  isSubagentSessionRunActive: () => true,
  listAncestorSessionKeys: () => [],
  listSubagentRunsForRequester: () => [],
  replaceSubagentRunAfterSteer: () => true,
  resolveRequesterForChildSession: () => null,
  shouldIgnorePostCompletionAnnounceForSession: () => false,
}));

vi.mock("./subagent-depth.js", () => ({
  getSubagentDepthFromSessionStore: (sessionKey: string) =>
    sessionKey.includes(":subagent:") ? 1 : 0,
}));

vi.mock("./tools/agent-step.js", () => ({
  readLatestAssistantReply: vi.fn(async () => "raw subagent reply"),
}));

import { runSubagentAnnounceFlow } from "./subagent-announce.js";

describe("continue_delegate child continue_work token self-continuation", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.callGateway.mockClear();
    mocks.consumePendingDelegates.mockClear();
    mocks.deliverSubagentAnnouncement.mockClear();
    mocks.dispatchToolDelegates.mockClear();
    mocks.enqueueSystemEvent.mockClear();
    mocks.resolveAgentIdFromSessionKey.mockClear();
    mocks.resolveStorePath.mockClear();
    mocks.scheduleContinuationWorkBatch.mockClear();
    mocks.updateSessionStore.mockClear();
    mockConfig = {
      agents: { defaults: { continuation: { enabled: true } } },
      session: { mainKey: "main", scope: "per-sender" },
    };
  });

  function defaultStore(childSessionKey: string): Record<string, unknown> {
    return {
      [childSessionKey]: {
        sessionId: "session-child",
        updatedAt: Date.now(),
        inputTokens: 5,
        outputTokens: 7,
      },
      "agent:main:main": {
        sessionId: "session-main",
        updatedAt: Date.now(),
      },
    };
  }

  async function completeDelegateChild(
    reply: string,
    options: { setupStore?: (childSessionKey: string) => void } = {},
  ): Promise<void> {
    const childSessionKey = "agent:main:subagent:self-continue-token";
    if (options.setupStore) {
      options.setupStore(childSessionKey);
    } else {
      const store = defaultStore(childSessionKey);
      mocks.loadSessionStore.mockImplementation(() => store);
    }

    await runSubagentAnnounceFlow({
      childSessionKey,
      childRunId: "run-child-self-continue-token",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      requesterOrigin: { channel: "discord", to: "channel:123" },
      task: "[continuation:chain-hop:1] child can self continue",
      timeoutMs: 100,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      roundOneReply: reply,
      silentAnnounce: true,
    });
  }

  it.each([
    ["bracket token", "hop1 done\n[[CONTINUE_WORK]]", 0],
    ["bracket delay token", "hop1 done\n[[CONTINUE_WORK:0]]", 0],
  ])("schedules a hop-2 same-session turn for %s", async (_name, reply, delaySeconds) => {
    await completeDelegateChild(reply);

    expect(mocks.scheduleContinuationWorkBatch).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleContinuationWorkBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "agent:main:subagent:self-continue-token",
        requests: [
          expect.objectContaining({
            delaySeconds,
            reason: "",
          }),
        ],
      }),
    );
    expect(mocks.scheduleContinuationWorkBatch.mock.calls[0]?.[0]).toMatchObject({
      chainState: {
        currentChainCount: 1,
        accumulatedChainTokens: 12,
      },
      parentRunId: "run-child-self-continue-token",
    });
  });

  it("does not reschedule a plain CONTINUE_WORK token already handled by the child turn", async () => {
    await completeDelegateChild("hop1 done\nCONTINUE_WORK:0");

    expect(mocks.scheduleContinuationWorkBatch).not.toHaveBeenCalled();
  });

  it("refreshes child chain state advanced by delegate drain before scheduling bracket work", async () => {
    const backingStore: Record<string, Record<string, unknown>> = {};
    const cloneBackingStore = () =>
      Object.fromEntries(
        Object.entries(backingStore).map(([key, value]) => [key, { ...value }]),
      ) as Record<string, Record<string, unknown>>;

    mocks.dispatchToolDelegates.mockResolvedValueOnce({
      dispatched: 1,
      rejected: 0,
      chainState: {
        currentChainCount: 2,
        chainStartedAt: 1_700_000_000_000,
        accumulatedChainTokens: 99,
      },
    });

    await completeDelegateChild("hop1 done\n[[CONTINUE_WORK]]", {
      setupStore: (childSessionKey) => {
        Object.assign(backingStore, defaultStore(childSessionKey));
        mocks.loadSessionStore.mockImplementation(cloneBackingStore);
        mocks.updateSessionStore.mockImplementation(async (_storePath, mutator) => {
          const draft = cloneBackingStore();
          await mutator(draft);
          for (const [key, value] of Object.entries(draft)) {
            backingStore[key] = value;
          }
        });
      },
    });

    expect(mocks.scheduleContinuationWorkBatch.mock.calls[0]?.[0]).toMatchObject({
      chainState: {
        currentChainCount: 2,
        accumulatedChainTokens: 111,
      },
    });
  });
});
