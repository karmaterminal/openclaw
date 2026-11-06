// C1 regression: a bracket [[CONTINUE_DELEGATE: ... | post-compaction]] staged
// on a turn where auto-compaction ALSO fires must survive to the next compaction
// seam. dispatchPostCompactionDelegates runs before staging, and the staged
// delegate must remain queued in the custody-backed post-compaction store until
// the next seam consumes it.

import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abortEmbeddedAgentRun } from "../../agents/embedded-agent-runner/runs.js";
import { testing as embeddedRunTesting } from "../../agents/embedded-agent-runner/runs.test-support.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import { SESSION_TOTAL_TOKENS_VERSION, type SessionEntry } from "../../config/sessions.js";
import {
  patchSessionEntryCore,
  replaceSessionEntry,
} from "../../config/sessions/session-accessor.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import {
  drainSystemEventEntries,
  peekSystemEvents,
  resetSystemEventsForTest,
} from "../../infra/system-events.js";
import { clearMemoryPluginState, registerMemoryCapability } from "../../plugins/memory-state.js";
import { testing as sessionControllerTesting } from "../../sessions/session-controller.test-support.js";
import {
  listCustodyRecordsForTest,
  useContinuationCustodyTestState,
} from "../continuation/custody/custody.test-support.js";
import { resetDelegateDispatchHedgesForTests } from "../continuation/delegate-dispatch.js";
import { stagedPostCompactionDelegateCount } from "../continuation/delegate-store-post-compaction.js";
import { resetContinuationStateForTests } from "../continuation/state.js";
import type { TemplateContext } from "../templating.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const runEmbeddedAgentMock = vi.fn();
const runWithModelFallbackMock = vi.fn();
const runtimeErrorMock = vi.fn();
const abortEmbeddedAgentRunMock = vi.fn();
const refreshQueuedFollowupSessionMock = vi.fn();
const compactState = vi.hoisted(() => ({
  compactEmbeddedAgentSessionMock: vi.fn(),
}));
const spawnSubagentDirectMock = vi.hoisted(() => vi.fn());

// mock-isolation: Turns run through a scripted fallback runner; the real one reads auth profiles and calls providers.
vi.mock("../../agents/model-fallback-runner.js", () => ({
  runWithModelFallback: (params: {
    provider: string;
    model: string;
    runCandidate: (provider: string, model: string) => Promise<unknown>;
  }) => runWithModelFallbackMock(params),
}));

// mock-isolation: A scripted entry completes each run; the real entry loads the plugin runtime and agent harness.
vi.mock("../../agents/embedded-agent-runner/run-entry.js", async () => {
  const { createSuccessfulEmbeddedAgentEntryMock } =
    await import("./agent-runner-entry.test-support.js");
  return {
    runEmbeddedAgentEntry: createSuccessfulEmbeddedAgentEntryMock(() => runWithModelFallbackMock),
  };
});

// mock-isolation: Only the summary-error check is needed; the real module loads the harness registry and command queue.
vi.mock("../../agents/model-fallback-attempt.js", () => ({
  isFallbackSummaryError: (err: unknown) =>
    err instanceof Error &&
    err.name === "FallbackSummaryError" &&
    Array.isArray((err as { attempts?: unknown[] }).attempts),
}));

// mock-isolation: Auth is fixed to api-key, so no auth profile or env credential is read.
vi.mock("../../agents/model-auth.js", () => ({
  isMissingProviderAuthError: () => false,
  resolveModelAuthMode: () => "api-key",
}));

// mock-isolation: Embedded runs and compaction are scripted; abort still reaches the real run registry.
vi.mock("../../agents/embedded-agent.js", () => ({
  runEmbeddedAgent: (params: unknown) => runEmbeddedAgentMock(params),
  compactEmbeddedAgentSession: (params: unknown) =>
    compactState.compactEmbeddedAgentSessionMock(params),
  queueEmbeddedAgentMessage: vi.fn().mockReturnValue(false),
  abortEmbeddedAgentRun: (sessionId: string) => {
    abortEmbeddedAgentRunMock(sessionId);
    return abortEmbeddedAgentRun(sessionId);
  },
}));

// mock-isolation: CLI agent runs are recorded without spawning a CLI process.
vi.mock("../../agents/cli-runner.js", () => ({
  runCliAgent: vi.fn(),
}));

// mock-isolation: Spawn requests are recorded without starting real subagent runs.
vi.mock("../../agents/subagents/spawn/subagent-spawn.js", () => ({
  SUBAGENT_SPAWN_MODES: ["run", "session"],
  SUBAGENT_SPAWN_SANDBOX_MODES: ["inherit", "require"],
  SUBAGENT_SPAWN_CONTEXT_MODES: ["isolated", "fork"],
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));

// mock-isolation: Runtime errors are captured, and exit never reaches process.exit.
vi.mock("../../runtime.js", () => ({
  defaultRuntime: {
    log: vi.fn(),
    error: (...args: unknown[]) => runtimeErrorMock(...args),
    exit: vi.fn(),
  },
}));

// mock-isolation: Continuation wakes are recorded without running the session-event handoff.
vi.mock("../continuation/continuation-wake.js", () => ({
  requestContinuationWake: vi.fn(),
}));

// mock-isolation: Keep the process-wide followup queue and drain registry outside runner cases.
vi.mock("./queue.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./queue.js")>()),
  enqueueFollowupRun: vi.fn(),
  scheduleFollowupDrain: vi.fn(),
  clearSessionQueues: vi.fn().mockReturnValue({ followupCleared: 0, laneCleared: 0, keys: [] }),
  refreshQueuedFollowupSession: (...args: unknown[]) => refreshQueuedFollowupSessionMock(...args),
}));

// mock-isolation: Secret refs resolve to the given config; no Gateway or secret store is contacted.
vi.mock("../../cli/command-secret-gateway.js", () => ({
  resolveCommandSecretRefsViaGateway: async ({ config }: { config: unknown }) => ({
    resolvedConfig: config,
    diagnostics: [],
  }),
}));

// mock-isolation: Reasoning-tag providers are fixed here; the real check asks provider plugins.
vi.mock("../../utils/provider-utils.js", () => ({
  isReasoningTagProvider: (provider: string | undefined | null) =>
    provider === "google" || provider === "google-gemini-cli",
}));

const loadCronStoreMock = vi.fn();
// mock-isolation: Cron jobs come from the test; the real store reads the state database.
vi.mock("../../cron/store.js", () => ({
  loadCronStore: (...args: unknown[]) => loadCronStoreMock(...args),
  resolveCronStorePath: (storePath?: string) => storePath ?? "/tmp/openclaw-cron-store.json",
}));

// mock-isolation: No ACP sessions exist here; the process-wide ACP session manager is never created.
vi.mock("../../acp/control-plane/manager.js", () => ({
  getAcpSessionManager: () => ({
    resolveSession: () => ({ kind: "none" }),
    cancelSession: async () => {},
  }),
}));

// mock-isolation: An empty registry stands in; the real module registers process-wide maintenance and restores runs.
vi.mock("../../agents/subagents/registry/subagent-registry.js", () => ({
  getLatestSubagentRunByChildSessionKey: () => null,
  getSwarmRunByLaunchReplayKey: () => undefined,
  initSubagentRegistry: () => {},
  listSubagentRunsForController: () => [],
  markSubagentRunTerminated: () => 0,
}));

import { runReplyAgent } from "./agent-runner-run.js";

type RunWithModelFallbackParams = {
  provider: string;
  model: string;
  runCandidate: (provider: string, model: string) => Promise<unknown>;
};

const custodyState = useContinuationCustodyTestState();

beforeEach(() => {
  embeddedRunTesting.resetActiveEmbeddedRuns();
  sessionControllerTesting.resetSessionControllerForTest();
  runEmbeddedAgentMock.mockReset();
  runWithModelFallbackMock.mockReset();
  runtimeErrorMock.mockClear();
  abortEmbeddedAgentRunMock.mockClear();
  compactState.compactEmbeddedAgentSessionMock.mockReset();
  compactState.compactEmbeddedAgentSessionMock.mockResolvedValue({
    compacted: false,
    reason: "test-preflight-disabled",
  });
  refreshQueuedFollowupSessionMock.mockReset();
  refreshQueuedFollowupSessionMock.mockResolvedValue(undefined);
  loadCronStoreMock.mockReset();
  loadCronStoreMock.mockResolvedValue({ version: 1, jobs: [] });
  spawnSubagentDirectMock.mockReset().mockResolvedValue({
    status: "accepted",
    childSessionKey: "agent:main:subagent:spawned",
    runId: "run-spawned",
  });
  runWithModelFallbackMock.mockImplementation(
    async ({ provider, model, runCandidate }: RunWithModelFallbackParams) => ({
      result: await runCandidate(provider, model),
      provider,
      model,
      attempts: [],
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  resetDelegateDispatchHedgesForTests();
  resetContinuationStateForTests();
  clearRuntimeConfigSnapshot();
  clearMemoryPluginState();
  sessionControllerTesting.resetSessionControllerForTest();
  embeddedRunTesting.resetActiveEmbeddedRuns();
});

function createContinuationRun(params: { sessionKey: string; compactionCount: number }) {
  const sessionKey = params.sessionKey;
  const typing = createMockTypingController();
  const sessionCtx = {
    Provider: "discord",
    Surface: "discord",
    OriginatingChannel: "discord",
    OriginatingTo: "channel:1",
    AccountId: "primary",
    MessageSid: "msg",
  } as unknown as TemplateContext;
  const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
  const sessionEntry = {
    sessionId: "session",
    updatedAt: Date.now(),
  } satisfies SessionEntry;
  const config = {
    agents: {
      defaults: {
        continuation: {
          enabled: true,
          minDelayMs: 0,
          maxDelayMs: 5_000,
          defaultDelayMs: 1_000,
          maxChainLength: 4,
          maxDelegatesPerTurn: 4,
        },
      },
    },
  } satisfies Record<string, unknown>;
  const followupRun = {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      agentId: "main",
      sessionId: "session",
      sessionKey,
      messageProvider: "discord",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config,
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: { enabled: false, allowed: false, defaultLevel: "off" },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
    originatingChannel: "discord",
    originatingAccountId: "primary",
    originatingTo: "channel:1",
  } as unknown as FollowupRun;

  runEmbeddedAgentMock.mockResolvedValueOnce({
    payloads: [{ text: "Reply" }],
    meta: {
      finalAssistantVisibleText: "Reply",
      finalAssistantRawText:
        "Reply\n[[CONTINUE_DELEGATE: lifeboat survival task | post-compaction]]",
      agentMeta: {
        usage: { input: 1, output: 1 },
        ...(params.compactionCount > 0 ? { compactionCount: params.compactionCount } : {}),
      },
    },
  });

  return { sessionKey, sessionEntry, config, typing, sessionCtx, resolvedQueue, followupRun };
}

async function runDelegateTurn(
  run: ReturnType<typeof createContinuationRun>,
  sessionStore: Record<string, SessionEntry>,
  storePath?: string,
): Promise<void> {
  setRuntimeConfigSnapshot(run.followupRun.run.config);
  await runReplyAgent({
    commandBody: "hello",
    followupRun: run.followupRun,
    queueKey: run.sessionKey,
    resolvedQueue: run.resolvedQueue,
    shouldSteer: false,
    shouldFollowup: false,
    isActive: false,
    typing: run.typing,
    sessionCtx: run.sessionCtx,
    sessionEntry: run.sessionEntry,
    sessionStore,
    sessionKey: run.sessionKey,
    storePath,
    defaultModel: "anthropic/claude-opus-4-6",
    resolvedVerboseLevel: "off",
    isNewSession: false,
    blockStreamingEnabled: false,
    resolvedBlockStreamingBreak: "message_end",
    shouldInjectGroupIntro: false,
    typingMode: "instant",
  });
}

describe("runReplyAgent :: post-compaction delegate survives same-turn auto-compaction (C1)", () => {
  it("persists the staged delegate when auto-compaction fires the same turn", async () => {
    const run = createContinuationRun({ sessionKey: "c1-autocompaction", compactionCount: 1 });
    const sessionStore: Record<string, SessionEntry> = { [run.sessionKey]: run.sessionEntry };

    await runDelegateTurn(run, sessionStore);

    expect(stagedPostCompactionDelegateCount(run.sessionKey)).toBe(1);
    expect(await listCustodyRecordsForTest({ ownerSessionKey: run.sessionKey })).toMatchObject([
      { kind: "post_compaction", status: "queued" },
    ]);
    expect(sessionStore[run.sessionKey]?.pendingPostCompactionDelegates ?? []).toHaveLength(0);
  });

  it("persists the staged delegate on the normal path with no compaction (baseline)", async () => {
    const run = createContinuationRun({ sessionKey: "c1-baseline", compactionCount: 0 });
    const sessionStore: Record<string, SessionEntry> = { [run.sessionKey]: run.sessionEntry };

    await runDelegateTurn(run, sessionStore);

    expect(stagedPostCompactionDelegateCount(run.sessionKey)).toBe(1);
    expect(await listCustodyRecordsForTest({ ownerSessionKey: run.sessionKey })).toMatchObject([
      { kind: "post_compaction", status: "queued" },
    ]);
    expect(sessionStore[run.sessionKey]?.pendingPostCompactionDelegates ?? []).toHaveLength(0);
  });
});

describe("runReplyAgent :: pressure warning to post-compaction handoff", () => {
  const WINDOW = 200_000;
  const report = {
    tools: { entries: [{ name: "continue_delegate" }, { name: "request_compaction" }] },
  } as unknown as SessionEntry["systemPromptReport"];

  afterEach(() => {
    resetSystemEventsForTest();
  });

  const pressureEvents = (queueKey: string) =>
    peekSystemEvents(queueKey).filter((event) => event.includes("[system:context-pressure]"));

  async function createPressureRun(sessionKey: string, trigger: number) {
    const run = createContinuationRun({ sessionKey, compactionCount: 0 });
    run.config.agents.defaults.continuation = {
      ...run.config.agents.defaults.continuation,
      contextPressureThreshold: 0.8,
    } as typeof run.config.agents.defaults.continuation;
    Object.assign(run.sessionEntry, {
      contextTokens: WINDOW,
      totalTokens: trigger - 20_000,
      totalTokensFresh: true,
      totalTokensVersion: SESSION_TOTAL_TOKENS_VERSION,
      systemPromptReport: report,
      compactionCount: 0,
    } satisfies Partial<SessionEntry>);
    const storePath = path.join(custodyState.stateDir(), "agents/main/agent/openclaw-agent.sqlite");
    await replaceSessionEntry({ storePath, sessionKey }, run.sessionEntry);
    const sessionStore = { [sessionKey]: run.sessionEntry };
    return {
      run,
      storePath,
      sessionStore,
      queueKey: resolveSystemEventQueueKey(sessionKey, "main"),
    };
  }

  it.each([
    { branch: "the 0.75 cap", reserveTokensFloor: undefined, trigger: 150_000 },
    { branch: "a memory plan's reserve", reserveTokensFloor: 90_000, trigger: 110_000 },
  ])(
    "warns, stages, compacts at $branch, then hands off",
    async ({ reserveTokensFloor, trigger }) => {
      if (reserveTokensFloor !== undefined) {
        registerMemoryCapability("memory-core", {
          flushPlanResolver: () => ({
            softThresholdTokens: 4_000,
            forceFlushTranscriptBytes: 1_000_000_000,
            reserveTokensFloor,
            prompt: "flush",
            systemPrompt: "flush",
            relativePath: "memory/flush.md",
          }),
        });
      }
      const sessionKey = `agent:main:pressure-${trigger}`;
      const { run, queueKey, sessionStore, storePath } = await createPressureRun(
        sessionKey,
        trigger,
      );

      // Turn one: past the first warning, with the handoff staged in the same turn.
      await runDelegateTurn(run, sessionStore, storePath);

      expect(compactState.compactEmbeddedAgentSessionMock).not.toHaveBeenCalled();
      const warnings = pressureEvents(queueKey);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(`${Math.round(trigger / 1000)}k tokens`);
      expect(warnings[0]).toContain("continue_delegate(mode='post-compaction'");
      expect(warnings[0]).not.toContain("request_compaction");
      expect(stagedPostCompactionDelegateCount(run.sessionKey)).toBe(1);
      expect(spawnSubagentDirectMock).not.toHaveBeenCalled();
      drainSystemEventEntries(queueKey);

      // Turn two: the session crossed the trigger, so preflight maintenance compacts first.
      const crossed = await patchSessionEntryCore({ storePath, sessionKey }, () => ({
        totalTokens: trigger,
        totalTokensFresh: true,
        totalTokensVersion: SESSION_TOTAL_TOKENS_VERSION,
      }));
      sessionStore[sessionKey] = crossed!;
      compactState.compactEmbeddedAgentSessionMock.mockResolvedValueOnce({
        ok: true,
        compacted: true,
        result: {
          summary: "compacted",
          firstKeptEntryId: "kept",
          tokensBefore: trigger,
          tokensAfter: 40_000,
        },
      });
      runEmbeddedAgentMock.mockResolvedValueOnce({
        payloads: [{ text: "Reply" }],
        meta: {
          finalAssistantVisibleText: "Reply",
          finalAssistantRawText: "Reply",
          agentMeta: { usage: { input: 1, output: 1 } },
        },
      });
      const nextTurn = { ...run.followupRun, controllerInput: undefined };
      await runDelegateTurn(
        { ...run, sessionEntry: crossed!, followupRun: nextTurn },
        sessionStore,
        storePath,
      );

      expect(compactState.compactEmbeddedAgentSessionMock).toHaveBeenCalledOnce();
      const notices = pressureEvents(queueKey);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toContain("Post-compaction:");
      expect(stagedPostCompactionDelegateCount(run.sessionKey)).toBe(0);
      expect(await listCustodyRecordsForTest({ ownerSessionKey: run.sessionKey })).toMatchObject([
        {
          kind: "post_compaction",
          status: "succeeded",
          phase: "Durably handed off after compaction",
          handoff: { target: "session_delivery_queue" },
        },
      ]);
      expect(peekSystemEvents(queueKey)).toContainEqual(
        expect.stringContaining("Queued 1 post-compaction delegate(s)"),
      );
    },
  );
});
