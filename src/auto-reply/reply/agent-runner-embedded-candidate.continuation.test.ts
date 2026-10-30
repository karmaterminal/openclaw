import { describe, expect, it, vi } from "vitest";
import { createAssistantErrorTranscript } from "../../agents/assistant-error-transcript.js";
import { createDeferredEmbeddedRunLifecycleManager } from "../../agents/embedded-agent-runner/run/deferred-lifecycle-owner.js";
import type { RunEmbeddedAgentParams } from "../../agents/embedded-agent-runner/run/params.js";
import type { AgentTurnParams } from "./agent-runner-execution.types.js";
import { createAgentTurnTimingTracker } from "./agent-runner-turn-timing.js";

const mocks = vi.hoisted(() => ({
  compactEmbeddedAgentSession: vi.fn(async () => ({
    ok: true,
    compacted: true,
    result: {},
  })),
  computeRequestCompactionContextUsage: vi.fn<
    typeof import("./agent-runner-post-compaction-release.js").computeRequestCompactionContextUsage
  >(() => 0.75),
  releaseQueuedCompactionTolerant: vi.fn(async () => undefined),
  runEmbeddedAgent: vi.fn(),
}));

// mock-isolation: Embedded agent runs are scripted; no agent session or provider runs.
vi.mock("../../agents/embedded-agent.js", () => ({
  runEmbeddedAgent: mocks.runEmbeddedAgent,
}));

// mock-isolation: Compaction is recorded without loading the compaction runtime (context engines, plugins, harness).
vi.mock("../../agents/embedded-agent-runner/compact.queued.js", () => ({
  compactEmbeddedAgentSession: mocks.compactEmbeddedAgentSession,
}));

// mock-isolation: Fixed run params replace the builder, which reads config, channel plugins and secrets.
vi.mock("./agent-runner-utils.js", () => ({
  // Upstream returns one flat run-parameter object (embedded, sender and base facts).
  buildEmbeddedRunExecutionParams: () => ({
    agentId: "main",
    messageProvider: "discord",
    sessionId: "session-fallback",
    sessionKey: "agent:main:fallback",
    authProfileId: "openai:fallback-auth",
    sessionFile: "session-fallback.jsonl",
    timeoutMs: 1_000,
    workspaceDir: "/workspace",
  }),
}));

// mock-isolation: The harness policy is pinned to openclaw instead of resolving model runtime policy.
vi.mock("../../agents/harness/policy.js", () => ({
  resolveAgentHarnessPolicy: () => ({ runtime: "openclaw", runtimeSource: "model" }),
}));

// mock-isolation: The runtime provider is pinned to openai; the real module imports model selection and route resolvers.
vi.mock("../../agents/openai-routing.js", () => ({
  resolveOpenAIRuntimeProvider: () => "openai",
}));

// mock-isolation: No capability is minted into the process-wide capability table.
vi.mock("../../gateway/message-action-turn-capability.js", () => ({
  isTrustedMessageActionTurnIngress: () => false,
  mintMessageActionTurnCapability: vi.fn(),
  revokeMessageActionTurnCapability: vi.fn(),
}));

// mock-isolation: An inert backstop replaces the real one, which emits on the process-wide agent event bus.
vi.mock("./agent-lifecycle-terminal.js", () => ({
  createAgentLifecycleTerminalBackstop: () => ({
    emit: vi.fn(),
    getDeferredError: () => undefined,
  }),
}));

// mock-isolation: Run events are dropped instead of streaming to channels.
vi.mock("./agent-runner-event-handler.js", () => ({
  createAgentRunEventHandler: () => vi.fn(),
}));

// mock-isolation: Compaction release is recorded without the session store or delegate queue.
vi.mock("./agent-runner-post-compaction-release.js", () => ({
  computeRequestCompactionContextUsage: mocks.computeRequestCompactionContextUsage,
  releaseQueuedCompactionTolerant: mocks.releaseQueuedCompactionTolerant,
}));

import { createTestPreparedRunAdmission } from "../../agents/admitted-run-context.test-support.js";
import { createOpenClawContinuationTools } from "../../agents/openclaw-tools.continuation.js";
import type { SessionEntry } from "../../config/sessions.js";
import { runEmbeddedFallbackCandidate } from "./agent-runner-embedded-candidate.js";

const FRESH_USAGE_ENTRY: SessionEntry = {
  sessionId: "session-fallback",
  updatedAt: 1,
  totalTokens: 75,
  totalTokensFresh: true,
  contextTokens: 100,
};

function createTurn(
  config: AgentTurnParams["followupRun"]["run"]["config"],
  activeSessionEntry: SessionEntry = FRESH_USAGE_ENTRY,
): AgentTurnParams {
  return {
    commandBody: "continue the fallback task",
    followupRun: {
      prompt: "continue the fallback task",
      enqueuedAt: Date.now(),
      run: {
        agentId: "main",
        agentDir: "/agent",
        sessionId: "session-fallback",
        sessionKey: "agent:main:fallback",
        sessionFile: "session-fallback.jsonl",
        workspaceDir: "/workspace",
        config,
        provider: "anthropic",
        model: "claude-sonnet-4.6",
        timeoutMs: 1_000,
        blockReplyBreak: "message_end",
        drainsContinuationDelegateQueue: true,
      },
    },
    sessionCtx: {},
    typingSignals: {
      mode: "instant",
      shouldStartImmediately: true,
      shouldStartOnMessageStart: false,
      shouldStartOnText: true,
      shouldStartOnReasoning: false,
      signalExecutionActivity: async () => undefined,
      signalMessageStart: async () => undefined,
      signalReasoningDelta: async () => undefined,
      signalRunStart: async () => undefined,
      signalTextDelta: async () => undefined,
      signalToolStart: async () => undefined,
    },
    blockReplyPipeline: null,
    blockStreamingEnabled: false,
    resolvedBlockStreamingBreak: "message_end",
    applyReplyToMode: (payload) => payload,
    shouldEmitToolResult: () => true,
    shouldEmitToolOutput: () => true,
    pendingToolTasks: new Set(),
    isHeartbeat: false,
    sessionKey: "agent:main:fallback",
    getActiveSessionEntry: () => activeSessionEntry,
    activeSessionStore: {},
    storePath: "sessions.json",
    resolvedVerboseLevel: "off",
  } as AgentTurnParams;
}

function runCandidate(
  config: AgentTurnParams["followupRun"]["run"]["config"],
  onCompactionCount = vi.fn(),
  activeSessionEntry?: SessionEntry,
) {
  return runEmbeddedFallbackCandidate({
    preparedRunAdmission: createTestPreparedRunAdmission("run-test"),
    deferredLifecycle: createDeferredEmbeddedRunLifecycleManager({
      runId: "run-fallback",
      sessionId: "session-fallback",
      sessionKey: "agent:main:fallback",
    }),
    turn: createTurn(config, activeSessionEntry),
    directBlockDeliveries: [],
    effectiveRun: createTurn(config).followupRun.run,
    candidateRun: createTurn(config).followupRun.run,
    runtimeConfig: config,
    provider: "openai",
    model: "gpt-5.6-luna",
    isFallbackRetry: false,
    agentHarnessRuntimeOverride: undefined,
    // Concrete candidate runtime, as upstream's reply fixtures resolve it (#163909).
    candidateAgentRuntime: "openclaw",
    classifyResult: () => null,
    modelRoutingProvenance: {
      requestedProvider: "openai",
      requestedModel: "gpt-5.6-luna",
      stage: "initial",
    },
    candidateFastMode: {},
    runLane: "main",
    runId: "run-fallback",
    getLifecycleGeneration: () => "generation-1",
    onLifecycleGeneration: vi.fn(),
    hasAgentRunStarted: () => false,
    suppressQueuedUserPersistenceForCandidate: false,
    userTurnTranscriptRecorder: undefined,
    contextEngineLogicalTurnLease: {} as never,
    onContextEngineTurnCandidate: vi.fn(),
    assistantErrorTranscript: createAssistantErrorTranscript(),
    authProfileFailurePolicy: undefined,
    notifyUserMessagePersisted: vi.fn(),
    fastModeStartedAtMs: Date.now(),
    fastModeAutoProgressState: { offAnnounced: false, resetAnnounced: false },
    bootstrapContextRunKind: "default",
    bootstrapPromptWarningSignaturesSeen: [],
    currentTurnImages: { images: undefined, imageOrder: undefined },
    signalExecutionPhaseForTyping: vi.fn(),
    prepareAgentRunStart: vi.fn(),
    notifyAgentRunStart: vi.fn(),
    notifyUserAboutCompaction: false,
    // sourceRepliesAreToolOnly is no longer a turn param: upstream derives it
    // from the source-reply delivery runtime / followupRun.run.sourceReplyDeliveryMode.
    // This fixture leaves that mode unset, so the derived value is false —
    // identical to the explicit `false` this object used to carry.
    messageToolDeliveryState: { toolCallIds: new Set(), completed: false },
    preserveProgressCallbackStartOrder: false,
    presentation: {
      // Partial replies are not part of this fixture: present none of them.
      presentPartialReply: async () => {},
      normalizeStreamingText: () => ({ skip: true }),
      presentWithTyping: async (_typingPromise, startPresentation) => startPresentation(),
      blockReplyHandler: undefined,
    },
    timing: createAgentTurnTimingTracker(),
    onLifecycleBackstop: vi.fn(),
    onCompactionFacts: ({ accounting }) => onCompactionCount(accounting?.count ?? 0),
  });
}

describe("runEmbeddedFallbackCandidate continuation callbacks", () => {
  it("binds callbacks to the selected fallback provider, model, and auth profile", async () => {
    const config = {
      agents: { defaults: { continuation: { enabled: true } } },
    };
    mocks.compactEmbeddedAgentSession.mockClear();
    mocks.releaseQueuedCompactionTolerant.mockClear();
    const onCompactionCount = vi.fn();
    mocks.runEmbeddedAgent.mockImplementationOnce(async (options: RunEmbeddedAgentParams) => {
      expect(options.requestCompactionOpts?.ownerAgentId).toBe("main");
      expect(options.requestCompactionOpts?.contextUsageOrigin).toBe("live_runner");
      options.continueWorkOpts?.requestContinuation({
        reason: "continue after fallback",
        delaySeconds: 5,
      });
      await options.requestCompactionOpts?.triggerCompaction({
        sessionKey: "agent:main:fallback",
        sessionId: "session-fallback",
        runId: "run-fallback",
        diagId: "diag-fallback",
        trigger: "volitional",
        reason: "test fallback compaction",
        contextUsage: 0.75,
        requestedAtMs: 1,
        traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      });
      return {
        payloads: [{ text: "done" }],
        meta: {
          durationMs: 1,
          agentMeta: {
            sessionId: "session-fallback",
            provider: "openai",
            model: "gpt-5.6-luna",
            compactionCount: 7,
          },
          contextManagement: { lastTurnCompactions: 1 },
          finalAssistantRawText:
            "<final>done\n[[CONTINUE_DELEGATE: inspect wrapped fallback]]</final>",
        },
      };
    });

    const result = await runCandidate(config, onCompactionCount);

    expect(mocks.compactEmbeddedAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-5.6-luna",
        authProfileId: "openai:fallback-auth",
      }),
      // The requesting turn's own admission is the compaction source (#157977).
      {
        assertActive: expect.any(Function),
        sourceAuthority: {
          assertActive: expect.any(Function),
          operatorAuthority: createTurn(config).followupRun.operatorAuthority,
        },
      },
    );
    expect(mocks.releaseQueuedCompactionTolerant).toHaveBeenCalledOnce();
    expect(onCompactionCount).toHaveBeenCalledOnce();
    expect(onCompactionCount).toHaveBeenCalledWith(1);
    expect(result.continueWorkRequests).toEqual([
      { reason: "continue after fallback", delaySeconds: 5 },
    ]);
    expect(result.rawContinuationText).toBe(
      "done\n[[CONTINUE_DELEGATE: inspect wrapped fallback]]",
    );
  });

  // bootstrap#1727 (R-CD-3): a fresh session's first chat turn has no fresh token
  // totals yet. The rejection must say usage is unmeasured, not inventory-only.
  it("rejects a first-turn request_compaction as unmeasured, not as an inventory-only path", async () => {
    const config = {
      agents: { defaults: { continuation: { enabled: true } } },
    };
    const actual = await vi.importActual<
      typeof import("./agent-runner-post-compaction-release.js")
    >("./agent-runner-post-compaction-release.js");
    mocks.computeRequestCompactionContextUsage.mockImplementationOnce(
      actual.computeRequestCompactionContextUsage,
    );
    mocks.compactEmbeddedAgentSession.mockClear();
    let toolResult: { content?: unknown; details?: unknown } | undefined;
    mocks.runEmbeddedAgent.mockImplementationOnce(async (options: RunEmbeddedAgentParams) => {
      const tool = createOpenClawContinuationTools({
        config,
        agentSessionKey: "agent:main:fallback",
        sessionId: "session-fallback",
        runId: "run-fallback",
        requestCompactionOpts: options.requestCompactionOpts,
      }).find((candidate) => candidate.name === "request_compaction");
      toolResult = await tool?.execute("call-first-turn", { reason: "first-turn pressure check" });
      return { payloads: [{ text: "done" }], meta: { durationMs: 1 } };
    });

    await runCandidate(config, vi.fn(), { sessionId: "session-fallback", updatedAt: 1 });

    expect(toolResult?.details).toMatchObject({
      status: "rejected",
      guard: "context_unmeasured",
      cause: "no_fresh_usage",
      reason: expect.stringContaining("not been measured"),
    });
    expect(JSON.stringify(toolResult?.content)).not.toContain("inventory-only");
    expect(mocks.compactEmbeddedAgentSession).not.toHaveBeenCalled();
  });

  it("releases once and reports a degraded committed summary to the request tool", async () => {
    const config = {
      agents: { defaults: { continuation: { enabled: true } } },
    };
    mocks.releaseQueuedCompactionTolerant.mockClear();
    mocks.compactEmbeddedAgentSession.mockResolvedValueOnce({
      ok: true,
      compacted: true,
      result: {
        summary: "best available summary",
        firstKeptEntryId: "entry-1",
        tokensBefore: 100,
        details: { readFiles: [], modifiedFiles: [], qualityDegraded: true },
      },
    } as never);
    let triggerResult: unknown;
    mocks.runEmbeddedAgent.mockImplementationOnce(async (options: RunEmbeddedAgentParams) => {
      triggerResult = await options.requestCompactionOpts?.triggerCompaction({
        sessionKey: "agent:main:fallback",
        sessionId: "session-fallback",
        runId: "run-degraded",
        diagId: "diag-degraded",
        trigger: "volitional",
        reason: "degraded audit",
        contextUsage: 0.9,
        requestedAtMs: 1,
      });
      return { payloads: [{ text: "done" }], meta: { durationMs: 1 } };
    });

    await runCandidate(config, vi.fn());

    expect(triggerResult).toEqual({
      ok: true,
      compacted: true,
      reason: undefined,
      qualityDegraded: true,
    });
    expect(mocks.releaseQueuedCompactionTolerant).toHaveBeenCalledOnce();
  });

  it("does not retain raw continuation text from replay-unsafe incomplete turns", async () => {
    const config = {
      agents: { defaults: { continuation: { enabled: true } } },
    };
    mocks.runEmbeddedAgent.mockResolvedValueOnce({
      payloads: [{ text: "partial" }],
      meta: {
        durationMs: 1,
        finalAssistantRawText: "partial\n[[CONTINUE_DELEGATE: unsafe task]]",
        replayInvalid: true,
        error: {
          kind: "incomplete_turn",
          message: "stream interrupted",
        },
      },
    });

    const result = await runCandidate(config);

    expect(result.rawContinuationText).toBeUndefined();
  });
});
