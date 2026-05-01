import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { emitAgentEvent } from "../infra/agent-events.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import {
  normalizeCompactionTrigger,
  type CompactionCounterAttribution,
} from "./compaction-attribution.js";
import type { EmbeddedPiSubscribeContext } from "./pi-embedded-subscribe.handlers.types.js";
import { makeZeroUsageSnapshot } from "./usage.js";

function formatCompactionError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emitCompactionCountReconcileFailure(params: {
  ctx: EmbeddedPiSubscribeContext;
  error: unknown;
  trigger: ReturnType<typeof normalizeCompactionTrigger>;
  compactionCountBefore: number;
  compactionCountAfter: number;
}): void {
  const { ctx, error, trigger, compactionCountBefore, compactionCountAfter } = params;
  const message = formatCompactionError(error);
  const data = {
    phase: "warning",
    warning: "compaction_count_reconcile_failed",
    sessionKey: ctx.params.sessionKey,
    trigger,
    outcome: "compacted",
    error: message,
    compactionCountBefore,
    compactionCountAfter,
    compactionCountDelta: compactionCountAfter - compactionCountBefore,
  };
  ctx.log.warn(
    `[compaction-counter:reconcile-failed] runId=${ctx.params.runId} sessionKey=${ctx.params.sessionKey ?? ctx.params.sessionId} ` +
      `trigger=${trigger} observed=${compactionCountAfter} error=${message}`,
  );
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "compaction",
    sessionKey: ctx.params.sessionKey,
    data,
  });
  void Promise.resolve(ctx.params.onAgentEvent?.({ stream: "compaction", data })).catch(
    (eventErr) => {
      ctx.log.warn(
        `compaction count reconcile failure event delivery failed: ${formatCompactionError(eventErr)}`,
      );
    },
  );
}

export function handleCompactionStart(
  ctx: EmbeddedPiSubscribeContext,
  evt?: AgentEvent & { reason?: unknown },
) {
  const trigger = normalizeCompactionTrigger(evt?.reason);
  ctx.state.compactionInFlight = true;
  ctx.state.livenessState = "paused";
  ctx.ensureCompactionPromise();
  ctx.log.debug(`embedded run compaction start: runId=${ctx.params.runId} trigger=${trigger}`);
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "compaction",
    data: { phase: "start", trigger, sessionKey: ctx.params.sessionKey },
  });
  void ctx.params.onAgentEvent?.({
    stream: "compaction",
    data: { phase: "start", trigger, sessionKey: ctx.params.sessionKey },
  });

  // Run before_compaction plugin hook (fire-and-forget)
  const hookRunner = getGlobalHookRunner();
  if (hookRunner?.hasHooks("before_compaction")) {
    void hookRunner
      .runBeforeCompaction(
        {
          messageCount: ctx.params.session.messages?.length ?? 0,
          messages: ctx.params.session.messages,
          sessionFile: ctx.params.session.sessionFile,
        },
        {
          sessionKey: ctx.params.sessionKey,
        },
      )
      .catch((err) => {
        ctx.log.warn(`before_compaction hook failed: ${String(err)}`);
      });
  }
}

export function handleCompactionEnd(
  ctx: EmbeddedPiSubscribeContext,
  evt: AgentEvent & {
    reason?: unknown;
    willRetry?: unknown;
    result?: unknown;
    aborted?: unknown;
    errorMessage?: unknown;
  },
) {
  ctx.state.compactionInFlight = false;
  const trigger = normalizeCompactionTrigger(evt.reason);
  const willRetry = Boolean(evt.willRetry);
  // Increment counter whenever compaction actually produced a result,
  // regardless of willRetry.  Overflow-triggered compaction sets willRetry=true
  // (the framework retries the LLM request), but the compaction itself succeeded
  // and context was trimmed — the counter must reflect that.  (#38905)
  const hasResult = evt.result != null;
  const wasAborted = Boolean(evt.aborted);
  const compactionCountBefore = ctx.getCompactionCount();
  let compactionCountAfter = compactionCountBefore;
  if (hasResult && !wasAborted) {
    ctx.incrementCompactionCount();
    compactionCountAfter = ctx.getCompactionCount();
    void reconcileSessionStoreCompactionCountAfterSuccess({
      sessionKey: ctx.params.sessionKey,
      agentId: ctx.params.agentId,
      configStore: ctx.params.config?.session?.store,
      observedCompactionCount: compactionCountAfter,
      attribution: {
        runId: ctx.params.runId,
        trigger,
        outcome: "compacted",
      },
    }).catch((err) => {
      emitCompactionCountReconcileFailure({
        ctx,
        error: err,
        trigger,
        compactionCountBefore,
        compactionCountAfter,
      });
    });
  }
  const completed = hasResult && !wasAborted;
  const outcome = completed ? "compacted" : wasAborted ? "aborted" : "skipped";
  const compactionCountDelta = compactionCountAfter - compactionCountBefore;
  ctx.log.debug(
    `[compaction-attribution] end runId=${ctx.params.runId} sessionKey=${ctx.params.sessionKey ?? ctx.params.sessionId} ` +
      `trigger=${trigger} outcome=${outcome} willRetry=${willRetry} ` +
      `compactionCount.before=${compactionCountBefore} compactionCount.after=${compactionCountAfter} ` +
      `compactionCount.delta=${compactionCountDelta}`,
  );
  if (willRetry) {
    ctx.noteCompactionRetry();
    ctx.resetForCompactionRetry();
    ctx.log.debug(`embedded run compaction retry: runId=${ctx.params.runId}`);
  } else {
    if (!wasAborted) {
      ctx.state.livenessState = "working";
    }
    ctx.maybeResolveCompactionWait();
    clearStaleAssistantUsageOnSessionMessages(ctx);
  }
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "compaction",
    data: {
      phase: "end",
      willRetry,
      completed,
      trigger,
      sessionKey: ctx.params.sessionKey,
      compactionCountBefore,
      compactionCountAfter,
      compactionCountDelta,
    },
  });
  void ctx.params.onAgentEvent?.({
    stream: "compaction",
    data: {
      phase: "end",
      willRetry,
      completed,
      trigger,
      sessionKey: ctx.params.sessionKey,
      compactionCountBefore,
      compactionCountAfter,
      compactionCountDelta,
    },
  });

  // Run after_compaction plugin hook (fire-and-forget)
  if (!willRetry) {
    const hookRunnerEnd = getGlobalHookRunner();
    if (hookRunnerEnd?.hasHooks("after_compaction")) {
      void hookRunnerEnd
        .runAfterCompaction(
          {
            messageCount: ctx.params.session.messages?.length ?? 0,
            compactedCount: ctx.getCompactionCount(),
            sessionFile: ctx.params.session.sessionFile,
          },
          { sessionKey: ctx.params.sessionKey },
        )
        .catch((err) => {
          ctx.log.warn(`after_compaction hook failed: ${String(err)}`);
        });
    }
  }
}

export async function reconcileSessionStoreCompactionCountAfterSuccess(params: {
  sessionKey?: string;
  agentId?: string;
  configStore?: string;
  observedCompactionCount: number;
  now?: number;
  attribution?: CompactionCounterAttribution;
}): Promise<number | undefined> {
  const { reconcileSessionStoreCompactionCountAfterSuccess: reconcile } =
    await import("./pi-embedded-subscribe.handlers.compaction.runtime.js");
  return reconcile(params);
}

function clearStaleAssistantUsageOnSessionMessages(ctx: EmbeddedPiSubscribeContext): void {
  const messages = ctx.params.session.messages;
  if (!Array.isArray(messages)) {
    return;
  }
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }
    const candidate = message as { role?: unknown; usage?: unknown };
    if (candidate.role !== "assistant") {
      continue;
    }
    // pi-coding-agent expects assistant usage to exist when computing context usage.
    // Reset stale snapshots to zeros instead of deleting the field.
    candidate.usage = makeZeroUsageSnapshot();
  }
}
