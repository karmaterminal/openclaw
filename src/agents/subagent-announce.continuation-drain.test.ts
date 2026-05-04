import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSubagentAnnounceDeliveryRuntimeMock } from "./subagent-announce.test-support.js";

// F7 synthesis: verify subagent-announce drains the child session's
// continue_delegate queue after the child settles, using the child's
// inherited chain state (not hardcoded 0) so hop labels and cost caps
// stay accurate for two-hop chains.
//
// RFC: docs/design/continue-work-signal-v2.md §3.2, §3.4
// Refs: SWIM 33 F7 finding.

type AgentCallRequest = { method?: string; params?: Record<string, unknown> };

const agentSpy = vi.fn(async (_req: AgentCallRequest) => ({ runId: "run-main", status: "ok" }));
const callGatewayMock = vi.fn(async (_request: unknown) => ({}));
const loadSessionStoreMock = vi.fn((_storePath: string) => ({}) as Record<string, unknown>);
const resolveAgentIdFromSessionKeyMock = vi.fn((sessionKey: string) => {
  return sessionKey.match(/^agent:([^:]+)/)?.[1] ?? "main";
});
const resolveStorePathMock = vi.fn((_store: unknown, _options: unknown) => "/tmp/sessions.json");
const resolveMainSessionKeyMock = vi.fn((_cfg: unknown) => "agent:main:main");
const isEmbeddedPiRunActiveMock = vi.fn((_sessionId: string) => false);
const queueEmbeddedPiMessageMock = vi.fn((_sessionId: string, _text: string) => false);
const waitForEmbeddedPiRunEndMock = vi.fn(async (_sessionId: string, _timeoutMs?: number) => true);
const validTraceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

const dispatchToolDelegatesMock = vi.fn(
  async (
    _params: unknown,
  ): Promise<{
    dispatched: number;
    rejected: number;
    chainState?: {
      currentChainCount: number;
      chainStartedAt: number;
      accumulatedChainTokens: number;
    };
  }> => ({
    dispatched: 0,
    rejected: 0,
  }),
);
const resolveContinuationRuntimeConfigMock = vi.fn((_cfg?: unknown) => ({
  enabled: true,
  defaultDelayMs: 15_000,
  minDelayMs: 5_000,
  maxDelayMs: 300_000,
  maxChainLength: 10,
  costCapTokens: 500_000,
  maxDelegatesPerTurn: 5,
  contextPressureThreshold: undefined,
}));

let mockConfig: ReturnType<(typeof import("../config/config.js"))["loadConfig"]> = {
  session: { mainKey: "main", scope: "per-sender" },
};

const { continuationTargetingMock, subagentRegistryRuntimeMock } = vi.hoisted(() => ({
  continuationTargetingMock: {
    CONTINUATION_DELEGATE_FANOUT_MODES: ["tree", "all"] as const,
    enqueueContinuationReturnDeliveries: vi.fn(async (_params: unknown) => ({
      enqueued: 0,
      delivered: 0,
      deliveryIds: [],
    })),
    normalizeContinuationTargetKey: (value?: string) => {
      const trimmed = value?.trim();
      return trimmed || undefined;
    },
    normalizeContinuationTargetKeys: (values?: readonly string[]) => {
      const seen = new Set<string>();
      const keys: string[] = [];
      for (const value of values ?? []) {
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed)) {
          continue;
        }
        seen.add(trimmed);
        keys.push(trimmed);
      }
      return keys;
    },
    hasContinuationDelegateTargeting: () => false,
    resolveContinuationReturnTargetSessionKeys: vi.fn((params: Record<string, unknown>) => {
      if (Array.isArray(params.targetSessionKeys)) {
        return params.targetSessionKeys;
      }
      if (typeof params.targetSessionKey === "string") {
        return [params.targetSessionKey];
      }
      if (Array.isArray(params.treeSessionKeys)) {
        return params.treeSessionKeys;
      }
      if (Array.isArray(params.allSessionKeys)) {
        return params.allSessionKeys;
      }
      return typeof params.defaultSessionKey === "string" ? [params.defaultSessionKey] : [];
    }),
  },
  subagentRegistryRuntimeMock: {
    shouldIgnorePostCompletionAnnounceForSession: vi.fn(() => false),
    isSubagentSessionRunActive: vi.fn(() => true),
    countActiveDescendantRuns: vi.fn(() => 0),
    countPendingDescendantRuns: vi.fn(() => 0),
    countPendingDescendantRunsExcludingRun: vi.fn(() => 0),
    listAncestorSessionKeys: vi.fn(() => []),
    listSubagentRunsForRequester: vi.fn(() => []),
    replaceSubagentRunAfterSteer: vi.fn(() => true),
    resolveRequesterForChildSession: vi.fn(() => null),
  },
}));

vi.mock("./subagent-announce.runtime.js", () => ({
  callGateway: (request: unknown) => callGatewayMock(request),
  getRuntimeConfig: () => mockConfig,
  isEmbeddedPiRunActive: (sessionId: string) => isEmbeddedPiRunActiveMock(sessionId),
  loadConfig: () => mockConfig,
  loadSessionStore: (storePath: string) => loadSessionStoreMock(storePath),
  resolveContinuationRuntimeConfig: (cfg?: unknown) => resolveContinuationRuntimeConfigMock(cfg),
  queueEmbeddedPiMessage: (sessionId: string, text: string) =>
    queueEmbeddedPiMessageMock(sessionId, text),
  resolveAgentIdFromSessionKey: (sessionKey: string) =>
    resolveAgentIdFromSessionKeyMock(sessionKey),
  resolveMainSessionKey: (cfg: unknown) => resolveMainSessionKeyMock(cfg),
  resolveStorePath: (store: unknown, options: unknown) => resolveStorePathMock(store, options),
  waitForEmbeddedPiRunEnd: (sessionId: string, timeoutMs?: number) =>
    waitForEmbeddedPiRunEndMock(sessionId, timeoutMs),
}));

vi.mock("./subagent-announce-delivery.runtime.js", () =>
  createSubagentAnnounceDeliveryRuntimeMock({
    callGateway: (request: unknown) => callGatewayMock(request),
    getRuntimeConfig: () => mockConfig,
    loadSessionStore: (storePath: string) => loadSessionStoreMock(storePath),
    resolveAgentIdFromSessionKey: (sessionKey: string) =>
      resolveAgentIdFromSessionKeyMock(sessionKey),
    resolveMainSessionKey: (cfg: unknown) => resolveMainSessionKeyMock(cfg),
    resolveStorePath: (store: unknown, options: unknown) => resolveStorePathMock(store, options),
    isEmbeddedPiRunActive: (sessionId: string) => isEmbeddedPiRunActiveMock(sessionId),
    queueEmbeddedPiMessage: (sessionId: string, text: string) =>
      queueEmbeddedPiMessageMock(sessionId, text),
  }),
);

vi.mock("./subagent-announce-delivery.js", () => ({
  deliverSubagentAnnouncement: async () => ({ delivered: true, path: "direct" }),
  loadRequesterSessionEntry: (sessionKey: string) => {
    const store = loadSessionStoreMock("/tmp/sessions.json");
    return { entry: store?.[sessionKey] };
  },
  loadSessionEntryByKey: (sessionKey: string) => {
    const store = loadSessionStoreMock("/tmp/sessions.json");
    return store?.[sessionKey];
  },
  resolveAnnounceOrigin: (
    _entry: unknown,
    requesterOrigin?: { channel?: string; to?: string; accountId?: string; threadId?: string },
  ) => requesterOrigin ?? {},
  resolveSubagentCompletionOrigin: async (params: { requesterOrigin?: unknown }) =>
    params.requesterOrigin,
  resolveSubagentAnnounceTimeoutMs: () => 10_000,
  runAnnounceDeliveryWithRetry: async <T>(params: { run: () => Promise<T> }) => await params.run(),
}));

vi.mock("./subagent-announce.registry.runtime.js", () => subagentRegistryRuntimeMock);

vi.mock("../auto-reply/continuation/delegate-dispatch.js", () => ({
  dispatchToolDelegates: (params: unknown) => dispatchToolDelegatesMock(params),
}));

vi.mock("../auto-reply/continuation/config.js", () => ({
  resolveContinuationRuntimeConfig: (cfg?: unknown) => resolveContinuationRuntimeConfigMock(cfg),
}));

vi.mock("../auto-reply/continuation/targeting.js", () => continuationTargetingMock);

vi.mock("../config/sessions/targets.js", () => ({
  resolveAllAgentSessionStoreTargetsSync: () => [{ storePath: "/tmp/sessions.json" }],
}));

vi.mock("../config/sessions/store-load.js", () => ({
  loadSessionStore: (storePath: string) => loadSessionStoreMock(storePath),
}));

import { runSubagentAnnounceFlow } from "./subagent-announce.js";

describe("subagent-announce continuation drain (F7)", () => {
  beforeEach(() => {
    agentSpy.mockClear();
    callGatewayMock.mockReset().mockImplementation(async () => ({}));
    dispatchToolDelegatesMock.mockReset().mockResolvedValue({ dispatched: 0, rejected: 0 });
    resolveContinuationRuntimeConfigMock.mockReset().mockImplementation((_cfg?: unknown) => ({
      enabled: true,
      defaultDelayMs: 15_000,
      minDelayMs: 5_000,
      maxDelayMs: 300_000,
      maxChainLength: 10,
      costCapTokens: 500_000,
      maxDelegatesPerTurn: 5,
      contextPressureThreshold: undefined,
    }));
    loadSessionStoreMock.mockReset().mockImplementation(() => ({}));
    resolveAgentIdFromSessionKeyMock.mockReset().mockImplementation(() => "main");
    resolveStorePathMock.mockReset().mockImplementation(() => "/tmp/sessions.json");
    resolveMainSessionKeyMock.mockReset().mockImplementation(() => "agent:main:main");
    isEmbeddedPiRunActiveMock.mockReset().mockReturnValue(false);
    queueEmbeddedPiMessageMock.mockReset().mockReturnValue(false);
    waitForEmbeddedPiRunEndMock.mockReset().mockResolvedValue(true);
    mockConfig = {
      agents: { defaults: { continuation: { enabled: true } } },
      session: { mainKey: "main", scope: "per-sender" },
    };
    subagentRegistryRuntimeMock.shouldIgnorePostCompletionAnnounceForSession
      .mockReset()
      .mockReturnValue(false);
    subagentRegistryRuntimeMock.isSubagentSessionRunActive.mockReset().mockReturnValue(true);
    subagentRegistryRuntimeMock.countPendingDescendantRuns.mockReset().mockReturnValue(0);
    subagentRegistryRuntimeMock.listAncestorSessionKeys.mockReset().mockReturnValue([]);
    subagentRegistryRuntimeMock.listSubagentRunsForRequester.mockReset().mockReturnValue([]);
    subagentRegistryRuntimeMock.resolveRequesterForChildSession.mockReset().mockReturnValue(null);
    continuationTargetingMock.enqueueContinuationReturnDeliveries.mockReset().mockResolvedValue({
      enqueued: 0,
      delivered: 0,
      deliveryIds: [],
    });
    continuationTargetingMock.resolveContinuationReturnTargetSessionKeys
      .mockReset()
      .mockImplementation((params: Record<string, unknown>) => {
        if (Array.isArray(params.targetSessionKeys)) {
          return params.targetSessionKeys;
        }
        if (typeof params.targetSessionKey === "string") {
          return [params.targetSessionKey];
        }
        if (Array.isArray(params.treeSessionKeys)) {
          return params.treeSessionKeys;
        }
        if (Array.isArray(params.allSessionKeys)) {
          return params.allSessionKeys;
        }
        return typeof params.defaultSessionKey === "string" ? [params.defaultSessionKey] : [];
      });
  });

  it("drains the child session's continue_delegate queue using inherited chain state", async () => {
    loadSessionStoreMock.mockImplementation(
      () =>
        ({
          "agent:main:subagent:test": {
            sessionId: "session-child",
            updatedAt: Date.now(),
            continuationChainCount: 1,
            continuationChainStartedAt: 1_700_000_000_000,
            continuationChainTokens: 5_000,
          },
          "agent:main:main": {
            sessionId: "session-main",
            updatedAt: Date.now(),
          },
        }) as Record<string, unknown>,
    );

    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-chain-hop",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "chain hop task",
      timeoutMs: 100,
      cleanup: "delete",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      roundOneReply: "done",
    });

    expect(dispatchToolDelegatesMock).toHaveBeenCalledTimes(1);
    const call = dispatchToolDelegatesMock.mock.calls[0]?.[0] as {
      sessionKey?: string;
      chainState?: {
        currentChainCount?: number;
        chainStartedAt?: number;
        accumulatedChainTokens?: number;
      };
      ctx?: { sessionKey?: string };
      maxChainLength?: number;
    };

    // Dispatch targets the CHILD session's queue so delegates the subagent
    // enqueued via continue_delegate during its turn are consumed.
    expect(call?.sessionKey).toBe("agent:main:subagent:test");
    expect(call?.ctx?.sessionKey).toBe("agent:main:subagent:test");

    // Chain state must be inherited from the child session entry — NOT
    // hardcoded zero (that was Ronan's attempt.ts bug). Hop labels depend
    // on this to stay sequential.
    expect(call?.chainState?.currentChainCount).toBe(1);
    expect(call?.chainState?.chainStartedAt).toBe(1_700_000_000_000);
    expect(call?.chainState?.accumulatedChainTokens).toBe(5_000);
    expect(call?.maxChainLength).toBe(10);
  });

  it("defaults chain state to 0 when child session has no chain fields", async () => {
    loadSessionStoreMock.mockImplementation(
      () =>
        ({
          "agent:main:subagent:leaf": {
            sessionId: "session-leaf",
            updatedAt: Date.now(),
          },
          "agent:main:main": {
            sessionId: "session-main",
            updatedAt: Date.now(),
          },
        }) as Record<string, unknown>,
    );

    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:leaf",
      childRunId: "run-leaf",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "leaf task",
      timeoutMs: 100,
      cleanup: "delete",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      roundOneReply: "done",
    });

    expect(dispatchToolDelegatesMock).toHaveBeenCalledTimes(1);
    const call = dispatchToolDelegatesMock.mock.calls[0]?.[0] as {
      chainState?: { currentChainCount?: number; accumulatedChainTokens?: number };
    };
    expect(call?.chainState?.currentChainCount).toBe(0);
    expect(call?.chainState?.accumulatedChainTokens).toBe(0);
  });

  it("does not dispatch when continuation is disabled", async () => {
    mockConfig = {
      session: { mainKey: "main", scope: "per-sender" },
    };
    loadSessionStoreMock.mockImplementation(
      () =>
        ({
          "agent:main:subagent:test": {
            sessionId: "session-child",
            updatedAt: Date.now(),
            continuationChainCount: 1,
          },
        }) as Record<string, unknown>,
    );

    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-disabled",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "test",
      timeoutMs: 100,
      cleanup: "delete",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      roundOneReply: "done",
    });

    expect(dispatchToolDelegatesMock).not.toHaveBeenCalled();
  });

  it("does not fail the announce when dispatch throws", async () => {
    loadSessionStoreMock.mockImplementation(
      () =>
        ({
          "agent:main:subagent:test": {
            sessionId: "session-child",
            updatedAt: Date.now(),
          },
          "agent:main:main": {
            sessionId: "session-main",
            updatedAt: Date.now(),
          },
        }) as Record<string, unknown>,
    );
    dispatchToolDelegatesMock.mockRejectedValueOnce(new Error("spawn failed"));

    const didAnnounce = await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-dispatch-error",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "test",
      timeoutMs: 100,
      cleanup: "delete",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      roundOneReply: "done",
    });

    expect(dispatchToolDelegatesMock).toHaveBeenCalledTimes(1);
    // Dispatch failure must not break the announce path — it is best-effort.
    expect(didAnnounce).toBe(true);
  });

  it("persists advanced child chain state after delegates dispatched", async () => {
    // `drainChildContinuationQueue` must consume
    // the `chainState` returned by `dispatchToolDelegates` (advanced past
    // the dispatched hops) and write it back to both the in-memory child
    // entry AND the durable session store. Without this, the next drain
    // reloads stale counters and `maxChainLength` enforcement breaks.
    const childEntry = {
      sessionId: "session-child",
      updatedAt: Date.now(),
      continuationChainCount: 1,
      continuationChainStartedAt: 1_700_000_000_000,
      continuationChainTokens: 5_000,
    };
    const store: Record<string, Record<string, unknown>> = {
      "agent:main:subagent:test": childEntry,
      "agent:main:main": { sessionId: "session-main", updatedAt: Date.now() },
    };
    loadSessionStoreMock.mockImplementation(() => store as unknown as Record<string, unknown>);

    dispatchToolDelegatesMock.mockResolvedValueOnce({
      dispatched: 2,
      rejected: 0,
      chainState: {
        currentChainCount: 3,
        chainStartedAt: 1_700_000_000_000,
        accumulatedChainTokens: 12_500,
      },
    });

    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-persist",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "persist test",
      timeoutMs: 100,
      cleanup: "delete",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      roundOneReply: "done",
    });

    // In-memory child entry must reflect the advanced chain state so any
    // post-drain readers (e.g. a second drain on the same entry) see fresh
    // counters rather than the pre-dispatch snapshot.
    expect(childEntry.continuationChainCount).toBe(3);
    expect(childEntry.continuationChainStartedAt).toBe(1_700_000_000_000);
    expect(childEntry.continuationChainTokens).toBe(12_500);
  });

  it("skips persist when no delegates dispatched", async () => {
    // Negative case: when `dispatched` is 0, the chain state is unchanged
    // and we must not re-write the entry (avoid spurious `updatedAt` churn
    // and unnecessary store I/O).
    const childEntry = {
      sessionId: "session-child",
      updatedAt: Date.now(),
      continuationChainCount: 1,
      continuationChainStartedAt: 1_700_000_000_000,
      continuationChainTokens: 5_000,
    };
    const store: Record<string, Record<string, unknown>> = {
      "agent:main:subagent:test": childEntry,
      "agent:main:main": { sessionId: "session-main", updatedAt: Date.now() },
    };
    loadSessionStoreMock.mockImplementation(() => store as unknown as Record<string, unknown>);

    dispatchToolDelegatesMock.mockResolvedValueOnce({
      dispatched: 0,
      rejected: 0,
      chainState: {
        currentChainCount: 1,
        chainStartedAt: 1_700_000_000_000,
        accumulatedChainTokens: 5_000,
      },
    });

    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-no-dispatch",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "no dispatch test",
      timeoutMs: 100,
      cleanup: "delete",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      roundOneReply: "done",
    });

    // Counter unchanged — no advance to persist.
    expect(childEntry.continuationChainCount).toBe(1);
    expect(childEntry.continuationChainTokens).toBe(5_000);
  });

  it("threads targeted returns through the session-delivery fanout helper", async () => {
    loadSessionStoreMock.mockImplementation(
      () =>
        ({
          "agent:main:subagent:test": {
            sessionId: "session-child",
            updatedAt: Date.now(),
          },
          "agent:main:main": {
            sessionId: "session-main",
            updatedAt: Date.now(),
          },
        }) as Record<string, unknown>,
    );

    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-targeted",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "[continuation:chain-hop:1] targeted task",
      timeoutMs: 100,
      cleanup: "delete",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      roundOneReply: "targeted result",
      continuationTargetSessionKeys: ["agent:main:root", "agent:main:sibling"],
    });

    expect(
      continuationTargetingMock.resolveContinuationReturnTargetSessionKeys,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultSessionKey: "agent:main:main",
        targetSessionKeys: ["agent:main:root", "agent:main:sibling"],
      }),
    );
    expect(continuationTargetingMock.enqueueContinuationReturnDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSessionKeys: ["agent:main:root", "agent:main:sibling"],
        idempotencyKeyBase: expect.stringContaining("continuation-return:"),
        wakeRecipients: true,
        childRunId: "run-targeted",
      }),
    );
  });

  // Issue #580 Finding 1 discriminator (silas-seat 🌫️): mirror of the plural
  // test above for the singular-API call shape. The `hasContinuationTargeting`
  // predicate at subagent-announce.ts:1216-1219 OR-checks all three axes;
  // this test pins that the singular axis is reached and routed correctly so
  // a future refactor that silently strips the singular branch from the
  // announce flow flips to a test failure rather than a substrate-walk burden.
  it("threads singular continuationTargetSessionKey through the resolver and fanout helper", async () => {
    loadSessionStoreMock.mockImplementation(
      () =>
        ({
          "agent:main:subagent:test": {
            sessionId: "session-child",
            updatedAt: Date.now(),
          },
          "agent:main:main": {
            sessionId: "session-main",
            updatedAt: Date.now(),
          },
        }) as Record<string, unknown>,
    );

    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-targeted-singular",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "[continuation:chain-hop:1] singular targeted task",
      timeoutMs: 100,
      cleanup: "delete",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      roundOneReply: "singular result",
      continuationTargetSessionKey: "agent:main:recipient",
    });

    expect(
      continuationTargetingMock.resolveContinuationReturnTargetSessionKeys,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultSessionKey: "agent:main:main",
        targetSessionKey: "agent:main:recipient",
      }),
    );
    expect(continuationTargetingMock.enqueueContinuationReturnDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSessionKeys: ["agent:main:recipient"],
        idempotencyKeyBase: expect.stringContaining("continuation-return:"),
        wakeRecipients: true,
        childRunId: "run-targeted-singular",
      }),
    );
  });

  it("fanoutMode=all spends one chain step per completion, not per recipient", async () => {
    const knownSessionKeys = [
      "agent:main:main",
      "agent:main:subagent:test",
      ...Array.from({ length: 48 }, (_, index) => `agent:main:recipient-${index}`),
    ];
    loadSessionStoreMock.mockImplementation(
      () =>
        Object.fromEntries(
          knownSessionKeys.map((sessionKey) => [
            sessionKey,
            {
              sessionId: `session-${sessionKey}`,
              updatedAt: Date.now(),
            },
          ]),
        ) as Record<string, unknown>,
    );

    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-fanout",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "[continuation:chain-hop:1] fanout task",
      timeoutMs: 100,
      cleanup: "delete",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      roundOneReply: "fanout result",
      continuationFanoutMode: "all",
      traceparent: validTraceparent,
    });

    const call = continuationTargetingMock.enqueueContinuationReturnDeliveries.mock
      .calls[0]?.[0] as
      | {
          targetSessionKeys?: string[];
          fanoutMode?: string;
          chainStepRemaining?: number;
          traceparent?: string;
        }
      | undefined;
    expect(call?.targetSessionKeys).toHaveLength(50);
    expect(call?.fanoutMode).toBe("all");
    expect(call?.chainStepRemaining).toBe(9);
    expect(call?.traceparent).toBe(validTraceparent);
  });

  it("drops return traceparent once the completion exhausts chain-step budget", async () => {
    resolveContinuationRuntimeConfigMock.mockImplementation((_cfg?: unknown) => ({
      enabled: true,
      defaultDelayMs: 15_000,
      minDelayMs: 5_000,
      maxDelayMs: 300_000,
      maxChainLength: 2,
      costCapTokens: 500_000,
      maxDelegatesPerTurn: 5,
      contextPressureThreshold: undefined,
    }));
    loadSessionStoreMock.mockImplementation(
      () =>
        ({
          "agent:main:subagent:test": {
            sessionId: "session-child",
            updatedAt: Date.now(),
          },
          "agent:main:main": {
            sessionId: "session-main",
            updatedAt: Date.now(),
          },
        }) as Record<string, unknown>,
    );

    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-capped",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "[continuation:chain-hop:2] capped targeted task",
      timeoutMs: 100,
      cleanup: "delete",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      roundOneReply: "targeted result",
      continuationTargetSessionKeys: ["agent:main:root", "agent:main:sibling"],
      traceparent: validTraceparent,
    });

    expect(continuationTargetingMock.enqueueContinuationReturnDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSessionKeys: ["agent:main:root", "agent:main:sibling"],
        chainStepRemaining: 0,
      }),
    );
    expect(continuationTargetingMock.enqueueContinuationReturnDeliveries).toHaveBeenCalledWith(
      expect.not.objectContaining({ traceparent: expect.any(String) }),
    );
  });
});
