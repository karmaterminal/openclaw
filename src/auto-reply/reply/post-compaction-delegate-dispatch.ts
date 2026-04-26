import { resolveAgentWorkspaceDir, resolveSessionAgentId } from "../../agents/agent-scope.js";
import { spawnSubagentDirect, type SpawnSubagentResult } from "../../agents/subagent-spawn.js";
import { resolveSessionStoreEntry, updateSessionStore } from "../../config/sessions/store.js";
import type { SessionEntry, SessionPostCompactionDelegate } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
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

export type PostCompactionDelegateSpawn = (
  params: Parameters<typeof spawnSubagentDirect>[0],
  context: Parameters<typeof spawnSubagentDirect>[1],
) => Promise<SpawnSubagentResult>;

export type PostCompactionDelegateDispatchDeps = {
  consumeStagedPostCompactionDelegates(sessionKey: string): SessionPostCompactionDelegate[];
  enqueueSystemEvent(text: string, options: { sessionKey: string }): void;
  log(message: string): void;
  now(): number;
  readPostCompactionContext(
    workspaceDir: string,
    options: { cfg: OpenClawConfig; agentId: string },
  ): Promise<string | null>;
  resolveAgentWorkspaceDir(cfg: OpenClawConfig, agentId: string): string;
  resolveContinuationRuntimeConfig(cfg: OpenClawConfig): ContinuationRuntimeConfig;
  resolveSessionAgentId(params: { sessionKey?: string; config?: OpenClawConfig }): string;
  spawnSubagentDirect: PostCompactionDelegateSpawn;
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
  dispatchedDelegates: number;
  droppedDelegates: number;
  currentChainCount: number;
};

const defaultPostCompactionDelegateDispatchDeps: PostCompactionDelegateDispatchDeps = {
  consumeStagedPostCompactionDelegates,
  enqueueSystemEvent,
  log: (message) => defaultRuntime.log(message),
  now: () => Date.now(),
  readPostCompactionContext,
  resolveAgentWorkspaceDir,
  resolveContinuationRuntimeConfig,
  resolveSessionAgentId,
  spawnSubagentDirect,
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
    params.sessionStore[resolved.normalizedKey] = {
      ...(resolved.existing ?? params.sessionEntry!),
      continuationChainCount: params.count,
      continuationChainStartedAt: params.startedAt,
      continuationChainTokens: params.tokens,
    };
    for (const legacyKey of resolved.legacyKeys) {
      delete params.sessionStore[legacyKey];
    }
  }
  if (params.storePath) {
    try {
      await updateSessionStore(params.storePath, (store) => {
        const resolved = resolveSessionStoreEntry({ store, sessionKey: params.sessionKey });
        if (resolved.existing) {
          store[resolved.normalizedKey] = {
            ...resolved.existing,
            continuationChainCount: params.count,
            continuationChainStartedAt: params.startedAt,
            continuationChainTokens: params.tokens,
          };
          for (const legacyKey of resolved.legacyKeys) {
            delete store[legacyKey];
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
  const {
    maxChainLength: maxCompactionChainLength,
    maxDelegatesPerTurn: maxCompactionDelegates,
    costCapTokens: compactionCostCapTokens,
  } = deps.resolveContinuationRuntimeConfig(params.cfg);
  const bracketDelegateOffset = params.continuationSignalKind === "delegate" ? 1 : 0;
  const compactionBudget = Math.max(0, maxCompactionDelegates - bracketDelegateOffset);
  const releasedCompactionDelegates = allCompactionDelegates.slice(0, compactionBudget);
  let droppedCompactionDelegates = Math.max(
    0,
    allCompactionDelegates.length - releasedCompactionDelegates.length,
  );
  const originalCompactionChainCount = params.sessionEntry?.continuationChainCount ?? 0;
  let currentCompactionChainCount = originalCompactionChainCount;
  const compactionChainStartedAt = params.sessionEntry?.continuationChainStartedAt ?? deps.now();
  const compactionChainTokens = params.sessionEntry?.continuationChainTokens ?? 0;
  let dispatchedCompactionDelegates = 0;

  const workspaceDir =
    typeof params.followupRun.run.workspaceDir === "string" &&
    params.followupRun.run.workspaceDir.trim()
      ? params.followupRun.run.workspaceDir
      : deps.resolveAgentWorkspaceDir(params.cfg, params.followupRun.run.agentId);
  deps
    .readPostCompactionContext(workspaceDir, {
      cfg: params.cfg,
      agentId: deps.resolveSessionAgentId({ sessionKey: params.sessionKey, config: params.cfg }),
    })
    .then((contextContent) => {
      if (contextContent) {
        deps.enqueueSystemEvent(contextContent, { sessionKey: params.sessionKey });
      }
    })
    .catch(() => {
      // Silent failure: post-compaction context is best-effort.
    });

  for (const delegate of releasedCompactionDelegates) {
    if (currentCompactionChainCount >= maxCompactionChainLength) {
      droppedCompactionDelegates += 1;
      deps.log(
        `Post-compaction delegate rejected: chain length ${currentCompactionChainCount} >= ${maxCompactionChainLength} for session ${params.sessionKey}`,
      );
      deps.enqueueSystemEvent(
        `[continuation] Post-compaction delegate rejected: chain length ${maxCompactionChainLength} reached. Task: ${delegate.task}`,
        { sessionKey: params.sessionKey },
      );
      continue;
    }

    if (compactionCostCapTokens > 0 && compactionChainTokens > compactionCostCapTokens) {
      droppedCompactionDelegates += 1;
      deps.log(
        `Post-compaction delegate rejected: cost cap exceeded (${compactionChainTokens} > ${compactionCostCapTokens}) for session ${params.sessionKey}`,
      );
      deps.enqueueSystemEvent(
        `[continuation] Post-compaction delegate rejected: cost cap exceeded (${compactionChainTokens} > ${compactionCostCapTokens}). Task: ${delegate.task}`,
        { sessionKey: params.sessionKey },
      );
      continue;
    }

    const nextCompactionChainCount = currentCompactionChainCount + 1;
    deps.log(
      `Post-compaction delegate dispatch for session ${params.sessionKey}: ${delegate.task}`,
    );
    try {
      const delegateWakeOnReturn = delegate.silentWake ?? true;
      const delegateSilentAnnounce = delegate.silent ?? delegateWakeOnReturn;
      const spawnResult = await deps.spawnSubagentDirect(
        {
          task:
            `[continuation:post-compaction] ` +
            `[continuation:chain-hop:${nextCompactionChainCount}] ` +
            `Compaction just completed. Carry this working state to the post-compaction session: ${delegate.task}`,
          ...(delegateSilentAnnounce ? { silentAnnounce: true } : {}),
          ...(delegateWakeOnReturn ? { silentAnnounce: true, wakeOnReturn: true } : {}),
          drainsContinuationDelegateQueue: true,
        },
        {
          agentSessionKey: params.sessionKey,
          agentChannel: params.followupRun.originatingChannel ?? undefined,
          agentAccountId: params.followupRun.originatingAccountId ?? undefined,
          agentTo: params.followupRun.originatingTo ?? undefined,
          agentThreadId: params.followupRun.originatingThreadId ?? undefined,
        },
      );
      if (spawnResult.status === "accepted") {
        currentCompactionChainCount = nextCompactionChainCount;
        dispatchedCompactionDelegates += 1;
        deps.enqueueSystemEvent(
          `[continuation:compaction-delegate-spawned] Post-compaction shard dispatched: ${delegate.task}`,
          { sessionKey: params.sessionKey },
        );
      } else {
        droppedCompactionDelegates += 1;
        params.postCompactionDelegatesToPreserve.push(delegate);
        deps.log(
          `Post-compaction delegate rejected (${spawnResult.status}) for session ${params.sessionKey} (re-staged)`,
        );
      }
    } catch (err) {
      droppedCompactionDelegates += 1;
      params.postCompactionDelegatesToPreserve.push(delegate);
      deps.log(
        `Post-compaction delegate failed for session ${params.sessionKey} (re-staged): ${String(
          err,
        )}`,
      );
    }
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
      releasedDelegates: dispatchedCompactionDelegates,
      droppedDelegates: droppedCompactionDelegates,
    }),
    { sessionKey: params.sessionKey },
  );

  if (currentCompactionChainCount > originalCompactionChainCount) {
    await persistPostCompactionDelegateChainState({
      count: currentCompactionChainCount,
      log: deps.log,
      sessionEntry: params.sessionEntry,
      sessionKey: params.sessionKey,
      sessionStore: params.sessionStore,
      startedAt: compactionChainStartedAt,
      storePath: params.storePath,
      tokens: compactionChainTokens,
    });
  }

  return {
    dispatchedDelegates: dispatchedCompactionDelegates,
    droppedDelegates: droppedCompactionDelegates,
    currentChainCount: currentCompactionChainCount,
  };
}
