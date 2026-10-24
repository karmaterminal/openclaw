// Continuation (karmaterminal): a completed subagent's announce to its requester carries
// continuationTrigger "subagent-return" only when continuation is enabled. This runs the real
// runSubagentAnnounceFlow on the harness subagent-announce.format.e2e.test.ts uses: the
// registry, Gateway calls, hook runner and session reads are scripted; announce,
// delivery and output run for real.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
  type OpenClawConfig,
} from "../../../config/config.js";
import * as configSessions from "../../../config/sessions.js";
import type { SessionEntry } from "../../../config/sessions/types.js";
import * as gatewayCall from "../../../gateway/call.js";
import { testing as sessionBindingServiceTesting } from "../../../infra/outbound/session-binding-service.js";
import { normalizeLegacySessionEntryDelivery } from "../../../infra/state-migrations.legacy-session-store.js";
import * as hookRunnerGlobal from "../../../plugins/hook-runner-global.js";
import { createHookRunner, type HookRunner } from "../../../plugins/hooks.js";
import { setActivePluginRegistry } from "../../../plugins/runtime.js";
import * as sessionNativeRuntime from "../../../sessions/session-controller.native-runtime.js";
import * as sessionQueries from "../../../sessions/session-controller.queries.js";
import { captureSessionTarget } from "../../../sessions/session-controller.target.js";
import { matchesTranscriptEvent } from "../../../sessions/transcript-visible-record.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../../test-utils/channel-plugins.js";
import { prepareAgentRunTerminalReply } from "../../agent-run-terminal-reply.js";
import { RUNTIME_EVENT_USER_PROMPT } from "../../internal-runtime-context.js";
import { textAssistant } from "../../test-helpers/sparse-transcript.test-support.js";
import { subagentRuns } from "../registry/subagent-registry-memory.js";
import { testing as deliveryTesting } from "./subagent-announce-delivery.test-support.js";
import { testing as outputTesting } from "./subagent-announce-output.test-support.js";
import { announceTesting } from "./subagent-announce-overrides.test-support.js";
import {
  visibleAgentResponse,
  publishAnnounceRunFixture,
  type MockSubagentRun,
  expectAgentCallFields,
  type AgentCallRequest,
} from "./subagent-announce.test-support.js";

type SessionEntryFixture = Partial<Omit<SessionEntry, "updatedAt">> & { updatedAt?: number };
type AnnounceParams = Partial<
  Parameters<typeof import("./subagent-announce.js").runSubagentAnnounceFlow>[0]
>;

const childKey = "agent:main:subagent:test";
const requesterKey = "agent:main:main";
const workerKey = "agent:main:subagent:worker";
const minimalUsage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const sessionConfig = {
  mainKey: "main",
  scope: "per-sender",
  store: "/tmp/sessions.json",
} as const;
const defaultOutcomeAnnounce = {
  childRunId: "run-default",
  childSessionKey: childKey,
  requesterSessionKey: requesterKey,
  task: "do thing",
  timeoutMs: 10,
  cleanup: "keep" as const,
  startedAt: 10,
  endedAt: 20,
  roundOneReply: "raw subagent reply",
  terminalReply: { disposition: "visible", text: "raw subagent reply" } as const,
  outcome: { status: "ok" } as const,
};

const agentSpy = vi.fn(async (_req: AgentCallRequest) => visibleAgentResponse());
const sendSpy = vi.fn(async (_req: AgentCallRequest) => ({ runId: "send-main", status: "ok" }));
const callGatewaySpy = vi.spyOn(gatewayCall, "callGateway");
const getGlobalHookRunnerSpy = vi.spyOn(hookRunnerGlobal, "getGlobalHookRunner");
const isSessionRunActiveSpy = vi.spyOn(sessionQueries, "isSessionRunActive");
const waitForSessionRunEndSpy = vi.spyOn(sessionNativeRuntime, "waitForSessionRunEnd");
const { registry } = vi.hoisted(() => ({
  registry: {
    isSubagentSessionRunActive: vi.fn(() => true),
    shouldIgnorePostCompletionAnnounceForSession: vi.fn(
      (_sessionKey: string, _childAgentId?: string) => false,
    ),
    countPendingDescendantRuns: vi.fn((_sessionKey: string) => 0),
    latestRunForChild: vi.fn((_childSessionKey: string): MockSubagentRun | undefined => undefined),
    listSubagentRunsForRequester: vi.fn(
      (_sessionKey: string, _scope?: { requesterRunId?: string }): MockSubagentRun[] => [],
    ),
    replaceSubagentRunAfterSteerCore: vi.fn(
      (_params: { previousRunId: string; nextRunId: string; lifecycleGeneration?: string }) => true,
    ),
    resolveRequesterForChildSession: vi.fn(
      (
        _sessionKey: string,
        _childAgentId?: string,
      ): {
        requesterSessionKey: string;
      } | null => null,
    ),
  },
}));
const hookRunnerMock: HookRunner = {
  ...createHookRunner(createTestRegistry()),
  hasHooks: () => false,
};
const chatHistoryMock = vi.fn(async (_sessionKey?: string) => ({
  messages: [] as Array<unknown>,
}));
let sessionStore: Record<string, SessionEntryFixture | undefined> = {};
let transcriptEvents: unknown[] = [];
let configOverride: OpenClawConfig = { session: sessionConfig };

function prepareTerminal(rawText: string) {
  return prepareAgentRunTerminalReply({ rawText }).terminalReply;
}

function setConfigOverride(next: OpenClawConfig): void {
  configOverride = next;
  setRuntimeConfigSnapshot(configOverride);
}

function withContinuationEnabled(config: OpenClawConfig): OpenClawConfig {
  return { ...config, agents: { defaults: { continuation: { enabled: true } } } };
}

function readSessionFixture(sessionKey: string): SessionEntry | undefined {
  const entry: SessionEntryFixture | undefined =
    !(sessionKey in sessionStore) && sessionKey.includes(":subagent:")
      ? minimalUsage
      : sessionStore[sessionKey];
  if (!entry) {
    return undefined;
  }
  return normalizeLegacySessionEntryDelivery({
    ...entry,
    sessionId: entry.sessionId ?? sessionKey,
    updatedAt: entry.updatedAt ?? Date.now(),
  } as SessionEntry);
}

function createRegistryDiscoveryFixture() {
  return {
    ...registry,
    buildLatestSubagentSessionListReadIndex() {
      return {
        getLatestSubagentRun(childSessionKey: string) {
          const fixture = registry.latestRunForChild(childSessionKey);
          return fixture ? publishAnnounceRunFixture(fixture) : null;
        },
      };
    },
    listSubagentRunsForRequester(sessionKey: string, scope?: { requesterRunId?: string }) {
      return registry
        .listSubagentRunsForRequester(sessionKey, scope)
        .map(publishAnnounceRunFixture);
    },
  };
}

// mock-isolation: Registry runs are scripted per case; the real registry reads process-wide run state.
vi.mock("../registry/subagent-registry.js", () => createRegistryDiscoveryFixture());
// mock-isolation: Registry reads see the same scripted runs as the registry mock above.
vi.mock("../registry/subagent-registry-read.js", () => createRegistryDiscoveryFixture());

const gatewayDeps = {
  callGateway: async <T = Record<string, unknown>>(
    req: Parameters<typeof gatewayCall.callGateway>[0],
  ) => (await callGatewaySpy(req)) as T,
  getRuntimeConfig: () => configOverride,
};

const deliveryDeps = {
  ...gatewayDeps,
  loadSessionEntry: (scope) => readSessionFixture(scope.sessionKey),
  loadSessionEntryByKey: async (sessionKey) => readSessionFixture(sessionKey),
  getRequesterSessionActivity: (requesterSessionKey: string, requester) => {
    const sessionId = readSessionFixture(requesterSessionKey)?.sessionId;
    return {
      sessionId,
      target: captureSessionTarget({
        storeScope:
          requester.storePath ??
          configSessions.resolveSessionStorePathCore(configOverride.session?.store, {
            agentId: requester.agentId ?? "main",
          }),
        sessionKey: requester.canonicalKey,
        aliases: [requesterSessionKey],
        agentId: requester.agentId,
        incarnation: sessionId,
      }),
      isActive: Boolean(sessionId && isSessionRunActiveSpy(sessionId)),
    };
  },
} satisfies Parameters<typeof deliveryTesting.setDepsForTest>[0];

function getAgentCall(): AgentCallRequest {
  const call = agentSpy.mock.calls[0]?.[0];
  if (!call) {
    throw new Error("Expected an agent call");
  }
  return call;
}

describe("subagent announce continuation trigger", () => {
  let previousFastTestEnv: string | undefined;
  let runSubagentAnnounceFlow: (typeof import("./subagent-announce.js"))["runSubagentAnnounceFlow"];
  const announceWithDefaults = (params: AnnounceParams = {}) =>
    runSubagentAnnounceFlow({ ...defaultOutcomeAnnounce, ...params });

  beforeAll(async () => {
    previousFastTestEnv = process.env.OPENCLAW_TEST_FAST;
    process.env.OPENCLAW_TEST_FAST = "1";
    ({ runSubagentAnnounceFlow } = await import("./subagent-announce.js"));
  });

  afterAll(() => {
    announceTesting.setDepsForTest();
    outputTesting.setDepsForTest();
    deliveryTesting.setDepsForTest();
    clearRuntimeConfigSnapshot();
    if (previousFastTestEnv === undefined) {
      delete process.env.OPENCLAW_TEST_FAST;
      return;
    }
    process.env.OPENCLAW_TEST_FAST = previousFastTestEnv;
  });

  afterEach(() => {
    subagentRuns.clear();
  });

  beforeEach(() => {
    subagentRuns.clear();
    agentSpy.mockReset().mockImplementation(async () => visibleAgentResponse());
    sendSpy.mockClear();
    callGatewaySpy.mockReset().mockImplementation(async (req: unknown) => {
      const typed = req as { method?: string; params?: { sessionKey?: string } };
      if (typed.method === "agent") {
        return await agentSpy(typed);
      }
      if (typed.method === "send") {
        return await sendSpy(typed);
      }
      if (typed.method === "agent.wait") {
        return { status: "error", startedAt: 10, endedAt: 20, error: "boom" };
      }
      if (typed.method === "chat.history") {
        return await chatHistoryMock(typed.params?.sessionKey);
      }
      return {};
    });
    deliveryTesting.setDepsForTest(deliveryDeps);
    announceTesting.setDepsForTest(gatewayDeps);
    transcriptEvents = [];
    outputTesting.setDepsForTest({
      findTranscriptEvent: async (_scope, match) => {
        const event = transcriptEvents.findLast((candidate) =>
          matchesTranscriptEvent(candidate, match),
        );
        return event === undefined ? undefined : { event };
      },
      ...gatewayDeps,
      readSubagentSessionEntry: (_storePath, sessionKey) => readSessionFixture(sessionKey),
      resolveSessionStorePathCore: () => "/tmp/sessions.json",
    });
    getGlobalHookRunnerSpy
      .mockReset()
      .mockImplementation(
        () => hookRunnerMock as unknown as ReturnType<typeof hookRunnerGlobal.getGlobalHookRunner>,
      );
    isSessionRunActiveSpy.mockReset().mockReturnValue(false);
    waitForSessionRunEndSpy.mockReset().mockResolvedValue(true);
    registry.isSubagentSessionRunActive.mockClear().mockReturnValue(true);
    registry.shouldIgnorePostCompletionAnnounceForSession.mockClear().mockReturnValue(false);
    registry.countPendingDescendantRuns.mockReset().mockReturnValue(0);
    registry.latestRunForChild.mockClear().mockReturnValue(undefined);
    registry.listSubagentRunsForRequester.mockClear().mockReturnValue([]);
    registry.replaceSubagentRunAfterSteerCore.mockClear().mockReturnValue(true);
    registry.resolveRequesterForChildSession.mockClear().mockReturnValue(null);
    chatHistoryMock.mockReset().mockResolvedValue({
      messages: [textAssistant("raw subagent reply")],
    });
    sessionStore = {};
    sessionBindingServiceTesting.resetSessionBindingAdaptersForTests();
    setActivePluginRegistry(
      createTestRegistry(
        (["discord", "whatsapp"] as const).map((id) => ({
          pluginId: id,
          plugin: createChannelTestPluginBase({ id, label: id }),
          source: "test",
        })),
      ),
    );
    setConfigOverride({ session: sessionConfig });
  });

  it("marks a parent-review completion as a subagent return", async () => {
    setConfigOverride(withContinuationEnabled(configOverride));
    const findings = "raw subagent reply with findings";
    sessionStore = { [childKey]: { sessionId: "child-session-123" } };
    const child = publishAnnounceRunFixture({
      runId: "run-123",
      childSessionKey: childKey,
      requesterSessionKey: requesterKey,
      requesterDisplayKey: "main",
      task: "do thing",
      cleanup: "keep",
      createdAt: 10,
      execution: { endedAt: 20, outcome: { status: "error", error: "boom" } },
      completion: {
        required: true,
        terminalReply: prepareTerminal(findings),
        resultText: findings,
      },
    });
    transcriptEvents = [
      {
        type: "message",
        message: {
          role: "assistant",
          stopReason: "stop",
          content: [{ type: "text", text: findings }],
          __openclaw: { runId: "run-123" },
        },
      },
    ];
    await announceWithDefaults({
      childRunId: "run-123",
      roundOneReply: undefined,
      terminalReply: child.completion?.terminalReply,
      outcome: { status: "error", error: "boom" },
      timeoutMs: 1000,
    });

    expect(agentSpy).toHaveBeenCalledTimes(1);
    const call = getAgentCall();
    expect(call.params).toMatchObject({
      sessionKey: requesterKey,
      message: RUNTIME_EVENT_USER_PROMPT,
    });
    expect(call.params?.internalEvents?.[0]).toMatchObject({
      type: "task_completion",
      taskLabel: "do thing",
    });
    expect(call.params?.continuationTrigger).toBe("subagent-return");
  });

  it("marks the internal fallback for a missing route as a subagent return", async () => {
    sessionStore = { [requesterKey]: { sessionId: "requester-session" } };
    setConfigOverride(withContinuationEnabled(configOverride));
    agentSpy.mockImplementationOnce(async ({ params }) => {
      if (params?.deliver === true && typeof params.channel !== "string") {
        throw new Error("Channel is required when deliver=true");
      }
      return visibleAgentResponse();
    });
    expect(
      await announceWithDefaults({
        childRunId: "run-completion",
        expectsCompletionMessage: true,
        terminalReply: prepareTerminal(defaultOutcomeAnnounce.roundOneReply),
        requesterOrigin: undefined,
        childSessionKey: workerKey,
        requesterSessionKey: "main",
      }),
    ).toBe("delivered");

    expect(sendSpy).not.toHaveBeenCalled();
    expect(agentSpy).toHaveBeenCalledTimes(1);
    const call = getAgentCall();
    expectAgentCallFields(call, { sessionKey: requesterKey, deliver: false });
    expect(call.params?.continuationTrigger).toBe("subagent-return");
  });

  it("omits continuationTrigger when continuation is disabled", async () => {
    await announceWithDefaults({ childRunId: "run-no-continuation-trigger" });

    expect(agentSpy).toHaveBeenCalledTimes(1);
    expect(getAgentCall().params?.continuationTrigger).toBeUndefined();
  });
});
