import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { formatDelegateArtifactTaskInstruction } from "../../agents/delegate-artifact-policy.js";
import {
  assertDelegateArtifactPolicyPrepared,
  MissingDelegateArtifactPolicyError,
  removeUnacceptedDelegateArtifactPolicy,
  UnavailableDelegateArtifactPolicyError,
} from "../../agents/delegate-artifacts.js";
import { deriveContinuationDelegateChildSessionKey } from "../../agents/subagent-continuation-ids.js";
import { getSubagentRunByChildSessionKey } from "../../agents/subagents/registry/subagent-registry-read.js";
import {
  spawnSubagentDirect,
  type SpawnSubagentContext,
  type SpawnSubagentParams,
} from "../../agents/subagents/spawn/subagent-spawn.js";
import { getRuntimeConfig } from "../../config/config.js";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import {
  loadSessionEntry,
  patchSessionEntryCore,
  resolveSessionEntryFromStore,
} from "../../config/sessions/session-accessor.js";
import type { SessionEntry, SessionPostCompactionDelegate } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { generateChainId } from "../../infra/secure-random.js";
import {
  markSessionDeliveryAttemptStarted,
  SessionDeliveryDeadLetteredError,
  SessionDeliveryDeferredError,
  SessionDeliverySafeRetryError,
  type QueuedSessionDelivery,
  type SessionDeliveryContext,
} from "../../infra/session-delivery-queue-storage.js";
import { enqueueSystemEventRaw as enqueueSystemEvent } from "../../infra/system-events.js";
import { defaultRuntime } from "../../runtime.js";
import type { OpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.types.js";
import { resolveContinuationRuntimeConfig } from "../continuation/config.js";
import {
  readDelegateAdmissionEvidence,
  type DelegateAdmissionEvidence,
} from "../continuation/delegate-dispatch-accepted-children.js";
import { registerContinuationDelegateDispatchClaim } from "../continuation/delegate-spawn-authority.js";
import {
  markPendingDelegateSpawnAccepted,
  revalidatePendingDelegateForSpawn,
  spawnResultNeverDispatched,
  type DelegateSpawnFenceResult,
} from "../continuation/delegate-store.js";
import { reserveAcceptedPostCompactionChainHop } from "../continuation/post-compaction-chain-charge.js";
import { failReleasedPostCompactionDelegate } from "../continuation/post-compaction-rejection.js";
import {
  classifyPostCompactionDelegateAge,
  formatPostCompactionStaleRejection,
  POST_COMPACTION_DELEGATE_TTL_MS,
} from "../continuation/post-compaction-staleness.js";
import { withContinuationOwner } from "../continuation/system-event-ownership.js";
import { hasCrossSessionDelegateTargeting } from "../continuation/targeting-pure.js";
import type { ChainState, ContinuationRuntimeConfig } from "../continuation/types.js";
import {
  enqueueQueueEntryInterruptedNotice,
  commitAcceptedPostCompactionChainCharge,
  maybeFinalizePreviouslyAcceptedDelivery,
  queuedAttemptRunIds,
  resolveQueuedPostCompactionContinuationFlowId,
  resolveQueuedPostCompactionTraceparent,
  settleInterruptedQueuedDelivery,
} from "./post-compaction-delegate-acceptance.js";
import { normalizePostCompactionDelegate } from "./post-compaction-delegate-normalize.js";
import { assertPostCompactionSourceLifecycle } from "./post-compaction-source-lifecycle.js";

export type QueuedPostCompactionDelegateDelivery = Extract<
  QueuedSessionDelivery,
  { kind: "postCompactionDelegate" }
>;

type PostCompactionDelegateSpawnResult = Awaited<ReturnType<typeof spawnSubagentDirect>>;

export type PostCompactionDelegateSpawn = (
  params: SpawnSubagentParams,
  context: SpawnSubagentContext,
) => Promise<PostCompactionDelegateSpawnResult>;

export type PostCompactionDelegateDeliveryDeps = {
  enqueueSystemEvent(
    text: string,
    options: { sessionKey: string; traceparent?: string; trusted?: boolean },
  ): void;
  getRuntimeConfig(): OpenClawConfig;
  loadSessionEntry(params: { storePath: string; sessionKey: string }): SessionEntry | undefined;
  log(message: string): void;
  now(): number;
  patchSessionEntryCore: typeof patchSessionEntryCore;
  resolveContinuationRuntimeConfig(cfg: OpenClawConfig): ContinuationRuntimeConfig;
  resolveSessionAgentId(params: { sessionKey?: string; config?: OpenClawConfig }): string;
  resolveSessionStorePathCore(
    store?: string,
    opts?: { agentId?: string; env?: NodeJS.ProcessEnv },
  ): string;
  spawnSubagentDirect: PostCompactionDelegateSpawn;
  revalidatePendingDelegateForSpawn(
    delegate: { flowId?: string; expectedRevision?: number; task: string },
    controller: "post-compaction",
  ): Promise<DelegateSpawnFenceResult>;
  markPendingDelegateSpawnAccepted(
    delegate: { flowId?: string; expectedRevision?: number; task: string },
    childSessionKey: string,
  ): Promise<boolean>;
  failReleasedPostCompactionDelegate(
    delegate: { flowId?: string; expectedRevision?: number; task: string },
    failureReason: string,
    phase?: string,
  ): Promise<boolean>;
  reserveAcceptedPostCompactionChainHop(
    delegate: { flowId?: string; expectedRevision?: number; task: string },
    plannedChainState: ChainState,
  ): Promise<{ chainState: ChainState; expectedRevision: number | undefined }>;
  /** Registry evidence under the entry's attempt keys (RFC §5.4.4). */
  readAdmissionEvidence(params: {
    runIds: readonly string[];
    requesterSessionKey: string;
  }): Promise<DelegateAdmissionEvidence>;
  /** Persist attempt ownership on the entry before any spawn begins. */
  markAttemptStarted(
    entry: QueuedPostCompactionDelegateDelivery,
    queueContext?: OpenClawStateWorkerContext,
  ): Promise<void>;
  /** Enqueue the entry's interrupted notice and surface it (idempotent per entry). */
  enqueueInterruptedNotice(params: {
    entry: QueuedPostCompactionDelegateDelivery;
    queueContext?: OpenClawStateWorkerContext;
  }): Promise<void>;
};

const defaultPostCompactionDelegateDeliveryDeps: PostCompactionDelegateDeliveryDeps = {
  enqueueSystemEvent,
  getRuntimeConfig,
  loadSessionEntry,
  log: (message) => defaultRuntime.log(message),
  now: () => Date.now(),
  patchSessionEntryCore,
  resolveContinuationRuntimeConfig,
  resolveSessionAgentId,
  resolveSessionStorePathCore,
  spawnSubagentDirect,
  revalidatePendingDelegateForSpawn,
  markPendingDelegateSpawnAccepted,
  failReleasedPostCompactionDelegate,
  reserveAcceptedPostCompactionChainHop,
  readAdmissionEvidence: readDelegateAdmissionEvidence,
  markAttemptStarted: markSessionDeliveryAttemptStarted,
  enqueueInterruptedNotice: enqueueQueueEntryInterruptedNotice,
};

function syncPendingPostCompactionDelegates(params: {
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey: string;
  delegates: SessionPostCompactionDelegate[] | undefined;
}) {
  if (params.sessionEntry) {
    params.sessionEntry.pendingPostCompactionDelegates = params.delegates;
  }
  if (params.sessionStore) {
    const resolved = resolveSessionEntryFromStore({
      store: params.sessionStore,
      sessionKey: params.sessionKey,
    });
    if (resolved.existing) {
      params.sessionStore[resolved.normalizedKey] = {
        ...resolved.existing,
        pendingPostCompactionDelegates: params.delegates,
      };
      for (const legacyKey of resolved.legacyKeys) {
        delete params.sessionStore[legacyKey];
      }
    }
  }
}

export function formatPostCompactionDelegateTaskPreview(task: string): string {
  return JSON.stringify(task.length > 120 ? `${task.slice(0, 117)}...` : task);
}

export function resolvePostCompactionDelegateDeliveryContext(params: {
  originatingChannel?: string;
  originatingTo?: string;
  originatingAccountId?: string;
  originatingThreadId?: string | number;
}): SessionDeliveryContext | undefined {
  const deliveryContext: SessionDeliveryContext = {
    ...(params.originatingChannel ? { channel: params.originatingChannel } : {}),
    ...(params.originatingTo ? { to: params.originatingTo } : {}),
    ...(params.originatingAccountId ? { accountId: params.originatingAccountId } : {}),
    ...(params.originatingThreadId != null ? { threadId: params.originatingThreadId } : {}),
  };
  return Object.keys(deliveryContext).length > 0 ? deliveryContext : undefined;
}

export async function persistPendingPostCompactionDelegates(params: {
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey: string;
  storePath?: string;
  delegates: SessionPostCompactionDelegate[];
}): Promise<SessionPostCompactionDelegate[]> {
  if (params.delegates.length === 0) {
    return (params.sessionEntry?.pendingPostCompactionDelegates ?? []).map(
      normalizePostCompactionDelegate,
    );
  }

  const normalizedDelegates = params.delegates.map(normalizePostCompactionDelegate);
  const localExisting = (params.sessionEntry?.pendingPostCompactionDelegates ?? []).map(
    normalizePostCompactionDelegate,
  );
  const combinedLocal = [...localExisting, ...normalizedDelegates];

  if (!params.storePath) {
    syncPendingPostCompactionDelegates({
      sessionEntry: params.sessionEntry,
      sessionStore: params.sessionStore,
      sessionKey: params.sessionKey,
      delegates: combinedLocal,
    });
    return combinedLocal;
  }

  const localStoredEntry = params.sessionStore
    ? resolveSessionEntryFromStore({
        store: params.sessionStore,
        sessionKey: params.sessionKey,
      }).existing
    : undefined;
  const fallbackEntry = localStoredEntry ?? params.sessionEntry;
  const persistedEntry = await patchSessionEntryCore(
    { storePath: params.storePath, sessionKey: params.sessionKey },
    (current) => ({
      pendingPostCompactionDelegates: [
        ...(current.pendingPostCompactionDelegates ?? []).map(normalizePostCompactionDelegate),
        ...normalizedDelegates,
      ],
    }),
    {
      ...(fallbackEntry ? { fallbackEntry } : {}),
      preserveActivity: true,
      requireWriteSuccess: true,
    },
  );
  const persisted = (persistedEntry?.pendingPostCompactionDelegates ?? combinedLocal).map(
    normalizePostCompactionDelegate,
  );

  syncPendingPostCompactionDelegates({
    sessionEntry: params.sessionEntry,
    sessionStore: params.sessionStore,
    sessionKey: params.sessionKey,
    delegates: persisted,
  });
  return persisted;
}

export async function takePendingPostCompactionDelegates(params: {
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey: string;
  storePath?: string;
}): Promise<SessionPostCompactionDelegate[]> {
  const localDelegates = (params.sessionEntry?.pendingPostCompactionDelegates ?? []).map(
    normalizePostCompactionDelegate,
  );

  if (!params.storePath) {
    syncPendingPostCompactionDelegates({
      sessionEntry: params.sessionEntry,
      sessionStore: params.sessionStore,
      sessionKey: params.sessionKey,
      delegates: undefined,
    });
    return localDelegates;
  }

  let persisted: SessionPostCompactionDelegate[] = [];
  await patchSessionEntryCore(
    { storePath: params.storePath, sessionKey: params.sessionKey },
    (current) => {
      persisted = (current.pendingPostCompactionDelegates ?? []).map(
        normalizePostCompactionDelegate,
      );
      return persisted.length > 0 ? { pendingPostCompactionDelegates: undefined } : null;
    },
    { preserveActivity: true, requireWriteSuccess: true },
  );

  syncPendingPostCompactionDelegates({
    sessionEntry: params.sessionEntry,
    sessionStore: params.sessionStore,
    sessionKey: params.sessionKey,
    delegates: undefined,
  });
  return persisted.length > 0 ? persisted : localDelegates;
}

async function failSourceBackedPostCompactionDelivery(
  deps: Pick<PostCompactionDelegateDeliveryDeps, "failReleasedPostCompactionDelegate" | "log">,
  entry: QueuedPostCompactionDelegateDelivery,
  summary: string,
): Promise<void> {
  if (!entry.sourceFlowId || entry.sourceExpectedRevision === undefined) {
    return;
  }
  const applied = await deps.failReleasedPostCompactionDelegate(
    {
      flowId: entry.sourceFlowId,
      expectedRevision: entry.sourceExpectedRevision,
      task: entry.task,
    },
    summary,
    "Post-compaction delegate rejected",
  );
  if (!applied) {
    throw new Error(
      `[continuation:post-compaction-source-fail-not-committed] flowId=${entry.sourceFlowId} reason=${summary}`,
    );
  }
}

/**
 * Drain one queued post-compaction delegate (RFC §4.4, §5.4.4). The drain is
 * the only place a released post-compaction delegate is spawned, at most once:
 *
 * - an entry without a `childRunId` was enqueued by a build that recorded no
 *   attempt, so it is never spawned; an owner-matching child under C's derived
 *   child session key settles it, anything else ends in one interrupted notice;
 * - every delivery first checks `subagent_runs` under the entry's attempt keys,
 *   and an owner-matching row there settles the entry as delivered;
 * - an entry whose attempt started (`deliveryStartedAt`) with no such row is an
 *   unresolved claim: one interrupted notice, never a second spawn;
 * - attempt ownership is persisted before the spawn, and only a spawn that
 *   provably never dispatched releases it for a retry.
 */
export async function deliverQueuedPostCompactionDelegate(
  params: {
    entry: QueuedPostCompactionDelegateDelivery;
    queueContext?: OpenClawStateWorkerContext;
  },
  deps: PostCompactionDelegateDeliveryDeps = defaultPostCompactionDelegateDeliveryDeps,
): Promise<void> {
  const entryTraceparent = resolveQueuedPostCompactionTraceparent(params.entry);
  const cfg = deps.getRuntimeConfig();
  const agentId = deps.resolveSessionAgentId({
    sessionKey: params.entry.sessionKey,
    config: cfg,
  });
  const acceptedChildSessionKey = deriveContinuationDelegateChildSessionKey(
    agentId,
    resolveQueuedPostCompactionContinuationFlowId(params.entry),
  );
  const storePath = deps.resolveSessionStorePathCore(cfg.session?.store, { agentId });
  const artifactMode = params.entry.returnOptions?.artifacts;
  const removeRejectedArtifactPolicy = async (): Promise<void> => {
    if (params.entry.sourceFlowId && (artifactMode === "optional" || artifactMode === "required")) {
      await removeUnacceptedDelegateArtifactPolicy(params.entry.sourceFlowId);
    }
  };
  const queueContextOption = params.queueContext ? { queueContext: params.queueContext } : {};
  const attemptRunIds = queuedAttemptRunIds(params.entry);
  if (attemptRunIds.length === 0) {
    // Backstop for entries a build without attempt keys enqueued (§5.4.5,
    // "Drain backstop"): C's own replay guard is the only admission proof.
    const legacyRun = getSubagentRunByChildSessionKey(acceptedChildSessionKey);
    const legacyEvidence: DelegateAdmissionEvidence =
      legacyRun?.requesterSessionKey === params.entry.sessionKey
        ? { kind: "admitted", runId: legacyRun.runId, childSessionKey: acceptedChildSessionKey }
        : { kind: "none" };
    if (
      await maybeFinalizePreviouslyAcceptedDelivery({
        deps,
        entry: params.entry,
        evidence: legacyEvidence,
        ownerAgentId: agentId,
        storePath,
      })
    ) {
      return;
    }
    return await settleInterruptedQueuedDelivery({
      deps,
      entry: params.entry,
      ...queueContextOption,
      reason: legacyRun ? "registry-collision" : "no-attempt-key",
    });
  }
  // An already-accepted child settles first and is never re-gated: its spawn is
  // live, so re-running policy or staleness here would strand a running child.
  const evidence = await deps.readAdmissionEvidence({
    runIds: attemptRunIds,
    requesterSessionKey: params.entry.sessionKey,
  });
  if (
    await maybeFinalizePreviouslyAcceptedDelivery({
      deps,
      entry: params.entry,
      evidence,
      ownerAgentId: agentId,
      storePath,
    })
  ) {
    return;
  }
  if (evidence.kind === "collision" || params.entry.deliveryStartedAt !== undefined) {
    return await settleInterruptedQueuedDelivery({
      deps,
      entry: params.entry,
      ...queueContextOption,
      reason: evidence.kind === "collision" ? "registry-collision" : "unproven-started-attempt",
    });
  }
  // RFC §4.4 stale work dies before every other gate, including the disabled
  // deferral, so a released row cannot outlive the staged row it came from and
  // cannot be revived by a later retry, restart, or config flip. This must stay
  // ahead of the artifact-policy assert and the spawn so no attachment snapshot
  // is ever materialized for expired work.
  const staleness = classifyPostCompactionDelegateAge(params.entry, deps.now());
  if (staleness.stale) {
    // Diagnostics carry only the age: a stale drop must not spill task prose or
    // attachment bytes into logs, terminal rows, or queue diagnostics.
    deps.log(
      `[continuation:post-compaction-delivery-stale] entryId=${params.entry.id} flowId=${params.entry.sourceFlowId ?? "none"} ageMs=${staleness.ageMs} ttlMs=${POST_COMPACTION_DELEGATE_TTL_MS}`,
    );
    await failSourceBackedPostCompactionDelivery(
      deps,
      params.entry,
      formatPostCompactionStaleRejection(staleness.ageMs),
    );
    await removeRejectedArtifactPolicy();
    return;
  }
  // An accepted artifact policy that is gone or expired can never become
  // valid again: reject before the disabled deferral so the entry does not
  // retry to its cap while holding the policy row and staying silent.
  if (artifactMode === "optional" || artifactMode === "required") {
    try {
      await assertDelegateArtifactPolicyPrepared(
        resolveQueuedPostCompactionContinuationFlowId(params.entry),
      );
    } catch (error) {
      const unavailable = error instanceof UnavailableDelegateArtifactPolicyError;
      if (!unavailable && !(error instanceof MissingDelegateArtifactPolicyError)) {
        throw error;
      }
      const summary = `Post-compaction delegate rejected: accepted artifact policy is ${unavailable ? "inactive or expired" : "missing"}.`;
      deps.log(
        `[continuation:post-compaction-policy-${unavailable ? "unavailable" : "missing"}] entryId=${params.entry.id} flowId=${params.entry.sourceFlowId ?? "none"}`,
      );
      deps.enqueueSystemEvent(
        `[continuation] ${summary} Task: ${params.entry.task}`,
        withContinuationOwner({ sessionKey: params.entry.sessionKey, trusted: true }, agentId),
      );
      await failSourceBackedPostCompactionDelivery(deps, params.entry, summary);
      await removeRejectedArtifactPolicy();
      return;
    }
  }
  const runtimeConfig = deps.resolveContinuationRuntimeConfig(cfg);
  if (!runtimeConfig.enabled) {
    throw new SessionDeliveryDeferredError(
      "post-compaction delegate delivery deferred while continuation is disabled",
    );
  }
  const sessionEntry = deps.loadSessionEntry({
    storePath,
    sessionKey: params.entry.sessionKey,
  });
  assertPostCompactionSourceLifecycle(params.entry, sessionEntry);
  const ownerEventOptions = <T extends { sessionKey: string }>(
    options: T,
  ): Omit<T, "sessionKey"> & { sessionKey: string } => withContinuationOwner(options, agentId);
  const {
    maxChainLength: maxCompactionChainLength,
    costCapTokens: compactionCostCapTokens,
    crossSessionTargeting,
  } = runtimeConfig;
  const currentCompactionChainCount = sessionEntry?.continuationChainCount ?? 0;
  const compactionChainTokens = sessionEntry?.continuationChainTokens ?? 0;

  if (currentCompactionChainCount >= maxCompactionChainLength) {
    deps.log(
      `Post-compaction delegate rejected: chain length ${currentCompactionChainCount} >= ${maxCompactionChainLength} for session ${params.entry.sessionKey}`,
    );
    deps.enqueueSystemEvent(
      `[continuation] Post-compaction delegate rejected: chain length ${maxCompactionChainLength} reached. Task: ${params.entry.task}`,
      ownerEventOptions({
        sessionKey: params.entry.sessionKey,
        ...(entryTraceparent ? { traceparent: entryTraceparent } : {}),
      }),
    );
    await failSourceBackedPostCompactionDelivery(
      deps,
      params.entry,
      `Post-compaction delegate rejected: chain length ${maxCompactionChainLength} reached.`,
    );
    await removeRejectedArtifactPolicy();
    return;
  }

  if (compactionCostCapTokens > 0 && compactionChainTokens > compactionCostCapTokens) {
    deps.log(
      `Post-compaction delegate rejected: cost cap exceeded (${compactionChainTokens} > ${compactionCostCapTokens}) for session ${params.entry.sessionKey}`,
    );
    deps.enqueueSystemEvent(
      `[continuation] Post-compaction delegate rejected: cost cap exceeded (${compactionChainTokens} > ${compactionCostCapTokens}). Task: ${params.entry.task}`,
      ownerEventOptions({
        sessionKey: params.entry.sessionKey,
        ...(entryTraceparent ? { traceparent: entryTraceparent } : {}),
      }),
    );
    await failSourceBackedPostCompactionDelivery(
      deps,
      params.entry,
      `Post-compaction delegate rejected: cost cap exceeded (${compactionChainTokens} > ${compactionCostCapTokens}).`,
    );
    await removeRejectedArtifactPolicy();
    return;
  }

  if (
    crossSessionTargeting === "disabled" &&
    hasCrossSessionDelegateTargeting(params.entry, params.entry.sessionKey)
  ) {
    if (artifactMode === "optional" || artifactMode === "required") {
      throw new SessionDeliveryDeferredError(
        "post-compaction delegate delivery deferred while cross-session targeting is disabled",
      );
    }
    deps.log(
      `Post-compaction delegate rejected: crossSessionTargeting=disabled at delivery time for session ${params.entry.sessionKey}`,
    );
    deps.enqueueSystemEvent(
      `[continuation] Post-compaction delegate rejected: cross-session targeting was disabled at delivery time. Task: ${params.entry.task}`,
      ownerEventOptions({
        sessionKey: params.entry.sessionKey,
        ...(entryTraceparent ? { traceparent: entryTraceparent } : {}),
      }),
    );
    await failSourceBackedPostCompactionDelivery(
      deps,
      params.entry,
      "Post-compaction delegate rejected: cross-session targeting was disabled at delivery time.",
    );
    return;
  }

  const nextCompactionChainCount = currentCompactionChainCount + 1;
  const compactionChainStartedAt = sessionEntry?.continuationChainStartedAt ?? deps.now();
  // Mint or reuse `continuationChainId` (UUID) so the post-compaction handoff
  // carries the same correlation key that
  // `agent-runner.ts:persistContinuationChainState` would have used before
  // compaction. A pre-compaction chain id survives the boundary; otherwise this
  // is the chain's first step post-handoff. It is resolved but NOT persisted
  // here: the child must be spawned with the id the accepted charge will record,
  // and an attempt that never reaches an accepted child persists nothing.
  const compactionChainId = sessionEntry?.continuationChainId ?? generateChainId();
  deps.log(
    `Post-compaction delegate dispatch for session ${params.entry.sessionKey}: ${params.entry.task}`,
  );
  const delegateWakeOnReturn = params.entry.silentWake ?? true;
  const delegateSilentAnnounce = params.entry.silent ?? delegateWakeOnReturn;

  if (artifactMode === "optional" || artifactMode === "required") {
    await assertDelegateArtifactPolicyPrepared(
      resolveQueuedPostCompactionContinuationFlowId(params.entry),
    );
  }

  const activeDispatch = registerContinuationDelegateDispatchClaim({
    controller: "post-compaction",
    delegate: {
      flowId: params.entry.sourceFlowId,
      expectedRevision: params.entry.sourceExpectedRevision,
      task: params.entry.task,
    },
    ownerSession: {
      agentId,
      load: () => deps.loadSessionEntry({ storePath, sessionKey: params.entry.sessionKey }),
    },
    ownerSessionKey: params.entry.sessionKey,
  });
  let rollbackAcceptedSpawn: (() => Promise<void>) | undefined;
  try {
    const spawnFence = await deps.revalidatePendingDelegateForSpawn(
      {
        flowId: params.entry.sourceFlowId,
        expectedRevision: params.entry.sourceExpectedRevision,
        task: params.entry.task,
      },
      "post-compaction",
    );
    if (!spawnFence.allowed) {
      await removeRejectedArtifactPolicy();
      deps.log(
        `[continuation:post-compaction-spawn-fenced] reason=${spawnFence.reason} flowId=${params.entry.sourceFlowId ?? "unknown"} entryId=${params.entry.id}`,
      );
      throw new SessionDeliveryDeadLetteredError(spawnFence.summary);
    }

    // Attempt ownership is durable before any spawn side effect: from here
    // on, a restart finds `deliveryStartedAt` and never spawns again.
    await deps.markAttemptStarted(params.entry, params.queueContext);
    let spawnResult: Awaited<ReturnType<PostCompactionDelegateSpawn>>;
    try {
      spawnResult = await deps.spawnSubagentDirect(
        {
          task:
            `[continuation:post-compaction] ` +
            `[continuation:chain-hop:${nextCompactionChainCount}] ` +
            `Compaction just completed. Carry this working state to the post-compaction session: ${params.entry.task}` +
            formatDelegateArtifactTaskInstruction(params.entry),
          ...(delegateSilentAnnounce ? { silentAnnounce: true } : {}),
          ...(delegateWakeOnReturn ? { silentAnnounce: true, wakeOnReturn: true } : {}),
          ...(params.entry.targetSessionKey
            ? { continuationTargetSessionKey: params.entry.targetSessionKey }
            : {}),
          ...(params.entry.targetSessionKeys && params.entry.targetSessionKeys.length > 0
            ? { continuationTargetSessionKeys: params.entry.targetSessionKeys }
            : {}),
          ...(params.entry.fanoutMode ? { continuationFanoutMode: params.entry.fanoutMode } : {}),
          ...(params.entry.recipientAuthorityBinding
            ? { continuationRecipientAuthorityBinding: params.entry.recipientAuthorityBinding }
            : {}),
          drainsContinuationDelegateQueue: true,
          continuationDelegateFlowId: resolveQueuedPostCompactionContinuationFlowId(params.entry),
          continuationChildRunId: attemptRunIds.at(-1),
          continuationChainState: {
            count: nextCompactionChainCount,
            startedAt: compactionChainStartedAt,
            tokens: compactionChainTokens,
            chainId: compactionChainId,
          },
          ...(params.entry.model ? { model: params.entry.model } : {}),
          ...(params.entry.attachments ? { attachments: params.entry.attachments } : {}),
          ...(params.entry.attachAs?.mountPath
            ? { attachMountPath: params.entry.attachAs.mountPath }
            : {}),
          ...(entryTraceparent ? { traceparent: entryTraceparent } : {}),
        },
        {
          agentSessionKey: params.entry.sessionKey,
          requesterAgentIdOverride: activeDispatch.ownerAgentId,
          agentChannel: params.entry.deliveryContext?.channel,
          agentAccountId: params.entry.deliveryContext?.accountId,
          agentTo: params.entry.deliveryContext?.to,
          agentThreadId: params.entry.deliveryContext?.threadId,
          continuationDelegateAdmission: activeDispatch.authority,
        },
      );
    } catch (error) {
      // A thrown spawn has no phase: the child may have been admitted.
      return await settleInterruptedQueuedDelivery({
        deps,
        entry: params.entry,
        ...queueContextOption,
        reason: `spawn-threw:${error instanceof Error ? error.name : "unknown"}`,
      });
    }
    if (spawnResult.status !== "accepted") {
      if (!spawnResultNeverDispatched(spawnResult)) {
        return await settleInterruptedQueuedDelivery({
          deps,
          entry: params.entry,
          ...queueContextOption,
          reason: `spawn-${spawnResult.status}:${spawnResult.failurePhase ?? "unknown-phase"}`,
        });
      }
      if (spawnResult.status === "cancelled") {
        await removeRejectedArtifactPolicy();
        throw new SessionDeliveryDeadLetteredError(
          spawnResult.error ?? "Continuation delegate admission cancelled.",
        );
      }
      if (
        spawnResult.status === "forbidden" &&
        params.entry.sourceFlowId &&
        params.entry.sourceExpectedRevision !== undefined
      ) {
        await failSourceBackedPostCompactionDelivery(
          deps,
          params.entry,
          `Post-compaction delegate spawn forbidden: ${spawnResult.error ?? "delegation was not accepted"}.`,
        );
        await removeRejectedArtifactPolicy();
        return;
      }
      // Provably never dispatched: release attempt ownership for a retry.
      throw new SessionDeliverySafeRetryError(
        `post-compaction delegate spawn ${spawnResult.status}`,
      );
    }
    rollbackAcceptedSpawn = spawnResult.rollbackAccepted;
    // Charge the chain only now that a child is actually accepted. Everything
    // above this line — artifact policy, spawn fence, attachment materialization,
    // spawn rejection — leaves the persisted depth untouched, so a retry after any
    // of those failures still has its full budget.
    const { expectedRevision: acceptedRevision } = await commitAcceptedPostCompactionChainCharge({
      deps,
      entry: params.entry,
      plannedChainState: {
        currentChainCount: nextCompactionChainCount,
        chainStartedAt: compactionChainStartedAt,
        accumulatedChainTokens: compactionChainTokens,
        chainId: compactionChainId,
      },
      ...(sessionEntry ? { sessionEntry } : {}),
      storePath,
    });
    activeDispatch.authority.assertCurrent("final-acceptance", null);
    assertPostCompactionSourceLifecycle(
      params.entry,
      deps.loadSessionEntry({ storePath, sessionKey: params.entry.sessionKey }),
    );
    if (params.entry.sourceFlowId && params.entry.sourceExpectedRevision !== undefined) {
      const spawnedChildSessionKey = spawnResult.childSessionKey ?? acceptedChildSessionKey;
      const committed = await deps.markPendingDelegateSpawnAccepted(
        {
          flowId: params.entry.sourceFlowId,
          expectedRevision: acceptedRevision ?? params.entry.sourceExpectedRevision,
          task: params.entry.task,
        },
        spawnedChildSessionKey,
      );
      if (!committed) {
        throw new Error(
          `[continuation:post-compaction-source-accept-not-committed] flowId=${params.entry.sourceFlowId}`,
        );
      }
    }

    assertPostCompactionSourceLifecycle(
      params.entry,
      deps.loadSessionEntry({ storePath, sessionKey: params.entry.sessionKey }),
    );
    deps.enqueueSystemEvent(
      `[continuation:compaction-delegate-spawned] Post-compaction shard dispatched: ${params.entry.task}`,
      ownerEventOptions({
        sessionKey: params.entry.sessionKey,
        ...(entryTraceparent ? { traceparent: entryTraceparent } : {}),
      }),
    );
    rollbackAcceptedSpawn = undefined;
  } finally {
    await rollbackAcceptedSpawn?.();
    activeDispatch.release();
  }
}
