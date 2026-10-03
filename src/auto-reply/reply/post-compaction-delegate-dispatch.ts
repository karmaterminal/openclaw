import { resolveAgentWorkspaceDir, resolveSessionAgentId } from "../../agents/agent-scope.js";
import type { SessionEntry, SessionPostCompactionDelegate } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveContinuationTraceparent } from "../../infra/continuation-tracer.js";
import {
  drainPendingSessionDeliveries,
  type SessionDeliveryRecoveryLogger,
} from "../../infra/session-delivery-queue-recovery.js";
import {
  enqueuePostCompactionDelegateDelivery,
  type SessionDeliveryContext,
} from "../../infra/session-delivery-queue-storage.js";
import { withSystemEventOwner } from "../../infra/system-event-ownership.js";
import { enqueueSystemEventRaw as enqueueSystemEvent } from "../../infra/system-events.js";
import { defaultRuntime } from "../../runtime.js";
import { captureOpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.js";
import { resolveContinuationRuntimeConfig } from "../continuation/config.js";
import {
  consumeStagedPostCompactionDelegates,
  type PostCompactionDelegateRequeueResult,
  releaseStagedPostCompactionDelegateToQueue,
  requeueReleasedPostCompactionDelegate,
  stagePostCompactionDelegate,
} from "../continuation/delegate-store-post-compaction.js";
import { rejectPostCompactionDelegate } from "../continuation/post-compaction-rejection.js";
import {
  classifyPostCompactionDelegateAge,
  formatPostCompactionStaleRejection,
  POST_COMPACTION_DELEGATE_TTL_MS,
} from "../continuation/post-compaction-staleness.js";
import type { ContinuationSignal } from "../continuation/signal.js";
import type { ContinuationRuntimeConfig } from "../continuation/types.js";
import { readPostCompactionContext } from "./post-compaction-context.js";
import {
  deliverQueuedPostCompactionDelegate,
  formatPostCompactionDelegateTaskPreview,
  persistPendingPostCompactionDelegates,
  resolvePostCompactionDelegateDeliveryContext,
  takePendingPostCompactionDelegates,
  type PostCompactionDelegateDeliveryDeps,
} from "./post-compaction-delegate-delivery.js";
import { normalizePostCompactionDelegate } from "./post-compaction-delegate-normalize.js";
import { isFollowupRunAborted, type FollowupRun } from "./queue/types.js";

type PostCompactionDelegateEnqueueParams = {
  sessionKey: string;
  sourceSessionId?: string;
  sourceLifecycleRevision?: string;
  delegate: SessionPostCompactionDelegate;
  sequence: number;
  compactionCount?: number;
  deliveryContext?: SessionDeliveryContext;
};

export type PostCompactionDelegateDispatchDeps = {
  consumeStagedPostCompactionDelegates(
    sessionKey: string,
  ): Promise<SessionPostCompactionDelegate[]>;
  /** Fail a claimed record the release refused (stale or over budget). */
  rejectPostCompactionDelegate?: (
    delegate: Pick<SessionPostCompactionDelegate, "flowId" | "expectedRevision" | "task">,
    failureReason: string,
  ) => Promise<boolean>;
  requeueReleasedPostCompactionDelegate(
    delegate: Pick<SessionPostCompactionDelegate, "flowId" | "expectedRevision" | "task">,
  ): Promise<PostCompactionDelegateRequeueResult>;
  stagePostCompactionDelegate(
    sessionKey: string,
    delegate: SessionPostCompactionDelegate,
  ): Promise<unknown>;
  /**
   * Release a claimed custody record: the queue insert and the record's
   * handoff commit together (RFC §4.4).
   */
  releasePostCompactionDelegateToQueue(
    params: PostCompactionDelegateEnqueueParams,
  ): Promise<{ released: true; entryId: string } | { released: false; reason: string }>;
  drainPostCompactionDelegateDeliveries(params: {
    entryIds?: readonly string[];
    log: SessionDeliveryRecoveryLogger;
    sessionKey: string;
  }): Promise<void>;
  /** Enqueue a session-store delegate that has no custody record. */
  enqueuePostCompactionDelegateDelivery(
    params: PostCompactionDelegateEnqueueParams,
  ): Promise<string>;
  enqueueSystemEvent(
    text: string,
    options: { sessionKey: string; traceparent?: string; trusted?: boolean },
  ): void;
  log(message: string): void;
  now(): number;
  readPostCompactionContext(
    workspaceDir: string,
    options: { cfg: OpenClawConfig; agentId: string },
  ): Promise<string | null>;
  resolveAgentWorkspaceDir(cfg: OpenClawConfig, agentId: string): string;
  resolveContinuationRuntimeConfig(cfg: OpenClawConfig): ContinuationRuntimeConfig;
  resolveSessionAgentId(params: { sessionKey?: string; config?: OpenClawConfig }): string;
};

export type DispatchPostCompactionDelegatesParams = {
  cfg: OpenClawConfig;
  compactionCount: number | undefined;
  continuationSignalKind?: ContinuationSignal["kind"];
  followupRun: FollowupRun;
  postCompactionDelegatesToPreserve: SessionPostCompactionDelegate[];
  releaseTraceparent?: string;
  sessionEntry?: SessionEntry;
  sessionKey: string;
  sessionStore?: Record<string, SessionEntry>;
  storePath?: string;
};

export type DispatchPostCompactionDelegatesResult = {
  queuedDelegates: number;
  droppedDelegates: number;
};

const defaultRecoveryLog: SessionDeliveryRecoveryLogger = {
  info: (message) => defaultRuntime.log(message),
  warn: (message) => defaultRuntime.log(message),
  error: (message) => defaultRuntime.log(message),
};

const defaultPostCompactionDelegateDispatchDeps: PostCompactionDelegateDispatchDeps = {
  consumeStagedPostCompactionDelegates,
  rejectPostCompactionDelegate,
  requeueReleasedPostCompactionDelegate,
  stagePostCompactionDelegate,
  releasePostCompactionDelegateToQueue: releaseStagedPostCompactionDelegateToQueue,
  drainPostCompactionDelegateDeliveries,
  enqueuePostCompactionDelegateDelivery,
  enqueueSystemEvent,
  log: (message) => defaultRuntime.log(message),
  now: () => Date.now(),
  readPostCompactionContext,
  resolveAgentWorkspaceDir,
  resolveContinuationRuntimeConfig,
  resolveSessionAgentId,
};

function formatErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Terminalize a claimed delegate the release dropped; every claimed record ends in a visible outcome. */
async function terminalizeDroppedDelegate(params: {
  delegate: SessionPostCompactionDelegate;
  deps: Partial<Pick<PostCompactionDelegateDispatchDeps, "rejectPostCompactionDelegate">>;
  summary: string;
}): Promise<string | undefined> {
  if (!params.delegate.flowId || params.delegate.expectedRevision === undefined) {
    return undefined;
  }
  const reject = params.deps.rejectPostCompactionDelegate ?? rejectPostCompactionDelegate;
  await reject(params.delegate, params.summary);
  return params.delegate.flowId;
}

function enqueueSystemEventOrLog(params: {
  deps: Pick<PostCompactionDelegateDispatchDeps, "enqueueSystemEvent" | "log">;
  label: string;
  agentId: string;
  sessionKey: string;
  text: string;
}): void {
  try {
    params.deps.enqueueSystemEvent(
      params.text,
      withSystemEventOwner({ sessionKey: params.sessionKey }, params.agentId),
    );
  } catch (err) {
    params.deps.log(
      `Failed to enqueue ${params.label} for ${params.sessionKey}: ${formatErrorMessage(err)}`,
    );
  }
}

export function buildPostCompactionLifecycleEvent(params: {
  compactionCount?: number;
  /**
   * Number of delegates accepted into the persistent delivery queue this
   * dispatch. NOTE: this is the queued count (post-`enqueue` accept,
   * pre-spawn). The actual spawn happens asynchronously in the
   * fire-and-forget drain triggered after this event is emitted, so this
   * count is an upper bound on what will eventually be released into the
   * fresh session — individual queued entries may still fail to spawn
   * (their failure is recorded as a queue retry, not reflected here).
   *
   * Named `queuedDelegates` to make the semantic accurate; the previous
   * agent-runner path counted accepted
   * spawns, but the queue-extraction architecture cannot count spawns
   * synchronously without awaiting the drain. The honest name is
   * `queuedDelegates`.
   */
  queuedDelegates: number;
  droppedDelegates: number;
}): string {
  const parts = [
    `[system:post-compaction] Session compacted at ${new Date().toISOString()}.`,
    typeof params.compactionCount === "number"
      ? `Compaction count: ${params.compactionCount}.`
      : undefined,
    `Queued ${params.queuedDelegates} post-compaction delegate(s) for delivery into the fresh session.`,
    params.droppedDelegates > 0
      ? `${params.droppedDelegates} delegate(s) were not released into the fresh session.`
      : undefined,
  ].filter(Boolean);
  return parts.join(" ");
}

function applyReleaseTraceparent(
  delegate: SessionPostCompactionDelegate,
  releaseTraceparent: string | undefined,
): SessionPostCompactionDelegate {
  if (delegate.traceparentProvenance === "internal" && delegate.traceparent) {
    return delegate;
  }
  const resolvedReleaseTraceparent = resolveContinuationTraceparent(releaseTraceparent);
  if (!resolvedReleaseTraceparent) {
    const normalized = { ...delegate };
    delete normalized.traceparent;
    delete normalized.traceparentProvenance;
    return normalized;
  }
  return {
    ...delegate,
    traceparent: resolvedReleaseTraceparent,
    traceparentProvenance: "internal",
  };
}

async function preservePostCompactionDelegates(params: {
  deps: PostCompactionDelegateDispatchDeps;
  dispatch: DispatchPostCompactionDelegatesParams;
}): Promise<{
  preservedClaimedFlowIds: Set<string>;
}> {
  const preservedClaimedFlowIds = new Set<string>();
  if (params.dispatch.postCompactionDelegatesToPreserve.length === 0) {
    return { preservedClaimedFlowIds };
  }

  const delegatesToPersist: SessionPostCompactionDelegate[] = [];
  for (const delegate of params.dispatch.postCompactionDelegatesToPreserve) {
    const requeueResult = await params.deps.requeueReleasedPostCompactionDelegate(delegate);
    if (requeueResult === "requeued") {
      if (delegate.flowId) {
        preservedClaimedFlowIds.add(delegate.flowId);
      }
      continue;
    }
    if (requeueResult === "authoritative") {
      if (delegate.flowId) {
        preservedClaimedFlowIds.add(delegate.flowId);
      }
      params.deps.log(
        `[continuation:post-compaction-requeue-not-applied] flowId=${delegate.flowId ?? "missing"}; preserving authoritative custody state`,
      );
      continue;
    }
    if (delegate.flowId) {
      preservedClaimedFlowIds.add(delegate.flowId);
    }
    delegatesToPersist.push(delegate);
  }
  try {
    if (delegatesToPersist.length > 0) {
      await persistPendingPostCompactionDelegates({
        sessionEntry: params.dispatch.sessionEntry,
        sessionStore: params.dispatch.sessionStore,
        sessionKey: params.dispatch.sessionKey,
        storePath: params.dispatch.storePath,
        delegates: delegatesToPersist,
      });
    }
  } catch (err) {
    // Session-store persist failed. Re-stage the delegates as fresh staged
    // custody records so they stay durably recoverable.
    const restagedCount = delegatesToPersist.length;
    for (const delegate of delegatesToPersist) {
      await params.deps.stagePostCompactionDelegate(params.dispatch.sessionKey, delegate);
    }
    params.deps.log(
      `Failed to persist re-staged post-compaction delegates for ${params.dispatch.sessionKey}; re-staged ${restagedCount} to the durable queue: ${String(
        err,
      )}`,
    );
  }
  // Cleared on both paths: the delegates are now durable (session store on
  // success, fresh staged custody records on failure), so the caller's finally
  // must not re-stage them a second time.
  params.dispatch.postCompactionDelegatesToPreserve.length = 0;
  return { preservedClaimedFlowIds };
}

async function preserveCancelledPostCompactionDelegates(params: {
  delegates: readonly SessionPostCompactionDelegate[];
  deps: PostCompactionDelegateDispatchDeps;
  dispatch: DispatchPostCompactionDelegatesParams;
  phase: "delegate-extraction" | "context-loading" | "enqueue";
}): Promise<DispatchPostCompactionDelegatesResult> {
  params.dispatch.postCompactionDelegatesToPreserve.push(...params.delegates);
  // Every claimed record goes back to staged (or stays with its authoritative
  // owner); a cancelled release hands nothing off.
  await preservePostCompactionDelegates({ deps: params.deps, dispatch: params.dispatch });
  params.deps.log(
    `[continuation:post-compaction-release-cancelled] sessionKey=${params.dispatch.sessionKey} phase=${params.phase} preserved=${params.delegates.length}`,
  );
  return { queuedDelegates: 0, droppedDelegates: 0 };
}

export async function drainPostCompactionDelegateDeliveries(params: {
  entryIds?: readonly string[];
  log?: SessionDeliveryRecoveryLogger;
  sessionKey?: string;
  stateDir?: string;
  deliveryDeps?: PostCompactionDelegateDeliveryDeps;
}): Promise<void> {
  const entryIds = new Set(params.entryIds ?? []);
  const queueContext = captureOpenClawStateWorkerContext({
    env: params.stateDir ? { ...process.env, OPENCLAW_STATE_DIR: params.stateDir } : process.env,
  });
  await drainPendingSessionDeliveries({
    drainKey: `post-compaction-delegate:${params.sessionKey ?? "all"}`,
    logLabel: "post-compaction delegate",
    log: params.log ?? defaultRecoveryLog,
    queueContext,
    deliver: async (entry, { queueContext: deliveryContext }) => {
      if (entry.kind !== "postCompactionDelegate") {
        return;
      }
      await deliverQueuedPostCompactionDelegate(
        { entry, queueContext: deliveryContext },
        params.deliveryDeps,
      );
    },
    selectEntry: (entry) => ({
      match:
        entry.kind === "postCompactionDelegate" &&
        (params.sessionKey == null || entry.sessionKey === params.sessionKey) &&
        (entryIds.size === 0 || entryIds.has(entry.id)),
      bypassBackoff: entryIds.size > 0,
    }),
  });
}

export async function dispatchPostCompactionDelegates(
  params: DispatchPostCompactionDelegatesParams,
  deps: PostCompactionDelegateDispatchDeps = defaultPostCompactionDelegateDispatchDeps,
): Promise<DispatchPostCompactionDelegatesResult> {
  if (isFollowupRunAborted(params.followupRun)) {
    deps.log(
      `[continuation:post-compaction-release-cancelled] sessionKey=${params.sessionKey} phase=pre-dispatch preserved=0`,
    );
    return { queuedDelegates: 0, droppedDelegates: 0 };
  }
  const internalReleaseTraceparent = resolveContinuationTraceparent(params.releaseTraceparent);
  // Queue identity is owner-scoped; a bare session key must not enqueue into a foreign queue.
  const ownerAgentId = deps.resolveSessionAgentId({
    sessionKey: params.sessionKey,
    config: params.cfg,
  });
  // Claims staged custody records `running`. Each claimed record ends below in
  // exactly one outcome: released to the queue with its handoff, requeued, or
  // failed; never another running record of the session.
  const stagedCompactionDelegates = await deps.consumeStagedPostCompactionDelegates(
    params.sessionKey,
  );
  let persistedCompactionDelegates: SessionPostCompactionDelegate[] = [];
  let persistedDelegateLoadError: unknown;
  try {
    persistedCompactionDelegates = await takePendingPostCompactionDelegates({
      sessionEntry: params.sessionEntry,
      sessionStore: params.sessionStore,
      sessionKey: params.sessionKey,
      storePath: params.storePath,
    });
  } catch (err) {
    persistedDelegateLoadError = err;
  }
  const allCompactionDelegates = [
    ...persistedCompactionDelegates,
    ...stagedCompactionDelegates,
  ].map((delegate) => {
    const normalized = applyReleaseTraceparent(
      normalizePostCompactionDelegate(delegate),
      internalReleaseTraceparent,
    );
    if (delegate.flowId) {
      normalized.flowId = delegate.flowId;
    }
    if (delegate.expectedRevision !== undefined) {
      normalized.expectedRevision = delegate.expectedRevision;
    }
    return normalized;
  });
  if (isFollowupRunAborted(params.followupRun)) {
    return preserveCancelledPostCompactionDelegates({
      delegates: allCompactionDelegates,
      deps,
      dispatch: params,
      phase: "delegate-extraction",
    });
  }
  if (persistedDelegateLoadError !== undefined) {
    const message = formatErrorMessage(persistedDelegateLoadError);
    deps.log(`Failed to load post-compaction delegates for ${params.sessionKey}: ${message}`);
    enqueueSystemEventOrLog({
      deps,
      agentId: ownerAgentId,
      label: "persisted post-compaction delegate warning",
      sessionKey: params.sessionKey,
      text:
        `[system:continuation-warning] Failed to load persisted post-compaction delegates for this session: ${message}. ` +
        "Earlier turns may have staged delegates that will not fire. Re-stage critical post-compaction work.",
    });
  }

  let postCompactionContextContent: string | null = null;
  let postCompactionContextError: unknown;
  try {
    postCompactionContextContent = await deps.readPostCompactionContext(
      typeof params.followupRun.run.workspaceDir === "string" &&
        params.followupRun.run.workspaceDir.trim()
        ? params.followupRun.run.workspaceDir
        : deps.resolveAgentWorkspaceDir(params.cfg, params.followupRun.run.agentId),
      {
        cfg: params.cfg,
        agentId: ownerAgentId,
      },
    );
  } catch (err) {
    postCompactionContextError = err;
  }
  if (isFollowupRunAborted(params.followupRun)) {
    return preserveCancelledPostCompactionDelegates({
      delegates: allCompactionDelegates,
      deps,
      dispatch: params,
      phase: "context-loading",
    });
  }
  if (postCompactionContextError !== undefined) {
    const message = formatErrorMessage(postCompactionContextError);
    deps.log(
      `[continuation:post-compaction-context-read-failed] sessionKey=${params.sessionKey} error=${message}`,
    );
    enqueueSystemEventOrLog({
      deps,
      agentId: ownerAgentId,
      label: "post-compaction context read failure",
      sessionKey: params.sessionKey,
      text:
        `[system:post-compaction] Context evacuation read failed: ${message}. ` +
        "The post-compaction session may be missing AGENTS.md/RESUMPTION.md content. Check workspace permissions and re-run if needed.",
    });
  }

  const runtimeConfig = deps.resolveContinuationRuntimeConfig(params.cfg);
  const now = deps.now();
  const freshCompactionDelegates: SessionPostCompactionDelegate[] = [];
  let staleDroppedDelegates = 0;
  for (const delegate of allCompactionDelegates) {
    const { ageMs, stale } = classifyPostCompactionDelegateAge(delegate, now);
    if (stale) {
      staleDroppedDelegates += 1;
      deps.log(
        `Post-compaction delegate dropped as stale for ${params.sessionKey}: ageMs=${ageMs} ttlMs=${POST_COMPACTION_DELEGATE_TTL_MS} firstArmedAt=${delegate.firstArmedAt ?? delegate.createdAt} task=${formatPostCompactionDelegateTaskPreview(delegate.task)}`,
      );
      await terminalizeDroppedDelegate({
        delegate,
        deps,
        summary: formatPostCompactionStaleRejection(ageMs),
      });
      continue;
    }
    freshCompactionDelegates.push(delegate);
  }

  // Enforce maxDelegatesPerTurn budget. Account for any bracket-style delegate
  // already spawned this turn so the combined per-turn count cannot exceed
  // the configured cap. Mirrors the pre-extraction behavior at
  // src/auto-reply/reply/agent-runner.ts (pre-cdc9b6ecd54).
  const { maxDelegatesPerTurn: maxCompactionDelegates } = runtimeConfig;
  const bracketDelegateOffset = params.continuationSignalKind === "delegate" ? 1 : 0;
  const compactionBudget = Math.max(0, maxCompactionDelegates - bracketDelegateOffset);
  const releasedCompactionDelegates = freshCompactionDelegates.slice(0, compactionBudget);
  const overflowDelegates = freshCompactionDelegates.slice(compactionBudget);
  const overflowDroppedDelegates = overflowDelegates.length;
  if (overflowDroppedDelegates > 0) {
    deps.log(
      `Post-compaction delegates dropped for ${params.sessionKey}: ${overflowDroppedDelegates} over maxDelegatesPerTurn budget (${maxCompactionDelegates}, bracketOffset=${bracketDelegateOffset})`,
    );
    for (const delegate of overflowDelegates) {
      await terminalizeDroppedDelegate({
        delegate,
        deps,
        summary: `Post-compaction delegate rejected: maxDelegatesPerTurn exceeded (${maxCompactionDelegates}).`,
      });
    }
  }

  const deliveryContext = resolvePostCompactionDelegateDeliveryContext(params.followupRun);
  if (isFollowupRunAborted(params.followupRun)) {
    return preserveCancelledPostCompactionDelegates({
      delegates: releasedCompactionDelegates,
      deps,
      dispatch: params,
      phase: "enqueue",
    });
  }

  const sourceEntry = params.sessionEntry ?? params.sessionStore?.[params.sessionKey];
  if (!sourceEntry?.sessionId) {
    throw new Error("Post-compaction delegate source session owner is unavailable.");
  }
  const enqueueResults = await Promise.allSettled(
    releasedCompactionDelegates.map(async (delegate, sequence) => {
      const enqueueParams: PostCompactionDelegateEnqueueParams = {
        sessionKey: params.sessionKey,
        sourceSessionId: sourceEntry.sessionId,
        ...(sourceEntry.lifecycleRevision
          ? { sourceLifecycleRevision: sourceEntry.lifecycleRevision }
          : {}),
        delegate,
        sequence,
        compactionCount: params.compactionCount,
        ...(deliveryContext ? { deliveryContext } : {}),
      };
      if (!delegate.flowId) {
        return await deps.enqueuePostCompactionDelegateDelivery(enqueueParams);
      }
      const released = await deps.releasePostCompactionDelegateToQueue(enqueueParams);
      if (!released.released) {
        throw new Error(`post-compaction release not committed: ${released.reason}`);
      }
      return released.entryId;
    }),
  );

  const queuedEntryIds: string[] = [];
  let droppedCompactionDelegates = staleDroppedDelegates + overflowDroppedDelegates;
  for (const [index, result] of enqueueResults.entries()) {
    if (result.status === "fulfilled") {
      queuedEntryIds.push(result.value);
      continue;
    }
    droppedCompactionDelegates += 1;
    const delegate = releasedCompactionDelegates[index];
    if (delegate) {
      params.postCompactionDelegatesToPreserve.push(delegate);
    }
    deps.log(
      `Failed to enqueue post-compaction delegate for ${params.sessionKey} (re-staged): ${String(
        result.reason,
      )}`,
    );
  }

  // A delegate whose release did not commit goes back to staged; the ones
  // released above are already handed off with their queue entries.
  await preservePostCompactionDelegates({ deps, dispatch: params });

  const lifecycleEvent = buildPostCompactionLifecycleEvent({
    compactionCount: params.compactionCount,
    queuedDelegates: queuedEntryIds.length,
    droppedDelegates: droppedCompactionDelegates,
  });
  if (postCompactionContextContent) {
    deps.enqueueSystemEvent(
      postCompactionContextContent,
      withSystemEventOwner({ sessionKey: params.sessionKey }, ownerAgentId),
    );
  }
  deps.enqueueSystemEvent(
    lifecycleEvent,
    withSystemEventOwner(
      {
        sessionKey: params.sessionKey,
        ...(internalReleaseTraceparent ? { traceparent: internalReleaseTraceparent } : {}),
      },
      ownerAgentId,
    ),
  );

  if (queuedEntryIds.length > 0) {
    // Drain unfiltered for this sessionKey: the prior `entryIds`-filtered
    // drain stranded any failed `pending/` entries from earlier turns —
    // they were never re-selected because the filter excluded their ids,
    // and only startup recovery would rescue them. With `entryIds`
    // omitted, `selectEntry` falls back to the sessionKey filter and
    // backoff-eligible failed retries are reconsidered alongside the
    // entries we just enqueued.
    void deps
      .drainPostCompactionDelegateDeliveries({
        log: defaultRecoveryLog,
        sessionKey: params.sessionKey,
      })
      .catch((err: unknown) => {
        deps.log(
          `Failed to drain queued post-compaction delegates for ${params.sessionKey}: ${String(
            err,
          )}`,
        );
      });
  }

  return {
    queuedDelegates: queuedEntryIds.length,
    droppedDelegates: droppedCompactionDelegates,
  };
}
