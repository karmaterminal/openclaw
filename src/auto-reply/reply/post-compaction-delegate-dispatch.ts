import { resolveAgentWorkspaceDir, resolveSessionAgentId } from "../../agents/agent-scope.js";
import {
  spawnSubagentDirect,
  type SpawnSubagentContext,
  type SpawnSubagentParams,
  type SpawnSubagentResult,
} from "../../agents/subagent-spawn.js";
import { loadConfig } from "../../config/config.js";
import { resolveStorePath } from "../../config/sessions/paths.js";
import { loadSessionStore } from "../../config/sessions/store-load.js";
import { resolveSessionStoreEntry, updateSessionStore } from "../../config/sessions/store.js";
import type { SessionEntry, SessionPostCompactionDelegate } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  drainPendingSessionDeliveries,
  type SessionDeliveryRecoveryLogger,
} from "../../infra/session-delivery-queue-recovery.js";
import {
  enqueuePostCompactionDelegateDelivery,
  type QueuedSessionDelivery,
  type SessionDeliveryContext,
} from "../../infra/session-delivery-queue-storage.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { defaultRuntime } from "../../runtime.js";
import { consumeStagedPostCompactionDelegates } from "../continuation-delegate-store.js";
import type { ContinuationSignal } from "../tokens.js";
import {
  resolveContinuationRuntimeConfig,
  type ContinuationRuntimeConfig,
} from "./continuation-runtime.js";
import { readPostCompactionContext } from "./post-compaction-context.js";
import type { FollowupRun } from "./queue/types.js";

export type QueuedPostCompactionDelegateDelivery = Extract<
  QueuedSessionDelivery,
  { kind: "postCompactionDelegate" }
>;

export type PostCompactionDelegateSpawn = (
  params: SpawnSubagentParams,
  context: SpawnSubagentContext,
) => Promise<SpawnSubagentResult>;

export type PostCompactionDelegateDeliveryDeps = {
  enqueueSystemEvent(text: string, options: { sessionKey: string }): void;
  loadConfig(): OpenClawConfig;
  loadSessionStore(storePath: string): Record<string, SessionEntry>;
  log(message: string): void;
  now(): number;
  resolveContinuationRuntimeConfig(cfg: OpenClawConfig): ContinuationRuntimeConfig;
  resolveSessionAgentId(params: { sessionKey?: string; config?: OpenClawConfig }): string;
  resolveStorePath(store?: string, opts?: { agentId?: string; env?: NodeJS.ProcessEnv }): string;
  spawnSubagentDirect: PostCompactionDelegateSpawn;
};

export type PostCompactionDelegateDispatchDeps = {
  consumeStagedPostCompactionDelegates(sessionKey: string): SessionPostCompactionDelegate[];
  drainPostCompactionDelegateDeliveries(params: {
    entryIds: readonly string[];
    log: SessionDeliveryRecoveryLogger;
    sessionKey: string;
  }): Promise<void>;
  enqueuePostCompactionDelegateDelivery(params: {
    sessionKey: string;
    delegate: SessionPostCompactionDelegate;
    sequence: number;
    compactionCount?: number;
    deliveryContext?: SessionDeliveryContext;
  }): Promise<string>;
  enqueueSystemEvent(text: string, options: { sessionKey: string }): void;
  log(message: string): void;
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

const defaultPostCompactionDelegateDeliveryDeps: PostCompactionDelegateDeliveryDeps = {
  enqueueSystemEvent,
  loadConfig,
  loadSessionStore,
  log: (message) => defaultRuntime.log(message),
  now: () => Date.now(),
  resolveContinuationRuntimeConfig,
  resolveSessionAgentId,
  resolveStorePath,
  spawnSubagentDirect,
};

const defaultPostCompactionDelegateDispatchDeps: PostCompactionDelegateDispatchDeps = {
  consumeStagedPostCompactionDelegates,
  drainPostCompactionDelegateDeliveries,
  enqueuePostCompactionDelegateDelivery,
  enqueueSystemEvent,
  log: (message) => defaultRuntime.log(message),
  readPostCompactionContext,
  resolveAgentWorkspaceDir,
  resolveContinuationRuntimeConfig,
  resolveSessionAgentId,
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
  if (params.sessionStore?.[params.sessionKey]) {
    params.sessionStore[params.sessionKey] = {
      ...params.sessionStore[params.sessionKey],
      pendingPostCompactionDelegates: params.delegates,
    };
  }
}

export function normalizePostCompactionDelegate(
  delegate: SessionPostCompactionDelegate,
): SessionPostCompactionDelegate {
  const legacySilentWake = delegate.silent == null && delegate.silentWake == null;
  const silentWake = legacySilentWake ? true : delegate.silentWake === true;
  const silent = legacySilentWake ? true : delegate.silent === true || silentWake;

  return {
    task: delegate.task,
    createdAt: delegate.createdAt,
    ...(delegate.silent != null || legacySilentWake ? { silent } : {}),
    ...(delegate.silentWake != null || legacySilentWake ? { silentWake } : {}),
  };
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

  const persisted = await updateSessionStore(params.storePath, (store) => {
    const resolved = resolveSessionStoreEntry({ store, sessionKey: params.sessionKey });
    const current =
      resolved.existing ??
      params.sessionStore?.[params.sessionKey] ??
      params.sessionEntry ??
      undefined;
    const combined = [
      ...(current?.pendingPostCompactionDelegates ?? []).map(normalizePostCompactionDelegate),
      ...normalizedDelegates,
    ];
    if (current) {
      store[resolved.normalizedKey] = {
        ...current,
        pendingPostCompactionDelegates: combined,
      };
      for (const legacyKey of resolved.legacyKeys) {
        delete store[legacyKey];
      }
    }
    return combined;
  });

  syncPendingPostCompactionDelegates({
    sessionEntry: params.sessionEntry,
    sessionStore: params.sessionStore,
    sessionKey: params.sessionKey,
    delegates: persisted.length > 0 ? persisted : combinedLocal,
  });
  return persisted.length > 0 ? persisted : combinedLocal;
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

  const persisted = await updateSessionStore(params.storePath, (store) => {
    const resolved = resolveSessionStoreEntry({ store, sessionKey: params.sessionKey });
    const current =
      resolved.existing ??
      params.sessionStore?.[params.sessionKey] ??
      params.sessionEntry ??
      undefined;
    const delegates = (current?.pendingPostCompactionDelegates ?? []).map(
      normalizePostCompactionDelegate,
    );
    if (current && delegates.length > 0) {
      store[resolved.normalizedKey] = {
        ...current,
        pendingPostCompactionDelegates: undefined,
      };
      for (const legacyKey of resolved.legacyKeys) {
        delete store[legacyKey];
      }
    }
    return delegates;
  });

  syncPendingPostCompactionDelegates({
    sessionEntry: params.sessionEntry,
    sessionStore: params.sessionStore,
    sessionKey: params.sessionKey,
    delegates: undefined,
  });
  return persisted.length > 0 ? persisted : localDelegates;
}

export function buildPostCompactionLifecycleEvent(params: {
  compactionCount?: number;
  releasedDelegates: number;
  droppedDelegates: number;
}): string {
  const parts = [
    `[system:post-compaction] Session compacted at ${new Date().toISOString()}.`,
    typeof params.compactionCount === "number"
      ? `Compaction count: ${params.compactionCount}.`
      : undefined,
    `Released ${params.releasedDelegates} post-compaction delegate(s) into the fresh session.`,
    params.droppedDelegates > 0
      ? `${params.droppedDelegates} delegate(s) were not released into the fresh session.`
      : undefined,
  ].filter(Boolean);
  return parts.join(" ");
}

async function persistPostCompactionDelegateChainState(params: {
  count: number;
  log: (message: string) => void;
  sessionEntry?: SessionEntry;
  sessionKey: string;
  sessionStore?: Record<string, SessionEntry>;
  startedAt: number;
  storePath?: string;
  tokens: number;
}): Promise<void> {
  if (params.sessionEntry) {
    params.sessionEntry.continuationChainCount = params.count;
    params.sessionEntry.continuationChainStartedAt = params.startedAt;
    params.sessionEntry.continuationChainTokens = params.tokens;
  }
  if (params.sessionStore) {
    const resolved = resolveSessionStoreEntry({
      store: params.sessionStore,
      sessionKey: params.sessionKey,
    });
    const existingEntry =
      resolved.existing ?? params.sessionStore[params.sessionKey] ?? params.sessionEntry;
    if (existingEntry) {
      params.sessionStore[resolved.normalizedKey] = {
        ...existingEntry,
        continuationChainCount: params.count,
        continuationChainStartedAt: params.startedAt,
        continuationChainTokens: params.tokens,
      };
      for (const legacyKey of resolved.legacyKeys) {
        delete params.sessionStore[legacyKey];
      }
    }
  }
  if (params.storePath) {
    try {
      await updateSessionStore(params.storePath, (store) => {
        const resolved = resolveSessionStoreEntry({ store, sessionKey: params.sessionKey });
        const existingEntry = resolved.existing ?? store[params.sessionKey];
        if (existingEntry) {
          store[resolved.existing ? resolved.normalizedKey : params.sessionKey] = {
            ...existingEntry,
            continuationChainCount: params.count,
            continuationChainStartedAt: params.startedAt,
            continuationChainTokens: params.tokens,
          };
          if (resolved.existing) {
            for (const legacyKey of resolved.legacyKeys) {
              delete store[legacyKey];
            }
          }
        }
      });
    } catch (err) {
      params.log(
        `Failed to persist post-compaction delegate chain state for ${params.sessionKey}: ${String(
          err,
        )}`,
      );
    }
  }
}

function resolvePostCompactionDeliveryContext(
  followupRun: FollowupRun,
): SessionDeliveryContext | undefined {
  const deliveryContext: SessionDeliveryContext = {
    ...(followupRun.originatingChannel ? { channel: followupRun.originatingChannel } : {}),
    ...(followupRun.originatingTo ? { to: followupRun.originatingTo } : {}),
    ...(followupRun.originatingAccountId ? { accountId: followupRun.originatingAccountId } : {}),
    ...(followupRun.originatingThreadId != null
      ? { threadId: followupRun.originatingThreadId }
      : {}),
  };
  return Object.keys(deliveryContext).length > 0 ? deliveryContext : undefined;
}

function isPostCompactionDelegateEntry(
  entry: QueuedSessionDelivery,
): entry is QueuedPostCompactionDelegateDelivery {
  return entry.kind === "postCompactionDelegate";
}

export async function deliverQueuedPostCompactionDelegate(
  params: {
    entry: QueuedPostCompactionDelegateDelivery;
  },
  deps: PostCompactionDelegateDeliveryDeps = defaultPostCompactionDelegateDeliveryDeps,
): Promise<void> {
  const cfg = deps.loadConfig();
  const agentId = deps.resolveSessionAgentId({
    sessionKey: params.entry.sessionKey,
    config: cfg,
  });
  const storePath = deps.resolveStorePath(cfg.session?.store, { agentId });
  const sessionStore = deps.loadSessionStore(storePath);
  const resolved = resolveSessionStoreEntry({
    store: sessionStore,
    sessionKey: params.entry.sessionKey,
  });
  const sessionEntry = resolved.existing ?? sessionStore[params.entry.sessionKey];
  const { maxChainLength: maxCompactionChainLength, costCapTokens: compactionCostCapTokens } =
    deps.resolveContinuationRuntimeConfig(cfg);
  const currentCompactionChainCount = sessionEntry?.continuationChainCount ?? 0;
  const compactionChainTokens = sessionEntry?.continuationChainTokens ?? 0;

  if (currentCompactionChainCount >= maxCompactionChainLength) {
    deps.log(
      `Post-compaction delegate rejected: chain length ${currentCompactionChainCount} >= ${maxCompactionChainLength} for session ${params.entry.sessionKey}`,
    );
    deps.enqueueSystemEvent(
      `[continuation] Post-compaction delegate rejected: chain length ${maxCompactionChainLength} reached. Task: ${params.entry.task}`,
      { sessionKey: params.entry.sessionKey },
    );
    return;
  }

  if (compactionCostCapTokens > 0 && compactionChainTokens > compactionCostCapTokens) {
    deps.log(
      `Post-compaction delegate rejected: cost cap exceeded (${compactionChainTokens} > ${compactionCostCapTokens}) for session ${params.entry.sessionKey}`,
    );
    deps.enqueueSystemEvent(
      `[continuation] Post-compaction delegate rejected: cost cap exceeded (${compactionChainTokens} > ${compactionCostCapTokens}). Task: ${params.entry.task}`,
      { sessionKey: params.entry.sessionKey },
    );
    return;
  }

  const nextCompactionChainCount = currentCompactionChainCount + 1;
  deps.log(
    `Post-compaction delegate dispatch for session ${params.entry.sessionKey}: ${params.entry.task}`,
  );
  const delegateWakeOnReturn = params.entry.silentWake ?? true;
  const delegateSilentAnnounce = params.entry.silent ?? delegateWakeOnReturn;
  const spawnResult = await deps.spawnSubagentDirect(
    {
      task:
        `[continuation:post-compaction] ` +
        `[continuation:chain-hop:${nextCompactionChainCount}] ` +
        `Compaction just completed. Carry this working state to the post-compaction session: ${params.entry.task}`,
      ...(delegateSilentAnnounce ? { silentAnnounce: true } : {}),
      ...(delegateWakeOnReturn ? { silentAnnounce: true, wakeOnReturn: true } : {}),
      drainsContinuationDelegateQueue: true,
    },
    {
      agentSessionKey: params.entry.sessionKey,
      agentChannel: params.entry.deliveryContext?.channel,
      agentAccountId: params.entry.deliveryContext?.accountId,
      agentTo: params.entry.deliveryContext?.to,
      agentThreadId: params.entry.deliveryContext?.threadId,
    },
  );
  if (spawnResult.status !== "accepted") {
    throw new Error(`post-compaction delegate spawn ${spawnResult.status}`);
  }

  deps.enqueueSystemEvent(
    `[continuation:compaction-delegate-spawned] Post-compaction shard dispatched: ${params.entry.task}`,
    { sessionKey: params.entry.sessionKey },
  );
  await persistPostCompactionDelegateChainState({
    count: nextCompactionChainCount,
    log: (message) => deps.log(message),
    sessionEntry,
    sessionKey: params.entry.sessionKey,
    sessionStore,
    startedAt: sessionEntry?.continuationChainStartedAt ?? deps.now(),
    storePath,
    tokens: compactionChainTokens,
  });
}

export async function drainPostCompactionDelegateDeliveries(params: {
  entryIds?: readonly string[];
  log?: SessionDeliveryRecoveryLogger;
  sessionKey?: string;
  stateDir?: string;
  deliveryDeps?: PostCompactionDelegateDeliveryDeps;
}): Promise<void> {
  const entryIds = new Set(params.entryIds ?? []);
  await drainPendingSessionDeliveries({
    drainKey: `post-compaction-delegate:${params.sessionKey ?? "all"}`,
    logLabel: "post-compaction delegate",
    log: params.log ?? defaultRecoveryLog,
    stateDir: params.stateDir,
    deliver: async (entry) => {
      if (!isPostCompactionDelegateEntry(entry)) {
        return;
      }
      await deliverQueuedPostCompactionDelegate({ entry }, params.deliveryDeps);
    },
    selectEntry: (entry) => ({
      match:
        isPostCompactionDelegateEntry(entry) &&
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
  const stagedCompactionDelegates = deps.consumeStagedPostCompactionDelegates(params.sessionKey);
  let persistedCompactionDelegates: SessionPostCompactionDelegate[] = [];
  try {
    persistedCompactionDelegates = await takePendingPostCompactionDelegates({
      sessionEntry: params.sessionEntry,
      sessionStore: params.sessionStore,
      sessionKey: params.sessionKey,
      storePath: params.storePath,
    });
  } catch (err) {
    deps.log(`Failed to load post-compaction delegates for ${params.sessionKey}: ${String(err)}`);
  }
  const allCompactionDelegates = [
    ...persistedCompactionDelegates,
    ...stagedCompactionDelegates,
  ].map(normalizePostCompactionDelegate);

  // Enforce maxDelegatesPerTurn budget. Account for any bracket-style delegate
  // already spawned this turn so the combined per-turn count cannot exceed
  // the configured cap. Mirrors the pre-extraction behavior at
  // src/auto-reply/reply/agent-runner.ts (pre-cdc9b6ecd54).
  const { maxDelegatesPerTurn: maxCompactionDelegates } = deps.resolveContinuationRuntimeConfig(
    params.cfg,
  );
  const bracketDelegateOffset = params.continuationSignalKind === "delegate" ? 1 : 0;
  const compactionBudget = Math.max(0, maxCompactionDelegates - bracketDelegateOffset);
  const releasedCompactionDelegates = allCompactionDelegates.slice(0, compactionBudget);
  const overflowDroppedDelegates = Math.max(
    0,
    allCompactionDelegates.length - releasedCompactionDelegates.length,
  );
  if (overflowDroppedDelegates > 0) {
    deps.log(
      `Post-compaction delegates dropped for ${params.sessionKey}: ${overflowDroppedDelegates} over maxDelegatesPerTurn budget (${maxCompactionDelegates}, bracketOffset=${bracketDelegateOffset})`,
    );
  }

  deps
    .readPostCompactionContext(
      typeof params.followupRun.run.workspaceDir === "string" &&
        params.followupRun.run.workspaceDir.trim()
        ? params.followupRun.run.workspaceDir
        : deps.resolveAgentWorkspaceDir(params.cfg, params.followupRun.run.agentId),
      {
        cfg: params.cfg,
        agentId: deps.resolveSessionAgentId({ sessionKey: params.sessionKey, config: params.cfg }),
      },
    )
    .then((contextContent) => {
      if (contextContent) {
        deps.enqueueSystemEvent(contextContent, { sessionKey: params.sessionKey });
      }
    })
    .catch(() => {
      // Silent failure: post-compaction context is best-effort.
    });

  const deliveryContext = resolvePostCompactionDeliveryContext(params.followupRun);
  const enqueueResults = await Promise.allSettled(
    releasedCompactionDelegates.map((delegate, sequence) =>
      deps.enqueuePostCompactionDelegateDelivery({
        sessionKey: params.sessionKey,
        delegate,
        sequence,
        compactionCount: params.compactionCount,
        ...(deliveryContext ? { deliveryContext } : {}),
      }),
    ),
  );

  const queuedEntryIds: string[] = [];
  let droppedCompactionDelegates = overflowDroppedDelegates;
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

  if (params.postCompactionDelegatesToPreserve.length > 0) {
    try {
      await persistPendingPostCompactionDelegates({
        sessionEntry: params.sessionEntry,
        sessionStore: params.sessionStore,
        sessionKey: params.sessionKey,
        storePath: params.storePath,
        delegates: params.postCompactionDelegatesToPreserve,
      });
      params.postCompactionDelegatesToPreserve.length = 0;
    } catch (err) {
      deps.log(
        `Failed to persist re-staged post-compaction delegates for ${params.sessionKey} (${params.postCompactionDelegatesToPreserve.length}): ${String(
          err,
        )}`,
      );
    }
  }

  deps.enqueueSystemEvent(
    buildPostCompactionLifecycleEvent({
      compactionCount: params.compactionCount,
      releasedDelegates: queuedEntryIds.length,
      droppedDelegates: droppedCompactionDelegates,
    }),
    { sessionKey: params.sessionKey },
  );

  if (queuedEntryIds.length > 0) {
    void deps
      .drainPostCompactionDelegateDeliveries({
        entryIds: queuedEntryIds,
        log: defaultRecoveryLog,
        sessionKey: params.sessionKey,
      })
      .catch((err) => {
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
