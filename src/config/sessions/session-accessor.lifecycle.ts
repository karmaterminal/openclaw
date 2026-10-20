import path from "node:path";
import { uniqueStrings } from "@openclaw/normalization-core/string-normalization";
import { createLazyRuntimeModule } from "../../shared/lazy-runtime.js";
import { INCOGNITO_AGENT_SQLITE_BASENAME } from "../../state/openclaw-agent-db.paths.js";
import { resolveStateDir } from "../paths.js";
import { isInternalSessionEffectsKey } from "./internal-session-key.js";
import {
  clearPluginHostCleanupTarget,
  hasPluginHostCleanupTarget,
  isLockedHarnessSessionOwnedByPlugin,
  matchesPluginHostCleanupSession,
  shouldSkipPluginHostCleanupStore,
  type PluginHostSessionCleanupStoreParams,
} from "./plugin-host-cleanup.js";
import { patchSessionEntryCore } from "./session-accessor.entry.js";
import { applySessionEntryCanonicalReplacements } from "./session-accessor.sqlite-replacement-projection.js";
import type {
  SessionPatchProjectionSnapshot,
  SessionPatchProjectionTarget,
  SessionPatchProjectionContext,
  SessionPatchProjectionFailure,
  SessionPatchProjectionResult,
} from "./session-accessor.types.js";
import { readSessionEntrySummariesInWorker } from "./session-entry-read-runtime.js";
import {
  resolveProjectionExistingEntry,
  SessionLabelOwnerIndex,
} from "./session-entry-selection.js";

type SqliteLifecycleRuntime = typeof import("./session-accessor.sqlite-lifecycle.js");

const loadSqliteLifecycleRuntime = createLazyRuntimeModule<SqliteLifecycleRuntime>(
  () => import("./session-accessor.sqlite-lifecycle.js"),
);

/**
 * Pins the state owner for one lifecycle call.
 *
 * Must run in the caller's synchronous frame. The lazy runtime load below is an
 * await, so a caller that mutates `OPENCLAW_STATE_DIR` after calling would
 * otherwise redirect work whose owner was already selected — the static import
 * this replaced resolved the owner before any suspension. An explicit
 * incognito sentinel already names its physical root, and pinning ambient
 * state onto it would retarget it, so it passes through unchanged.
 */
function captureLifecycleParams<T extends { env?: NodeJS.ProcessEnv; storePath?: string }>(
  params: T,
): T {
  if (
    !params.env &&
    params.storePath &&
    path.basename(params.storePath) === INCOGNITO_AGENT_SQLITE_BASENAME
  ) {
    return params;
  }
  const env = { ...(params.env ?? process.env) };
  env.OPENCLAW_STATE_DIR = resolveStateDir(env);
  return { ...params, env };
}

// Artifact cleanup moved to its own worker-planned owner; it does not load the
// SQLite lifecycle module, so a static re-export keeps the lazy boundary intact.
export { cleanupSessionLifecycleArtifactsCore } from "./session-accessor.sqlite-artifact-cleanup.js";

export const deleteSessionEntryLifecycle: SqliteLifecycleRuntime["deleteSessionEntryLifecycle"] =
  async (params) => {
    const captured = captureLifecycleParams(params);
    const runtime = await loadSqliteLifecycleRuntime();
    return await runtime.deleteSessionEntryLifecycle(captured);
  };

export const resetSessionEntryLifecycle: SqliteLifecycleRuntime["resetSessionEntryLifecycle"] =
  async (params) => {
    const captured = captureLifecycleParams(params);
    const runtime = await loadSqliteLifecycleRuntime();
    return await runtime.resetSessionEntryLifecycle(captured);
  };

export const rollbackAgentHarnessSessionEntryLifecycle: SqliteLifecycleRuntime["rollbackAgentHarnessSessionEntryLifecycle"] =
  async (params) => {
    const captured = captureLifecycleParams(params);
    const runtime = await loadSqliteLifecycleRuntime();
    return await runtime.rollbackAgentHarnessSessionEntryLifecycle(captured);
  };

export const rollbackPluginOwnedSessionEntryLifecycle: SqliteLifecycleRuntime["rollbackPluginOwnedSessionEntryLifecycle"] =
  async (params) => {
    const captured = captureLifecycleParams(params);
    const runtime = await loadSqliteLifecycleRuntime();
    return await runtime.rollbackPluginOwnedSessionEntryLifecycle(captured);
  };

// Session lifecycle storage is canonical SQLite; projection exports remain on
// their actual transaction owner while row-lifecycle work is loaded on demand.
export {
  applySessionEntryLifecycleMutation,
  applySessionEntryReplacements,
  purgeDeletedAgentSessionEntries,
} from "./session-accessor.sqlite-projection.js";

/** Projects one session patch against its detached store snapshot and commits once. */
export async function applySessionPatchProjection<
  TFailure extends SessionPatchProjectionFailure,
>(params: {
  agentId?: string;
  /** Revalidates request-scoped authorization after projection and before persistence. */
  assertCurrent?: () => void;
  /** Complete key authority for resolvers that can operate on a bounded store view. */
  sessionKeys?: readonly string[];
  storePath: string;
  resolveTarget: (snapshot: SessionPatchProjectionSnapshot) => SessionPatchProjectionTarget;
  project: (
    context: SessionPatchProjectionContext,
  ) => Promise<SessionPatchProjectionResult<TFailure>> | SessionPatchProjectionResult<TFailure>;
}): Promise<SessionPatchProjectionResult<TFailure>> {
  return await applySessionEntryCanonicalReplacements<SessionPatchProjectionResult<TFailure>>({
    agentId: params.agentId,
    sessionKeys: params.sessionKeys,
    storePath: params.storePath,
    skipMaintenance: true,
    update: async (entries) => {
      const workingStore = Object.fromEntries(
        entries.flatMap(({ entry, sessionKey }) =>
          isInternalSessionEffectsKey(sessionKey) ? [] : [[sessionKey, entry] as const],
        ),
      );
      const snapshot = { store: workingStore };
      const labelOwners = new SessionLabelOwnerIndex(workingStore);
      const target = params.resolveTarget(snapshot);
      const existingEntry = resolveProjectionExistingEntry(snapshot, target);
      const candidateKeys = uniqueStrings(
        (target.candidateKeys ?? [target.primaryKey]).map((key) => key.trim()).filter(Boolean),
      );
      const projected = await params.project({
        ...target,
        ...snapshot,
        ...(existingEntry ? { existingEntry } : {}),
        isLabelInUse: (label) => labelOwners.isLabelInUse(label, candidateKeys),
      });
      if (!projected.ok) {
        return { result: projected };
      }
      params.assertCurrent?.();
      const previousSessionKeys = candidateKeys.filter(
        (sessionKey) => sessionKey !== target.primaryKey && workingStore[sessionKey],
      );
      return {
        replacements: [
          { entry: projected.entry, previousSessionKeys, sessionKey: target.primaryKey },
        ],
        result: { ok: true, entry: structuredClone(projected.entry) },
      };
    },
  });
}

/**
 * Clears plugin host-owned state inside one resolved session store.
 * This is an internal transaction-sized boundary for the storage backend, not
 * a Plugin SDK API.
 */
export async function cleanupPluginHostSessionStore(
  params: PluginHostSessionCleanupStoreParams,
): Promise<number> {
  if (
    shouldSkipPluginHostCleanupStore(params) ||
    (params.shouldCleanup && !params.shouldCleanup())
  ) {
    return 0;
  }
  const now = Date.now();
  const cleanupRevoked = new Error("Plugin session cleanup is no longer current");
  let cleared = 0;
  for (const { entry, sessionKey } of await readSessionEntrySummariesInWorker({
    agentId: params.agentId,
    storePath: params.storePath,
    cleanupSession: params.sessionKey,
  })) {
    if (isLockedHarnessSessionOwnedByPlugin(entry, params.preserveLockedHarnessIds)) {
      continue;
    }
    if (!hasPluginHostCleanupTarget(entry, params)) {
      continue;
    }
    if (params.shouldCleanup && !params.shouldCleanup()) {
      break;
    }
    await patchSessionEntryCore(
      { agentId: params.agentId, sessionKey, storePath: params.storePath },
      (currentEntry) => {
        if (isLockedHarnessSessionOwnedByPlugin(currentEntry, params.preserveLockedHarnessIds)) {
          return null;
        }
        if (
          !matchesPluginHostCleanupSession(sessionKey, currentEntry, params.sessionKey) ||
          !hasPluginHostCleanupTarget(currentEntry, params)
        ) {
          return null;
        }
        clearPluginHostCleanupTarget(currentEntry, params);
        currentEntry.updatedAt = now;
        return currentEntry;
      },
      {
        workerGuard: {
          assertCurrent: () => {
            if (params.shouldCleanup?.() === false) {
              throw cleanupRevoked;
            }
          },
        },
        onCommitted: () => {
          cleared += 1;
        },
        replaceEntry: true,
        skipMaintenance: true,
      },
    ).catch((error: unknown) => {
      if (error !== cleanupRevoked) {
        throw error;
      }
    });
  }
  return cleared;
}
