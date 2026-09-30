/**
 * Subagent session-store reconciliation.
 *
 * Infers child completion from persisted session entries when registry updates arrive late.
 */
import { asFiniteNumber } from "@openclaw/normalization-core/number-coercion";
import { getRuntimeConfig } from "../../../config/config.js";
import {
  resolveAgentIdFromSessionKey,
  resolveSessionStorePathCore,
  type InternalSessionEntry as SessionEntry,
} from "../../../config/sessions.js";
import { loadSessionEntryReadOnly } from "../../../config/sessions/session-accessor.js";
import { withSessionEntryReadOnlyInWorker } from "../../../config/sessions/session-entry-read-runtime.js";
import { normalizeStoreSessionKey } from "../../../config/sessions/store-entry.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { getAgentRunContext, listAgentRunsForSession } from "../../../infra/agent-run-registry.js";
import { withExistingOpenClawStateDatabaseCurrentReadOnly } from "../../../state/openclaw-state-db-readonly.js";
import type { SubagentRunOutcome } from "../subagent-run-outcome.types.js";
import { hasRetainedRequiredCompletionDelivery } from "./subagent-delivery-state.js";
import {
  SUBAGENT_ENDED_REASON_COMPLETE,
  SUBAGENT_ENDED_REASON_ERROR,
  SUBAGENT_ENDED_REASON_KILLED,
  type SubagentLifecycleEndedReason,
} from "./subagent-lifecycle-events.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import { hasSubagentSessionOwnerInDatabase } from "./subagent-registry.store.sqlite.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { isStaleUnendedSubagentRun } from "./subagent-run-liveness.js";

export type SubagentSessionStoreCache = Map<string, Record<string, SessionEntry>>;
export type SubagentRunOrphanReason =
  | "missing-session-entry"
  | "missing-session-id"
  | "stale-unended-run";

/** Completion inferred from the child session store. */
export type SubagentSessionCompletion = {
  startedAt?: number;
  endedAt: number;
  outcome: SubagentRunOutcome;
  reason: SubagentLifecycleEndedReason;
};

function terminalSessionTimestamp(sessionEntry: SessionEntry | undefined): number | undefined {
  return asFiniteNumber(sessionEntry?.endedAt) ?? asFiniteNumber(sessionEntry?.updatedAt);
}

function isFreshForRun(
  sessionEntry: SessionEntry | undefined,
  notBeforeMs: number | undefined,
): boolean {
  if (notBeforeMs === undefined) {
    return true;
  }
  const terminalAt = terminalSessionTimestamp(sessionEntry);
  return terminalAt !== undefined && terminalAt >= notBeforeMs;
}

function freshSessionStartedAt(
  sessionEntry: SessionEntry | undefined,
  notBeforeMs: number | undefined,
): number | undefined {
  const startedAt = asFiniteNumber(sessionEntry?.startedAt);
  if (startedAt === undefined) {
    return undefined;
  }
  return notBeforeMs === undefined || startedAt >= notBeforeMs ? startedAt : undefined;
}

/** Load a child session entry using the agent-specific session store path. */
export function loadSubagentSessionEntry(params: {
  childSessionKey: string;
  storeCache?: SubagentSessionStoreCache;
  cfg?: OpenClawConfig;
}): SessionEntry | undefined {
  const key = params.childSessionKey.trim();
  if (!key) {
    return undefined;
  }
  const agentId = resolveAgentIdFromSessionKey(key);
  const cfg = params.cfg ?? getRuntimeConfig();
  const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId });
  const normalizedKey = normalizeStoreSessionKey(key);
  const store = params.storeCache?.get(storePath);
  const cached = store?.[key] ?? store?.[normalizedKey];
  if (cached) {
    return cached;
  }
  const entry = loadSessionEntryReadOnly({
    agentId,
    storePath,
    sessionKey: key,
    clone: false,
  });
  if (entry && params.storeCache) {
    const nextStore = store ?? {};
    nextStore[key] = entry;
    nextStore[normalizedKey] = entry;
    params.storeCache.set(storePath, nextStore);
  }
  return entry;
}

/** Resolve a child session entry without depending on the file-backed store shape. */
function loadSubagentSessionEntryForAccessor(params: {
  childSessionKey: string;
  cfg?: OpenClawConfig;
}): SessionEntry | undefined {
  const key = params.childSessionKey.trim();
  if (!key) {
    return undefined;
  }
  const agentId = resolveAgentIdFromSessionKey(key);
  const cfg = params.cfg ?? getRuntimeConfig();
  const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId });
  return loadSessionEntryReadOnly({
    agentId,
    storePath,
    sessionKey: key,
    clone: false,
  });
}

/** Resolves whether a registry row is orphaned from its child session entry. */
export function resolveSubagentRunOrphanReason(params: {
  entry: SubagentRunRecord;
  includeStaleUnended?: boolean;
  now?: number;
  cfg?: OpenClawConfig;
}): SubagentRunOrphanReason | null {
  const { entry } = params;
  // Execution, recovery, and completion obligations outlive individual turns.
  // Missing session metadata must not steal those owners or manufacture success.
  if (
    entry.execution.outcome ||
    entry.collectorCompletion ||
    entry.requesterSettleWake ||
    hasRetainedRequiredCompletionDelivery(entry) ||
    entry.pauseReason ||
    entry.killIntent ||
    entry.killReconciliation ||
    entry.execution.restartRecovery ||
    entry.terminalOwner === "interrupted-recovery" ||
    entry.suppressAnnounceReason === "steer-restart" ||
    entry.execution.status === "queued" ||
    getAgentRunContext(entry.runId)
  ) {
    return null;
  }
  const childSessionKey = entry.childSessionKey?.trim();
  if (!childSessionKey) {
    return "missing-session-entry";
  }
  try {
    const sessionEntry = loadSubagentSessionEntryForAccessor({
      childSessionKey,
      cfg: params.cfg,
    });
    if (!sessionEntry) {
      return "missing-session-entry";
    }
    if (typeof sessionEntry.sessionId !== "string" || !sessionEntry.sessionId.trim()) {
      return "missing-session-id";
    }
    if (
      params.includeStaleUnended === true &&
      sessionEntry.abortedLastRun !== true &&
      entry.execution.status !== "interrupted" &&
      isStaleUnendedSubagentRun(entry, params.now)
    ) {
      return "stale-unended-run";
    }
    return null;
  } catch {
    // A failed read cannot establish orphanhood or authorize terminal settlement.
    return null;
  }
}

/** Convert persisted session status into a subagent completion outcome. */
export function resolveCompletionFromSessionEntry(
  sessionEntry: SessionEntry | undefined,
  fallbackEndedAt: number,
  opts?: { notBeforeMs?: number },
): SubagentSessionCompletion | null {
  const status = sessionEntry?.status;
  // Startup interruption has no terminal event timestamp and cannot settle the registry.
  if (
    status === "running" ||
    status === "interrupted" ||
    !isFreshForRun(sessionEntry, opts?.notBeforeMs)
  ) {
    return null;
  }
  let outcome: SubagentRunOutcome;
  let reason: SubagentLifecycleEndedReason = SUBAGENT_ENDED_REASON_COMPLETE;
  switch (status) {
    case "failed":
      outcome = { status: "error", error: "session completed before registry settled" };
      reason = SUBAGENT_ENDED_REASON_ERROR;
      break;
    case "killed":
      outcome = { status: "error", error: "subagent run terminated" };
      reason = SUBAGENT_ENDED_REASON_KILLED;
      break;
    case "timeout":
      outcome = { status: "timeout" };
      break;
    default:
      if (status !== "done" && typeof sessionEntry?.endedAt !== "number") {
        return null;
      }
      outcome = { status: "ok" };
  }
  return {
    startedAt: freshSessionStartedAt(sessionEntry, opts?.notBeforeMs),
    endedAt: terminalSessionTimestamp(sessionEntry) ?? fallbackEndedAt,
    outcome,
    reason,
  };
}

/** Resolve child completion by reading its persisted session entry. */
export async function resolveSubagentSessionCompletion(params: {
  childSessionKey: string;
  fallbackEndedAt: number;
  notBeforeMs?: number;
  storeCache?: SubagentSessionStoreCache;
  cfg?: OpenClawConfig;
  assertCurrent?: () => void;
}): Promise<SubagentSessionCompletion | null> {
  return withSubagentSessionEntry(params, (entry) =>
    resolveCompletionFromSessionEntry(entry, params.fallbackEndedAt, {
      notBeforeMs: params.notBeforeMs,
    }),
  );
}

async function withSubagentSessionEntry<T>(
  params: {
    childSessionKey: string;
    storeCache?: SubagentSessionStoreCache;
    cfg?: OpenClawConfig;
    assertCurrent?: () => void;
  },
  consume: (entry: SessionEntry | undefined) => T,
): Promise<T> {
  const agentId = resolveAgentIdFromSessionKey(params.childSessionKey);
  const cfg = params.cfg ?? getRuntimeConfig();
  const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId });
  // A sweep-scoped cache already holds this pass's entry; reuse it instead of a second read.
  const cachedStore = params.storeCache?.get(storePath);
  const cacheKey = params.childSessionKey.trim();
  const cached = cachedStore?.[cacheKey] ?? cachedStore?.[normalizeStoreSessionKey(cacheKey)];
  if (cached) {
    params.assertCurrent?.();
    return consume(cached);
  }
  return withSessionEntryReadOnlyInWorker(
    { agentId, storePath, sessionKey: params.childSessionKey },
    () => params.assertCurrent?.(),
    async (read) => {
      if (!read.ok) {
        throw read.error;
      }
      return consume(read.value);
    },
  );
}

/** Resolve a fresh child session start time for lifecycle reconciliation. */
export async function resolveSubagentSessionStartedAt(params: {
  childSessionKey: string;
  notBeforeMs?: number;
  storeCache?: SubagentSessionStoreCache;
  cfg?: OpenClawConfig;
  assertCurrent?: () => void;
}): Promise<number | undefined> {
  return withSubagentSessionEntry(params, (entry) =>
    isFreshForRun(entry, params.notBeforeMs)
      ? freshSessionStartedAt(entry, params.notBeforeMs)
      : undefined,
  );
}

/** Startup may only settle session-only rows; any run/task generation retains ownership. */
export function hasSubagentSessionRecoveryOwner(params: {
  sessionKey: string;
  sessionId: string;
  env: NodeJS.ProcessEnv;
}): boolean {
  const key = params.sessionKey;
  if (listAgentRunsForSession(params).length > 0) {
    return true;
  }
  for (const run of subagentRuns.values()) {
    if (
      run.childSessionKey === key ||
      run.requesterSessionKey === key ||
      run.controllerSessionKey === key
    ) {
      return true;
    }
  }
  // Failed or incompatible reads propagate: unknown ownership never authorizes mutation.
  return (
    withExistingOpenClawStateDatabaseCurrentReadOnly(
      (database) => hasSubagentSessionOwnerInDatabase(database, key),
      { env: params.env },
    ) ?? false
  );
}
