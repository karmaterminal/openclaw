// "RFC §" references herein cite docs/design/continue-work-signal-v2.md (Agent Self-Elected Turn Continuation / CONTINUE_WORK).
/**
 * Queued post-compaction delivery lifecycle regressions.
 *
 * Two contracts live here because they share the same delivery entry point:
 *
 *  - P1-A: continuation depth follows ACCEPTED children. Any failure before an
 *    accepted spawn consumes zero chain budget, one accepted child charges
 *    exactly one hop, and crash/restart/replay after acceptance never charges
 *    twice.
 *  - P1-B: RFC §4.4 stale work terminalizes before enqueue/drain, spawn, or
 *    attachment materialization, deterministically and without leaking payload.
 */
import crypto from "node:crypto";
import path from "node:path";
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/config.js";
import * as sessionAccessorModule from "../../config/sessions/session-accessor.js";
import * as sessionStoreModule from "../../config/sessions/store-writer-state.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  loadPendingSessionDelivery,
  SessionDeliveryDeadLetteredError,
  SessionDeliverySafeRetryError,
} from "../../infra/session-delivery-queue-storage.js";
import { formatContinuationChildRunId } from "../../shared/continuation-run-key.js";
import { withTestDir } from "../../test-helpers/temp-dir.js";
import { useContinuationCustodyTestState } from "../continuation/custody/custody.test-support.js";
import {
  claimStagedPostCompactionDelegates,
  releaseStagedPostCompactionDelegateToQueue,
  stagePostCompactionCustodyDelegate,
  toSessionPostCompactionDelegate,
} from "../continuation/delegate-store-post-compaction.js";
import { POST_COMPACTION_DELEGATE_TTL_MS } from "../continuation/post-compaction-staleness.js";
import type { ChainState, ContinuationRuntimeConfig } from "../continuation/types.js";
import {
  deliverQueuedPostCompactionDelegate,
  type PostCompactionDelegateDeliveryDeps,
  type QueuedPostCompactionDelegateDelivery,
} from "./post-compaction-delegate-delivery.js";
import { drainPostCompactionDelegateDeliveries } from "./post-compaction-delegate-dispatch.js";

const mockRegistryState = vi.hoisted(() => ({
  acceptedChildSessionKeys: new Set<string>(),
  /** Registry rows keyed by attempt run ID: runId -> child session key. */
  admittedRunIds: new Map<string, string>(),
}));

vi.mock("../../agents/subagents/registry/subagent-registry-read.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSubagentRunByChildSessionKey: (childSessionKey: string) =>
    mockRegistryState.acceptedChildSessionKeys.has(childSessionKey)
      ? { runId: `run:${childSessionKey}`, childSessionKey }
      : null,
  hasLiveContinuationDelegateChildRun: (params: { childSessionKey: string }) =>
    mockRegistryState.acceptedChildSessionKeys.has(params.childSessionKey),
}));

const cfg: OpenClawConfig = {};

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

/** Delivery-time clock every `createDeliveryDeps()` mock reports. */
const DELIVERY_NOW_MS = 1_700_000_000_000;
const SECRET_TASK = "SECRET_TASK_SENTINEL_1198 carry this working state";
const SECRET_ATTACHMENT = "SECRET_ATTACHMENT_SENTINEL_1198";

function createQueuedEntry(
  overrides?: Partial<QueuedPostCompactionDelegateDelivery>,
): QueuedPostCompactionDelegateDelivery {
  return {
    id: "queue-1",
    kind: "postCompactionDelegate",
    sessionKey: "main",
    sourceSessionId: "session",
    task: "queued delegate",
    createdAt: DELIVERY_NOW_MS,
    firstArmedAt: DELIVERY_NOW_MS,
    enqueuedAt: DELIVERY_NOW_MS,
    retryCount: 0,
    childRunId: firstAttemptRunId(overrides?.sourceFlowId ?? overrides?.id ?? "queue-1"),
    ...overrides,
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
  spawnStatus?: "accepted" | "forbidden" | "error";
  /** Spawn pipeline phase a failed spawn reports (RFC §5.4.4). */
  spawnFailurePhase?: "initialize" | "dispatch" | "register";
  spawnError?: Error;
  /** Pre-existing accepted-hop marker on the source row, as a replay would see. */
  reservedChainState?: ChainState;
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
        };
  });
  const loadSessionEntry = vi.fn(({ storePath, sessionKey }) =>
    sessionAccessorModule.loadSessionEntry({ storePath, sessionKey }),
  );
  const markPendingDelegateSpawnAccepted = vi.fn(async () => true);
  const failReleasedPostCompactionDelegate = vi.fn(async () => true);
  const revalidatePendingDelegateForSpawn = vi.fn(async () => ({ allowed: true }) as const);
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
    loadSessionEntry,
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
    revalidatePendingDelegateForSpawn,
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
    loadSessionEntry,
    log,
    failReleasedPostCompactionDelegate,
    markPendingDelegateSpawnAccepted,
    reserveAcceptedPostCompactionChainHop,
    spawnSubagentDirect,
  };
}

async function seedSessionStore(
  storePath: string,
  store: Record<string, SessionEntry>,
): Promise<void> {
  await Promise.all(
    Object.entries(store).map(async ([sessionKey, entry]) => {
      await sessionAccessorModule.upsertSessionEntryCore({ storePath, sessionKey }, entry);
    }),
  );
}

// upsertSessionEntryCore canonicalizes a bare seed key ("main" -> "agent:main:main"),
// so read entries back through the same accessor production writes with instead
// of indexing the raw key on a listing.
function readSessionEntry(storePath: string, sessionKey = "main"): SessionEntry | undefined {
  return sessionAccessorModule.loadSessionEntry({ storePath, sessionKey });
}

function readSessionStore(storePath: string): Record<string, SessionEntry> {
  return Object.fromEntries(
    sessionAccessorModule
      .listSessionEntriesCore({ storePath })
      .map(({ sessionKey, entry }) => [sessionKey, entry]),
  );
}

/** Every string this delivery emitted anywhere an operator or transcript can see. */
function collectEmittedText(harness: ReturnType<typeof createDeliveryDeps>): string {
  return [
    ...harness.log.mock.calls.flat(),
    ...harness.enqueueSystemEvent.mock.calls.flat(),
    ...harness.failReleasedPostCompactionDelegate.mock.calls.flat(),
  ]
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
    .join("\n");
}

afterEach(() => {
  mockRegistryState.acceptedChildSessionKeys.clear();
  mockRegistryState.admittedRunIds.clear();
  sessionStoreModule.clearSessionStoreCacheForTest();
});

describe("post-compaction delivery: continuation depth follows accepted children", () => {
  it("consumes zero chain budget when a pre-acceptance failure retries", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, { main: { sessionId: "session", updatedAt: Date.now() } });
      const { deps, enqueueInterruptedNotice, reserveAcceptedPostCompactionChainHop } =
        createDeliveryDeps({
          storePath,
          spawnStatus: "error",
          spawnFailurePhase: "initialize",
        });
      const entry = createQueuedEntry({
        sourceFlowId: "pc-flow-source",
        sourceExpectedRevision: 7,
      });

      // Repeated transient spawn failures before the Gateway dispatch — the
      // shape a flaky attachment materialization or a briefly unavailable
      // spawner produces. They provably dispatched nothing, so each releases
      // attempt ownership for a retry (RFC §5.4.4).
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expect(deliverQueuedPostCompactionDelegate({ entry }, deps)).rejects.toBeInstanceOf(
          SessionDeliverySafeRetryError,
        );
      }
      expect(enqueueInterruptedNotice).not.toHaveBeenCalled();

      // Contract change (RFC §5.4.4, Q3): a THROWN spawn has no phase, so the
      // child may have been admitted. It is never retried: one interrupted
      // notice, then the entry dead-letters. It still charges nothing.
      const thrown = createDeliveryDeps({ storePath, spawnError: new Error("spawn unavailable") });
      await expect(
        deliverQueuedPostCompactionDelegate({ entry }, thrown.deps),
      ).rejects.toBeInstanceOf(SessionDeliveryDeadLetteredError);
      expect(thrown.enqueueInterruptedNotice).toHaveBeenCalledTimes(1);
      expect(thrown.enqueueInterruptedNotice).toHaveBeenCalledWith({ entry });

      // A retry that never reached an accepted child must consume ZERO chain
      // budget: nothing is charged, so the entry stays retryable instead of
      // walking itself into `maxChainLength` and stranding the snapshot.
      expect(reserveAcceptedPostCompactionChainHop).not.toHaveBeenCalled();
      expect(thrown.reserveAcceptedPostCompactionChainHop).not.toHaveBeenCalled();
      const stored = readSessionStore(storePath);
      for (const storedEntry of Object.values(stored)) {
        expect(storedEntry.continuationChainCount ?? 0).toBe(0);
      }
    });
  });

  it("charges exactly one chain hop for one accepted child", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, {
        main: { sessionId: "session", updatedAt: Date.now(), continuationChainCount: 1 },
      });
      const { deps, reserveAcceptedPostCompactionChainHop } = createDeliveryDeps({
        storePath,
      });

      await deliverQueuedPostCompactionDelegate(
        {
          entry: createQueuedEntry({
            sourceFlowId: "pc-flow-source",
            sourceExpectedRevision: 7,
          }),
        },
        deps,
      );

      expect(reserveAcceptedPostCompactionChainHop).toHaveBeenCalledTimes(1);
      expect(reserveAcceptedPostCompactionChainHop).toHaveBeenCalledWith(
        expect.objectContaining({ flowId: "pc-flow-source", expectedRevision: 7 }),
        expect.objectContaining({ currentChainCount: 2 }),
      );
      expect(expectDefined(readSessionEntry(storePath), "main entry").continuationChainCount).toBe(
        2,
      );
    });
  });

  it("re-persists the marker hop instead of advancing again when an accepted child replays", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, {
        main: {
          sessionId: "session",
          updatedAt: Date.now(),
          // Attempt 1 already charged this hop before crashing.
          continuationChainCount: 2,
        },
      });
      admitFirstAttempt("pc-flow-source");
      const { deps, spawnSubagentDirect } = createDeliveryDeps({
        storePath,
        reservedChainState: {
          currentChainCount: 2,
          chainStartedAt: DELIVERY_NOW_MS,
          accumulatedChainTokens: 0,
          chainId: "chain-from-marker",
        },
      });

      await deliverQueuedPostCompactionDelegate(
        {
          entry: createQueuedEntry({
            sourceFlowId: "pc-flow-source",
            sourceExpectedRevision: 7,
          }),
        },
        deps,
      );

      expect(spawnSubagentDirect).not.toHaveBeenCalled();
      const main = expectDefined(readSessionEntry(storePath), "main entry");
      expect(main.continuationChainCount).toBe(2);
      expect(main.continuationChainId).toBe("chain-from-marker");
    });
  });

  it("charges the accepted hop when a replay finds no marker (crash before the marker landed)", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, {
        main: { sessionId: "session", updatedAt: Date.now(), continuationChainCount: 1 },
      });
      const childSessionKey = admitFirstAttempt("pc-flow-source");
      const { deps, markPendingDelegateSpawnAccepted, spawnSubagentDirect } = createDeliveryDeps({
        storePath,
      });

      await deliverQueuedPostCompactionDelegate(
        {
          entry: createQueuedEntry({
            sourceFlowId: "pc-flow-source",
            sourceExpectedRevision: 7,
          }),
        },
        deps,
      );

      // No marker means the session entry was provably never advanced, so the
      // accepted child still gets its single hop.
      expect(spawnSubagentDirect).not.toHaveBeenCalled();
      expect(markPendingDelegateSpawnAccepted).toHaveBeenCalledWith(
        expect.objectContaining({ expectedRevision: 8 }),
        childSessionKey,
      );
      expect(expectDefined(readSessionEntry(storePath), "main").continuationChainCount).toBe(2);
    });
  });

  it("stays retryable at maxChainLength - 1 across repeated pre-acceptance failures", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, {
        main: { sessionId: "session", updatedAt: Date.now(), continuationChainCount: 3 },
      });
      const failing = createDeliveryDeps({
        storePath,
        runtimeConfig: { maxChainLength: 4 },
        spawnStatus: "error",
      });

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await expect(
          deliverQueuedPostCompactionDelegate(
            { entry: createQueuedEntry({ sourceFlowId: "pc", sourceExpectedRevision: 1 }) },
            failing.deps,
          ),
        ).rejects.toThrow("post-compaction delegate spawn error");
      }
      // Under the old persist-then-spawn ordering the first failure would have
      // pushed the count to 4 and every later retry would have been rejected by
      // the cap without ever reaching a child.
      expect(expectDefined(readSessionEntry(storePath), "main").continuationChainCount).toBe(3);

      const accepting = createDeliveryDeps({
        storePath,
        runtimeConfig: { maxChainLength: 4 },
      });
      await deliverQueuedPostCompactionDelegate(
        { entry: createQueuedEntry({ sourceFlowId: "pc", sourceExpectedRevision: 1 }) },
        accepting.deps,
      );
      expect(accepting.spawnSubagentDirect).toHaveBeenCalledTimes(1);
      expect(accepting.spawnSubagentDirect.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({
          continuationDelegateAdmission: expect.any(Object),
        }),
      );
      expect(expectDefined(readSessionEntry(storePath), "main").continuationChainCount).toBe(4);
    });
  });

  it("does not re-spawn a source-less entry whose post-acceptance chain persist failed", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-sourceless-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, { main: { sessionId: "session", updatedAt: Date.now() } });
      const { deps, spawnSubagentDirect } = createDeliveryDeps({ storePath });
      // Delegates persisted through the session-entry path lose their flowId in
      // `normalizePostCompactionDelegate`, so their queue entries are source-less.
      const entry = createQueuedEntry({ id: "queue-sourceless" });

      const persist = vi.fn<typeof sessionAccessorModule.patchSessionEntryCore>();
      persist.mockRejectedValueOnce(new Error("persist failed"));
      deps.patchSessionEntryCore = persist;
      await expect(deliverQueuedPostCompactionDelegate({ entry }, deps)).rejects.toThrow(
        "persist failed",
      );
      expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
      // The spawn runs under the entry's attempt key, which the registry row
      // of an admitted child carries as its run ID (RFC §5.4.4).
      expect(spawnSubagentDirect).toHaveBeenCalledWith(
        expect.objectContaining({
          continuationDelegateFlowId: "queue-sourceless",
          continuationChildRunId: firstAttemptRunId("queue-sourceless"),
        }),
        expect.any(Object),
      );

      // The redelivery carries the started attempt and a bumped retry count;
      // the replay guard must look the child up under the same attempt key or
      // this retry duplicates the child.
      admitFirstAttempt("queue-sourceless");
      deps.patchSessionEntryCore = sessionAccessorModule.patchSessionEntryCore;
      await deliverQueuedPostCompactionDelegate(
        { entry: { ...entry, deliveryStartedAt: DELIVERY_NOW_MS, retryCount: 1 } },
        deps,
      );
      expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
      // No durable marker exists for a source-less row, so the replay reclaims
      // the delivery without risking a second charge for the same accepted hop.
      expect(
        expectDefined(readSessionEntry(storePath), "main entry").continuationChainCount ?? 0,
      ).toBe(0);
    });
  });
});

describe("post-compaction delivery: RFC §4.4 stale work dies before materialization", () => {
  it("terminalizes a released entry past the TTL without spawning or materializing attachments", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-stale-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, { main: { sessionId: "session", updatedAt: Date.now() } });
      const harness = createDeliveryDeps({ storePath });

      await deliverQueuedPostCompactionDelegate(
        {
          entry: createQueuedEntry({
            task: SECRET_TASK,
            firstArmedAt: DELIVERY_NOW_MS - POST_COMPACTION_DELEGATE_TTL_MS - 1,
            createdAt: DELIVERY_NOW_MS - POST_COMPACTION_DELEGATE_TTL_MS - 1,
            attachments: [{ name: "state.md", content: SECRET_ATTACHMENT }],
            attachAs: { mountPath: "handoff" },
            sourceFlowId: "pc-flow-source",
            sourceExpectedRevision: 7,
          }),
        },
        harness.deps,
      );

      // Nothing downstream of the gate may run: no spawn, therefore no
      // attachment snapshot is ever materialized.
      expect(harness.spawnSubagentDirect).not.toHaveBeenCalled();
      expect(harness.reserveAcceptedPostCompactionChainHop).not.toHaveBeenCalled();

      // The row is terminal, not retryable.
      expect(harness.failReleasedPostCompactionDelegate).toHaveBeenCalledWith(
        { flowId: "pc-flow-source", expectedRevision: 7, task: SECRET_TASK },
        `Post-compaction delegate rejected as stale after ${POST_COMPACTION_DELEGATE_TTL_MS + 1}ms.`,
        "Post-compaction delegate rejected",
      );

      // Durable scrub: neither the task prose nor any attachment byte reaches a
      // log, system event, transcript, or terminal row.
      const emitted = collectEmittedText(harness);
      expect(emitted).not.toContain(SECRET_ATTACHMENT);
      expect(emitted).toContain("[continuation:post-compaction-delivery-stale]");
      expect(harness.log.mock.calls.flat().join("\n")).not.toContain(SECRET_TASK);
      expect(harness.enqueueSystemEvent).not.toHaveBeenCalled();
      expect(
        expectDefined(readSessionEntry(storePath), "main entry").continuationChainCount ?? 0,
      ).toBe(0);
    });
  });

  it("still releases work at exactly the TTL and drops it one millisecond later", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-stale-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, { main: { sessionId: "session", updatedAt: Date.now() } });

      // RFC §4.4 drops work "older than the TTL": the boundary is exclusive.
      const atBoundary = createDeliveryDeps({ storePath });
      await deliverQueuedPostCompactionDelegate(
        {
          entry: createQueuedEntry({
            firstArmedAt: DELIVERY_NOW_MS - POST_COMPACTION_DELEGATE_TTL_MS,
            createdAt: DELIVERY_NOW_MS - POST_COMPACTION_DELEGATE_TTL_MS,
          }),
        },
        atBoundary.deps,
      );
      expect(atBoundary.spawnSubagentDirect).toHaveBeenCalledTimes(1);

      const pastBoundary = createDeliveryDeps({ storePath });
      await deliverQueuedPostCompactionDelegate(
        {
          entry: createQueuedEntry({
            firstArmedAt: DELIVERY_NOW_MS - POST_COMPACTION_DELEGATE_TTL_MS - 1,
            createdAt: DELIVERY_NOW_MS - POST_COMPACTION_DELEGATE_TTL_MS - 1,
          }),
        },
        pastBoundary.deps,
      );
      expect(pastBoundary.spawnSubagentDirect).not.toHaveBeenCalled();
    });
  });

  it("prefers firstArmedAt over createdAt and treats an unstamped row as freshly armed", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-stale-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, { main: { sessionId: "session", updatedAt: Date.now() } });

      // An ancient `createdAt` re-armed inside the TTL still releases.
      const rearmed = createDeliveryDeps({ storePath });
      await deliverQueuedPostCompactionDelegate(
        {
          entry: createQueuedEntry({
            createdAt: 1,
            firstArmedAt: DELIVERY_NOW_MS - 1_000,
          }),
        },
        rearmed.deps,
      );
      expect(rearmed.spawnSubagentDirect).toHaveBeenCalledTimes(1);

      // A legacy row with no `firstArmedAt` falls back to `createdAt`.
      const legacy = createDeliveryDeps({ storePath });
      const legacyEntry = createQueuedEntry({ createdAt: 1 });
      delete (legacyEntry as { firstArmedAt?: number }).firstArmedAt;
      await deliverQueuedPostCompactionDelegate({ entry: legacyEntry }, legacy.deps);
      expect(legacy.spawnSubagentDirect).not.toHaveBeenCalled();
    });
  });

  it("terminalizes stale work even while continuation is disabled, so it cannot be revived", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-stale-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, { main: { sessionId: "session", updatedAt: Date.now() } });
      const disabled = createDeliveryDeps({
        storePath,
        runtimeConfig: { enabled: false },
      });
      const staleEntry = createQueuedEntry({
        firstArmedAt: DELIVERY_NOW_MS - POST_COMPACTION_DELEGATE_TTL_MS - 1,
        createdAt: DELIVERY_NOW_MS - POST_COMPACTION_DELEGATE_TTL_MS - 1,
        sourceFlowId: "pc-flow-source",
        sourceExpectedRevision: 7,
      });

      // Stale work resolves terminally instead of deferring: a deferral would
      // leave it eligible again the moment continuation is re-enabled.
      await deliverQueuedPostCompactionDelegate({ entry: staleEntry }, disabled.deps);
      expect(disabled.spawnSubagentDirect).not.toHaveBeenCalled();
      expect(disabled.failReleasedPostCompactionDelegate).toHaveBeenCalledTimes(1);

      const reEnabled = createDeliveryDeps({ storePath });
      await deliverQueuedPostCompactionDelegate({ entry: staleEntry }, reEnabled.deps);
      expect(reEnabled.spawnSubagentDirect).not.toHaveBeenCalled();
    });
  });

  it("finalizes an accepted child even when the entry is stale, instead of stranding a live run", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-stale-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await seedSessionStore(storePath, { main: { sessionId: "session", updatedAt: Date.now() } });
      admitFirstAttempt("pc-flow-source");
      const harness = createDeliveryDeps({ storePath });

      await deliverQueuedPostCompactionDelegate(
        {
          entry: createQueuedEntry({
            firstArmedAt: DELIVERY_NOW_MS - POST_COMPACTION_DELEGATE_TTL_MS - 1,
            createdAt: DELIVERY_NOW_MS - POST_COMPACTION_DELEGATE_TTL_MS - 1,
            sourceFlowId: "pc-flow-source",
            sourceExpectedRevision: 7,
          }),
        },
        harness.deps,
      );

      expect(harness.failReleasedPostCompactionDelegate).not.toHaveBeenCalled();
      expect(harness.markPendingDelegateSpawnAccepted).toHaveBeenCalledTimes(1);
    });
  });
});

// The durable entry comes from the real release commit (RFC §4.4), so it has
// the attempt key the drain requires before it applies any gate (§5.4.4).
describe("post-compaction delivery: stale custody-released entries in a queue drain", () => {
  const custody = useContinuationCustodyTestState();
  beforeEach(() => {
    // Staging and decoding a delegate's attachments both read this policy.
    setRuntimeConfigSnapshot({ tools: { sessions_spawn: { attachments: { enabled: true } } } });
  });
  afterEach(() => {
    clearRuntimeConfigSnapshot();
  });

  it("drops a stale entry during a queue drain without re-queuing it for a later restart", async () => {
    await withTestDir({ prefix: "openclaw-post-compaction-stale-drain-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      const stateDir = custody.stateDir();
      await seedSessionStore(storePath, { main: { sessionId: "session", updatedAt: Date.now() } });
      const armedAt = DELIVERY_NOW_MS - POST_COMPACTION_DELEGATE_TTL_MS - 1;
      const staged = await stagePostCompactionCustodyDelegate("main", {
        task: SECRET_TASK,
        stagedAt: armedAt,
        firstArmedAt: armedAt,
        attachments: [{ name: "state.md", content: SECRET_ATTACHMENT }],
      });
      const claimed = expectDefined(
        (await claimStagedPostCompactionDelegates("main"))[0],
        "claimed post-compaction delegate",
      );
      const released = await releaseStagedPostCompactionDelegateToQueue({
        sessionKey: "main",
        sourceSessionId: "session",
        delegate: toSessionPostCompactionDelegate(claimed),
        sequence: 0,
      });
      if (!released.released) {
        throw new Error(`release did not commit: ${released.reason}`);
      }
      const deliveryId = released.entryId;
      const harness = createDeliveryDeps({ storePath });

      await drainPostCompactionDelegateDeliveries({
        sessionKey: "main",
        stateDir,
        deliveryDeps: harness.deps,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      // Terminal, not retryable: the entry leaves `pending/` so no restart or
      // later compaction can resurrect the expired snapshot.
      expect(harness.spawnSubagentDirect).not.toHaveBeenCalled();
      expect(harness.markAttemptStarted).not.toHaveBeenCalled();
      expect(harness.enqueueInterruptedNotice).not.toHaveBeenCalled();
      expect(harness.failReleasedPostCompactionDelegate).toHaveBeenCalledWith(
        {
          flowId: staged.recordId,
          expectedRevision: claimed.expectedRevision,
          task: SECRET_TASK,
        },
        `Post-compaction delegate rejected as stale after ${POST_COMPACTION_DELEGATE_TTL_MS + 1}ms.`,
        "Post-compaction delegate rejected",
      );
      expect(await loadPendingSessionDelivery(deliveryId, stateDir)).toBeNull();
      expect(collectEmittedText(harness)).not.toContain(SECRET_ATTACHMENT);
    });
  });
});
