/**
 * Continuation wiring for embedded agent attempts: continue_work and request_compaction
 * tool options, plus post-run settlement of continue_work / continue_delegate elections.
 */
import { sanitizeForLog } from "../../../packages/terminal-core/src/ansi.js";
import { failQueuedDelegatesOwnedByRun } from "../../auto-reply/continuation/delegate-store.js";
import {
  computeRequestCompactionContextUsage,
  releaseQueuedCompactionTolerant,
} from "../../auto-reply/reply/agent-runner-post-compaction-release.js";
import type { FollowupRun } from "../../auto-reply/reply/queue.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  formatActiveContinuationTraceparent,
  resolveContinuationTraceparent,
} from "../../infra/continuation-tracer.js";
import { runWithDiagnosticTraceparent } from "../../infra/diagnostic-trace-context.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { resolveMessageChannel } from "../../utils/message-channel.js";
import type { RequestCompactionInvocation } from "../compaction-attribution.js";
import type { EmbeddedAgentRunResult } from "../embedded-agent.js";
import type { ContinueWorkRequest } from "../tools/continue-work-tool.js";
import {
  notifyContinueWorkWakeUnconfirmed,
  scheduleSpawnInitContinueWorkWake,
} from "./attempt-execution.continue-work.js";
import type { AgentCommandOpts, AgentRunContext } from "./types.js";

const log = createSubsystemLogger("agents/agent-command");

type AttemptContinuationParams = {
  cfg: OpenClawConfig;
  sessionEntry: SessionEntry | undefined;
  sessionId: string;
  sessionKey: string | undefined;
  sessionAgentId: string;
  sessionFile: string;
  workspaceDir: string;
  cwd?: string;
  modelOverride: string;
  timeoutMs: number;
  runId: string;
  opts: AgentCommandOpts;
  runContext: AgentRunContext;
  messageChannel: ReturnType<typeof resolveMessageChannel>;
  agentDir: string;
  sessionStore?: Record<string, SessionEntry>;
  storePath?: string;
};

/**
 * Starts continuation tracking for one attempt. Call at attempt start so delegate
 * rows created by this run are bounded by the attempt's start time.
 */
export function startAttemptContinuation(params: AttemptContinuationParams) {
  const runStartedAt = Date.now();
  let continuationEnabled = false;
  const attemptContinueWorkRequests: ContinueWorkRequest[] = [];
  return {
    /** Continuation tool options for the embedded run params. */
    runOpts(
      embeddedAgentProvider: string,
      authProfileId: string | undefined,
      effectivePrompt: string,
    ) {
      continuationEnabled = params.cfg.agents?.defaults?.continuation?.enabled === true;
      const continueWorkOpts = continuationEnabled
        ? {
            requestContinuation: (request: ContinueWorkRequest) => {
              attemptContinueWorkRequests.push(request);
            },
          }
        : undefined;

      const requestCompactionOpts = continuationEnabled
        ? {
            sessionId: params.sessionId,
            ownerAgentId: params.sessionAgentId,
            contextUsageOrigin: "live_runner" as const,
            getContextUsage: () =>
              computeRequestCompactionContextUsage({
                entry: params.sessionEntry,
                cfg: params.cfg,
                provider: embeddedAgentProvider,
                model: params.modelOverride,
              }),
            triggerCompaction: async (request: RequestCompactionInvocation) => {
              const assertCompactionSourceActive = () => {
                params.opts.abortSignal?.throwIfAborted();
                params.opts.operatorAuthority?.assertCurrent();
              };
              try {
                const { compactEmbeddedAgentSession } =
                  await import("../embedded-agent-runner/compact.queued.js");
                const result = await compactEmbeddedAgentSession(
                  {
                    sessionId: params.sessionId,
                    runId: request.runId ?? params.runId,
                    sessionKey: params.sessionKey,
                    sessionFile: params.sessionFile,
                    workspaceDir: params.workspaceDir,
                    cwd: params.cwd,
                    config: params.cfg,
                    messageChannel: params.messageChannel,
                    messageProvider: params.opts.messageProvider ?? params.messageChannel,
                    agentAccountId: params.runContext.accountId,
                    provider: embeddedAgentProvider,
                    model: params.modelOverride,
                    authProfileId,
                    customInstructions: request.customInstructions,
                    trigger: request.trigger,
                    diagId: request.diagId,
                    traceparent: request.traceparent,
                    abortSignal: params.opts.abortSignal,
                  },
                  {
                    // The requesting run's own admission is the compaction source.
                    assertActive: assertCompactionSourceActive,
                    sourceAuthority: {
                      assertActive: assertCompactionSourceActive,
                      operatorAuthority: params.opts.operatorAuthority,
                    },
                  },
                );
                if (params.opts.abortSignal?.aborted) {
                  if (params.sessionKey) {
                    await failQueuedDelegatesOwnedByRun(
                      params.sessionKey,
                      {
                        originRunId: params.runId,
                        legacyCreatedAfter: runStartedAt,
                      },
                      "Continuation delegate election ignored because the spawn-init turn was cancelled.",
                    );
                  }
                  return result;
                }
                if (result.ok && result.compacted) {
                  const releaseOriginatingTo = params.opts.replyTo ?? params.opts.to;
                  const releaseMessageProvider =
                    params.opts.messageProvider ?? params.messageChannel;
                  const compactionReleaseFollowupRun: FollowupRun = {
                    prompt: effectivePrompt,
                    enqueuedAt: Date.now(),
                    ...(params.runContext.messageChannel
                      ? { originatingChannel: params.runContext.messageChannel }
                      : {}),
                    ...(releaseOriginatingTo ? { originatingTo: releaseOriginatingTo } : {}),
                    ...(params.runContext.accountId
                      ? { originatingAccountId: params.runContext.accountId }
                      : {}),
                    ...(params.opts.threadId != null
                      ? { originatingThreadId: params.opts.threadId }
                      : {}),
                    abortSignal: params.opts.abortSignal,
                    run: {
                      agentId: params.sessionAgentId,
                      agentDir: params.agentDir,
                      sessionId: params.sessionId,
                      ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
                      sessionFile: params.sessionFile,
                      workspaceDir: params.workspaceDir,
                      ...(params.cwd ? { cwd: params.cwd } : {}),
                      config: params.cfg,
                      provider: embeddedAgentProvider,
                      model: params.modelOverride,
                      ...(releaseMessageProvider
                        ? { messageProvider: releaseMessageProvider }
                        : {}),
                      ...(params.runContext.accountId
                        ? { agentAccountId: params.runContext.accountId }
                        : {}),
                      timeoutMs: params.timeoutMs,
                      blockReplyBreak: "message_end",
                    },
                  };
                  await releaseQueuedCompactionTolerant({
                    ...(params.sessionStore ? { activeSessionStore: params.sessionStore } : {}),
                    compactionResult: result,
                    followupRun: compactionReleaseFollowupRun,
                    getActiveSessionEntry: () => params.sessionEntry,
                    ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
                    ...(params.storePath ? { storePath: params.storePath } : {}),
                    ...(request.traceparent ? { traceparent: request.traceparent } : {}),
                  });
                }
                return {
                  ok: result.ok,
                  compacted: result.compacted,
                  reason: result.reason,
                };
              } catch (err) {
                return {
                  ok: false,
                  compacted: false,
                  reason: err instanceof Error ? err.message : String(err),
                };
              }
            },
          }
        : undefined;
      return { continueWorkOpts, requestCompactionOpts };
    },
    /** Runs the attempt under the caller trace, then settles continuation elections. */
    async run(execute: () => Promise<EmbeddedAgentRunResult>) {
      const embeddedRunResult = await runWithDiagnosticTraceparent(
        params.opts.traceparent,
        execute,
      );

      if (continuationEnabled && params.sessionKey) {
        // True while a tool election that was answered "scheduled" has no
        // owner for its session notice; the wake scheduler takes it over.
        let unsignaledWorkElection = false;
        try {
          if (
            embeddedRunResult.meta?.aborted === true ||
            params.opts.abortSignal?.aborted === true
          ) {
            if (attemptContinueWorkRequests.length > 0) {
              log.info(
                `[continuation] Ignoring ${attemptContinueWorkRequests.length} continue_work election(s) because the spawn-init turn was cancelled for session ${sanitizeForLog(params.sessionKey)}`,
              );
            }
            const failedDelegateRows = await failQueuedDelegatesOwnedByRun(
              params.sessionKey,
              {
                originRunId: params.runId,
                legacyCreatedAfter: runStartedAt,
              },
              "Continuation delegate election ignored because the spawn-init turn was cancelled.",
            );
            if (failedDelegateRows > 0) {
              log.info(
                `[continuation] Failed ${failedDelegateRows} queued continue_delegate election(s) because the spawn-init turn was cancelled for session ${sanitizeForLog(params.sessionKey)}`,
              );
            }
            return embeddedRunResult;
          }
          const suppressContinuationAfterReplayUnsafeRun =
            embeddedRunResult.meta?.error?.kind === "incomplete_turn" &&
            embeddedRunResult.meta?.replayInvalid === true;
          if (suppressContinuationAfterReplayUnsafeRun) {
            if (attemptContinueWorkRequests.length > 0) {
              log.info(
                `[continuation] Ignoring ${attemptContinueWorkRequests.length} continue_work election(s) because the spawn-init turn was incomplete and replay-unsafe for session ${sanitizeForLog(params.sessionKey)}`,
              );
            }
            const failedDelegateRows = await failQueuedDelegatesOwnedByRun(
              params.sessionKey,
              {
                originRunId: params.runId,
                legacyCreatedAfter: runStartedAt,
              },
              "Continuation delegate election ignored because the spawn-init turn was incomplete and replay-unsafe.",
            );
            if (failedDelegateRows > 0) {
              log.info(
                `[continuation] Failed ${failedDelegateRows} queued continue_delegate election(s) because the spawn-init turn was incomplete and replay-unsafe for session ${sanitizeForLog(params.sessionKey)}`,
              );
            }
            return embeddedRunResult;
          }
          unsignaledWorkElection = attemptContinueWorkRequests.length > 0;
          const { extractContinuationSignal, stripContinuationSignal } =
            await import("../../auto-reply/continuation/signal.js");
          const continuationPayloads = embeddedRunResult.payloads ?? [];
          const firstWorkRequest = attemptContinueWorkRequests[0];
          const extraction = extractContinuationSignal({
            payloads: continuationPayloads.map((payload) => ({ ...payload })),
            ...(firstWorkRequest ? { continueWorkRequest: firstWorkRequest } : {}),
            enabled: true,
            sessionKey: params.sessionKey,
          });
          if (extraction.signal?.kind === "work") {
            const internalBracketTraceparent = extraction.fromBracket
              ? (resolveContinuationTraceparent(params.opts.traceparent) ??
                formatActiveContinuationTraceparent())
              : undefined;
            const requests =
              !extraction.fromBracket && attemptContinueWorkRequests.length > 0
                ? attemptContinueWorkRequests
                : [
                    {
                      reason: extraction.workReason ?? "",
                      ...(extraction.signal.delayMs !== undefined
                        ? { delaySeconds: extraction.signal.delayMs / 1000 }
                        : {}),
                      ...(internalBracketTraceparent
                        ? { traceparent: internalBracketTraceparent }
                        : {}),
                    },
                  ];
            if (extraction.fromBracket) {
              for (let i = continuationPayloads.length - 1; i >= 0; i--) {
                const payload = continuationPayloads[i];
                if (!payload?.text) {
                  continue;
                }
                const stripped = stripContinuationSignal(payload.text);
                if (stripped.signal?.kind !== "work") {
                  continue;
                }
                payload.text = stripped.text;
                break;
              }
            }
            unsignaledWorkElection = false;
            await scheduleSpawnInitContinueWorkWake({
              sessionKey: params.sessionKey,
              sessionEntry: params.sessionStore?.[params.sessionKey] ?? params.sessionEntry,
              sessionStore: params.sessionStore,
              storePath: params.storePath,
              requests,
              cfg: params.cfg,
              runResult: embeddedRunResult,
              originRunId: params.runId,
              originTurnId: params.sessionId,
              abortSignal: params.opts.abortSignal,
            });
          }
        } catch (err) {
          log.warn(
            `[attempt-execution] failed to schedule continue_work wake for ${sanitizeForLog(params.sessionKey)}: ${sanitizeForLog(String(err))}`,
          );
          if (unsignaledWorkElection) {
            notifyContinueWorkWakeUnconfirmed(params.sessionKey);
          }
        }
      }

      return embeddedRunResult;
    },
  };
}
