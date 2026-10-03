/**
 * Scenario: post-compaction delegate recovery + one-way ownership.
 *
 * Covers:
 * - recovery of accepted/replayed chain hops and source-less entries
 * - batch dispatch vs single-entry delivery ownership stays one-way
 * - restart-sentinel delivery may call the delivery owner, never dispatch
 *
 * Stubs: `subagents/registry/subagent-registry-read` for accepted-child
 * lookup only. Ownership assertions are source inspection: delivery lives in
 * `post-compaction-delegate-delivery.ts`; gateway restart sentinel imports that
 * leaf via `../auto-reply/reply/post-compaction-delegate-delivery.js` and must
 * not import the dispatch module.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as sessionAccessorModule from "../../config/sessions/session-accessor.js";
import * as sessionStoreModule from "../../config/sessions/store-writer-state.js";
import type { SessionEntry, SessionPostCompactionDelegate } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  enqueuePostCompactionDelegateDelivery as enqueuePostCompactionDelegateDeliveryQueue,
  loadPendingSessionDelivery,
  markSessionDeliveryAttemptStarted,
  SessionDeliveryDeadLetteredError,
  SessionDeliverySafeRetryError,
} from "../../infra/session-delivery-queue-storage.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import { formatContinuationChildRunId } from "../../shared/continuation-run-key.js";
import { withTestDir } from "../../test-helpers/temp-dir.js";
import { useContinuationCustodyTestState } from "../continuation/custody/custody.test-support.js";
import {
  claimStagedPostCompactionDelegates,
  releaseStagedPostCompactionDelegateToQueue,
  stagePostCompactionCustodyDelegate,
  toSessionPostCompactionDelegate,
} from "../continuation/delegate-store-post-compaction.js";
import { captureContinuationQueueContext } from "../continuation/queue-context.js";
import type { ChainState, ContinuationRuntimeConfig } from "../continuation/types.js";
import {
  deliverQueuedPostCompactionDelegate,
  persistPendingPostCompactionDelegates,
  takePendingPostCompactionDelegates,
  type PostCompactionDelegateDeliveryDeps,
  type QueuedPostCompactionDelegateDelivery,
} from "./post-compaction-delegate-delivery.js";
import {
  buildPostCompactionLifecycleEvent,
  drainPostCompactionDelegateDeliveries as drainPostCompactionDelegateDeliveriesDispatch,
  dispatchPostCompactionDelegates,
  type PostCompactionDelegateDispatchDeps,
} from "./post-compaction-delegate-dispatch.js";
import { normalizePostCompactionDelegate } from "./post-compaction-delegate-normalize.js";
import type { FollowupRun } from "./queue/types.js";

// Upstream's system-event ownership qualifies the queue key by owning agent:
// resolveSystemEventQueueKey("main", "main") -> "agent:main:main". That file
// (src/infra/system-event-ownership.ts) is BYTE-IDENTICAL to upstream/main in
// this tree, and its contract is explicit -- "Queue identity is scoped without
// rewriting the caller's persisted session key". The caller's own sessionKey
// stays "main" (see the inputs below, deliberately unchanged); only the
// enqueued event's queue identity is qualified.
//
// These expectations previously asserted the bare "main". They are derived from
// the resolver rather than re-hardcoded, so the assertion tracks the contract
// instead of a second literal that can rot the same way.
const OWNED_MAIN_QUEUE_KEY = resolveSystemEventQueueKey("main", "main");

const mockRegistryState = vi.hoisted(() => ({
  acceptedChildSessionKeys: new Set<string>(),
  /** Registry rows keyed by attempt run ID: runId -> child session key. */
  admittedRunIds: new Map<string, string>(),
  /** Requester of a C-era row under a derived child session key (default: the owner). */
  legacyRequesterByChild: new Map<string, string>(),
}));

vi.mock("../../agents/subagents/registry/subagent-registry-read.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSubagentRunByChildSessionKey: (childSessionKey: string) =>
    mockRegistryState.acceptedChildSessionKeys.has(childSessionKey)
      ? {
          runId: `run:${childSessionKey}`,
          childSessionKey,
          requesterSessionKey:
            mockRegistryState.legacyRequesterByChild.get(childSessionKey) ?? "main",
        }
      : null,
  hasLiveContinuationDelegateChildRun: (params: { childSessionKey: string }) =>
    mockRegistryState.acceptedChildSessionKeys.has(params.childSessionKey),
}));

const cfg: OpenClawConfig = {};
const VALID_TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

const defaultRuntimeConfig: ContinuationRuntimeConfig = {
  enabled: true,
  defaultDelayMs: 0,
  minDelayMs: 0,
  maxDelayMs: 1_000,
  maxChainLength: 4,
  costCapTokens: 500_000,
  maxDelegatesPerTurn: 5,
  maxPendingWork: 32,
  crossSessionTargeting: "disabled",
};

function delegate(
  task: string,
  overrides?: Partial<SessionPostCompactionDelegate>,
): SessionPostCompactionDelegate {
  return {
    task,
    createdAt: overrides?.createdAt ?? 1,
    ...(overrides?.firstArmedAt != null ? { firstArmedAt: overrides.firstArmedAt } : {}),
    ...(overrides?.silent != null ? { silent: overrides.silent } : {}),
    ...(overrides?.silentWake != null ? { silentWake: overrides.silentWake } : {}),
    ...(overrides?.traceparent
      ? {
          traceparent: overrides.traceparent,
          traceparentProvenance: overrides.traceparentProvenance ?? ("internal" as const),
        }
      : {}),
    ...(overrides?.model ? { model: overrides.model } : {}),
  };
}

function createFollowupRun(overrides?: {
  workspaceDir?: string;
  originatingChannel?: FollowupRun["originatingChannel"];
  originatingAccountId?: string;
  originatingTo?: string;
  originatingThreadId?: string | number;
}): FollowupRun {
  return {
    prompt: "hello",
    enqueuedAt: 1,
    originatingChannel: overrides?.originatingChannel,
    originatingAccountId: overrides?.originatingAccountId,
    originatingTo: overrides?.originatingTo,
    originatingThreadId: overrides?.originatingThreadId,
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: "main",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: overrides?.workspaceDir ?? "/tmp/workspace",
      config: cfg,
      provider: "anthropic",
      model: "claude",
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  };
}

function createDispatchDeps(options?: {
  staged?: SessionPostCompactionDelegate[];
  context?: string | null;
  contextError?: Error;
  rejectEnqueueAt?: number;
  runtimeConfig?: ContinuationRuntimeConfig;
  now?: number;
}) {
  const enqueueSystemEvent = vi.fn();
  const log = vi.fn();
  const readPostCompactionContext = vi.fn(async () => {
    if (options?.contextError) {
      throw options.contextError;
    }
    return options?.context ?? null;
  });
  const resolveAgentWorkspaceDir = vi.fn(() => "/fallback-workspace");
  const resolveContinuationRuntimeConfig = vi.fn(
    () => options?.runtimeConfig ?? defaultRuntimeConfig,
  );
  const enqueuePostCompactionDelegateDelivery = vi.fn(async ({ sequence }) => {
    if (options?.rejectEnqueueAt === sequence) {
      throw new Error("queue write failed");
    }
    return `queue-${sequence}`;
  });
  const drainPostCompactionDelegateDeliveries = vi.fn(async () => undefined);
  // A claimed custody delegate is released through one commit (queue insert
  // plus permanent handoff); a session-store delegate uses the plain enqueue.
  const releasePostCompactionDelegateToQueue = vi.fn<
    PostCompactionDelegateDispatchDeps["releasePostCompactionDelegateToQueue"]
  >(async ({ sequence }) => {
    if (options?.rejectEnqueueAt === sequence) {
      throw new Error("queue write failed");
    }
    return { released: true, entryId: `queue-${sequence}` };
  });
  const requeueReleasedPostCompactionDelegate = vi.fn<
    PostCompactionDelegateDispatchDeps["requeueReleasedPostCompactionDelegate"]
  >(async () => "missing");
  const stagePostCompactionDelegate = vi.fn();
  const deps: PostCompactionDelegateDispatchDeps = {
    consumeStagedPostCompactionDelegates: vi.fn(async () => options?.staged ?? []),
    releasePostCompactionDelegateToQueue,
    requeueReleasedPostCompactionDelegate,
    stagePostCompactionDelegate,
    drainPostCompactionDelegateDeliveries,
    enqueuePostCompactionDelegateDelivery,
    enqueueSystemEvent,
    log,
    now: vi.fn(() => options?.now ?? 1),
    readPostCompactionContext,
    resolveAgentWorkspaceDir,
    resolveContinuationRuntimeConfig,
    resolveSessionAgentId: vi.fn(() => "main"),
  };
  return {
    deps,
    drainPostCompactionDelegateDeliveries,
    enqueuePostCompactionDelegateDelivery,
    enqueueSystemEvent,
    releasePostCompactionDelegateToQueue,
    log,
    readPostCompactionContext,
    requeueReleasedPostCompactionDelegate,
    resolveAgentWorkspaceDir,
    resolveContinuationRuntimeConfig,
    stagePostCompactionDelegate,
  };
}

/** Delivery-time clock every `createDeliveryDeps()` mock reports. */
const DELIVERY_NOW_MS = 1_700_000_000_000;
const SOURCE_SESSION_ID = "session";
const SOURCE_LIFECYCLE_REVISION = "lifecycle";

function createQueuedEntry(
  overrides?: Partial<QueuedPostCompactionDelegateDelivery>,
): QueuedPostCompactionDelegateDelivery {
  return {
    id: "queue-1",
    kind: "postCompactionDelegate",
    sessionKey: "main",
    sourceSessionId: SOURCE_SESSION_ID,
    sourceLifecycleRevision: SOURCE_LIFECYCLE_REVISION,
    task: "queued delegate",
    // Armed at the delivery clock: an entry stamped at epoch 1 would be ~54
    // years old and would terminalize on the RFC §4.4 stale gate instead of
    // exercising the guard under test.
    createdAt: DELIVERY_NOW_MS,
    firstArmedAt: DELIVERY_NOW_MS,
    enqueuedAt: DELIVERY_NOW_MS,
    retryCount: 0,
    childRunId: firstAttemptRunId(overrides?.sourceFlowId ?? overrides?.id ?? "queue-1"),
    ...overrides,
    ...(overrides?.traceparent && overrides.traceparentProvenance === undefined
      ? { traceparentProvenance: "internal" as const }
      : {}),
  };
}

function deriveTestContinuationChildSessionKey(agentId: string, flowId: string): string {
  const digest = crypto.createHash("sha256").update(flowId).digest("hex").slice(0, 32);
  return `agent:${agentId}:subagent:continuation-${digest}`;
}

/** The first attempt key a release records for `recordId` (RFC §5.4.4). */
function firstAttemptRunId(recordId: string): string {
  return formatContinuationChildRunId(recordId, 1);
}

/** Put an owner-matching registry row under `recordId`'s first attempt key. */
function admitFirstAttempt(recordId: string, agentId = "main"): string {
  const childSessionKey = deriveTestContinuationChildSessionKey(agentId, recordId);
  mockRegistryState.admittedRunIds.set(firstAttemptRunId(recordId), childSessionKey);
  return childSessionKey;
}

function createDeliveryDeps(params: {
  storePath: string;
  runtimeConfig?: Partial<ContinuationRuntimeConfig>;
  /** Pre-existing accepted-hop marker on the source row, as a replay would see. */
  reservedChainState?: ChainState;
  spawnStatus?: "accepted" | "forbidden" | "error";
  /** Spawn pipeline phase a failed spawn reports (RFC §5.4.4). */
  spawnFailurePhase?: "initialize" | "dispatch" | "register";
  /** Run ID a failed spawn reports: the pipeline had started. */
  spawnRunId?: string;
  spawnError?: Error;
}) {
  const enqueueSystemEvent = vi.fn();
  const log = vi.fn();
  const spawnSubagentDirect = vi.fn(async (_request: unknown, _context: unknown) => {
    if (params.spawnError) {
      throw params.spawnError;
    }
    const status = params.spawnStatus ?? "accepted";
    return status === "accepted"
      ? { status, context: "isolated" as const }
      : {
          status,
          ...(params.spawnFailurePhase ? { failurePhase: params.spawnFailurePhase } : {}),
          ...(params.spawnRunId ? { runId: params.spawnRunId } : {}),
        };
  });
  const markPendingDelegateSpawnAccepted = vi.fn(async () => true);
  const failReleasedPostCompactionDelegate = vi.fn(async () => true);
  // Mirrors the real store: the marker write bumps the custody revision, and a
  // record that already carries a marker returns that same hop on every replay.
  const reserveAcceptedPostCompactionChainHop = vi.fn(
    async (
      flowRef: { flowId?: string; expectedRevision?: number },
      plannedChainState: ChainState,
    ) => ({
      chainState: params.reservedChainState ?? plannedChainState,
      expectedRevision:
        flowRef.expectedRevision === undefined ? undefined : flowRef.expectedRevision + 1,
    }),
  );
  // Registry evidence under the entry's attempt keys (RFC §5.4.4): a row whose
  // requester is the owner is an admitted child.
  const readAdmissionEvidence = vi.fn<PostCompactionDelegateDeliveryDeps["readAdmissionEvidence"]>(
    async ({ runIds }) => {
      const runId = runIds.find((candidate) => mockRegistryState.admittedRunIds.has(candidate));
      return runId
        ? {
            kind: "admitted",
            runId,
            childSessionKey: mockRegistryState.admittedRunIds.get(runId)!,
          }
        : { kind: "none" };
    },
  );
  const markAttemptStarted = vi.fn<PostCompactionDelegateDeliveryDeps["markAttemptStarted"]>(
    async () => undefined,
  );
  const enqueueInterruptedNotice = vi.fn<
    PostCompactionDelegateDeliveryDeps["enqueueInterruptedNotice"]
  >(async () => undefined);
  const deps: PostCompactionDelegateDeliveryDeps = {
    enqueueSystemEvent,
    getRuntimeConfig: vi.fn(() => cfg),
    loadSessionEntry: vi.fn(({ storePath, sessionKey }) =>
      sessionAccessorModule.loadSessionEntry({ storePath, sessionKey }),
    ),
    log,
    now: vi.fn(() => DELIVERY_NOW_MS),
    patchSessionEntryCore: sessionAccessorModule.patchSessionEntryCore,
    resolveContinuationRuntimeConfig: vi.fn(() => ({
      ...defaultRuntimeConfig,
      ...params.runtimeConfig,
    })),
    resolveSessionAgentId: vi.fn(() => "main"),
    resolveSessionStorePathCore: vi.fn(() => params.storePath),
    spawnSubagentDirect,
    revalidatePendingDelegateForSpawn: vi.fn(async () => ({ allowed: true }) as const),
    markPendingDelegateSpawnAccepted,
    failReleasedPostCompactionDelegate,
    reserveAcceptedPostCompactionChainHop,
    readAdmissionEvidence,
    markAttemptStarted,
    enqueueInterruptedNotice,
  };
  return {
    deps,
    enqueueInterruptedNotice,
    markAttemptStarted,
    readAdmissionEvidence,
    enqueueSystemEvent,
    log,
    failReleasedPostCompactionDelegate,
    markPendingDelegateSpawnAccepted,
    reserveAcceptedPostCompactionChainHop,
    spawnSubagentDirect,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function seedSessionStore(
  storePath: string,
  store: Record<string, SessionEntry>,
): Promise<void> {
  await Promise.all(
    Object.entries(store).map(async ([sessionKey, entry]) => {
      await sessionAccessorModule.upsertSessionEntryCore(
        { storePath, sessionKey },
        {
          ...(entry.sessionId === SOURCE_SESSION_ID && entry.lifecycleRevision === undefined
            ? { lifecycleRevision: SOURCE_LIFECYCLE_REVISION }
            : {}),
          ...entry,
        },
      );
    }),
  );
}

// upsertSessionEntryCore canonicalizes a bare seed key ("main" -> "agent:main:main"),
// so read entries back through the same accessor production writes with instead
// of indexing the raw key on a listing.
function readSessionEntry(storePath: string, sessionKey = "main"): SessionEntry | undefined {
  return sessionAccessorModule.loadSessionEntry({ storePath, sessionKey });
}

afterEach(() => {
  vi.useRealTimers();
  mockRegistryState.acceptedChildSessionKeys.clear();
  mockRegistryState.admittedRunIds.clear();
  mockRegistryState.legacyRequesterByChild.clear();
  sessionStoreModule.clearSessionStoreCacheForTest();
});

const splitLintUse = [
  expectDefined,
  enqueuePostCompactionDelegateDeliveryQueue,
  normalizePostCompactionDelegate,
  persistPendingPostCompactionDelegates,
  takePendingPostCompactionDelegates,
  buildPostCompactionLifecycleEvent,
  drainPostCompactionDelegateDeliveriesDispatch,
  VALID_TRACEPARENT,
  deriveTestContinuationChildSessionKey,
];
void splitLintUse;

describe("post-compaction delegate dispatch extraction", () => {
  it("allows queued self-targeting delivery when cross-session targeting is disabled", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, { main: { sessionId: "session", updatedAt: 1 } });
      const { deps, spawnSubagentDirect } = createDeliveryDeps({
        storePath,
        runtimeConfig: { crossSessionTargeting: "disabled" },
      });

      await deliverQueuedPostCompactionDelegate(
        { entry: createQueuedEntry({ targetSessionKey: " main " }) },
        deps,
      );

      expect(spawnSubagentDirect).toHaveBeenCalledWith(
        expect.objectContaining({ continuationTargetSessionKey: " main " }),
        expect.any(Object),
      );
    });
  });

  it("allows queued fanoutMode=tree post-compaction delivery when cross-session targeting is disabled", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, { main: { sessionId: "session", updatedAt: 1 } });
      const { deps, spawnSubagentDirect } = createDeliveryDeps({
        storePath,
        runtimeConfig: { crossSessionTargeting: "disabled" },
      });

      await deliverQueuedPostCompactionDelegate(
        { entry: createQueuedEntry({ fanoutMode: "tree" }) },
        deps,
      );

      expect(spawnSubagentDirect).toHaveBeenCalledWith(
        expect.objectContaining({ continuationFanoutMode: "tree" }),
        expect.any(Object),
      );
    });
  });

  // ---- Regression tests for queue-model correctness repairs ----

  it("drains unfiltered for sessionKey so prior failed entries are reconsidered", async () => {
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const preserve: SessionPostCompactionDelegate[] = [];
    const { deps, drainPostCompactionDelegateDeliveries } = createDispatchDeps({
      staged: [delegate("fresh")],
    });

    await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: preserve,
        sessionEntry,
        sessionKey: "main",
      },
      deps,
    );
    await flushMicrotasks();

    expect(drainPostCompactionDelegateDeliveries).toHaveBeenCalledTimes(1);
    const calls = drainPostCompactionDelegateDeliveries.mock.calls as ReadonlyArray<
      ReadonlyArray<unknown>
    >;
    const callArg = calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(callArg).toBeDefined();
    // Must omit entryIds so the drain is sessionKey-scoped and
    // backoff-eligible (no bypass), rescuing prior failed pending entries.
    expect(callArg).not.toHaveProperty("entryIds");
    expect(callArg).toMatchObject({ sessionKey: "main" });
  });

  it("does not re-spawn an accepted child when the post-acceptance chain persist fails", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-persist-fail-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, { main: { sessionId: "session", updatedAt: 1 } });
      const { deps, log, markPendingDelegateSpawnAccepted, spawnSubagentDirect } =
        createDeliveryDeps({ storePath });
      const entry = createQueuedEntry({
        sourceFlowId: "pc-flow-source",
        sourceExpectedRevision: 7,
      });

      // The chain is charged only after the child is accepted, so a persist
      // failure now happens with a live child. The delivery must reject (entry
      // stays pending) without committing acceptance.
      const persist = vi.fn<typeof sessionAccessorModule.patchSessionEntryCore>();
      persist.mockRejectedValueOnce(new Error("persist failed"));
      deps.patchSessionEntryCore = persist;
      await expect(deliverQueuedPostCompactionDelegate({ entry }, deps)).rejects.toBeDefined();
      expect(persist).toHaveBeenCalledWith(
        { storePath, sessionKey: "main" },
        expect.any(Function),
        expect.objectContaining({ requireWriteSuccess: true }),
      );
      expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
      expect(markPendingDelegateSpawnAccepted).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("Failed to persist post-compaction delegate chain state for main"),
      );

      // The load-bearing assertion: the retry sees the accepted child under the
      // entry's attempt key and settles it instead of spawning a duplicate.
      // Duplicate protection is the registry check, not a persist-before-spawn
      // ordering (RFC §5.4.4).
      admitFirstAttempt("pc-flow-source");
      deps.patchSessionEntryCore = sessionAccessorModule.patchSessionEntryCore;
      await deliverQueuedPostCompactionDelegate(
        { entry: { ...entry, deliveryStartedAt: DELIVERY_NOW_MS, retryCount: 1 } },
        deps,
      );
      expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
      expect(markPendingDelegateSpawnAccepted).toHaveBeenCalledTimes(1);
      expect(expectDefined(readSessionEntry(storePath), "main").continuationChainCount).toBe(1);
    });
  });

  it("reports queuedDelegates count (not delivered count) in the lifecycle event", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T22:30:00.000Z"));

    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const preserve: SessionPostCompactionDelegate[] = [];
    const { deps, enqueueSystemEvent } = createDispatchDeps({
      staged: [delegate("a"), delegate("b"), delegate("c")],
    });

    const result = await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 4,
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: preserve,
        sessionEntry,
        sessionKey: "main",
      },
      deps,
    );
    await flushMicrotasks();

    expect(result).toEqual({ queuedDelegates: 3, droppedDelegates: 0 });
    expect(enqueueSystemEvent).toHaveBeenCalledWith(
      "[system:post-compaction] Session compacted at 2026-04-26T22:30:00.000Z. Compaction count: 4. Queued 3 post-compaction delegate(s) for delivery into the fresh session.",
      { sessionKey: OWNED_MAIN_QUEUE_KEY },
    );
  });

  it("re-stages preserved delegates and keeps the committed release when the durable persist fails", async () => {
    // Two staged records are claimed; the first delegate's release fails so it
    // lands in the preserve list, and the session-store re-stage then throws.
    // The dispatch must re-stage the preserved delegate as a fresh staged
    // custody record. The second claim's release committed its queue entry and
    // handoff in one step (RFC §4.4), so it is neither re-staged nor touched.
    const staged: SessionPostCompactionDelegate[] = [
      { ...delegate("staged one"), flowId: "flow-1" },
      { ...delegate("staged two"), flowId: "flow-2" },
    ];
    const preserve: SessionPostCompactionDelegate[] = [];
    const { deps, releasePostCompactionDelegateToQueue } = createDispatchDeps({
      staged,
      rejectEnqueueAt: 0,
    });

    const persistSpy = vi
      .spyOn(sessionAccessorModule, "patchSessionEntryCore")
      .mockRejectedValue(new Error("store write failed"));
    try {
      await dispatchPostCompactionDelegates(
        {
          cfg,
          compactionCount: 1,
          followupRun: createFollowupRun(),
          postCompactionDelegatesToPreserve: preserve,
          sessionEntry: {
            sessionId: SOURCE_SESSION_ID,
            lifecycleRevision: SOURCE_LIFECYCLE_REVISION,
            updatedAt: 1,
          },
          sessionKey: "main",
          storePath: "/tmp/post-compaction-persist-fail.json",
        },
        deps,
      );
    } finally {
      persistSpy.mockRestore();
    }
    await flushMicrotasks();

    // The preserved delegate is re-staged as a fresh durable staged record.
    const stageCalls = vi.mocked(deps["stagePostCompactionDelegate"]).mock.calls;
    expect(stageCalls).toHaveLength(1);
    expect(stageCalls[0]?.[1]).toMatchObject({ task: "staged one" });
    // Each claim was released once; only the second release committed.
    expect(
      releasePostCompactionDelegateToQueue.mock.calls.map((call) => call[0].delegate.flowId),
    ).toEqual(["flow-1", "flow-2"]);
    expect(releasePostCompactionDelegateToQueue.mock.settledResults).toEqual([
      { type: "rejected", value: new Error("queue write failed") },
      { type: "fulfilled", value: { released: true, entryId: "queue-1" } },
    ]);
    // Preserve list drained: the caller's finally must not re-stage a second time.
    expect(preserve).toHaveLength(0);
  });

  it("requeues source-backed preserved delegates instead of creating a duplicate copy", async () => {
    const staged: SessionPostCompactionDelegate[] = [
      { ...delegate("staged one"), flowId: "flow-1", expectedRevision: 3 },
      { ...delegate("staged two"), flowId: "flow-2", expectedRevision: 4 },
    ];
    const preserve: SessionPostCompactionDelegate[] = [];
    const {
      deps,
      releasePostCompactionDelegateToQueue,
      requeueReleasedPostCompactionDelegate,
      stagePostCompactionDelegate,
    } = createDispatchDeps({
      staged,
      rejectEnqueueAt: 0,
    });
    requeueReleasedPostCompactionDelegate.mockResolvedValueOnce("requeued");

    const result = await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: preserve,
        sessionEntry: {
          sessionId: SOURCE_SESSION_ID,
          lifecycleRevision: SOURCE_LIFECYCLE_REVISION,
          updatedAt: 1,
        },
        sessionKey: "main",
      },
      deps,
    );
    await flushMicrotasks();

    expect(result).toEqual({ queuedDelegates: 1, droppedDelegates: 1 });
    expect(requeueReleasedPostCompactionDelegate).toHaveBeenCalledWith(
      expect.objectContaining({
        flowId: "flow-1",
        expectedRevision: 3,
        task: "staged one",
      }),
    );
    expect(stagePostCompactionDelegate).not.toHaveBeenCalled();
    expect(
      releasePostCompactionDelegateToQueue.mock.calls.map((call) => call[0].delegate.flowId),
    ).toEqual(["flow-1", "flow-2"]);
    expect(releasePostCompactionDelegateToQueue.mock.settledResults[1]).toEqual({
      type: "fulfilled",
      value: { released: true, entryId: "queue-1" },
    });
    expect(preserve).toHaveLength(0);
  });

  // Contract change (RFC §4.4): the release is one commit (queue entry plus
  // handoff), so a batch can no longer be partially finalized. A release that
  // does not commit leaves its claim untouched, and the claim goes back to
  // staged instead of failing the whole batch.
  it("re-stages a claim whose release did not commit while the other release lands", async () => {
    const staged: SessionPostCompactionDelegate[] = [
      { ...delegate("staged one"), flowId: "flow-1", expectedRevision: 3 },
      { ...delegate("staged two"), flowId: "flow-2", expectedRevision: 4 },
    ];
    const preserve: SessionPostCompactionDelegate[] = [];
    const {
      deps,
      log,
      releasePostCompactionDelegateToQueue,
      requeueReleasedPostCompactionDelegate,
    } = createDispatchDeps({ staged });
    releasePostCompactionDelegateToQueue.mockResolvedValueOnce({
      released: false,
      reason: "claim moved",
    });
    requeueReleasedPostCompactionDelegate.mockResolvedValueOnce("requeued");

    const result = await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: preserve,
        sessionEntry: {
          sessionId: SOURCE_SESSION_ID,
          lifecycleRevision: SOURCE_LIFECYCLE_REVISION,
          updatedAt: 1,
        },
        sessionKey: "main",
      },
      deps,
    );
    await flushMicrotasks();

    expect(result).toEqual({ queuedDelegates: 1, droppedDelegates: 1 });
    expect(
      releasePostCompactionDelegateToQueue.mock.calls.map((call) => call[0].delegate.flowId),
    ).toEqual(["flow-1", "flow-2"]);
    expect(requeueReleasedPostCompactionDelegate).toHaveBeenCalledTimes(1);
    expect(requeueReleasedPostCompactionDelegate).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: "flow-1", expectedRevision: 3, task: "staged one" }),
    );
    expect(log).toHaveBeenCalledWith(
      "Failed to enqueue post-compaction delegate for main (re-staged): Error: post-compaction release not committed: claim moved",
    );
    expect(preserve).toHaveLength(0);
  });

  it("keeps batch dispatch and single-entry delivery ownership one-way", async () => {
    const dispatchSource = await fs.readFile(
      new URL("./post-compaction-delegate-dispatch.ts", import.meta.url),
      "utf8",
    );
    const deliverySource = await fs.readFile(
      new URL("./post-compaction-delegate-delivery.ts", import.meta.url),
      "utf8",
    );
    const restartDeliverySource = await fs.readFile(
      new URL("../../gateway/server-restart-sentinel-delivery.ts", import.meta.url),
      "utf8",
    );
    const combinedSource = `${dispatchSource}\n${deliverySource}`;

    expect(dispatchSource).toContain('from "./post-compaction-delegate-delivery.js"');
    expect(deliverySource).not.toContain("post-compaction-delegate-dispatch");
    // Restart sentinel lives under gateway/, so its delivery import is absolute
    // to the auto-reply reply leaf — not a same-directory `./` specifier.
    expect(restartDeliverySource).toContain(
      'from "../auto-reply/reply/post-compaction-delegate-delivery.js"',
    );
    expect(restartDeliverySource).not.toContain("post-compaction-delegate-dispatch");
    expect(
      combinedSource.match(/export async function deliverQueuedPostCompactionDelegate/g),
    ).toHaveLength(1);
    expect(dispatchSource).not.toMatch(
      /\b(?:updateSessionStore|loadSessionStore|spawnSubagentDirect|markPendingDelegateSpawnAccepted|failReleasedPostCompactionDelegate)\b/,
    );
    expect(deliverySource).not.toMatch(
      /\b(?:DispatchPostCompactionDelegatesParams|buildPostCompactionLifecycleEvent|postCompactionDelegatesToPreserve|readPostCompactionContext|drainPostCompactionDelegateDeliveries)\b/,
    );
  });
});

// RFC §5.4.4 "post-compaction queue drain": the drain is the only spawn path for
// a released delegate, and it spawns each attempt at most once. Deps are
// injected, so these pin the drain's own decisions without a Gateway.
describe("post-compaction queue drain admission (RFC §5.4.4)", () => {
  async function withSeededStore(run: (storePath: string) => Promise<void>): Promise<void> {
    await withTestDir({ prefix: "openclaw-post-compaction-drain-rules-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, {
        main: { sessionId: SOURCE_SESSION_ID, updatedAt: DELIVERY_NOW_MS },
      });
      await run(storePath);
    });
  }

  it("turns a started attempt with no registry row into one notice and a dead letter, never a spawn", async () => {
    await withSeededStore(async (storePath) => {
      const harness = createDeliveryDeps({ storePath });
      const entry = createQueuedEntry({
        sourceFlowId: "pc-flow-started",
        sourceExpectedRevision: 2,
        deliveryStartedAt: DELIVERY_NOW_MS - 1_000,
        retryCount: 1,
      });

      await expect(
        deliverQueuedPostCompactionDelegate({ entry }, harness.deps),
      ).rejects.toBeInstanceOf(SessionDeliveryDeadLetteredError);

      // The registry was consulted under every attempt key the entry may have
      // launched under before the started attempt was judged unproven.
      expect(harness.readAdmissionEvidence).toHaveBeenCalledWith({
        runIds: [
          formatContinuationChildRunId("pc-flow-started", 1),
          formatContinuationChildRunId("pc-flow-started", 2),
        ],
        requesterSessionKey: "main",
      });
      expect(harness.spawnSubagentDirect).not.toHaveBeenCalled();
      expect(harness.markAttemptStarted).not.toHaveBeenCalled();
      expect(harness.enqueueInterruptedNotice).toHaveBeenCalledTimes(1);
      expect(harness.enqueueInterruptedNotice).toHaveBeenCalledWith({ entry });
      expect(harness.markPendingDelegateSpawnAccepted).not.toHaveBeenCalled();
      expect(harness.reserveAcceptedPostCompactionChainHop).not.toHaveBeenCalled();
    });
  });

  it("settles an entry whose attempt key has the owner's registry row as delivered, without a spawn or notice", async () => {
    await withSeededStore(async (storePath) => {
      const childSessionKey = admitFirstAttempt("pc-flow-admitted");
      const harness = createDeliveryDeps({ storePath });
      const entry = createQueuedEntry({
        sourceFlowId: "pc-flow-admitted",
        sourceExpectedRevision: 5,
        deliveryStartedAt: DELIVERY_NOW_MS - 1_000,
      });

      await expect(
        deliverQueuedPostCompactionDelegate({ entry }, harness.deps),
      ).resolves.toBeUndefined();

      expect(harness.readAdmissionEvidence).toHaveBeenCalledWith({
        runIds: [firstAttemptRunId("pc-flow-admitted")],
        requesterSessionKey: "main",
      });
      expect(harness.spawnSubagentDirect).not.toHaveBeenCalled();
      expect(harness.markAttemptStarted).not.toHaveBeenCalled();
      expect(harness.enqueueInterruptedNotice).not.toHaveBeenCalled();
      expect(harness.markPendingDelegateSpawnAccepted).toHaveBeenCalledWith(
        { flowId: "pc-flow-admitted", expectedRevision: 6, task: "queued delegate" },
        childSessionKey,
      );
    });
  });

  it("treats a registry row under another requester as a collision: one notice, no spawn", async () => {
    await withSeededStore(async (storePath) => {
      const harness = createDeliveryDeps({ storePath });
      harness.readAdmissionEvidence.mockResolvedValueOnce({
        kind: "collision",
        runId: firstAttemptRunId("pc-flow-collision"),
      });
      const entry = createQueuedEntry({
        sourceFlowId: "pc-flow-collision",
        sourceExpectedRevision: 1,
      });

      await expect(
        deliverQueuedPostCompactionDelegate({ entry }, harness.deps),
      ).rejects.toBeInstanceOf(SessionDeliveryDeadLetteredError);
      expect(harness.spawnSubagentDirect).not.toHaveBeenCalled();
      expect(harness.enqueueInterruptedNotice).toHaveBeenCalledTimes(1);
      expect(harness.markPendingDelegateSpawnAccepted).not.toHaveBeenCalled();
    });
  });

  it("never spawns an entry without a childRunId: no owner child ends in one notice", async () => {
    await withSeededStore(async (storePath) => {
      const harness = createDeliveryDeps({ storePath });
      const entry = createQueuedEntry({
        sourceFlowId: "pc-flow-c-era",
        sourceExpectedRevision: 3,
        childRunId: undefined,
      });

      await expect(
        deliverQueuedPostCompactionDelegate({ entry }, harness.deps),
      ).rejects.toBeInstanceOf(SessionDeliveryDeadLetteredError);
      expect(harness.spawnSubagentDirect).not.toHaveBeenCalled();
      expect(harness.markAttemptStarted).not.toHaveBeenCalled();
      // No attempt key exists, so there is no attempt-key registry read.
      expect(harness.readAdmissionEvidence).not.toHaveBeenCalled();
      expect(harness.enqueueInterruptedNotice).toHaveBeenCalledTimes(1);
      expect(harness.enqueueInterruptedNotice).toHaveBeenCalledWith({ entry });
    });
  });

  it("never spawns an entry without a childRunId: the owner's C-derived child settles it", async () => {
    await withSeededStore(async (storePath) => {
      const childSessionKey = deriveTestContinuationChildSessionKey("main", "pc-flow-c-era");
      mockRegistryState.acceptedChildSessionKeys.add(childSessionKey);
      const harness = createDeliveryDeps({ storePath });
      const entry = createQueuedEntry({
        sourceFlowId: "pc-flow-c-era",
        sourceExpectedRevision: 3,
        childRunId: undefined,
      });

      await expect(
        deliverQueuedPostCompactionDelegate({ entry }, harness.deps),
      ).resolves.toBeUndefined();
      expect(harness.spawnSubagentDirect).not.toHaveBeenCalled();
      expect(harness.enqueueInterruptedNotice).not.toHaveBeenCalled();
      expect(harness.markPendingDelegateSpawnAccepted).toHaveBeenCalledWith(
        { flowId: "pc-flow-c-era", expectedRevision: 4, task: "queued delegate" },
        childSessionKey,
      );
    });
  });

  it("never spawns an entry without a childRunId whose C-derived child belongs to another requester", async () => {
    await withSeededStore(async (storePath) => {
      const childSessionKey = deriveTestContinuationChildSessionKey("main", "pc-flow-c-era");
      mockRegistryState.acceptedChildSessionKeys.add(childSessionKey);
      mockRegistryState.legacyRequesterByChild.set(childSessionKey, "agent:main:someone-else");
      const harness = createDeliveryDeps({ storePath });

      await expect(
        deliverQueuedPostCompactionDelegate(
          {
            entry: createQueuedEntry({
              sourceFlowId: "pc-flow-c-era",
              sourceExpectedRevision: 3,
              childRunId: undefined,
            }),
          },
          harness.deps,
        ),
      ).rejects.toBeInstanceOf(SessionDeliveryDeadLetteredError);
      expect(harness.spawnSubagentDirect).not.toHaveBeenCalled();
      expect(harness.enqueueInterruptedNotice).toHaveBeenCalledTimes(1);
      expect(harness.markPendingDelegateSpawnAccepted).not.toHaveBeenCalled();
    });
  });

  it("releases attempt ownership only for a spawn that failed in the initialize phase", async () => {
    await withSeededStore(async (storePath) => {
      const harness = createDeliveryDeps({
        storePath,
        spawnStatus: "error",
        spawnFailurePhase: "initialize",
      });

      await expect(
        deliverQueuedPostCompactionDelegate(
          { entry: createQueuedEntry({ sourceFlowId: "pc-flow-init", sourceExpectedRevision: 1 }) },
          harness.deps,
        ),
      ).rejects.toBeInstanceOf(SessionDeliverySafeRetryError);
      expect(harness.spawnSubagentDirect).toHaveBeenCalledTimes(1);
      expect(harness.enqueueInterruptedNotice).not.toHaveBeenCalled();
      expect(harness.failReleasedPostCompactionDelegate).not.toHaveBeenCalled();
      expect(harness.reserveAcceptedPostCompactionChainHop).not.toHaveBeenCalled();
    });
  });

  it.each([
    { name: "dispatch phase", spawnFailurePhase: "dispatch" as const, spawnRunId: undefined },
    { name: "register phase", spawnFailurePhase: "register" as const, spawnRunId: undefined },
    { name: "run id without a phase", spawnFailurePhase: undefined, spawnRunId: "run-started" },
  ])(
    "turns a spawn failure after dispatch ($name) into one notice and a dead letter",
    async ({ spawnFailurePhase, spawnRunId }) => {
      await withSeededStore(async (storePath) => {
        const harness = createDeliveryDeps({
          storePath,
          spawnStatus: "error",
          ...(spawnFailurePhase ? { spawnFailurePhase } : {}),
          ...(spawnRunId ? { spawnRunId } : {}),
        });
        const entry = createQueuedEntry({
          sourceFlowId: "pc-flow-dispatched",
          sourceExpectedRevision: 1,
        });

        await expect(
          deliverQueuedPostCompactionDelegate({ entry }, harness.deps),
        ).rejects.toBeInstanceOf(SessionDeliveryDeadLetteredError);
        expect(harness.spawnSubagentDirect).toHaveBeenCalledTimes(1);
        expect(harness.enqueueInterruptedNotice).toHaveBeenCalledTimes(1);
        expect(harness.enqueueInterruptedNotice).toHaveBeenCalledWith({ entry });
        expect(harness.markPendingDelegateSpawnAccepted).not.toHaveBeenCalled();
        expect(harness.reserveAcceptedPostCompactionChainHop).not.toHaveBeenCalled();
      });
    },
  );

  it("turns a thrown spawn into one notice and a dead letter, never a retry", async () => {
    await withSeededStore(async (storePath) => {
      const harness = createDeliveryDeps({
        storePath,
        spawnError: new Error("gateway connection reset"),
      });
      const entry = createQueuedEntry({
        sourceFlowId: "pc-flow-thrown",
        sourceExpectedRevision: 1,
      });

      await expect(
        deliverQueuedPostCompactionDelegate({ entry }, harness.deps),
      ).rejects.toBeInstanceOf(SessionDeliveryDeadLetteredError);
      expect(harness.enqueueInterruptedNotice).toHaveBeenCalledTimes(1);
      expect(harness.reserveAcceptedPostCompactionChainHop).not.toHaveBeenCalled();
    });
  });

  it("persists attempt ownership before the spawn and spawns under the entry's attempt key", async () => {
    await withSeededStore(async (storePath) => {
      const harness = createDeliveryDeps({ storePath });
      const entry = createQueuedEntry({ sourceFlowId: "pc-flow-order", sourceExpectedRevision: 1 });

      await deliverQueuedPostCompactionDelegate({ entry }, harness.deps);

      expect(harness.markAttemptStarted).toHaveBeenCalledTimes(1);
      expect(harness.markAttemptStarted).toHaveBeenCalledWith(entry, undefined);
      expect(harness.spawnSubagentDirect).toHaveBeenCalledTimes(1);
      expect(harness.markAttemptStarted.mock.invocationCallOrder[0]).toBeLessThan(
        harness.spawnSubagentDirect.mock.invocationCallOrder[0]!,
      );
      expect(harness.spawnSubagentDirect).toHaveBeenCalledWith(
        expect.objectContaining({ continuationChildRunId: firstAttemptRunId("pc-flow-order") }),
        expect.any(Object),
      );
      expect(harness.enqueueInterruptedNotice).not.toHaveBeenCalled();
    });
  });

  it("does not spawn when attempt ownership cannot be persisted", async () => {
    await withSeededStore(async (storePath) => {
      const harness = createDeliveryDeps({ storePath });
      harness.markAttemptStarted.mockRejectedValueOnce(new Error("queue row write failed"));

      await expect(
        deliverQueuedPostCompactionDelegate(
          { entry: createQueuedEntry({ sourceFlowId: "pc-flow-mark", sourceExpectedRevision: 1 }) },
          harness.deps,
        ),
      ).rejects.toThrow("queue row write failed");
      expect(harness.spawnSubagentDirect).not.toHaveBeenCalled();
      expect(harness.enqueueInterruptedNotice).not.toHaveBeenCalled();
    });
  });
});

// Drains over entries the real release committed (RFC §4.4), so each entry
// carries its first attempt key and lives in the custody test state database.
describe("post-compaction queue drain over custody-released entries", () => {
  const custody = useContinuationCustodyTestState();

  async function releaseForSession(params: {
    sessionKey: string;
    sourceSessionId: string;
    sourceLifecycleRevision: string;
    task: string;
  }): Promise<string> {
    await stagePostCompactionCustodyDelegate(params.sessionKey, {
      task: params.task,
      stagedAt: DELIVERY_NOW_MS,
      firstArmedAt: DELIVERY_NOW_MS,
    });
    const claimed = expectDefined(
      (await claimStagedPostCompactionDelegates(params.sessionKey))[0],
      "claimed post-compaction delegate",
    );
    const released = await releaseStagedPostCompactionDelegateToQueue({
      sessionKey: params.sessionKey,
      sourceSessionId: params.sourceSessionId,
      sourceLifecycleRevision: params.sourceLifecycleRevision,
      delegate: toSessionPostCompactionDelegate(claimed),
      sequence: 0,
      compactionCount: 1,
    });
    if (!released.released) {
      throw new Error(`release did not commit: ${released.reason}`);
    }
    return released.entryId;
  }

  it("records retry metadata only for the selected session during a mixed-session drain", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-drain-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      const stateDir = custody.stateDir();
      await seedSessionStore(storePath, {
        main: {
          sessionId: "main-session",
          lifecycleRevision: "main-lifecycle",
          updatedAt: 1,
        },
        other: {
          sessionId: "other-session",
          lifecycleRevision: "other-lifecycle",
          updatedAt: 1,
        },
      });
      const mainId = await releaseForSession({
        sessionKey: "main",
        sourceSessionId: "main-session",
        sourceLifecycleRevision: "main-lifecycle",
        task: "main retry",
      });
      const otherId = await releaseForSession({
        sessionKey: "other",
        sourceSessionId: "other-session",
        sourceLifecycleRevision: "other-lifecycle",
        task: "other untouched",
      });
      // A transient failure that provably dispatched nothing is the retryable
      // shape (RFC §5.4.4); an uncertain one would dead-letter instead.
      const { deps, markAttemptStarted, spawnSubagentDirect } = createDeliveryDeps({
        storePath,
        spawnStatus: "error",
        spawnFailurePhase: "initialize",
      });
      markAttemptStarted.mockImplementation(markSessionDeliveryAttemptStarted);

      await drainPostCompactionDelegateDeliveriesDispatch({
        sessionKey: "main",
        stateDir,
        deliveryDeps: deps,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
      const mainEntry = await loadPendingSessionDelivery(
        mainId,
        captureContinuationQueueContext(stateDir),
      );
      expect(mainEntry).toMatchObject({
        sessionKey: "main",
        retryCount: 1,
        lastError: "post-compaction delegate spawn error",
      });
      // The never-dispatched failure released attempt ownership for the retry.
      expect(mainEntry).not.toHaveProperty("deliveryStartedAt");
      expect(
        await loadPendingSessionDelivery(otherId, captureContinuationQueueContext(stateDir)),
      ).toMatchObject({
        sessionKey: "other",
        retryCount: 0,
      });
    });
  });
});
