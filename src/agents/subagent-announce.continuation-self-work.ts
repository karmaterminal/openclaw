// A sub-agent's `CONTINUE_WORK` token arms a same-session continue_work wake
// for the child session itself, unless the child already holds live
// continuation custody or that run already elected its work.
import { loadContinuationChainState } from "../auto-reply/continuation/state.js";
import { scheduleContinuationWorkBatch } from "../auto-reply/continuation/work-dispatch.js";
import {
  hasContinuationWorkFromRun,
  hasLiveContinuationCustody,
} from "../auto-reply/continuation/work-store.js";
import { resolveAgentIdFromSessionKey, resolveSessionStorePathCore } from "../config/sessions.js";
import { updateSessionEntry } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { defaultRuntime } from "../runtime.js";
import { loadSessionEntryByKey } from "./subagents/announce/subagent-announce-delivery.js";
import { resolveContinuationRuntimeConfig } from "./subagents/announce/subagent-announce.runtime.js";

export async function scheduleSubagentSelfContinuationWork(params: {
  cfg: OpenClawConfig;
  childSessionKey: string;
  childRunId: string;
  delayMs?: number;
  traceparent?: string;
}): Promise<void> {
  try {
    // The child's own turn records its token under the same run id, and its wake may already
    // have run by the time an announce (a retry or a restart replay) reads the recorded answer.
    if (
      (await hasLiveContinuationCustody(params.childSessionKey)) ||
      (await hasContinuationWorkFromRun(params.childSessionKey, params.childRunId))
    ) {
      return;
    }
    const config = resolveContinuationRuntimeConfig(params.cfg);
    const childEntry = await loadSessionEntryByKey(params.childSessionKey);
    const result = await scheduleContinuationWorkBatch({
      sessionKey: params.childSessionKey,
      chainState: loadContinuationChainState(childEntry),
      requests: [
        {
          reason: "subagent self-continuation (CONTINUE_WORK token)",
          delaySeconds:
            params.delayMs !== undefined ? params.delayMs / 1000 : config.defaultDelayMs / 1000,
          ...(params.traceparent ? { traceparent: params.traceparent } : {}),
        },
      ],
      config,
      originRunId: params.childRunId,
      originTurnId: params.childSessionKey,
      log: (message) => defaultRuntime.log(message),
    });
    if (result.scheduledCount === 0) {
      return;
    }
    const agentId = resolveAgentIdFromSessionKey(params.childSessionKey);
    const storePath = resolveSessionStorePathCore(params.cfg.session?.store, { agentId });
    const persisted = await updateSessionEntry(
      { agentId, sessionKey: params.childSessionKey, storePath },
      () => ({
        continuationChainCount: result.chainState.currentChainCount,
        continuationChainStartedAt: result.chainState.chainStartedAt,
        continuationChainTokens: result.chainState.accumulatedChainTokens,
        ...(result.chainState.chainId ? { continuationChainId: result.chainState.chainId } : {}),
      }),
      { requireWriteSuccess: true },
    );
    if (!persisted) {
      throw new Error(`child entry not found: ${params.childSessionKey}`);
    }
    defaultRuntime.log(
      `[subagent-chain-hop] Armed self-continuation continue_work wake for ${params.childSessionKey} (hop ${result.chainState.currentChainCount}) from completion-flow findings`,
    );
  } catch (error) {
    defaultRuntime.error?.(
      `[continuation:self-continuation-failed] child=${params.childSessionKey} error=${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
