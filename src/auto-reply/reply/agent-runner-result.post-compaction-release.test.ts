import { expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import type { SessionPostCompactionDelegate } from "../../config/sessions/types.js";
import { createReplyContinuationController } from "./agent-runner-continuation.js";
import { finalizeReplyAgentRun } from "./agent-runner-result.js";
import type { FinalizeReplyAgentRunInput } from "./agent-runner-result.types.js";
import type { PostCompactionDelegateDispatchDeps } from "./post-compaction-delegate-dispatch.js";
import { createReplyOperation } from "./reply-run-registry.js";
import { createMockFollowupRun, createMockTypingController } from "./test-helpers.js";
import { createTypingSignaler } from "./typing-mode.js";

type ReleasedDelegate = Parameters<
  PostCompactionDelegateDispatchDeps["releasePostCompactionDelegateToQueue"]
>[0];

const COMPACTION_TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

const releaseState = vi.hoisted(() => ({
  staged: [] as SessionPostCompactionDelegate[],
  released: [] as ReleasedDelegate[],
}));

// Runs the real dispatch owner from the foreground caller, swapping only its
// custody, queue, and workspace dependencies.
vi.mock("./post-compaction-delegate-dispatch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./post-compaction-delegate-dispatch.js")>();
  const deps: PostCompactionDelegateDispatchDeps = {
    consumeStagedPostCompactionDelegates: async () => releaseState.staged.splice(0),
    rejectPostCompactionDelegate: async () => true,
    requeueReleasedPostCompactionDelegate: async () => "missing",
    stagePostCompactionDelegate: async () => undefined,
    releasePostCompactionDelegateToQueue: async (params) => {
      releaseState.released.push(params);
      return { released: true, entryId: `queue-${params.sequence}` };
    },
    drainPostCompactionDelegateDeliveries: async () => undefined,
    enqueuePostCompactionDelegateDelivery: async (params) => {
      releaseState.released.push(params);
      return `queue-${params.sequence}`;
    },
    enqueueSystemEvent: () => undefined,
    log: () => undefined,
    now: () => 1,
    readPostCompactionContext: async () => null,
    resolveAgentWorkspaceDir: () => "workspace",
    resolveContinuationRuntimeConfig: () => ({
      enabled: true,
      defaultDelayMs: 0,
      minDelayMs: 0,
      maxDelayMs: 1_000,
      maxChainLength: 4,
      costCapTokens: 500_000,
      maxDelegatesPerTurn: 5,
      maxPendingWork: 32,
      crossSessionTargeting: "disabled",
    }),
    resolveSessionAgentId: () => "main",
  };
  return {
    ...actual,
    dispatchPostCompactionDelegates: (
      params: Parameters<typeof actual.dispatchPostCompactionDelegates>[0],
    ) => actual.dispatchPostCompactionDelegates(params, deps),
  };
});

it("releases a foreground post-compaction delegate under the compaction traceparent", async () => {
  const sessionKey = "agent:main:foreground-release";
  const sessionId = "foreground-release-session";
  const cfg = {};
  const followupRun = createMockFollowupRun({
    prompt: "keep going",
    run: {
      agentId: "main",
      agentDir: "agent",
      workspaceDir: "workspace",
      sessionKey,
      sessionId,
      config: cfg,
      provider: "openai",
      model: "gpt-5.6-luna",
    },
  });
  const replyOperation = createReplyOperation({
    sessionKey,
    sessionId,
    resetTriggered: false,
  });
  replyOperation.setPhase("running");
  // A staged delegate with no trace of its own inherits the release trace.
  releaseState.staged = [{ task: "resume the audit", createdAt: 1 }];
  releaseState.released = [];
  const activeSessionStore: Record<string, SessionEntry> = {
    [sessionKey]: { sessionId, updatedAt: 1 },
  };
  let activeSessionEntry: SessionEntry | undefined = activeSessionStore[sessionKey];
  const getActiveSessionEntry = () => activeSessionEntry;
  const setActiveSessionEntry = (next: SessionEntry | undefined) => {
    activeSessionEntry = next;
  };
  const continuation = createReplyContinuationController({
    cfg,
    sessionKey,
    storePath: undefined,
    isContinuationWake: false,
    activeSessionStore,
    getActiveSessionEntry,
    setActiveSessionEntry,
  });
  const context: FinalizeReplyAgentRunInput = {
    activeIsNewSession: false,
    activeSessionEntry,
    activeSessionStore,
    blockReplyPipeline: null,
    blockStreamingEnabled: false,
    cfg,
    commandBody: followupRun.prompt,
    continuation,
    defaultModel: "gpt-5.6-luna",
    followupRun,
    getActiveSessionEntry,
    setActiveSessionEntry,
    isHeartbeat: false,
    noOpRearmWakeClass: undefined,
    pendingToolTasks: new Set(),
    preflightCompactionApplied: false,
    queueKey: sessionKey,
    replyMediaContext: { normalizePayload: async (payload) => payload },
    replyOperation,
    replyRouteThreadId: undefined,
    replySessionKey: sessionKey,
    replyToChannel: undefined,
    replyToMode: "off",
    resolvedBlockStreamingBreak: "message_end",
    resolvedQueue: { mode: "followup" },
    resolvedVerboseLevel: "off",
    returnWithQueuedFollowupDrain: (value) => value,
    runFollowupTurn: async () => {},
    execution: {
      kind: "settled",
      status: "ok",
      result: {
        payloads: [{ text: "compacted and continuing" }],
        meta: {
          durationMs: 1,
          agentMeta: { sessionId, provider: "openai", model: "gpt-5.6-luna" },
        },
      },
      compactionTraceparent: COMPACTION_TRACEPARENT,
      resolved: { provider: "openai", model: "gpt-5.6-luna" },
      fallback: { exhausted: false, attempts: [] },
      autoCompactionCount: 1,
      didLogHeartbeatStrip: false,
    },
    runId: "foreground-release-run",
    runStartedAt: Date.now(),
    sessionCtx: {},
    sessionKey,
    shouldInjectGroupIntro: false,
    storePath: undefined,
    typingSignals: createTypingSignaler({
      typing: createMockTypingController(),
      mode: "never",
      isHeartbeat: false,
    }),
  };

  try {
    await finalizeReplyAgentRun(context);
    expect(releaseState.released).toHaveLength(1);
    expect(releaseState.released[0]?.delegate).toMatchObject({
      task: "resume the audit",
      traceparent: COMPACTION_TRACEPARENT,
      traceparentProvenance: "internal",
    });
  } finally {
    replyOperation.complete();
  }
});
