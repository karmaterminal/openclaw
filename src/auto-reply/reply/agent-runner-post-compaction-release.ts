import { resolveContextTokensForModel } from "../../agents/context.js";
import type { EmbeddedAgentCompactResult } from "../../agents/embedded-agent-runner/types.js";
import {
  SESSION_TOTAL_TOKENS_VERSION,
  resolveFreshSessionTotalTokens,
  resolveSessionTotalTokens,
  type SessionEntry,
  type SessionPostCompactionDelegate,
} from "../../config/sessions.js";
import { resolveSessionEntryFromStore } from "../../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { logVerbose } from "../../globals.js";
import { stagePostCompactionDelegate } from "../continuation/delegate-store-post-compaction.js";
import type { FollowupRun } from "./queue.js";

export async function releaseQueuedCompactionCompletion(params: {
  activeSessionStore?: Record<string, SessionEntry>;
  compactionResult: EmbeddedAgentCompactResult;
  followupRun: FollowupRun;
  getActiveSessionEntry: () => SessionEntry | undefined;
  sessionKey?: string;
  storePath?: string;
  traceparent?: string;
}): Promise<void> {
  if (!params.compactionResult.ok || !params.compactionResult.compacted) {
    return;
  }
  if (!params.sessionKey || !params.activeSessionStore) {
    logVerbose(
      `[request_compaction:post-compaction-release-skipped] session=${params.sessionKey ?? "none"} reason=session-store-unavailable`,
    );
    return;
  }
  const sessionEntry =
    params.getActiveSessionEntry() ?? params.activeSessionStore[params.sessionKey];
  if (!sessionEntry) {
    logVerbose(
      `[request_compaction:post-compaction-release-skipped] session=${params.sessionKey} reason=session-entry-unavailable`,
    );
    return;
  }

  const { incrementCompactionCount } = await import("./session-updates.js");
  const compactionId = await incrementCompactionCount({
    agentId: params.followupRun.run.agentId,
    sessionEntry,
    sessionStore: params.activeSessionStore,
    sessionKey: params.sessionKey,
    storePath: params.storePath,
    amount: 1,
    tokensAfter: params.compactionResult.result?.tokensAfter,
    newSessionId: params.compactionResult.result?.sessionId,
  });
  const resolved = resolveSessionEntryFromStore({
    store: params.activeSessionStore,
    sessionKey: params.sessionKey,
  });
  await releasePostCompactionDelegatesAfterCompaction({
    activeSessionStore: params.activeSessionStore,
    compactionCount: compactionId,
    followupRun: params.followupRun,
    sessionEntry: resolved.existing ?? sessionEntry,
    sessionKey: params.sessionKey,
    storePath: params.storePath,
    traceparent: params.traceparent,
  });
}

export async function releasePostCompactionDelegatesAfterCompaction(params: {
  activeSessionStore: Record<string, SessionEntry>;
  compactionCount: number | undefined;
  followupRun: FollowupRun;
  sessionEntry: SessionEntry;
  sessionKey: string;
  storePath?: string;
  traceparent?: string;
}): Promise<void> {
  const { dispatchPostCompactionDelegates } =
    await import("./post-compaction-delegate-dispatch.js");
  const delegatesToPreserve: SessionPostCompactionDelegate[] = [];
  const dispatchResult = await dispatchPostCompactionDelegates({
    cfg: params.followupRun.run.config,
    compactionCount: params.compactionCount,
    followupRun: params.followupRun,
    postCompactionDelegatesToPreserve: delegatesToPreserve,
    releaseTraceparent: params.traceparent,
    sessionEntry: params.sessionEntry,
    sessionKey: params.sessionKey,
    sessionStore: params.activeSessionStore,
    storePath: params.storePath,
  });
  for (const delegate of delegatesToPreserve) {
    stagePostCompactionDelegate(params.sessionKey, delegate);
  }

  const { emitContinuationCompactionReleasedSpan } =
    await import("../../infra/continuation-tracer.js");
  emitContinuationCompactionReleasedSpan({
    releasedCount: dispatchResult.queuedDelegates,
    compactionId: params.compactionCount,
    traceparent: params.traceparent,
    log: (message) => logVerbose(message),
  });
}

export async function releaseQueuedCompactionTolerant(
  params: Parameters<typeof releaseQueuedCompactionCompletion>[0],
): Promise<void> {
  try {
    await releaseQueuedCompactionCompletion(params);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logVerbose(
      `[request_compaction:post-compaction-release-failed] session=${params.sessionKey ?? "none"} reason=${reason}`,
    );
  }
}

type RequestCompactionContextUsageParams = {
  entry: SessionEntry | undefined;
  cfg: OpenClawConfig | undefined;
  provider: string;
  model: string;
};

function resolveRequestCompactionContextWindow(params: RequestCompactionContextUsageParams) {
  const entryContextWindow = params.entry?.contextTokens;
  const resolvedContextWindow =
    entryContextWindow ??
    resolveContextTokensForModel({
      cfg: params.cfg,
      provider: params.provider,
      model: params.model,
      allowAsyncLoad: false,
    });
  return {
    contextWindow:
      typeof resolvedContextWindow === "number" && resolvedContextWindow > 0
        ? resolvedContextWindow
        : null,
    contextWindowSource:
      typeof resolvedContextWindow !== "number" || resolvedContextWindow <= 0
        ? "unresolved"
        : entryContextWindow === resolvedContextWindow
          ? (params.entry?.contextTokensSource ?? "session_entry")
          : "model_resolver",
  };
}

export function inspectRequestCompactionContextUsage(params: RequestCompactionContextUsageParams) {
  const freshTotalTokens = resolveFreshSessionTotalTokens(params.entry);
  const { contextWindow, contextWindowSource } = resolveRequestCompactionContextWindow(params);

  return {
    contextUsage:
      freshTotalTokens !== undefined && contextWindow !== null
        ? freshTotalTokens / contextWindow
        : null,
    entryPresent: params.entry !== undefined,
    totalTokens: params.entry?.totalTokens ?? null,
    totalTokensFresh: params.entry?.totalTokensFresh ?? null,
    totalTokensVersion: params.entry?.totalTokensVersion ?? null,
    contextWindow,
    contextWindowSource,
  };
}

/**
 * Builds the `getContextUsageDiagnostics` payload for a persisted-session
 * (session-store fallback) `request_compaction` callsite. Shared by the
 * spawn-init and followup-runner callsites so the persisted-snapshot /
 * null-cause derivation lives in one place.
 */
export function buildPersistedContextUsageDiagnostics(
  params: RequestCompactionContextUsageParams & {
    callbackSessionId?: string;
    callbackSessionKey?: string;
  },
) {
  const snapshot = inspectRequestCompactionContextUsage(params);
  const validTotalTokens = resolveSessionTotalTokens(params.entry);
  const persistedNullCause = !snapshot.entryPresent
    ? ("missing_entry" as const)
    : params.entry?.totalTokens == null
      ? ("missing_total_tokens" as const)
      : validTotalTokens === undefined
        ? ("invalid_total_tokens" as const)
        : snapshot.totalTokensFresh !== true
          ? ("stale_total_tokens" as const)
          : snapshot.totalTokensVersion !== SESSION_TOTAL_TOKENS_VERSION
            ? ("total_tokens_version_mismatch" as const)
            : snapshot.contextWindow === null
              ? ("unresolved_model_context" as const)
              : undefined;
  return {
    usageSource:
      snapshot.contextUsage === null ? ("unavailable" as const) : ("persisted_fallback" as const),
    callbackSessionId: params.callbackSessionId,
    callbackSessionKey: params.callbackSessionKey,
    entryPresent: snapshot.entryPresent,
    totalTokens: snapshot.totalTokens,
    totalTokensFresh: snapshot.totalTokensFresh,
    totalTokensVersion: snapshot.totalTokensVersion,
    contextWindow: snapshot.contextWindow,
    contextWindowSource: snapshot.contextWindowSource,
    nullCause: persistedNullCause,
    persistedNullCause,
  };
}

export function computeRequestCompactionContextUsage(
  params: RequestCompactionContextUsageParams,
): number | null {
  const freshTotalTokens = resolveFreshSessionTotalTokens(params.entry);
  if (freshTotalTokens === undefined) {
    return null;
  }
  const { contextWindow } = resolveRequestCompactionContextWindow(params);
  return contextWindow === null ? null : freshTotalTokens / contextWindow;
}
