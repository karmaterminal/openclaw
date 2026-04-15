import { createRunStateMachine } from "openclaw/plugin-sdk/channel-lifecycle";
import { KeyedAsyncQueue } from "openclaw/plugin-sdk/keyed-async-queue";
import {
  abortReplyRunBySessionKey,
  waitForReplyRunIdleBySessionKey,
} from "openclaw/plugin-sdk/reply-runtime";
import { danger, formatDurationSeconds } from "openclaw/plugin-sdk/runtime-env";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import { materializeDiscordInboundJob, type DiscordInboundJob } from "./inbound-job.js";
import type { RuntimeEnv } from "./message-handler.preflight.types.js";
import { processDiscordMessage } from "./message-handler.process.js";
import { deliverDiscordReply } from "./reply-delivery.js";
import type { DiscordMonitorStatusSink } from "./status.js";
import { resolveDiscordReplyDeliveryPlan } from "./threading.js";
import { normalizeDiscordInboundWorkerTimeoutMs, runDiscordTaskWithTimeout } from "./timeouts.js";

type DiscordInboundWorkerParams = {
  runtime: RuntimeEnv;
  setStatus?: DiscordMonitorStatusSink;
  abortSignal?: AbortSignal;
  runTimeoutMs?: number;
  __testing?: DiscordInboundWorkerTestingHooks;
};

export type DiscordInboundWorker = {
  enqueue: (job: DiscordInboundJob) => void;
  deactivate: () => void;
};

export type DiscordInboundWorkerTestingHooks = {
  processDiscordMessage?: typeof processDiscordMessage;
  deliverDiscordReply?: typeof deliverDiscordReply;
  abortReplyRunBySessionKey?: typeof abortReplyRunBySessionKey;
  waitForReplyRunIdleBySessionKey?: typeof waitForReplyRunIdleBySessionKey;
};

const DISCORD_TIMEOUT_ABORT_WAIT_MS = 5_000;

function formatDiscordRunContextSuffix(job: DiscordInboundJob): string {
  const channelId = job.payload.messageChannelId?.trim();
  const messageId = job.payload.data?.message?.id?.trim();
  const details = [
    channelId ? `channelId=${channelId}` : null,
    messageId ? `messageId=${messageId}` : null,
  ].filter((entry): entry is string => Boolean(entry));
  if (details.length === 0) {
    return "";
  }
  return ` (${details.join(", ")})`;
}

function resolveDiscordInboundWorkerSessionKey(params: {
  job: DiscordInboundJob;
  sessionKey?: string;
}): string | undefined {
  return normalizeOptionalString(
    params.sessionKey ?? params.job.payload.route.sessionKey ?? params.job.payload.baseSessionKey,
  );
}

function abortTimedOutDiscordReplyRun(params: {
  job: DiscordInboundJob;
  sessionKey?: string;
  abortReplyRunBySessionKeyImpl?: typeof abortReplyRunBySessionKey;
}): string | undefined {
  const resolvedSessionKey = resolveDiscordInboundWorkerSessionKey(params);
  if (!resolvedSessionKey) {
    return undefined;
  }
  const abortImpl = params.abortReplyRunBySessionKeyImpl ?? abortReplyRunBySessionKey;
  return abortImpl(resolvedSessionKey) ? resolvedSessionKey : undefined;
}

async function waitForTimedOutDiscordReplyRunCleanup(params: {
  runtime: RuntimeEnv;
  contextSuffix: string;
  sessionKey?: string;
  waitForReplyRunIdleBySessionKeyImpl?: typeof waitForReplyRunIdleBySessionKey;
}) {
  const resolvedSessionKey = normalizeOptionalString(params.sessionKey);
  if (!resolvedSessionKey) {
    return;
  }
  const waitForIdleImpl =
    params.waitForReplyRunIdleBySessionKeyImpl ?? waitForReplyRunIdleBySessionKey;
  const cleanedUp = await waitForIdleImpl(resolvedSessionKey, DISCORD_TIMEOUT_ABORT_WAIT_MS);
  if (cleanedUp) {
    return;
  }
  params.runtime.error?.(
    danger(
      `discord inbound worker timeout cleanup did not finish within ${formatDurationSeconds(
        DISCORD_TIMEOUT_ABORT_WAIT_MS,
        {
          decimals: 1,
          unit: "seconds",
        },
      )}${params.contextSuffix}`,
    ),
  );
}

async function processDiscordInboundJob(params: {
  job: DiscordInboundJob;
  runtime: RuntimeEnv;
  lifecycleSignal?: AbortSignal;
  runTimeoutMs?: number;
  testing?: DiscordInboundWorkerTestingHooks;
}) {
  const timeoutMs = normalizeDiscordInboundWorkerTimeoutMs(params.runTimeoutMs);
  const contextSuffix = formatDiscordRunContextSuffix(params.job);
  let finalReplyStarted = false;
  let createdThreadId: string | undefined;
  let sessionKey: string | undefined;
  const processDiscordMessageImpl = params.testing?.processDiscordMessage ?? processDiscordMessage;
  await runDiscordTaskWithTimeout({
    run: async (abortSignal) => {
      await processDiscordMessageImpl(materializeDiscordInboundJob(params.job, abortSignal), {
        onFinalReplyStart: () => {
          finalReplyStarted = true;
        },
        onFinalReplyDelivered: () => {
          finalReplyStarted = true;
        },
        onReplyPlanResolved: (resolved) => {
          createdThreadId = normalizeOptionalString(resolved.createdThreadId);
          sessionKey = normalizeOptionalString(resolved.sessionKey);
        },
      });
    },
    timeoutMs,
    abortSignals: [params.job.runtime.abortSignal, params.lifecycleSignal],
    onTimeout: async (resolvedTimeoutMs) => {
      params.runtime.error?.(
        danger(
          `discord inbound worker timed out after ${formatDurationSeconds(resolvedTimeoutMs, {
            decimals: 1,
            unit: "seconds",
          })}${contextSuffix}`,
        ),
      );
      const abortedSessionKey = abortTimedOutDiscordReplyRun({
        job: params.job,
        sessionKey,
        abortReplyRunBySessionKeyImpl: params.testing?.abortReplyRunBySessionKey,
      });
      if (finalReplyStarted) {
        await waitForTimedOutDiscordReplyRunCleanup({
          runtime: params.runtime,
          contextSuffix,
          sessionKey: abortedSessionKey,
          waitForReplyRunIdleBySessionKeyImpl: params.testing?.waitForReplyRunIdleBySessionKey,
        });
        return;
      }
      await sendDiscordInboundWorkerTimeoutReply({
        job: params.job,
        runtime: params.runtime,
        contextSuffix,
        createdThreadId,
        sessionKey,
        deliverDiscordReplyImpl: params.testing?.deliverDiscordReply,
      });
      await waitForTimedOutDiscordReplyRunCleanup({
        runtime: params.runtime,
        contextSuffix,
        sessionKey: abortedSessionKey,
        waitForReplyRunIdleBySessionKeyImpl: params.testing?.waitForReplyRunIdleBySessionKey,
      });
    },
    onErrorAfterTimeout: (error) => {
      params.runtime.error?.(
        danger(`discord inbound worker failed after timeout: ${String(error)}${contextSuffix}`),
      );
    },
  });
}

async function sendDiscordInboundWorkerTimeoutReply(params: {
  job: DiscordInboundJob;
  runtime: RuntimeEnv;
  contextSuffix: string;
  createdThreadId?: string;
  sessionKey?: string;
  deliverDiscordReplyImpl?: typeof deliverDiscordReply;
}) {
  const messageChannelId = params.job.payload.messageChannelId?.trim();
  const messageId = params.job.payload.message?.id?.trim();
  const token = params.job.payload.token?.trim();
  if (!messageChannelId || !messageId || !token) {
    params.runtime.error?.(
      danger(
        `discord inbound worker timeout reply skipped: missing reply target${params.contextSuffix}`,
      ),
    );
    return;
  }

  const deliveryPlan = resolveDiscordReplyDeliveryPlan({
    replyTarget: `channel:${params.job.payload.threadChannel?.id ?? messageChannelId}`,
    replyToMode: params.job.payload.replyToMode,
    messageId,
    threadChannel: params.job.payload.threadChannel,
    createdThreadId: params.createdThreadId,
  });

  try {
    await (params.deliverDiscordReplyImpl ?? deliverDiscordReply)({
      cfg: params.job.payload.cfg,
      replies: [{ text: "Discord inbound worker timed out.", isError: true }],
      target: deliveryPlan.deliverTarget,
      token,
      accountId: params.job.payload.accountId,
      runtime: params.runtime,
      textLimit: params.job.payload.textLimit,
      maxLinesPerMessage: params.job.payload.discordConfig?.maxLinesPerMessage,
      replyToId: deliveryPlan.replyReference.use(),
      replyToMode: params.job.payload.replyToMode,
      sessionKey:
        params.sessionKey ??
        params.job.payload.route.sessionKey ??
        params.job.payload.baseSessionKey,
      threadBindings: params.job.runtime.threadBindings,
    });
  } catch (error) {
    params.runtime.error?.(
      danger(
        `discord inbound worker timeout reply failed: ${String(error)}${params.contextSuffix}`,
      ),
    );
  }
}

export function createDiscordInboundWorker(
  params: DiscordInboundWorkerParams,
): DiscordInboundWorker {
  const runQueue = new KeyedAsyncQueue();
  const runState = createRunStateMachine({
    setStatus: params.setStatus,
    abortSignal: params.abortSignal,
  });

  return {
    enqueue(job) {
      void runQueue
        .enqueue(job.queueKey, async () => {
          if (!runState.isActive()) {
            return;
          }
          runState.onRunStart();
          try {
            if (!runState.isActive()) {
              return;
            }
            await processDiscordInboundJob({
              job,
              runtime: params.runtime,
              lifecycleSignal: params.abortSignal,
              runTimeoutMs: params.runTimeoutMs,
              testing: params.__testing,
            });
          } finally {
            runState.onRunEnd();
          }
        })
        .catch((error) => {
          params.runtime.error?.(danger(`discord inbound worker failed: ${String(error)}`));
        });
    },
    deactivate: runState.deactivate,
  };
}
