import { beforeEach, describe, expect, it, vi } from "vitest";

type AgentCallRequest = { method?: string; params?: Record<string, unknown> };

const mocked = vi.hoisted(() => ({
  spawnSubagentDirectMock: vi.fn(),
  requestHeartbeatNowMock: vi.fn(),
  readLatestAssistantReplyMock: vi.fn(
    async (_sessionKey?: string): Promise<string | undefined> => "raw subagent reply",
  ),
  generationState: new Map<string, number>(),
  setDelegatePendingMock: vi.fn(),
}));

let sessionStore: Record<string, Record<string, unknown>> = {};
let configOverride: ReturnType<(typeof import("../config/config.js"))["loadConfig"]> = {
  session: {
    mainKey: "main",
    scope: "per-sender",
  },
};

vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(async (_request: AgentCallRequest) => ({ runId: "run-main", status: "ok" })),
}));

vi.mock("./tools/agent-step.js", () => ({
  readLatestAssistantReply: mocked.readLatestAssistantReplyMock,
}));

vi.mock("../config/config.js", async () => {
  const actual = await vi.importActual<typeof import("../config/config.js")>("../config/config.js");
  return {
    ...actual,
    loadConfig: () => configOverride,
  };
});

vi.mock("../config/sessions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/sessions.js")>();
  return {
    ...actual,
    loadSessionStore: vi.fn(() => sessionStore),
    updateSessionStore: vi.fn(
      async (_storePath: string, updater: (store: typeof sessionStore) => unknown) => {
        const draft = structuredClone(sessionStore);
        const result = await updater(draft);
        sessionStore = draft;
        return result;
      },
    ),
    resolveAgentIdFromSessionKey: () => "main",
    resolveStorePath: () => "/tmp/sessions.json",
    resolveMainSessionKey: () => "agent:main:main",
    readSessionUpdatedAt: vi.fn(() => undefined),
    recordSessionMetaFromInbound: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("./subagent-spawn.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./subagent-spawn.js")>("./subagent-spawn.js");
  return {
    ...actual,
    spawnSubagentDirect: (...args: unknown[]) => mocked.spawnSubagentDirectMock(...args),
  };
});

vi.mock("../infra/heartbeat-wake.js", () => ({
  requestHeartbeatNow: (...args: unknown[]) => mocked.requestHeartbeatNowMock(...args),
}));

vi.mock("../auto-reply/reply/agent-runner.js", () => ({
  bumpContinuationGeneration: (sessionKey: string) => {
    const next = (mocked.generationState.get(sessionKey) ?? 0) + 1;
    mocked.generationState.set(sessionKey, next);
    return next;
  },
  currentContinuationGeneration: (sessionKey: string) =>
    mocked.generationState.get(sessionKey) ?? 0,
  setDelegatePending: (...args: unknown[]) => mocked.setDelegatePendingMock(...args),
}));

vi.mock("./subagent-depth.js", () => ({
  getSubagentDepthFromSessionStore: (sessionKey: string) =>
    sessionKey.includes(":subagent:") ? 1 : 0,
}));

vi.mock("./pi-embedded.js", () => ({
  isEmbeddedPiRunActive: () => false,
  isEmbeddedPiRunStreaming: () => false,
  queueEmbeddedPiMessage: () => false,
  waitForEmbeddedPiRunEnd: async () => true,
}));

vi.mock("./subagent-registry.js", () => ({
  countActiveDescendantRuns: () => 0,
  countPendingDescendantRuns: () => 0,
  countPendingDescendantRunsExcludingRun: () => 0,
  isSubagentSessionRunActive: () => true,
  resolveRequesterForChildSession: () => null,
}));

vi.mock("../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: () => false,
    runSubagentDeliveryTarget: async () => undefined,
  }),
}));

import { runSubagentAnnounceFlow } from "./subagent-announce.js";

describe("subagent announce continuation chaining", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocked.spawnSubagentDirectMock.mockReset().mockResolvedValue({
      status: "accepted",
      childSessionKey: "agent:main:subagent:spawned",
      runId: "run-spawned",
    });
    mocked.requestHeartbeatNowMock.mockReset();
    mocked.readLatestAssistantReplyMock.mockReset().mockResolvedValue("raw subagent reply");
    mocked.generationState.clear();
    mocked.setDelegatePendingMock.mockReset();
    sessionStore = {
      "agent:main:main": {
        sessionId: "parent-session",
        continuationChainTokens: 0,
      },
    };
    configOverride = {
      session: {
        mainKey: "main",
        scope: "per-sender",
      },
      agents: {
        defaults: {
          continuation: {
            enabled: true,
            maxChainLength: 10,
            minDelayMs: 0,
            maxDelayMs: 10_000,
            generationGuardTolerance: 0,
          },
        },
      },
    };
  });

  async function runContinuationAnnounce(params: {
    childSessionKey: string;
    childTaskPrefix: string;
    reply: string;
    maxChainLength?: number;
  }) {
    sessionStore[params.childSessionKey] = {
      sessionId: `${params.childSessionKey}-session`,
      inputTokens: 0,
      outputTokens: 0,
    };
    if (typeof params.maxChainLength === "number") {
      configOverride = {
        ...configOverride,
        agents: {
          defaults: {
            continuation: {
              ...configOverride.agents?.defaults?.continuation,
              maxChainLength: params.maxChainLength,
            },
          },
        },
      };
    }

    return await runSubagentAnnounceFlow({
      childSessionKey: params.childSessionKey,
      childRunId: `${params.childSessionKey}-run`,
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      requesterOrigin: { channel: "discord", to: "channel:123" },
      task: `${params.childTaskPrefix} delegated task`,
      roundOneReply: params.reply,
      timeoutMs: 10,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });
  }

  it("propagates canonical chain-hop metadata for the next spawned child", async () => {
    await runContinuationAnnounce({
      childSessionKey: "agent:main:subagent:worker-1",
      childTaskPrefix: "[continuation:chain-hop:1]",
      reply: "step complete\n[[CONTINUE_DELEGATE: do step 2]]",
      maxChainLength: 2,
    });

    expect(mocked.spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
    expect(mocked.spawnSubagentDirectMock.mock.calls[0]?.[0]).toMatchObject({
      task: expect.stringContaining("[continuation:chain-hop:2]"),
    });
  });

  it("rejects the hop after the configured maxChainLength is reached", async () => {
    await runContinuationAnnounce({
      childSessionKey: "agent:main:subagent:worker-2",
      childTaskPrefix: "[continuation:chain-hop:2]",
      reply: "step complete\n[[CONTINUE_DELEGATE: do step 3]]",
      maxChainLength: 2,
    });

    expect(mocked.spawnSubagentDirectMock).not.toHaveBeenCalled();
  });

  it("reads generationGuardTolerance when the delayed chain-hop timer fires", async () => {
    vi.useFakeTimers();

    await runContinuationAnnounce({
      childSessionKey: "agent:main:subagent:worker-live-tolerance",
      childTaskPrefix: "[continuation:chain-hop:1]",
      reply: "step complete\n[[CONTINUE_DELEGATE: do step 2 +1s]]",
      maxChainLength: 3,
    });

    mocked.generationState.set("agent:main:main", 4);
    configOverride = {
      ...configOverride,
      agents: {
        defaults: {
          continuation: {
            ...configOverride.agents?.defaults?.continuation,
            generationGuardTolerance: 3,
          },
        },
      },
    };

    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocked.spawnSubagentDirectMock).toHaveBeenCalledTimes(1);
  });
});
