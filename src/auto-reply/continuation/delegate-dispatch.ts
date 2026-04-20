/**
 * Continuation delegate dispatch — spawn logic for both immediate and delayed delegates.
 *
 * Consumes pending delegates from the store and dispatches them via spawnSubagentDirect.
 * Handles per-turn cap enforcement, chain-hop prefix, and mode flags.
 *
 * OBSERVABILITY: every spawn outcome (accepted/rejected/failed) is logged at info level,
 * regardless of whether the spawn was immediate or timer-triggered. The old branch gated
 * success logging behind `timerTriggered`, making immediate delegates invisible to operators.
 * Do not reproduce this.
 *
 * RFC: docs/design/continue-work-signal-v2.md §3.2, §3.4
 */

import { spawnSubagentDirect } from "../../agents/subagent-spawn.js";
import type { SpawnSubagentContext } from "../../agents/subagent-spawn.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { resolveContinuationRuntimeConfig } from "./config.js";
import { consumePendingDelegates, peekSoonestUnmaturedDelegateDueAt } from "./delegate-store.js";
import { checkContinuationBudget, type ChainState } from "./scheduler.js";
import {
  setDelegatePending,
  registerContinuationTimerHandle,
  retainContinuationTimerRef,
  unregisterContinuationTimerHandle,
} from "./state.js";

const log = createSubsystemLogger("continuation/delegate-dispatch");

// Per-session hedge timer for re-checking unmatured pending delegates in fully
// quiet channels (no further response-finalize event). Idempotent per
// sessionKey: a fresh dispatch call cancels + replaces any existing hedge.
// See swim-35/A2 verdict.
const hedgeTimers = new Map<string, NodeJS.Timeout>();

function clearHedgeTimer(sessionKey: string): void {
  const existing = hedgeTimers.get(sessionKey);
  if (existing) {
    clearTimeout(existing);
    hedgeTimers.delete(sessionKey);
    unregisterContinuationTimerHandle(sessionKey, existing);
  }
}

function armHedgeTimer(
  sessionKey: string,
  fireAt: number,
  params: { chainState: ChainState; ctx: DelegateDispatchContext; maxChainLength: number },
): void {
  clearHedgeTimer(sessionKey);
  const fireIn = Math.max(0, fireAt - Date.now());
  log.info(
    `[continuation:delegate-hedge-armed] fireIn=${fireIn}ms fireAt=${fireAt} session=${sessionKey}`,
  );
  retainContinuationTimerRef(sessionKey);
  const handle = setTimeout(() => {
    hedgeTimers.delete(sessionKey);
    // Release ref + handle registration on natural fire (matches
    // clearHedgeTimer on cancel). Without this, every hedge that fires
    // naturally leaks a timer-ref and handle, keeping continuation state
    // alive past its useful lifetime. openclaw#189.
    unregisterContinuationTimerHandle(sessionKey, handle);
    log.info(`[continuation:delegate-hedge-fired] session=${sessionKey}`);
    void dispatchToolDelegates({ sessionKey, ...params }).catch((err) => {
      log.info(
        `[continuation:delegate-hedge-error] error=${err instanceof Error ? err.message : String(err)} session=${sessionKey}`,
      );
    });
  }, fireIn);
  registerContinuationTimerHandle(sessionKey, handle);
  handle.unref();
  hedgeTimers.set(sessionKey, handle);
}

/**
 * Test-only: cancel any pending hedge timers and clear the registry.
 */
export function resetDelegateDispatchHedgesForTests(): void {
  for (const [sessionKey, handle] of hedgeTimers) {
    clearTimeout(handle);
    unregisterContinuationTimerHandle(sessionKey, handle);
  }
  hedgeTimers.clear();
}

export type DelegateDispatchContext = {
  sessionKey: string;
  agentChannel?: string;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
};

/**
 * Consume and dispatch all pending tool-dispatched delegates for a session.
 *
 * Called by agent-runner.ts after the response finalizes.
 * Each delegate goes through chain/cost enforcement and is spawned via spawnSubagentDirect.
 */
export async function dispatchToolDelegates(params: {
  sessionKey: string;
  chainState: ChainState;
  ctx: DelegateDispatchContext;
  maxChainLength: number;
}): Promise<{ dispatched: number; rejected: number }> {
  const { sessionKey, chainState, ctx } = params;
  const config = resolveContinuationRuntimeConfig();
  const toolDelegates = consumePendingDelegates(sessionKey);

  // Arm (or re-arm) a hedge timer for any unmatured queued delegates so they
  // still fire in fully-quiet channels where no further response-finalize
  // arrives. The hedge re-invokes this function; idempotent per sessionKey.
  // See swim-35/A2 verdict.
  const soonestUnmaturedDueAt = peekSoonestUnmaturedDelegateDueAt(sessionKey);
  if (soonestUnmaturedDueAt !== undefined) {
    armHedgeTimer(sessionKey, soonestUnmaturedDueAt, {
      chainState: params.chainState,
      ctx: params.ctx,
      maxChainLength: params.maxChainLength,
    });
  } else {
    clearHedgeTimer(sessionKey);
  }

  if (toolDelegates.length === 0) {
    return { dispatched: 0, rejected: 0 };
  }

  log.info(
    `[continue_delegate] Consuming ${toolDelegates.length} tool delegate(s) for session ${sessionKey}`,
  );

  const { maxDelegatesPerTurn, maxChainLength } = config;
  const delegatesWithinLimit = toolDelegates.slice(0, maxDelegatesPerTurn);
  const delegatesOverLimit = toolDelegates.slice(maxDelegatesPerTurn);

  for (const dropped of delegatesOverLimit) {
    log.info(
      `[continuation:delegate-rejected] maxDelegatesPerTurn=${maxDelegatesPerTurn} task=${dropped.task.slice(0, 80)} session=${sessionKey}`,
    );
    enqueueSystemEvent(
      `[continuation] Tool delegate rejected: maxDelegatesPerTurn exceeded (${maxDelegatesPerTurn}). Task: ${dropped.task}`,
      { sessionKey },
    );
  }

  let dispatched = 0;
  let rejected = delegatesOverLimit.length;
  let currentChainCount = chainState.currentChainCount;
  let accumulatedTokens = chainState.accumulatedChainTokens;

  for (const delegate of delegatesWithinLimit) {
    const budgetCheck = checkContinuationBudget({
      chainState: {
        currentChainCount,
        chainStartedAt: chainState.chainStartedAt,
        accumulatedChainTokens: accumulatedTokens,
      },
      config,
      sessionKey,
    });

    if (budgetCheck) {
      log.info(
        `[continuation:delegate-rejected] ${budgetCheck} task=${delegate.task.slice(0, 80)} session=${sessionKey}`,
      );
      enqueueSystemEvent(
        `[continuation] Tool delegate rejected: ${budgetCheck}. Task: ${delegate.task}`,
        { sessionKey },
      );
      rejected++;
      continue;
    }

    const nextHop = currentChainCount + 1;
    const silent = delegate.mode === "silent" || delegate.mode === "silent-wake";
    const silentWake = delegate.mode === "silent-wake";

    // Mark delegate-pending so the runner knows work is queued.
    setDelegatePending(sessionKey);

    const spawnCtx: SpawnSubagentContext = {
      agentSessionKey: sessionKey,
      agentChannel: ctx.agentChannel,
      agentAccountId: ctx.agentAccountId,
      agentTo: ctx.agentTo,
      agentThreadId: ctx.agentThreadId,
    };

    try {
      const result = await spawnSubagentDirect(
        {
          task: `[continuation:chain-hop:${nextHop}] Delegated task (turn ${nextHop}/${maxChainLength}): ${delegate.task}`,
          drainsContinuationDelegateQueue: true,
          ...(silent ? { silentAnnounce: true } : {}),
          ...(silentWake ? { silentAnnounce: true, wakeOnReturn: true } : {}),
        },
        spawnCtx,
      );

      if (result.status === "accepted") {
        // INFO-level on EVERY successful spawn — observability parity.
        log.info(
          `[continuation:delegate-spawned] hop=${nextHop}/${maxChainLength} mode=${delegate.mode ?? "normal"} session=${sessionKey} task=${delegate.task.slice(0, 80)}`,
        );
        enqueueSystemEvent(
          `[continuation:delegate-spawned] Spawned turn ${nextHop}/${maxChainLength}: ${delegate.task}`,
          { sessionKey },
        );
        dispatched++;
        currentChainCount = nextHop;
      } else {
        log.info(
          `[continuation:delegate-spawn-rejected] status=${result.status} session=${sessionKey} task=${delegate.task.slice(0, 80)}`,
        );
        enqueueSystemEvent(
          `[continuation] DELEGATE spawn ${result.status}: delegation was not accepted. Task: ${delegate.task}`,
          { sessionKey },
        );
        rejected++;
      }
    } catch (err) {
      log.info(
        `[continuation:delegate-spawn-failed] error=${err instanceof Error ? err.message : String(err)} session=${sessionKey}`,
      );
      enqueueSystemEvent(
        `[continuation] DELEGATE spawn failed: ${String(err)}. Task: ${delegate.task}`,
        { sessionKey },
      );
      rejected++;
    }
  }

  return { dispatched, rejected };
}

// ---------------------------------------------------------------------------
// Post-compaction delegate dispatch (RFC §4.4)
// ---------------------------------------------------------------------------

const postCompactionLog = createSubsystemLogger("continuation/compaction");

export interface PostCompactionSpawnContext {
  agentSessionKey: string;
  agentChannel?: string;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
}

/**
 * Dispatch post-compaction delegates with silentAnnounce + wakeOnReturn.
 *
 * This mirrors dispatchToolDelegates but is specifically for post-compaction
 * staged delegates. Errors are logged and surfaced as system events rather
 * than silently swallowed.
 *
 * See: issue #203, #639 for bug-class precedent.
 */
export async function dispatchPostCompactionDelegates(
  delegates: Array<{ task: string }>,
  sessionKey: string,
  spawnCtx: PostCompactionSpawnContext,
): Promise<{ dispatched: number; failed: number }> {
  let dispatched = 0;
  let failed = 0;

  postCompactionLog.info(
    `[continuation:compaction-delegate] Consuming ${delegates.length} compaction delegate(s) for session ${sessionKey}`,
  );

  for (const delegate of delegates) {
    try {
      await spawnSubagentDirect(
        {
          task: delegate.task,
          silentAnnounce: true,
          wakeOnReturn: true,
          drainsContinuationDelegateQueue: true,
        },
        spawnCtx,
      );
      dispatched++;
    } catch (err) {
      postCompactionLog.warn(
        `[continuation:post-compaction-spawn-failed] error=${err instanceof Error ? err.message : String(err)} session=${sessionKey} task=${delegate.task.slice(0, 80)}`,
      );
      enqueueSystemEvent(
        `[continuation] Post-compaction delegate spawn failed: ${String(err)}. Task: ${delegate.task}`,
        { sessionKey },
      );
      failed++;
    }
  }

  return { dispatched, failed };
}
