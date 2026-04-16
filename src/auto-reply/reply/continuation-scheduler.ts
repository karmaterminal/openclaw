import { spawnSubagentDirect } from "../../agents/subagent-spawn.js";
import type { SessionEntry } from "../../config/sessions.js";
import { stagePostCompactionDelegate } from "../continuation-delegate-store.js";
import type { PendingContinuationDelegate } from "../continuation-delegate.types.js";
import type { ContinuationSignal } from "../tokens.js";
import type { ContinuationRuntimeConfig } from "./continuation-runtime.js";
import { enqueueFollowupRun, type FollowupRun, type QueueSettings } from "./queue.js";

type ContinuationSchedulerDeps = {
  enqueueFollowupRun: typeof enqueueFollowupRun;
  setTimeout: typeof globalThis.setTimeout;
  spawnSubagentDirect: typeof spawnSubagentDirect;
};

const defaultDeps: ContinuationSchedulerDeps = {
  enqueueFollowupRun,
  setTimeout,
  spawnSubagentDirect,
};

export type ContinuationChainState = {
  count: number;
  startedAt: number;
  tokens: number;
};

export type ScheduleContinuationParams = {
  sessionKey?: string;
  queueKey: string;
  queueSettings: QueueSettings;
  runFollowupTurn: (run: FollowupRun) => Promise<void>;
  followupRun: FollowupRun;
  sessionEntry?: Pick<
    SessionEntry,
    "continuationChainCount" | "continuationChainStartedAt" | "continuationChainTokens"
  >;
  config: ContinuationRuntimeConfig;
  turnTokens: number;
  signal?: ContinuationSignal | null;
  workReason?: string;
  delegates: PendingContinuationDelegate[];
  onChainStateAccepted?: (state: ContinuationChainState) => Promise<void> | void;
};

export type ScheduleContinuationResult = {
  acceptedWork: boolean;
  acceptedDelegates: number;
  nextChainState?: ContinuationChainState;
};

function resolveCurrentChainState(
  sessionEntry?: Pick<
    SessionEntry,
    "continuationChainCount" | "continuationChainStartedAt" | "continuationChainTokens"
  >,
): ContinuationChainState {
  return {
    count: sessionEntry?.continuationChainCount ?? 0,
    startedAt: sessionEntry?.continuationChainStartedAt ?? Date.now(),
    tokens: sessionEntry?.continuationChainTokens ?? 0,
  };
}

function clampDelayMs(
  requestedDelayMs: number | undefined,
  config: Pick<ContinuationRuntimeConfig, "defaultDelayMs" | "minDelayMs" | "maxDelayMs">,
): number {
  if (requestedDelayMs === 0) {
    return 0;
  }
  const requested = requestedDelayMs ?? config.defaultDelayMs;
  if (requested <= 0) {
    return 0;
  }
  return Math.max(config.minDelayMs, Math.min(config.maxDelayMs, requested));
}

function resolveScheduledDelegates(
  params: Pick<ScheduleContinuationParams, "signal" | "delegates" | "config">,
): PendingContinuationDelegate[] {
  const signalDelegate =
    params.signal?.kind === "delegate"
      ? [
          {
            task: params.signal.task,
            delayMs: params.signal.delayMs,
            silent: params.signal.silent,
            silentWake: params.signal.silentWake,
            postCompaction: params.signal.postCompaction,
          },
        ]
      : [];
  const remainingToolBudget = Math.max(
    0,
    params.config.maxDelegatesPerTurn - signalDelegate.length,
  );
  return [...signalDelegate, ...params.delegates.slice(0, remainingToolBudget)];
}

function buildContinuationWakePrompt(params: {
  hop: number;
  maxChainLength: number;
  startedAt: number;
  tokens: number;
  reason?: string;
}): string {
  return [
    `[continuation:wake] Turn ${params.hop}/${params.maxChainLength}.`,
    `Chain started at ${new Date(params.startedAt).toISOString()}.`,
    `Accumulated tokens: ${params.tokens}.`,
    params.reason
      ? `Resume the outstanding work. Prior continuation reason: ${params.reason}`
      : "Resume the outstanding work now.",
  ].join(" ");
}

async function spawnContinuationDelegate(
  deps: ContinuationSchedulerDeps,
  params: {
    sessionKey: string;
    delegate: PendingContinuationDelegate;
    hop: number;
    maxChainLength: number;
    followupRun: FollowupRun;
  },
): Promise<void> {
  await deps.spawnSubagentDirect(
    {
      task: `[continuation:chain-hop:${params.hop}] Delegated task (turn ${params.hop}/${params.maxChainLength}): ${params.delegate.task}`,
      expectsCompletionMessage:
        params.delegate.silent !== true &&
        params.delegate.silentWake !== true &&
        params.delegate.postCompaction !== true,
    },
    {
      agentSessionKey: params.sessionKey,
      agentChannel: params.followupRun.originatingChannel ?? undefined,
      agentAccountId: params.followupRun.originatingAccountId ?? undefined,
      agentTo: params.followupRun.originatingTo ?? undefined,
      agentThreadId: params.followupRun.originatingThreadId ?? undefined,
    },
  );
}

export async function scheduleContinuation(
  params: ScheduleContinuationParams,
  deps: ContinuationSchedulerDeps = defaultDeps,
): Promise<ScheduleContinuationResult> {
  if (!params.sessionKey) {
    return { acceptedWork: false, acceptedDelegates: 0 };
  }

  const currentState = resolveCurrentChainState(params.sessionEntry);
  const workSignal = params.signal?.kind === "work" ? params.signal : null;
  const scheduledDelegates = resolveScheduledDelegates(params);
  const candidateCount = (workSignal ? 1 : 0) + scheduledDelegates.length;
  if (candidateCount === 0) {
    return { acceptedWork: false, acceptedDelegates: 0 };
  }

  const nextTokens = currentState.tokens + params.turnTokens;
  if (params.config.costCapTokens > 0 && nextTokens > params.config.costCapTokens) {
    return { acceptedWork: false, acceptedDelegates: 0 };
  }

  let acceptedWork = false;
  let acceptedDelegates = 0;
  let currentCount = currentState.count;
  const startedAt = currentState.startedAt;

  const enqueueWork = (hop: number, reason?: string, delayMs?: number) => {
    const queued: FollowupRun = {
      ...params.followupRun,
      prompt: buildContinuationWakePrompt({
        hop,
        maxChainLength: params.config.maxChainLength,
        startedAt,
        tokens: nextTokens,
        reason,
      }),
      summaryLine: reason ? `Continue: ${reason}` : "Continuation wake",
      enqueuedAt: Date.now(),
      run: {
        ...params.followupRun.run,
      },
    };
    const enqueue = () =>
      deps.enqueueFollowupRun(
        params.queueKey,
        queued,
        params.queueSettings,
        "none",
        params.runFollowupTurn,
      );
    const clampedDelay = clampDelayMs(delayMs, params.config);
    if (clampedDelay <= 0) {
      enqueue();
      return;
    }
    const timer = deps.setTimeout(enqueue, clampedDelay);
    timer.unref?.();
  };

  if (workSignal && currentCount < params.config.maxChainLength) {
    currentCount += 1;
    acceptedWork = true;
    enqueueWork(currentCount, params.workReason, workSignal.delayMs);
  }

  for (const delegate of scheduledDelegates) {
    if (currentCount >= params.config.maxChainLength) {
      break;
    }
    currentCount += 1;
    acceptedDelegates += 1;
    const hop = currentCount;
    if (delegate.postCompaction === true) {
      stagePostCompactionDelegate(params.sessionKey, delegate);
      continue;
    }
    const spawn = () =>
      void spawnContinuationDelegate(deps, {
        sessionKey: params.sessionKey!,
        delegate,
        hop,
        maxChainLength: params.config.maxChainLength,
        followupRun: params.followupRun,
      });
    const clampedDelay = clampDelayMs(delegate.delayMs, params.config);
    if (clampedDelay <= 0) {
      spawn();
      continue;
    }
    const timer = deps.setTimeout(spawn, clampedDelay);
    timer.unref?.();
  }

  if (!acceptedWork && acceptedDelegates === 0) {
    return { acceptedWork, acceptedDelegates };
  }

  const nextChainState: ContinuationChainState = {
    count: currentCount,
    startedAt,
    tokens: nextTokens,
  };
  await params.onChainStateAccepted?.(nextChainState);
  return {
    acceptedWork,
    acceptedDelegates,
    nextChainState,
  };
}
