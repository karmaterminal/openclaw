import { spawnSubagentDirect, type SpawnSubagentResult } from "../../agents/subagent-spawn.js";
import type { SessionPostCompactionDelegate } from "../../config/sessions.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { defaultRuntime } from "../../runtime.js";

// Origin context carried across the spawn boundary so the spawned shard
// inherits the parent's reply-routing fields. Substrate-shape: only the
// transport hints, no chain state.
export type PostCompactionDelegateOriginatingContext = {
  channel?: string;
  accountId?: string;
  to?: string;
  threadId?: string | number;
};

export type ChainBudgetVerdict =
  | { allow: true }
  | { allow: false; reason: "chain-length" | "cost-cap" };

export type EvaluatePostCompactionChainBudgetParams = {
  currentChainCount: number;
  maxChainLength: number;
  chainTokens: number;
  costCapTokens: number;
};

// Pure decision function. Splitting this out makes the chain-budget rule
// testable in isolation and re-callable from any drain layer (today the
// inline post-compaction loop in agent-runner; tomorrow a substrate-driven
// deliver callback — see #335 §4.6 / #332 Item B audit).
export function evaluatePostCompactionChainBudget(
  params: EvaluatePostCompactionChainBudgetParams,
): ChainBudgetVerdict {
  if (params.currentChainCount >= params.maxChainLength) {
    return { allow: false, reason: "chain-length" };
  }
  if (params.costCapTokens > 0 && params.chainTokens > params.costCapTokens) {
    return { allow: false, reason: "cost-cap" };
  }
  return { allow: true };
}

export type DispatchPostCompactionDelegateParams = {
  delegate: SessionPostCompactionDelegate;
  sessionKey: string;
  currentChainCount: number;
  maxChainLength: number;
  chainTokens: number;
  costCapTokens: number;
  originatingContext: PostCompactionDelegateOriginatingContext;
};

export type PostCompactionDelegateDispatchOutcome =
  | { kind: "dispatched"; nextChainCount: number; childSessionKey?: string }
  | { kind: "rejected-chain-length" }
  | { kind: "rejected-cost-cap" }
  | { kind: "rejected-spawn"; status: SpawnSubagentResult["status"]; reStage: true }
  | { kind: "error"; error: unknown; reStage: true };

// Single-delegate dispatcher. Encapsulates the chain-budget check, the
// subagent spawn call, and the lifecycle log/system-event side effects.
// The caller updates aggregate counters and re-stage lists from the outcome.
export async function dispatchPostCompactionDelegate(
  params: DispatchPostCompactionDelegateParams,
): Promise<PostCompactionDelegateDispatchOutcome> {
  const { sessionKey, delegate } = params;
  const verdict = evaluatePostCompactionChainBudget({
    currentChainCount: params.currentChainCount,
    maxChainLength: params.maxChainLength,
    chainTokens: params.chainTokens,
    costCapTokens: params.costCapTokens,
  });

  if (!verdict.allow) {
    if (verdict.reason === "chain-length") {
      defaultRuntime.log(
        `Post-compaction delegate rejected: chain length ${params.currentChainCount} >= ${params.maxChainLength} for session ${sessionKey}`,
      );
      enqueueSystemEvent(
        `[continuation] Post-compaction delegate rejected: chain length ${params.maxChainLength} reached. Task: ${delegate.task}`,
        { sessionKey },
      );
      return { kind: "rejected-chain-length" };
    }
    defaultRuntime.log(
      `Post-compaction delegate rejected: cost cap exceeded (${params.chainTokens} > ${params.costCapTokens}) for session ${sessionKey}`,
    );
    enqueueSystemEvent(
      `[continuation] Post-compaction delegate rejected: cost cap exceeded (${params.chainTokens} > ${params.costCapTokens}). Task: ${delegate.task}`,
      { sessionKey },
    );
    return { kind: "rejected-cost-cap" };
  }

  const nextChainCount = params.currentChainCount + 1;
  const wakeOnReturn = delegate.silentWake ?? true;
  const silentAnnounce = delegate.silent ?? wakeOnReturn;

  defaultRuntime.log(
    `Post-compaction delegate dispatch for session ${sessionKey}: ${delegate.task}`,
  );
  try {
    const spawnResult = await spawnSubagentDirect(
      {
        task:
          `[continuation:post-compaction] ` +
          `[continuation:chain-hop:${nextChainCount}] ` +
          `Compaction just completed. Carry this working state to the post-compaction session: ${delegate.task}`,
        ...(silentAnnounce ? { silentAnnounce: true } : {}),
        ...(wakeOnReturn ? { silentAnnounce: true, wakeOnReturn: true } : {}),
        drainsContinuationDelegateQueue: true,
      },
      {
        agentSessionKey: sessionKey,
        agentChannel: params.originatingContext.channel ?? undefined,
        agentAccountId: params.originatingContext.accountId ?? undefined,
        agentTo: params.originatingContext.to ?? undefined,
        agentThreadId: params.originatingContext.threadId ?? undefined,
      },
    );
    if (spawnResult.status === "accepted") {
      enqueueSystemEvent(
        `[continuation:compaction-delegate-spawned] Post-compaction shard dispatched: ${delegate.task}`,
        { sessionKey },
      );
      return {
        kind: "dispatched",
        nextChainCount,
        ...(spawnResult.childSessionKey ? { childSessionKey: spawnResult.childSessionKey } : {}),
      };
    }
    defaultRuntime.log(
      `Post-compaction delegate rejected (${spawnResult.status}) for session ${sessionKey} (re-staged)`,
    );
    return { kind: "rejected-spawn", status: spawnResult.status, reStage: true };
  } catch (err) {
    defaultRuntime.log(
      `Post-compaction delegate failed for session ${sessionKey} (re-staged): ${String(err)}`,
    );
    return { kind: "error", error: err, reStage: true };
  }
}
