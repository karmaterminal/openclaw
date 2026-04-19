/**
 * Continuation delegate dispatch helper for non-runReplyAgent paths.
 *
 * agent-command.ts (subagent) and followup-runner.ts go through different
 * code paths than runReplyAgent, so continue_delegate tool calls enqueued
 * during those turns were orphaned (F7 fix). This helper consumes and
 * dispatches them using the same chain/cost enforcement as the inline
 * dispatch in agent-runner.ts.
 *
 * RFC: docs/design/continue-work-signal-v2.md §3.2
 */

import { spawnSubagentDirect } from "../agents/subagent-spawn.js";
import type { SpawnSubagentContext } from "../agents/subagent-spawn.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { enqueueSystemEvent } from "../infra/system-events.js";
import {
  consumePendingDelegates,
  highestDelayedContinuationReservationHop,
} from "./continuation-delegate-store.js";
import { resolveContinuationRuntimeConfig } from "./reply/continuation-runtime.js";
import {
  setDelegatePending,
  clearDelegatePendingIfNoDelayedReservations,
} from "./reply/continuation-state.js";

export type DelegateDispatchContext = {
  sessionKey: string;
  agentChannel?: string;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
};

export type ChainState = {
  currentChainCount: number;
  chainStartedAt: number;
  accumulatedChainTokens: number;
};

/**
 * Consume and dispatch all pending tool-dispatched delegates for a session.
 *
 * Called by agent-command.ts and followup-runner.ts after response finalizes.
 * Each delegate goes through chain/cost enforcement and is spawned via spawnSubagentDirect.
 */
export async function dispatchToolDelegates(params: {
  sessionKey: string;
  chainState: ChainState;
  ctx: DelegateDispatchContext;
  maxChainLength: number;
  cfg?: OpenClawConfig;
}): Promise<{ dispatched: number; rejected: number }> {
  const { sessionKey, chainState, ctx } = params;
  const config = resolveContinuationRuntimeConfig(params.cfg);
  const toolDelegates = consumePendingDelegates(sessionKey);

  if (toolDelegates.length === 0) {
    return { dispatched: 0, rejected: 0 };
  }

  const { maxDelegatesPerTurn, maxChainLength, costCapTokens } = config;
  const delegatesWithinLimit = toolDelegates.slice(0, maxDelegatesPerTurn);
  const delegatesOverLimit = toolDelegates.slice(maxDelegatesPerTurn);

  for (const dropped of delegatesOverLimit) {
    enqueueSystemEvent(
      `[continuation] Tool delegate rejected: maxDelegatesPerTurn exceeded (${maxDelegatesPerTurn}). Task: ${dropped.task}`,
      { sessionKey },
    );
  }

  let dispatched = 0;
  let rejected = delegatesOverLimit.length;
  let currentChainCount = chainState.currentChainCount;
  const accumulatedChainTokens = chainState.accumulatedChainTokens;

  for (const delegate of delegatesWithinLimit) {
    const allocatedChainHop = Math.max(
      currentChainCount,
      highestDelayedContinuationReservationHop(sessionKey),
    );
    if (allocatedChainHop >= maxChainLength) {
      enqueueSystemEvent(
        `[continuation] Tool delegate rejected: chain length ${maxChainLength} reached. Task: ${delegate.task}`,
        { sessionKey },
      );
      rejected++;
      break;
    }

    if (costCapTokens > 0 && accumulatedChainTokens > costCapTokens) {
      enqueueSystemEvent(
        `[continuation] Tool delegate rejected: cost cap exceeded (${accumulatedChainTokens} > ${costCapTokens}). Task: ${delegate.task}`,
        { sessionKey },
      );
      rejected++;
      break;
    }

    const nextHop = allocatedChainHop + 1;
    const silent = delegate.silent;
    const silentWake = delegate.silentWake;

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
        enqueueSystemEvent(
          `[continuation:delegate-spawned] Tool delegate turn ${nextHop}/${maxChainLength}: ${delegate.task}`,
          { sessionKey },
        );
        dispatched++;
        currentChainCount = nextHop;
      } else {
        enqueueSystemEvent(
          `[continuation] Tool DELEGATE spawn ${result.status}: ${delegate.task}`,
          { sessionKey },
        );
        clearDelegatePendingIfNoDelayedReservations(sessionKey);
        rejected++;
      }
    } catch (err) {
      clearDelegatePendingIfNoDelayedReservations(sessionKey);
      enqueueSystemEvent(
        `[continuation] Tool DELEGATE spawn failed: ${String(err)}. Task: ${delegate.task}`,
        { sessionKey },
      );
      rejected++;
    }
  }

  return { dispatched, rejected };
}
