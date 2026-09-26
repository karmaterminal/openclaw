// Manual transcript trimming and model-backed session compaction.
import { randomUUID } from "node:crypto";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import {
  ErrorCodes,
  errorShape,
  validateSessionsCompactParams,
} from "../../../packages/gateway-protocol/src/index.js";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { resolveEmbeddedSessionLane } from "../../agents/embedded-agent-runner/lanes.js";
import { stagedPostCompactionDelegateCount } from "../../auto-reply/continuation/delegate-store-post-compaction.js";
import type { FollowupRun } from "../../auto-reply/reply/queue.js";
import { hasPendingFollowupQueueWork } from "../../auto-reply/reply/queue/state.js";
import {
  resolveSessionWorkStartError,
  SESSION_LIFECYCLE_CHANGED_ERROR_REASON,
  type SessionEntry,
} from "../../config/sessions.js";
import { formatSqliteSessionFileMarker } from "../../config/sessions/legacy-sqlite-marker.js";
import {
  applySessionPatchProjection,
  preflightSessionTranscriptForManualCompact,
  readTranscriptStatsSync,
  trimSessionTranscriptForManualCompact,
} from "../../config/sessions/session-accessor.js";
import { projectCompactionAccountingPatch } from "../../config/sessions/session-entry-projection.js";
import type { InternalSessionEntry } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { formatErrorMessage } from "../../infra/errors.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getCommandLaneSnapshot } from "../../process/command-queue.js";
import {
  isCompetingSessionWorkAdmissionActive,
  runExclusiveSessionLifecycleMutation,
} from "../../sessions/session-lifecycle-admission.js";
import { recordSessionCompacted } from "../../sessions/session-state-events.js";
import { deliveryContextFromSession } from "../../utils/delivery-context.read.js";
import { captureGatewayOperatorRunAuthority } from "../operator-run-authority.js";
import {
  resolveRequestedSessionAgentId as resolveRequestedGlobalAgentId,
  tryResolveSessionCompatibilityOwnerAgentId,
} from "../session-request-agent.js";
import {
  resolveCanonicalGatewaySessionStoreKey,
  resolveGatewaySessionStoreTargetWithStore,
  resolveSessionModelRef,
} from "../session-utils.js";
import { asWorkerInferenceControl } from "../worker-environments/inference-control.js";
import { resolveVisibleActiveSessionRunState } from "./session-active-runs.js";
import { emitSessionsChanged } from "./session-change-event.js";
import { readGatewayRequestMutationAuthority } from "./session-mutation-guards.js";
import {
  preflightGatewaySessionCompaction,
  runGatewaySessionCompaction,
} from "./sessions-compaction-runner.js";
import {
  emitSessionOperation,
  loadAccessorSessionEntryForGatewayTarget,
  requireSessionKey,
} from "./sessions-shared.js";
import type { GatewayRequestHandlers } from "./types.js";
import { assertValidParams } from "./validation.js";

const log = createSubsystemLogger("gateway/sessions");

function buildManualCompactionReleaseFollowupRun(params: {
  cfg: OpenClawConfig;
  entry: SessionEntry;
  model: { provider: string; model: string };
  sessionFile: string;
  sessionId: string;
  sessionKey: string;
  targetAgentId: string;
  workspaceDir: string;
}): FollowupRun {
  const deliveryContext = deliveryContextFromSession(params.entry);
  const cwd = normalizeOptionalString(params.entry.spawnedCwd);
  return {
    prompt: "",
    enqueuedAt: Date.now(),
    ...(deliveryContext?.channel ? { originatingChannel: deliveryContext.channel } : {}),
    ...(deliveryContext?.to ? { originatingTo: deliveryContext.to } : {}),
    ...(deliveryContext?.accountId ? { originatingAccountId: deliveryContext.accountId } : {}),
    ...(deliveryContext?.threadId !== undefined
      ? { originatingThreadId: deliveryContext.threadId }
      : {}),
    run: {
      agentId: params.targetAgentId,
      agentDir: params.workspaceDir,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      sessionFile: params.sessionFile,
      workspaceDir: params.workspaceDir,
      ...(cwd ? { cwd } : {}),
      config: params.cfg,
      provider: params.model.provider,
      model: params.model.model,
      ...(deliveryContext?.channel ? { messageProvider: deliveryContext.channel } : {}),
      ...(deliveryContext?.accountId ? { agentAccountId: deliveryContext.accountId } : {}),
      timeoutMs: 0,
      blockReplyBreak: "message_end",
    },
  };
}

function sessionHasPostCompactionDelegates(params: {
  entry?: SessionEntry;
  sessionKey: string;
}): boolean {
  return (
    stagedPostCompactionDelegateCount(params.sessionKey) > 0 ||
    (params.entry?.pendingPostCompactionDelegates?.length ?? 0) > 0
  );
}

async function releaseManualPostCompactionDelegatesIfNeeded(params: {
  cfg: OpenClawConfig;
  compactionCount: number | undefined;
  entry: SessionEntry;
  model: { provider: string; model: string };
  sessionFile: string;
  sessionId: string;
  sessionKey: string;
  store: Record<string, SessionEntry>;
  storePath: string;
  targetAgentId: string;
  workspaceDir: string;
}): Promise<void> {
  if (!sessionHasPostCompactionDelegates(params)) {
    return;
  }
  try {
    const { releasePostCompactionDelegatesAfterCompaction } =
      await import("../../auto-reply/reply/agent-runner-post-compaction-release.js");
    await releasePostCompactionDelegatesAfterCompaction({
      activeSessionStore: params.store,
      compactionCount: params.compactionCount,
      followupRun: buildManualCompactionReleaseFollowupRun(params),
      sessionEntry: params.entry,
      sessionKey: params.sessionKey,
      storePath: params.storePath,
    });
  } catch (error) {
    log.warn(
      `[sessions.compact:post-compaction-release-failed] session=${params.sessionKey} reason=${formatErrorMessage(error)}`,
    );
  }
}

export const sessionCompactHandlers: GatewayRequestHandlers = {
  "sessions.compact": async (options) => {
    const { params, respond, context, client, signal, hasCurrentClientAuthority } = options;
    const requestAuthority = readGatewayRequestMutationAuthority(options);
    if (!assertValidParams(params, validateSessionsCompactParams, "sessions.compact", respond)) {
      return;
    }
    const key = requireSessionKey(params.key, respond);
    if (!key) {
      return;
    }
    const maxLines = params.maxLines;

    const cfg = context.getRuntimeConfig();
    const requestedAgent = resolveRequestedGlobalAgentId(cfg, key, params.agentId);
    if (!requestedAgent.ok) {
      respond(false, undefined, requestedAgent.error);
      return;
    }
    const requestedAgentId = requestedAgent.agentId;
    const compatibilityDefaultAgentId = tryResolveSessionCompatibilityOwnerAgentId(cfg, key);
    const target = resolveGatewaySessionStoreTargetWithStore({
      cfg,
      key,
      exactRead: true,
      ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
    });
    const storePath = target.storePath;
    let capturedOperator: Awaited<ReturnType<typeof captureGatewayOperatorRunAuthority>>;
    const assertRequestCurrent = () => {
      requestAuthority.assertCurrent();
      capturedOperator?.authority.assertCurrent();
    };
    try {
      if (maxLines === undefined) {
        capturedOperator = await captureGatewayOperatorRunAuthority({
          client,
          context,
          hasCurrentClientAuthority,
          invocationAuthority: { assertCurrent: requestAuthority.assertCurrent, signal },
        });
      }
      const sourceSignal = capturedOperator?.authority.signal;
      const abortSignal =
        signal && sourceSignal ? AbortSignal.any([signal, sourceSignal]) : (signal ?? sourceSignal);
      assertRequestCurrent();
      // Lock + read in a short critical section; transcript work happens outside.
      // The projection resolver re-runs gateway key migration on the writer
      // snapshot so alias promotion/pruning persists through the accessor.
      let compactPrimaryKey = target.canonicalKey;
      const compactRead = await applySessionPatchProjection({
        agentId: target.agentId,
        assertCurrent: assertRequestCurrent,
        sessionKeys: target.storeKeys,
        storePath,
        resolveTarget: ({ store }) => {
          const { target: migratedTarget, primaryKey } = resolveCanonicalGatewaySessionStoreKey({
            cfg,
            key,
            store: store as Record<string, SessionEntry>,
            agentId: requestedAgentId,
          });
          compactPrimaryKey = primaryKey;
          return { primaryKey, candidateKeys: migratedTarget.storeKeys };
        },
        // Read-only projection: persist the resolved row unchanged so the alias
        // migration above is saved even when compaction bails out below.
        project: ({ existingEntry }) =>
          existingEntry ? { ok: true, entry: existingEntry } : { ok: false },
      });
      const compactTarget = {
        entry: compactRead.ok ? compactRead.entry : undefined,
        primaryKey: compactPrimaryKey,
      };
      const entry = compactTarget.entry;
      const sessionId = entry?.sessionId;
      const respondNotCompacted = (details: { ok?: boolean; kept?: number; reason?: string }) => {
        respond(
          true,
          { ok: true, key: target.canonicalKey, compacted: false, ...details },
          undefined,
        );
      };
      if (!sessionId) {
        respondNotCompacted({ reason: "no sessionId" });
        return;
      }

      if (maxLines !== undefined) {
        const trimPreflight = await preflightSessionTranscriptForManualCompact(
          {
            sessionId,
            storePath,
            sessionKey: compactTarget.primaryKey,
            agentId: target.agentId,
          },
          { maxLines },
        );
        if (!trimPreflight.compacted) {
          respondNotCompacted(
            "kept" in trimPreflight ? { kept: trimPreflight.kept } : { reason: "no transcript" },
          );
          return;
        }
      } else {
        const transcriptStats = readTranscriptStatsSync({
          agentId: target.agentId,
          sessionId,
          sessionKey: compactTarget.primaryKey,
          storePath,
        });
        if (transcriptStats.eventCount === 0) {
          respondNotCompacted({ reason: "no transcript" });
          return;
        }
      }

      const lifecycleRevision = entry.lifecycleRevision;
      const readCurrentEntry = () => {
        const latest = loadAccessorSessionEntryForGatewayTarget({
          key,
          cfg,
          agentId: requestedAgentId,
        }).entry;
        return latest &&
          latest.sessionId === sessionId &&
          latest.lifecycleRevision === lifecycleRevision &&
          !resolveSessionWorkStartError(target.canonicalKey, latest)
          ? latest
          : undefined;
      };
      const queueIdentities = [key, target.canonicalKey, compactTarget.primaryKey, sessionId];
      const lifecycleIdentities = [...queueIdentities, lifecycleRevision];
      let sessionStillCurrent = true;
      let compactionNoopReason: string | undefined;
      let blockedByActiveRun = false;
      let blockedByQueuedWork = false;
      await runExclusiveSessionLifecycleMutation({
        scope: storePath,
        identities: lifecycleIdentities,
        kind: "compaction",
        signal: abortSignal,
        prepare: async () => {
          assertRequestCurrent();
          const latestEntry = readCurrentEntry();
          if (!latestEntry) {
            sessionStillCurrent = false;
            return;
          }
          if (maxLines === undefined) {
            compactionNoopReason = (
              await preflightGatewaySessionCompaction({
                cfg,
                entry: latestEntry,
                agentId: target.agentId,
                sessionId,
                sessionKey: target.canonicalKey,
                sessionStoreKey: compactTarget.primaryKey,
                storePath,
              })
            )?.reason;
            if (compactionNoopReason) {
              return;
            }
          }
          blockedByActiveRun =
            isCompetingSessionWorkAdmissionActive(storePath, lifecycleIdentities) ||
            (asWorkerInferenceControl(context.workerEnvironmentService)?.hasInferenceForSession(
              sessionId,
            ) ??
              false) ||
            resolveVisibleActiveSessionRunState({
              context,
              requestedKey: key,
              canonicalKey: target.canonicalKey,
              sessionId,
              agentId: requestedAgentId,
              defaultAgentId: compatibilityDefaultAgentId,
            }).active;
          // Accepted work can live only in its command lane; waiting behind it
          // while holding the lifecycle fence would deadlock or drop that turn.
          blockedByQueuedWork =
            hasPendingFollowupQueueWork(queueIdentities) ||
            queueIdentities.some(
              (identity) =>
                getCommandLaneSnapshot(resolveEmbeddedSessionLane(identity)).queuedCount > 0,
            );
        },
        run: async () => {
          assertRequestCurrent();
          if (!sessionStillCurrent) {
            respond(
              false,
              undefined,
              errorShape(
                ErrorCodes.INVALID_REQUEST,
                `Session ${key} changed before compaction. Retry.`,
                { details: { reason: SESSION_LIFECYCLE_CHANGED_ERROR_REASON } },
              ),
            );
            return;
          }
          if (compactionNoopReason) {
            respondNotCompacted({ ok: false, reason: compactionNoopReason });
            return;
          }
          if (blockedByQueuedWork) {
            respond(
              false,
              undefined,
              errorShape(
                ErrorCodes.INVALID_REQUEST,
                `Session ${key} has queued work; retry after it finishes.`,
              ),
            );
            return;
          }
          if (blockedByActiveRun) {
            respond(
              false,
              undefined,
              errorShape(
                ErrorCodes.INVALID_REQUEST,
                `Session ${key} has an active run; retry after it finishes.`,
              ),
            );
            return;
          }

          const latestEntry = readCurrentEntry();
          if (!latestEntry) {
            respond(
              false,
              undefined,
              errorShape(
                ErrorCodes.INVALID_REQUEST,
                `Session ${key} changed before compaction. Retry.`,
                { details: { reason: SESSION_LIFECYCLE_CHANGED_ERROR_REASON } },
              ),
            );
            return;
          }

          const operationId = randomUUID();
          if (maxLines !== undefined) {
            const trimResult = await trimSessionTranscriptForManualCompact(
              {
                sessionId,
                storePath,
                sessionKey: compactTarget.primaryKey,
                agentId: target.agentId,
              },
              { maxLines },
            );
            respond(
              true,
              {
                ok: true,
                key: target.canonicalKey,
                compacted: trimResult.compacted,
                ...(trimResult.compacted
                  ? { kept: trimResult.kept }
                  : "kept" in trimResult
                    ? { kept: trimResult.kept }
                    : { reason: "no transcript" }),
              },
              undefined,
            );
            if (trimResult.compacted) {
              const loadedAfterTrim = loadAccessorSessionEntryForGatewayTarget({
                key,
                cfg,
                agentId: requestedAgentId,
              });
              const entryAfterTrim = loadedAfterTrim.entry ?? latestEntry;
              const targetAgentId = target.agentId ?? requestedAgentId;
              await releaseManualPostCompactionDelegatesIfNeeded({
                cfg,
                compactionCount: entryAfterTrim.compactionCount ?? 0,
                entry: entryAfterTrim,
                model: resolveSessionModelRef(cfg, entryAfterTrim, targetAgentId),
                sessionFile: formatSqliteSessionFileMarker({
                  agentId: targetAgentId,
                  sessionId: entryAfterTrim.sessionId ?? sessionId,
                  storePath,
                }),
                sessionId: entryAfterTrim.sessionId ?? sessionId,
                sessionKey: target.canonicalKey,
                store: loadedAfterTrim.target.store,
                storePath,
                targetAgentId,
                workspaceDir:
                  normalizeOptionalString(entryAfterTrim.spawnedWorkspaceDir) ??
                  resolveAgentWorkspaceDir(cfg, targetAgentId),
              });
              recordSessionCompacted({
                sessionKey: target.canonicalKey,
                operationId,
                sessionId,
                agentId: target.agentId ?? requestedAgentId,
              });
              emitSessionsChanged(context, {
                sessionKey: target.canonicalKey,
                agentId: target.agentId,
                reason: "compact",
                compacted: true,
              });
            }
            return;
          }

          const transcriptStats = readTranscriptStatsSync({
            agentId: target.agentId,
            sessionId,
            sessionKey: compactTarget.primaryKey,
            storePath,
          });
          if (transcriptStats.eventCount === 0) {
            respondNotCompacted({ reason: "no transcript" });
            return;
          }
          emitSessionOperation(context, {
            operationId,
            operation: "compact",
            phase: "start",
            sessionKey: target.canonicalKey,
            agentId: target.agentId,
          });
          const emitCompactionEnd = (completed: boolean, reason?: string) =>
            emitSessionOperation(context, {
              operationId,
              operation: "compact",
              phase: "end",
              sessionKey: target.canonicalKey,
              agentId: target.agentId,
              completed,
              reason,
            });
          let result: Awaited<ReturnType<typeof runGatewaySessionCompaction>>;
          let expectedEntry: InternalSessionEntry = latestEntry;
          const assertActive = () => {
            assertRequestCurrent();
            abortSignal?.throwIfAborted();
          };
          try {
            result = await runGatewaySessionCompaction(
              {
                cfg,
                entry: latestEntry,
                abortSignal,
                runId: operationId,
                agentId: target.agentId,
                sessionId,
                sessionKey: target.canonicalKey,
                sessionStoreKey: compactTarget.primaryKey,
                storePath,
              },
              {
                assertActive,
                sourceAuthority: { assertActive, operatorAuthority: capturedOperator?.authority },
                onCommitted: (accepted) => {
                  expectedEntry = accepted.entry;
                },
              },
            );
          } catch (err) {
            emitCompactionEnd(false, formatErrorMessage(err));
            throw err;
          }
          if (result.ok && result.compacted) {
            let persisted: boolean;
            let releaseSessionEntry: SessionEntry | undefined;
            let releaseSessionStore: Record<string, SessionEntry> | undefined;
            try {
              // Skip terminal persistence when session ownership rotated during compaction.
              const persistProjection = await applySessionPatchProjection({
                agentId: target.agentId,
                assertCurrent: assertActive,
                sessionKeys: [compactTarget.primaryKey],
                storePath,
                resolveTarget: () => ({ primaryKey: compactTarget.primaryKey }),
                project: ({ existingEntry }) => {
                  if (
                    !existingEntry ||
                    existingEntry.sessionId !== expectedEntry.sessionId ||
                    existingEntry.lifecycleRevision !== expectedEntry.lifecycleRevision ||
                    existingEntry.activeWriterRunId !== expectedEntry.activeWriterRunId ||
                    resolveSessionWorkStartError(target.canonicalKey, existingEntry)
                  ) {
                    return { ok: false };
                  }
                  return {
                    ok: true,
                    entry: {
                      ...existingEntry,
                      ...projectCompactionAccountingPatch(existingEntry, {
                        compactionKind: result.compactionKind,
                        tokensAfter: result.result?.tokensAfter,
                      }),
                    },
                  };
                },
              });
              persisted = persistProjection.ok;
              if (persistProjection.ok) {
                releaseSessionEntry = persistProjection.entry;
                releaseSessionStore = { [target.canonicalKey]: persistProjection.entry };
              }
            } catch (err) {
              emitCompactionEnd(false, formatErrorMessage(err));
              throw err;
            }
            if (!persisted) {
              const reason = `Session ${key} changed before compaction completed. Retry.`;
              emitCompactionEnd(false, reason);
              respond(
                false,
                undefined,
                errorShape(ErrorCodes.INVALID_REQUEST, reason, {
                  details: { reason: SESSION_LIFECYCLE_CHANGED_ERROR_REASON },
                }),
              );
              return;
            }
            if (releaseSessionEntry && releaseSessionStore) {
              const targetAgentId = target.agentId ?? requestedAgentId;
              await releaseManualPostCompactionDelegatesIfNeeded({
                cfg,
                compactionCount: releaseSessionEntry.compactionCount ?? 0,
                entry: releaseSessionEntry,
                model: resolveSessionModelRef(cfg, releaseSessionEntry, targetAgentId),
                sessionFile: formatSqliteSessionFileMarker({
                  agentId: targetAgentId,
                  sessionId: releaseSessionEntry.sessionId ?? result.result?.sessionId ?? sessionId,
                  storePath,
                }),
                sessionId: releaseSessionEntry.sessionId ?? result.result?.sessionId ?? sessionId,
                sessionKey: target.canonicalKey,
                store: releaseSessionStore,
                storePath,
                targetAgentId,
                workspaceDir:
                  normalizeOptionalString(releaseSessionEntry.spawnedWorkspaceDir) ??
                  resolveAgentWorkspaceDir(cfg, targetAgentId),
              });
            }
            recordSessionCompacted({
              sessionKey: target.canonicalKey,
              operationId,
              sessionId: expectedEntry.sessionId,
              agentId: target.agentId ?? requestedAgentId,
            });
          }

          emitCompactionEnd(result.ok && result.compacted, result.reason);
          respond(
            true,
            {
              ok: result.ok,
              key: target.canonicalKey,
              compacted: result.compacted,
              reason: result.reason,
              result: result.result,
            },
            undefined,
          );
          if (result.ok) {
            emitSessionsChanged(context, {
              sessionKey: target.canonicalKey,
              agentId: target.agentId,
              reason: "compact",
              compacted: result.compacted,
            });
          }
        },
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatErrorMessage(err)));
    } finally {
      capturedOperator?.release();
    }
  },
};
