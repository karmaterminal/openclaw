import { sanitizeForLog } from "../../../packages/terminal-core/src/ansi.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { generateChainId } from "../../infra/secure-random.js";
import { enqueueSystemEventRaw as enqueueSystemEvent } from "../../infra/system-events.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { EmbeddedAgentRunResult } from "../embedded-agent.js";

const log = createSubsystemLogger("agents/attempt-execution");

const CONTINUATION_DISABLED_NOTICE =
  "[continuation] continue_work election(s) were not scheduled because continuation was disabled before the wake was committed.";

type SpawnInitContinueWorkRequest = {
  reason: string;
  delaySeconds?: number;
  traceparent?: string;
};

type ScheduledSpawnInitContinueWorkRequest = {
  reason: string;
  delaySeconds: number;
  traceparent?: string;
};

type ContinuationChainPatch = {
  continuationChainCount: number;
  continuationChainStartedAt: number;
  continuationChainTokens: number;
  continuationChainId: string | undefined;
};

type SpawnInitChainStateUpdate = {
  count: number;
  startedAt: number;
  tokens: number;
  chainId?: string;
  update?: (entry: SessionEntry, proposed: ContinuationChainPatch) => Partial<SessionEntry> | null;
};

type PriorChainState = {
  count: number;
  startedAt: number | undefined;
  tokens: number;
  chainId: string | undefined;
};

function normalizeCleanupError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === "string" ? error : fallback);
}

type SpawnInitContinueWorkWakeParams = {
  sessionKey: string;
  sessionEntry: SessionEntry | undefined;
  sessionStore?: Record<string, SessionEntry>;
  storePath?: string;
  requests: SpawnInitContinueWorkRequest[];
  cfg: OpenClawConfig;
  runResult: EmbeddedAgentRunResult;
  originRunId: string;
  originTurnId: string;
  abortSignal?: AbortSignal;
};

/**
 * Tell the session that a continue_work election it was told is "scheduled"
 * has no confirmed wake. Used when post-run scheduling throws before a more
 * specific notice was enqueued.
 */
export function notifyContinueWorkWakeUnconfirmed(sessionKey: string): void {
  enqueueSystemEvent(
    "[continuation] continue_work wake could not be confirmed because post-run scheduling failed; do not assume another turn is coming.",
    { sessionKey, trusted: true },
  );
}

/**
 * Durably schedules spawn-init continue_work elections after the run settles.
 *
 * The tool already answered "scheduled" in-turn, so every outcome that ends
 * without a durable wake (other than cancellation of the electing turn) must
 * reach the session as a system event, never only a log line.
 */
export async function scheduleSpawnInitContinueWorkWake(
  params: SpawnInitContinueWorkWakeParams,
): Promise<void> {
  let sessionNotified = false;
  const notifyNotScheduled = (text: string): void => {
    sessionNotified = true;
    enqueueSystemEvent(text, { sessionKey: params.sessionKey, trusted: true });
  };
  try {
    await scheduleSpawnInitContinueWorkWakeOnce(params, notifyNotScheduled);
  } catch (error) {
    if (!sessionNotified) {
      notifyContinueWorkWakeUnconfirmed(params.sessionKey);
    }
    throw error;
  }
}

async function scheduleSpawnInitContinueWorkWakeOnce(
  params: SpawnInitContinueWorkWakeParams,
  notifyNotScheduled: (text: string) => void,
): Promise<void> {
  const [
    { resolveLiveContinuationRuntimeConfig },
    { loadContinuationChainState },
    { scheduleContinuationWorkBatch },
    { patchSessionEntryCore, resolveSessionEntryFromStore },
  ] = await Promise.all([
    import("../../auto-reply/continuation/config.js"),
    import("../../auto-reply/continuation/state.js"),
    import("../../auto-reply/continuation/lazy.runtime.js"),
    import("../../config/sessions/session-accessor.js"),
  ]);

  if (params.abortSignal?.aborted) {
    return;
  }
  const continuationConfig = resolveLiveContinuationRuntimeConfig(params.cfg);
  if (!continuationConfig.enabled) {
    log.info(
      `[continuation] Ignoring spawn-init continue_work election(s) disabled before scheduling for session ${sanitizeForLog(params.sessionKey)}`,
    );
    notifyNotScheduled(CONTINUATION_DISABLED_NOTICE);
    return;
  }
  if (!params.storePath) {
    log.info(
      `[continuation] Ignoring spawn-init continue_work election(s) without a durable session store for session ${sanitizeForLog(params.sessionKey)}`,
    );
    notifyNotScheduled(
      "[continuation] continue_work election(s) were not scheduled because durable session state is unavailable.",
    );
    return;
  }

  const tailUsage = params.runResult.meta?.agentMeta?.usage;
  const turnTokens = (tailUsage?.input ?? 0) + (tailUsage?.output ?? 0);
  let activeSessionEntry = params.sessionStore?.[params.sessionKey] ?? params.sessionEntry;
  const initialChainState = loadContinuationChainState(activeSessionEntry, turnTokens);
  const workChainId = initialChainState.chainId ?? generateChainId();

  const persistChainState = async (state: SpawnInitChainStateUpdate): Promise<SessionEntry> => {
    const proposed: ContinuationChainPatch = {
      continuationChainCount: state.count,
      continuationChainStartedAt: state.startedAt,
      continuationChainTokens: state.tokens,
      continuationChainId: state.chainId,
    };
    const updated =
      (await patchSessionEntryCore(
        { storePath: params.storePath, sessionKey: params.sessionKey },
        (entry) => (state.update ? state.update(entry, proposed) : proposed),
        { preserveActivity: true, requireWriteSuccess: true },
      )) ?? undefined;
    if (!updated) {
      throw new Error(`session entry was not found: ${params.sessionKey}`);
    }

    activeSessionEntry = updated;
    if (params.sessionStore) {
      const resolved = resolveSessionEntryFromStore({
        store: params.sessionStore,
        sessionKey: params.sessionKey,
      });
      params.sessionStore[resolved.normalizedKey] = updated;
      for (const legacyKey of resolved.legacyKeys) {
        delete params.sessionStore[legacyKey];
      }
    }
    return updated;
  };

  let prior: PriorChainState | undefined;
  let reservedEntry: SessionEntry;
  try {
    reservedEntry = await persistChainState({
      count: initialChainState.currentChainCount + params.requests.length,
      startedAt: initialChainState.chainStartedAt,
      tokens: initialChainState.accumulatedChainTokens,
      chainId: workChainId,
      update: (entry, proposed) => {
        const persistedCount = entry.continuationChainCount ?? 0;
        const persistedTokens = entry.continuationChainTokens ?? 0;
        const persistedChainId =
          persistedCount > 0 && entry.continuationChainId
            ? entry.continuationChainId
            : proposed.continuationChainId;
        const persistedStartedAt =
          persistedCount > 0
            ? (entry.continuationChainStartedAt ?? proposed.continuationChainStartedAt)
            : proposed.continuationChainStartedAt;
        prior = {
          count: persistedCount,
          startedAt: entry.continuationChainStartedAt,
          tokens: persistedTokens,
          chainId: entry.continuationChainId,
        };
        return {
          continuationChainCount: Math.min(
            continuationConfig.maxChainLength,
            persistedCount + params.requests.length,
          ),
          continuationChainStartedAt: persistedStartedAt,
          continuationChainTokens: persistedTokens + turnTokens,
          continuationChainId: persistedChainId,
        };
      },
    });
  } catch (error) {
    notifyNotScheduled(
      "[continuation] continue_work election(s) were not scheduled because chain state could not be persisted.",
    );
    throw error;
  }
  if (!prior) {
    throw new Error("continuation chain reservation did not return prior session state");
  }

  const reservation = {
    prior,
    reserved: {
      currentChainCount: prior.count,
      chainStartedAt:
        reservedEntry.continuationChainStartedAt ??
        prior.startedAt ??
        initialChainState.chainStartedAt,
      accumulatedChainTokens: reservedEntry.continuationChainTokens ?? prior.tokens + turnTokens,
      ...(reservedEntry.continuationChainId ? { chainId: reservedEntry.continuationChainId } : {}),
    },
    reservedCount: reservedEntry.continuationChainCount ?? prior.count,
  };
  let rollbackExpectedCount = reservation.reservedCount;
  const restorePriorChainState = async (): Promise<void> => {
    let rolledBack = false;
    try {
      await persistChainState({
        count: reservation.prior.count,
        startedAt: reservation.prior.startedAt ?? initialChainState.chainStartedAt,
        tokens: reservation.prior.tokens,
        chainId: reservation.prior.chainId,
        update: (entry) => {
          if (
            entry.continuationChainId !== reservation.reserved.chainId ||
            (entry.continuationChainCount ?? 0) !== rollbackExpectedCount
          ) {
            return {};
          }
          rolledBack = true;
          return {
            continuationChainCount: reservation.prior.count,
            continuationChainStartedAt: reservation.prior.startedAt,
            continuationChainTokens: Math.max(
              reservation.prior.tokens,
              (entry.continuationChainTokens ?? 0) - turnTokens,
            ),
            continuationChainId: reservation.prior.chainId,
          };
        },
      });
      if (!rolledBack) {
        throw new Error("session chain advanced after spawn-init reservation");
      }
    } catch (error) {
      notifyNotScheduled(
        "[continuation] continue_work chain-state rollback failed; the reserved budget remains fail-closed.",
      );
      throw error;
    }
  };
  if (params.abortSignal?.aborted) {
    await restorePriorChainState();
    return;
  }

  const liveSchedulingConfig = resolveLiveContinuationRuntimeConfig(params.cfg);
  if (!liveSchedulingConfig.enabled) {
    await restorePriorChainState();
    log.info(
      `[continuation] Ignoring spawn-init continue_work election(s) disabled during chain-state reservation for session ${sanitizeForLog(params.sessionKey)}`,
    );
    notifyNotScheduled(CONTINUATION_DISABLED_NOTICE);
    return;
  }

  const reservedRequestCount = Math.max(0, reservation.reservedCount - reservation.prior.count);
  const reservedRequests = params.requests.slice(0, reservedRequestCount);
  const unreservedRequestCount = params.requests.length - reservedRequests.length;
  const { checkContinuationBudget } = await import("../../auto-reply/continuation/scheduler.js");
  if (params.abortSignal?.aborted) {
    await restorePriorChainState();
    return;
  }
  const liveBudgetRejection =
    reservedRequests.length > 0
      ? checkContinuationBudget({
          chainState: reservation.reserved,
          config: liveSchedulingConfig,
          sessionKey: params.sessionKey,
        })
      : null;
  let result: Awaited<ReturnType<typeof scheduleContinuationWorkBatch>>;
  let failCreatedWork: ((summary: string) => Promise<void>) | undefined;
  const createdFlowIds: string[] = [];
  if (reservedRequests.length === 0 || liveBudgetRejection) {
    result = {
      scheduledCount: 0,
      cappedCount: params.requests.length,
      capped: params.requests.length > 0,
      chainState: reservation.reserved,
    };
  } else {
    try {
      const [
        { listContinuationRecords, requestContinuationRecordCancel, failContinuationRecord },
        { abortContinuationDispatchClaim },
        { decodeWorkState, isContinuationWorkFlow },
        { rollbackPendingWorkReplacement },
      ] = await Promise.all([
        import("../../auto-reply/continuation/custody/custody-store.js"),
        import("../../auto-reply/continuation/continuation-dispatch-claims.js"),
        import("../../auto-reply/continuation/work-flow-state.js"),
        import("../../auto-reply/continuation/work-replacement-store.js"),
      ]);
      const existingWork = await listContinuationRecords({
        ownerSessionKey: params.sessionKey,
        kinds: ["work"],
        statuses: ["queued", "running"],
      });
      const priorParkedFlows = existingWork.filter(
        (record) =>
          record.status === "queued" &&
          decodeWorkState(record)?.idleRetry?.trigger === "reply-run-ended",
      );
      let supersededPriorParkedFlows: readonly (typeof priorParkedFlows)[number][] =
        priorParkedFlows;
      let replacementApplied = false;
      const readRecord = async (recordId: string) =>
        (await listContinuationRecords({ recordIds: [recordId] }))[0];
      failCreatedWork = async (summary) => {
        if (replacementApplied) {
          const rollback = await rollbackPendingWorkReplacement({
            sessionKey: params.sessionKey,
            createdFlowIds,
            priorFlows: supersededPriorParkedFlows,
            originRunId: params.originRunId,
            originTurnId: params.originTurnId,
            summary,
          });
          const cleanupErrors: Error[] = [];
          if (rollback.unresolvedCreatedFlowIds.length > 0) {
            cleanupErrors.push(
              new Error(
                `failed to terminalize continuation record(s): ${rollback.unresolvedCreatedFlowIds.join(", ")}`,
              ),
            );
          }
          if (rollback.unrestoredPriorFlowIds.length > 0) {
            cleanupErrors.push(
              new Error(
                `failed to restore prior continuation record(s): ${rollback.unrestoredPriorFlowIds.join(", ")}`,
              ),
            );
          }
          if (!rollback.applied && cleanupErrors.length === 0) {
            cleanupErrors.push(new Error("atomic continuation replacement rollback failed"));
          }
          const [cleanupError] = cleanupErrors;
          if (cleanupErrors.length === 1 && cleanupError) {
            throw cleanupError;
          }
          if (cleanupErrors.length > 1) {
            throw new AggregateError(cleanupErrors, "continuation replacement rollback failed");
          }
          return;
        }
        const cleanupErrors: Error[] = [];
        const unresolvedFlowIds: string[] = [];
        for (const recordId of createdFlowIds) {
          let resolved = false;
          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              let record = await readRecord(recordId);
              if (!record || (record.status !== "queued" && record.status !== "running")) {
                resolved = true;
                break;
              }
              if (!isContinuationWorkFlow(record)) {
                break;
              }
              const state = decodeWorkState(record);
              if (
                state?.originRunId !== params.originRunId ||
                state.originTurnId !== params.originTurnId
              ) {
                break;
              }
              if (record.status === "running") {
                abortContinuationDispatchClaim({
                  sessionKey: params.sessionKey,
                  flowId: record.recordId,
                  reason: summary,
                });
                if (record.cancelRequestedAt === undefined) {
                  const cancelled = await requestContinuationRecordCancel({
                    recordId: record.recordId,
                    ownerSessionKey: record.ownerSessionKey,
                    expectedRevision: record.revision,
                    now: Date.now(),
                  });
                  if (cancelled.outcome !== "applied" || !cancelled.records[0]) {
                    continue;
                  }
                  record = cancelled.records[0];
                }
              }
              const failed = await failContinuationRecord({
                recordId: record.recordId,
                ownerSessionKey: record.ownerSessionKey,
                expectedRevision: record.revision,
                now: Date.now(),
                phase: "spawn-init continuation finalization failed",
                failureReason: summary,
              });
              if (failed.outcome === "applied") {
                resolved = true;
                break;
              }
            } catch (error) {
              lastError = error;
            }
          }
          if (!resolved) {
            const latest = await readRecord(recordId).catch(() => undefined);
            if (
              latest &&
              (latest.status === "queued" || latest.status === "running") &&
              latest.cancelRequestedAt === undefined
            ) {
              unresolvedFlowIds.push(latest.recordId);
            }
            if (lastError) {
              cleanupErrors.push(
                new Error(`failed to clean up continuation record ${recordId}`, {
                  cause: lastError,
                }),
              );
            }
          }
        }
        if (unresolvedFlowIds.length > 0) {
          cleanupErrors.push(
            new Error(
              `failed to terminalize or cancel continuation record(s): ${unresolvedFlowIds.join(", ")}`,
            ),
          );
        }
        const [cleanupError] = cleanupErrors;
        if (cleanupErrors.length === 1 && cleanupError) {
          throw cleanupError;
        }
        if (cleanupErrors.length > 1) {
          throw new AggregateError(cleanupErrors, "continuation record cleanup failed");
        }
      };
      result = await scheduleContinuationWorkBatch({
        sessionKey: params.sessionKey,
        chainState: reservation.reserved,
        requests: reservedRequests.map((request) => {
          const scheduledRequest: ScheduledSpawnInitContinueWorkRequest = {
            reason: request.reason,
            delaySeconds: request.delaySeconds ?? liveSchedulingConfig.defaultDelayMs / 1000,
          };
          if (request.traceparent) {
            scheduledRequest.traceparent = request.traceparent;
          }
          return scheduledRequest;
        }),
        config: liveSchedulingConfig,
        coalescePriorParkedWork: false,
        priorParkedFlowsToSupersede: priorParkedFlows,
        expectedRunningFlowIds: existingWork
          .filter((record) => record.status === "running")
          .map((record) => record.recordId),
        onFlowEnqueued: (flowId) => {
          createdFlowIds.push(flowId);
          replacementApplied ||= priorParkedFlows.length > 0;
        },
        // Same-session own-turn work has no spawning parent. Adding parentRunId
        // would let orphan recovery reap the row after its electing turn settles.
        originRunId: params.originRunId,
        originTurnId: params.originTurnId,
        ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
        log: (message) => log.info(message),
      });
      supersededPriorParkedFlows = result.supersededFlows ?? [];
      replacementApplied ||= supersededPriorParkedFlows.length > 0;
      result.cappedCount += unreservedRequestCount;
      result.capped ||= unreservedRequestCount > 0;
    } catch (error) {
      await failCreatedWork?.("continue_work scheduling failed after durable chain reservation.");
      notifyNotScheduled(
        "[continuation] continue_work scheduling failed; the reserved chain budget remains fail-closed.",
      );
      throw error;
    }
  }

  const failCreatedWorkAndRestoreReservation = async (summary: string): Promise<void> => {
    try {
      await failCreatedWork?.(summary);
    } catch (error) {
      throw normalizeCleanupError(error, "continuation flow cleanup failed");
    }
    try {
      await restorePriorChainState();
    } catch (error) {
      throw normalizeCleanupError(error, "continuation chain rollback failed");
    }
  };

  if (result.replacementFailure) {
    notifyNotScheduled(
      "[continuation] A newer continue_work wake was not scheduled because prior parked-wake supersession did not commit.",
    );
    await failCreatedWorkAndRestoreReservation(
      "continue_work replacement cancelled because parked-wake supersession did not commit.",
    );
    throw new Error(
      `prior parked-wake supersession did not commit (${result.replacementFailure})${result.replacementFailureFlowId ? ` for flow ${result.replacementFailureFlowId}` : ""}`,
    );
  }

  if (params.abortSignal?.aborted) {
    await failCreatedWorkAndRestoreReservation(
      "continue_work scheduling cancelled with its originating turn.",
    );
    return;
  }
  if (result.cappedCount > 0) {
    enqueueSystemEvent(
      params.requests.length > 1
        ? `[continuation] ${result.cappedCount} of ${params.requests.length} continue_work elections were not scheduled (chain/cost/pending cap).`
        : "[continuation] continue_work election was not scheduled (chain/cost/pending cap).",
      { sessionKey: params.sessionKey, trusted: true },
    );
  }
  if (result.scheduledCount === 0) {
    await restorePriorChainState();
    return;
  }

  let finalizationApplied = false;
  try {
    await persistChainState({
      count: result.chainState.currentChainCount,
      startedAt: result.chainState.chainStartedAt,
      tokens: result.chainState.accumulatedChainTokens,
      ...(result.chainState.chainId ? { chainId: result.chainState.chainId } : {}),
      update: (entry, proposed) => {
        if (entry.continuationChainId !== reservation.reserved.chainId) {
          return {};
        }
        finalizationApplied = true;
        return {
          ...proposed,
          continuationChainCount:
            (entry.continuationChainCount ?? 0) === reservation.reservedCount
              ? proposed.continuationChainCount
              : Math.max(entry.continuationChainCount ?? 0, proposed.continuationChainCount),
          continuationChainTokens: Math.max(
            entry.continuationChainTokens ?? 0,
            proposed.continuationChainTokens,
          ),
        };
      },
    });
    if (!finalizationApplied) {
      throw new Error("spawn-init chain finalization guard did not apply");
    }
    rollbackExpectedCount = result.chainState.currentChainCount;
  } catch (error) {
    let cleanupError: unknown;
    try {
      await failCreatedWork?.("continue_work chain-state finalization did not commit.");
    } catch (caught) {
      cleanupError = caught;
    }
    // failCreatedWork terminalized the created wake unless its cleanup failed.
    notifyNotScheduled(
      cleanupError
        ? "[continuation] continue_work chain-state finalization failed and the wake could not be cancelled; it may still fire. The reserved budget remains fail-closed."
        : "[continuation] continue_work wake was not scheduled because chain-state finalization failed; the reserved budget remains fail-closed.",
    );
    if (cleanupError) {
      const combinedError = new Error(
        "spawn-init chain finalization and wake cleanup both failed",
        {
          cause: error,
        },
      );
      Object.assign(combinedError, { cleanupError });
      throw combinedError;
    }
    throw error;
  }

  if (params.abortSignal?.aborted) {
    await failCreatedWorkAndRestoreReservation(
      "continue_work scheduling cancelled with its originating turn.",
    );
  }
}
