// Integration pin for delegate-dispatch span shape across continuation modes.
//
// The current tracer contract names the span `continuation.delegate.dispatch`.
// This test drives the runner-side tool delegate path for silent modes and
// leaves the post-compaction mode as a production-gap TODO.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  abortEmbeddedAgentRun,
  isEmbeddedAgentRunActive,
} from "../../agents/embedded-agent-runner/runs.js";
import { testing as embeddedRunTesting } from "../../agents/embedded-agent-runner/runs.test-support.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import { upsertSessionEntryCore } from "../../config/sessions/session-accessor.js";
import {
  resetContinuationTracer,
  setContinuationTracer,
  type Span,
  type SpanAttributes,
  type SpanStatus,
  type StartSpanOptions,
  type Tracer,
} from "../../infra/continuation-tracer.js";
import { clearMemoryPluginState } from "../../plugins/memory-state.js";
import {
  createOpenClawTestState,
  type OpenClawTestState,
} from "../../test-utils/openclaw-test-state.js";
import { useContinuationCustodyTestState } from "../continuation/custody/custody.test-support.js";
import { enqueuePendingDelegate } from "../continuation/delegate-store.js";
import type { TemplateContext } from "../templating.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { testing as replyRunRegistryTesting } from "./reply-run-registry.test-support.js";
import { createMockTypingController } from "./test-helpers.js";

const runEmbeddedAgentMock = vi.fn();
const runCliAgentMock = vi.fn();
const runWithModelFallbackMock = vi.fn();
const runtimeErrorMock = vi.fn();
const abortEmbeddedAgentRunMock = vi.fn();
const clearSessionQueuesMock = vi.fn();
const refreshQueuedFollowupSessionMock = vi.fn();
const compactState = vi.hoisted(() => ({
  compactEmbeddedAgentSessionMock: vi.fn(),
}));
const requestHeartbeatNowMock = vi.hoisted(() => vi.fn());
const spawnSubagentDirectMock = vi.hoisted(() => vi.fn());
let testState: OpenClawTestState;

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

// mock-isolation: Embedded runs and compaction are scripted; abort and active checks still reach the real run registry.
vi.mock("../../agents/embedded-agent.js", () => ({
  runEmbeddedAgent: (params: unknown) => runEmbeddedAgentMock(params),
  compactEmbeddedAgentSession: (params: unknown) =>
    compactState.compactEmbeddedAgentSessionMock(params),
  queueEmbeddedAgentMessage: vi.fn().mockReturnValue(false),
  abortEmbeddedAgentRun: (sessionId: string) => {
    abortEmbeddedAgentRunMock(sessionId);
    return abortEmbeddedAgentRun(sessionId);
  },
  isEmbeddedAgentRunActive: (sessionId: string) => isEmbeddedAgentRunActive(sessionId),
}));

// mock-isolation: CLI agent runs are recorded without spawning a CLI process.
vi.mock("../../agents/cli-runner.js", () => ({
  runCliAgent: (...args: unknown[]) => runCliAgentMock(...args),
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

// mock-isolation: Heartbeat wake requests are recorded without the process-wide wake handler.
vi.mock("../../infra/heartbeat-wake.js", () => ({
  requestHeartbeatNow: (...args: unknown[]) => requestHeartbeatNowMock(...args),
}));

// mock-isolation: Keep the process-wide followup queue and drain registry outside runner cases.
vi.mock("./queue.js", () => ({
  enqueueFollowupRun: vi.fn(),
  scheduleFollowupDrain: vi.fn(),
  clearSessionQueues: (...args: unknown[]) => clearSessionQueuesMock(...args),
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

type RecordedSpan = {
  name: string;
  attributes: SpanAttributes;
  status: SpanStatus | undefined;
  ended: boolean;
};

type DelegateModeUnderTest = "silent" | "silent-wake";

const PARENT_CHAIN_ID = "019dcf57-b536-77cc-834b-b803d9262032";

function createRecordingTracer(): { tracer: Tracer; spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const tracer: Tracer = {
    startSpan(name: string, opts?: StartSpanOptions): Span {
      const rec: RecordedSpan = {
        name,
        attributes: { ...opts?.attributes },
        status: undefined,
        ended: false,
      };
      spans.push(rec);
      const span: Span = {
        setAttributes(attrs: SpanAttributes): void {
          Object.assign(rec.attributes, attrs);
        },
        setStatus(status: SpanStatus, _message?: string): void {
          rec.status = status;
        },
        recordException(_err: unknown): void {
          // unused by the delegate dispatch accept path
        },
        end(): void {
          rec.ended = true;
        },
      };
      return span;
    },
  };
  return { tracer, spans };
}

beforeEach(async () => {
  testState = await createOpenClawTestState({
    layout: "state-only",
    prefix: "openclaw-continuation-span-uniformity-",
  });
  embeddedRunTesting.resetActiveEmbeddedRuns();
  replyRunRegistryTesting.resetReplyRunRegistry();
  runEmbeddedAgentMock.mockClear();
  runCliAgentMock.mockClear();
  runWithModelFallbackMock.mockClear();
  runtimeErrorMock.mockClear();
  abortEmbeddedAgentRunMock.mockClear();
  compactState.compactEmbeddedAgentSessionMock.mockReset();
  compactState.compactEmbeddedAgentSessionMock.mockResolvedValue({
    compacted: false,
    reason: "test-preflight-disabled",
  });
  clearSessionQueuesMock.mockReset();
  clearSessionQueuesMock.mockReturnValue({ followupCleared: 0, laneCleared: 0, keys: [] });
  refreshQueuedFollowupSessionMock.mockReset();
  refreshQueuedFollowupSessionMock.mockResolvedValue(undefined);
  loadCronStoreMock.mockClear();
  loadCronStoreMock.mockResolvedValue({ version: 1, jobs: [] });
  requestHeartbeatNowMock.mockReset();
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

// Registered after the fixture state above so custody's per-test state
// directory is the one the runner resolves; its afterEach runs first.
const custodyState = useContinuationCustodyTestState();

afterEach(async () => {
  vi.useRealTimers();
  clearRuntimeConfigSnapshot();
  clearMemoryPluginState();
  replyRunRegistryTesting.resetReplyRunRegistry();
  embeddedRunTesting.resetActiveEmbeddedRuns();
  resetContinuationTracer();
  await testState.cleanup();
});

function createContinuationRun(params: {
  mode: DelegateModeUnderTest;
  sessionKey: string;
  currentChainCount: number;
}) {
  const typing = createMockTypingController();
  const sessionCtx = {
    Provider: "discord",
    OriginatingTo: "channel:1",
    AccountId: "primary",
    MessageSid: "msg",
  } as unknown as TemplateContext;
  const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
  const sessionEntry = {
    sessionId: "session",
    updatedAt: Date.now(),
    continuationChainId: PARENT_CHAIN_ID,
    continuationChainCount: params.currentChainCount,
    continuationChainStartedAt: 1_700_000_000_000,
    continuationChainTokens: 0,
  } satisfies SessionEntry;
  const followupRun = {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      agentId: "main",
      sessionId: "session",
      sessionKey: params.sessionKey,
      messageProvider: "discord",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: {
        agents: {
          defaults: {
            continuation: {
              enabled: true,
              minDelayMs: 0,
              maxDelayMs: 5_000,
              defaultDelayMs: 1_000,
              maxChainLength: 6,
              maxDelegatesPerTurn: 4,
            },
          },
        },
      },
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;

  return {
    sessionKey: params.sessionKey,
    sessionEntry,
    typing,
    sessionCtx,
    resolvedQueue,
    followupRun,
  };
}

async function runDelegateTurn(
  run: ReturnType<typeof createContinuationRun>,
  sessionStore: Record<string, SessionEntry>,
): Promise<unknown> {
  await upsertSessionEntryCore(
    {
      agentId: "main",
      env: { ...testState.env, OPENCLAW_STATE_DIR: custodyState.stateDir() },
      sessionKey: run.sessionKey,
    },
    run.sessionEntry,
  );
  setRuntimeConfigSnapshot(run.followupRun.run.config);
  return runReplyAgent({
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
    defaultModel: "anthropic/claude-opus-4-6",
    resolvedVerboseLevel: "off",
    isNewSession: false,
    blockStreamingEnabled: false,
    resolvedBlockStreamingBreak: "message_end",
    shouldInjectGroupIntro: false,
    typingMode: "instant",
    // These scenarios seed a mid-chain entry (continuationChainCount ≥ 1) and
    // continue it, so the turn is a continuation WAKE: the chain-break
    // reset must NOT fire and the parent chain.id / step math carry forward.
    isContinuationWake: true,
  });
}

async function dispatchToolDelegateMode(params: {
  mode: DelegateModeUnderTest;
  currentChainCount: number;
}): Promise<RecordedSpan> {
  const { tracer, spans } = createRecordingTracer();
  setContinuationTracer(tracer);
  const sessionKey = `continuation-span-uniformity-${params.mode}`;
  const run = createContinuationRun({
    mode: params.mode,
    sessionKey,
    currentChainCount: params.currentChainCount,
  });
  runEmbeddedAgentMock.mockImplementationOnce(async () => {
    await enqueuePendingDelegate(sessionKey, {
      task: `check span uniformity for ${params.mode}`,
      mode: params.mode,
    });
    return {
      payloads: [{ text: "Queued delegate." }],
      meta: { agentMeta: { usage: { input: 1, output: 1 } } },
    };
  });

  await runDelegateTurn(run, { [sessionKey]: run.sessionEntry });

  const dispatchSpans = spans.filter((s) => s.name === "continuation.delegate.dispatch");
  expect(dispatchSpans).toHaveLength(1);
  const dispatchSpan = dispatchSpans[0];
  if (!dispatchSpan) {
    throw new Error(`expected continuation.delegate.dispatch span for ${params.mode}`);
  }
  return dispatchSpan;
}

describe("runReplyAgent :: delegate dispatch span uniformity", () => {
  it("emits uniform continuation.delegate.dispatch spans for silent and silent-wake tool delegates", async () => {
    const silent = await dispatchToolDelegateMode({ mode: "silent", currentChainCount: 1 });
    const silentWake = await dispatchToolDelegateMode({
      mode: "silent-wake",
      currentChainCount: 2,
    });

    for (const [mode, span] of [
      ["silent", silent],
      ["silent-wake", silentWake],
    ] as const) {
      expect(span.status).toBe("OK");
      expect(span.ended).toBe(true);
      expect(span.attributes["chain.id"]).toBe(PARENT_CHAIN_ID);
      expect(span.attributes["delay.ms"]).toBe(0);
      expect(span.attributes["delegate.delivery"]).toBe("immediate");
      expect(span.attributes["delegate.mode"]).toBe(mode);
    }

    expect(Object.keys(silent.attributes).toSorted()).toEqual(
      Object.keys(silentWake.attributes).toSorted(),
    );

    const stableKeys = Object.keys(silent.attributes).filter(
      (key) =>
        key !== "delegate.mode" &&
        key !== "chain.step.remaining" &&
        key !== "reason.length" &&
        key !== "reason.hash" &&
        key !== "reason.redacted",
    );
    for (const key of stableKeys) {
      expect(silent.attributes[key]).toBe(silentWake.attributes[key]);
    }
    expect(silent.attributes["chain.step.remaining"]).toBe(4);
    expect(silentWake.attributes["chain.step.remaining"]).toBe(3);
  });

  // Post-compaction delegate delivery persists continuation chain state but
  // does not yet emit `continuation.delegate.dispatch` with
  // `delegate.mode = "post-compaction"`. Keep this todo as the coverage marker
  // for the production lane.
  it.todo(
    "emits exactly one continuation.delegate.dispatch span for post-compaction delegates with the same attribute-key shape",
  );
});
