// Integration pin for delegate-dispatch span shape across continuation modes.
//
// The current tracer contract names the span `continuation.delegate.dispatch`.
// This test drives the runner-side tool delegate path for silent modes, and the
// auto-compaction release of a staged post-compaction delegate through the real
// custody store, delivery queue, and queue drain (#1497).

import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEmbeddedAgentInternalParams } from "../../agents/embedded-agent-runner/run/internal-params.js";
import { abortEmbeddedAgentRun } from "../../agents/embedded-agent-runner/runs.js";
import { testing as embeddedRunTesting } from "../../agents/embedded-agent-runner/runs.test-support.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import {
  loadSessionEntry,
  upsertSessionEntryCore,
} from "../../config/sessions/session-accessor.js";
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
import { testing as sessionControllerTesting } from "../../sessions/session-controller.test-support.js";
import {
  createOpenClawTestState,
  type OpenClawTestState,
} from "../../test-utils/openclaw-test-state.js";
import { useContinuationCustodyTestState } from "../continuation/custody/custody.test-support.js";
import { stagePostCompactionCustodyDelegate } from "../continuation/delegate-store-post-compaction.js";
import { enqueuePendingDelegate } from "../continuation/delegate-store.js";
import type { TemplateContext } from "../templating.js";
import { drainPostCompactionDelegateDeliveries } from "./post-compaction-delegate-dispatch.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
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
const requestContinuationWakeMock = vi.hoisted(() => vi.fn());
const spawnSubagentDirectMock = vi.hoisted(() => vi.fn());
const queueDrains = vi.hoisted(() => [] as Promise<void>[]);
let testState: OpenClawTestState;

// The compaction release starts its queue drain without awaiting it. Record each
// real drain so a case can await the delivery it started instead of polling.
vi.mock("../../infra/session-delivery-queue-recovery.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../infra/session-delivery-queue-recovery.js")>();
  return {
    ...actual,
    drainPendingSessionDeliveries: (
      ...args: Parameters<typeof actual.drainPendingSessionDeliveries>
    ) => {
      const drain = actual.drainPendingSessionDeliveries(...args);
      queueDrains.push(drain);
      return drain;
    },
  };
});

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

// mock-isolation: Continuation wakes are recorded without running the session-event handoff.
vi.mock("../continuation/continuation-wake.js", () => ({
  requestContinuationWake: (...args: unknown[]) => requestContinuationWakeMock(...args),
}));

// mock-isolation: Keep the process-wide followup queue and drain registry outside runner cases.
vi.mock("./queue.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./queue.js")>()),
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
  // A released delegate's drain reads admission evidence here; nothing is admitted yet.
  prepareSubagentRunsByRunIds: async () => ({
    consume: <T>(read: (runs: ReadonlyMap<string, never>) => T) => ({
      ready: true as const,
      value: read(new Map()),
    }),
  }),
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
  /** The W3C parent the emitter passed in `StartSpanOptions.traceparent`. */
  parentTraceparent: string | undefined;
  /** This span's own W3C traceparent, in its parent's trace when it has one. */
  traceparent: string;
};

type DelegateModeUnderTest = "silent" | "silent-wake";

const PARENT_CHAIN_ID = "019dcf57-b536-77cc-834b-b803d9262032";

function createRecordingTracer(): { tracer: Tracer; spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const tracer: Tracer = {
    startSpan(name: string, opts?: StartSpanOptions): Span {
      const traceId = opts?.traceparent?.split("-")[1] ?? randomBytes(16).toString("hex");
      const rec: RecordedSpan = {
        name,
        attributes: { ...opts?.attributes },
        status: undefined,
        ended: false,
        parentTraceparent: opts?.traceparent,
        traceparent: `00-${traceId}-${randomBytes(8).toString("hex")}-01`,
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
          // status carries the outcome these cases assert
        },
        traceparent(): string {
          return rec.traceparent;
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

/** Await every queue drain started so far, including drains a drain starts. */
async function settleQueueDrains(): Promise<void> {
  while (queueDrains.length > 0) {
    await Promise.all(queueDrains.splice(0));
  }
}

/** The privacy-safe reason fingerprint every delegate span carries (`continuation-tracer.ts`). */
function reasonFingerprint(task: string) {
  return {
    "reason.present": true,
    "reason.length": task.length,
    "reason.hash": createHash("sha256").update(task).digest("hex").slice(0, 16),
    "reason.redacted": false,
  };
}

beforeEach(async () => {
  testState = await createOpenClawTestState({
    layout: "state-only",
    prefix: "openclaw-continuation-span-uniformity-",
  });
  embeddedRunTesting.resetActiveEmbeddedRuns();
  sessionControllerTesting.resetSessionControllerForTest();
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
  requestContinuationWakeMock.mockReset();
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
  await settleQueueDrains();
  vi.useRealTimers();
  clearRuntimeConfigSnapshot();
  clearMemoryPluginState();
  sessionControllerTesting.resetSessionControllerForTest();
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

});

describe("runReplyAgent :: released post-compaction delegate spans (#1497)", () => {
  // The staging turn's span: the continue_delegate tool captured it on the delegate.
  const STAGING_TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

  async function stageLifeboat(sessionKey: string, task: string): Promise<void> {
    await stagePostCompactionCustodyDelegate(sessionKey, {
      task,
      stagedAt: Date.now(),
      traceparent: STAGING_TRACEPARENT,
    });
  }

  /** One reply turn whose embedded run auto-compacted, releasing the staged lifeboats. */
  async function runCompactingTurn(sessionKey: string): Promise<void> {
    const run = createContinuationRun({ mode: "silent-wake", sessionKey, currentChainCount: 1 });
    runEmbeddedAgentMock.mockImplementationOnce(async (params: RunEmbeddedAgentInternalParams) => {
      const storePath = resolveSessionStorePathCore(undefined, { agentId: "main" });
      const stored = loadSessionEntry({ storePath, sessionKey });
      params.onCompactionAccounting?.({
        kind: "durable",
        count: 1,
        currentContextSnapshot: { tokens: 40 },
        target: {
          agentId: "main",
          sessionId: run.sessionEntry.sessionId,
          sessionKey,
          storePath,
          lifecycleRevision: stored?.lifecycleRevision,
          activeWriterRunId: undefined,
        },
      });
      return {
        payloads: [{ text: "Compacted and continuing." }],
        meta: { agentMeta: { usage: { input: 1, output: 1 }, compactionCount: 1 } },
      };
    });
    await runDelegateTurn(run, { [sessionKey]: run.sessionEntry });
    await settleQueueDrains();
  }

  it("emits one dispatch and one fire span per released lifeboat, joined to its release", async () => {
    const typed = await dispatchToolDelegateMode({ mode: "silent-wake", currentChainCount: 1 });
    const { tracer, spans } = createRecordingTracer();
    setContinuationTracer(tracer);
    const sessionKey = "continuation-span-uniformity-lifeboat";
    const task = "carry the audit plan across compaction";
    await stageLifeboat(sessionKey, task);

    await runCompactingTurn(sessionKey);

    const released = spans.filter((s) => s.name === "continuation.compaction.released");
    expect(released).toHaveLength(1);
    const compactionId = released[0]?.attributes["compaction.id"];
    expect(compactionId).toEqual(expect.any(Number));
    const dispatches = spans.filter((s) => s.name === "continuation.delegate.dispatch");
    const fires = spans.filter((s) => s.name === "continuation.delegate.fire");
    expect(dispatches).toHaveLength(1);
    expect(fires).toHaveLength(1);
    const [dispatch, fire] = [dispatches[0], fires[0]];
    // The dispatch continues the staging turn's trace; the fire and the spawned
    // child hang off the dispatch, and the fire names the release it came from.
    expect(dispatch).toMatchObject({
      status: "OK",
      ended: true,
      parentTraceparent: STAGING_TRACEPARENT,
      attributes: {
        ...reasonFingerprint(task),
        "chain.id": PARENT_CHAIN_ID,
        "delay.ms": 0,
        "delegate.delivery": "compaction",
        "delegate.mode": "post-compaction",
      },
    });
    expect(fire).toMatchObject({
      status: "OK",
      ended: true,
      parentTraceparent: dispatch?.traceparent,
      attributes: {
        ...reasonFingerprint(task),
        "chain.id": PARENT_CHAIN_ID,
        "chain.step.remaining": dispatch?.attributes["chain.step.remaining"],
        "compaction.id": compactionId,
        "delegate.delivery": "compaction",
        "delegate.mode": "post-compaction",
      },
    });
    expect(spawnSubagentDirectMock.mock.calls.at(-1)?.[0]).toMatchObject({
      traceparent: dispatch?.traceparent,
    });
    // Same attribute keys as a typed dispatch; the fire adds only the release join.
    expect(Object.keys(dispatch?.attributes ?? {}).toSorted()).toEqual(
      Object.keys(typed.attributes).toSorted(),
    );
    expect(Object.keys(fire?.attributes ?? {}).toSorted()).toEqual(
      [...Object.keys(typed.attributes), "compaction.id", "fire.deferred_ms"].toSorted(),
    );

    // A replayed drain finds the delivery settled and fires nothing again.
    await drainPostCompactionDelegateDeliveries({ sessionKey });
    await settleQueueDrains();
    expect(spans.filter((s) => s.name === "continuation.delegate.fire")).toHaveLength(1);
    expect(spans.filter((s) => s.name === "continuation.delegate.dispatch")).toHaveLength(1);
  });
});
