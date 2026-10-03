// Pure builders for one pending-delegate dispatch: the chain basis its budget
// check uses, and the spawn-owner request carrying its claimed launch key
// (RFC docs/design/continue-work-signal-v2.md §5.4.4).
import type { SpawnSubagentParams } from "../../agents/subagents/spawn/subagent-spawn.js";
import type { ChainState } from "./scheduler.js";
import type { PendingContinuationDelegate } from "./types.js";

/**
 * The chain basis a delegate is budget-checked against. A delegate that
 * already planned its chain charge is checked against that plan (one hop back
 * for an `advanced` marker), so a replay never charges the same hop twice.
 */
export function delegateBudgetChainState(
  delegate: PendingContinuationDelegate,
  current: ChainState,
): ChainState {
  const planned = delegate.persistedChainState;
  if (!planned) {
    return current;
  }
  const kind = delegate.persistedChainStateKind ?? "advanced";
  return {
    currentChainCount:
      kind === "advanced" ? Math.max(0, planned.currentChainCount - 1) : planned.currentChainCount,
    chainStartedAt: planned.chainStartedAt,
    accumulatedChainTokens: planned.accumulatedChainTokens,
    ...(planned.chainId ? { chainId: planned.chainId } : {}),
  };
}

/** The spawn-owner request for one claimed pending delegate. */
export function buildDelegateSpawnRequest(params: {
  delegate: PendingContinuationDelegate;
  nextHop: number;
  maxChainLength: number;
  chainState: { startedAt: number; tokens: number; chainId?: string };
  silent: boolean;
  silentWake: boolean;
  traceparent?: string;
}): SpawnSubagentParams {
  const { delegate, nextHop } = params;
  return {
    task: `[continuation:chain-hop:${nextHop}] Delegated task (turn ${nextHop}/${params.maxChainLength}): ${delegate.task}`,
    drainsContinuationDelegateQueue: true,
    continuationChainState: {
      count: nextHop,
      startedAt: params.chainState.startedAt,
      tokens: params.chainState.tokens,
      ...(params.chainState.chainId ? { chainId: params.chainState.chainId } : {}),
    },
    ...(delegate.model ? { model: delegate.model } : {}),
    ...(delegate.attachments ? { attachments: delegate.attachments } : {}),
    ...(delegate.attachAs?.mountPath ? { attachMountPath: delegate.attachAs.mountPath } : {}),
    ...(delegate.flowId ? { continuationDelegateFlowId: delegate.flowId } : {}),
    ...(delegate.spawnAttempt ? { continuationChildRunId: delegate.spawnAttempt.childRunId } : {}),
    ...(params.silent ? { silentAnnounce: true } : {}),
    ...(params.silentWake ? { silentAnnounce: true, wakeOnReturn: true } : {}),
    ...(delegate.targetSessionKey
      ? { continuationTargetSessionKey: delegate.targetSessionKey }
      : {}),
    ...(delegate.targetSessionKeys && delegate.targetSessionKeys.length > 0
      ? { continuationTargetSessionKeys: delegate.targetSessionKeys }
      : {}),
    ...(delegate.fanoutMode ? { continuationFanoutMode: delegate.fanoutMode } : {}),
    ...(delegate.recipientAuthorityBinding
      ? { continuationRecipientAuthorityBinding: delegate.recipientAuthorityBinding }
      : {}),
    ...(params.traceparent ? { traceparent: params.traceparent } : {}),
  };
}
