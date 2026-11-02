import { readResolvedSessionEntryInWorker } from "../config/sessions/session-accessor.entry.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { ownOutcome } from "./host-hook-injection-outcomes.js";
import {
  hasValidInjectionGenerationFence,
  isExpired,
  isPluginNextTurnInjectionRecord,
} from "./host-hook-injection-validation.js";
import type { PluginNextTurnInjectionStateResult } from "./host-hook-turn-types.js";

export async function getPluginNextTurnInjectionState(params: {
  cfg: OpenClawConfig;
  pluginId: string;
  sessionKey: string;
  agentId?: string;
  idempotencyKey: string;
  expectedSessionId?: string;
  expectedLifecycleRevision?: string;
  shouldQuery?: () => boolean;
}): Promise<PluginNextTurnInjectionStateResult> {
  const idempotencyKey = params.idempotencyKey.trim();
  const unknown: PluginNextTurnInjectionStateResult = {
    sessionKey: params.sessionKey,
    idempotencyKey,
    state: "unknown",
  };
  if (
    (params.shouldQuery && !params.shouldQuery()) ||
    !hasValidInjectionGenerationFence(params.expectedSessionId, params.expectedLifecycleRevision)
  ) {
    return unknown;
  }
  const entry = await readResolvedSessionEntryInWorker({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
  });
  if (!entry) {
    return unknown;
  }
  const result = (() => {
    if (params.shouldQuery && !params.shouldQuery()) {
      return unknown;
    }
    if (
      params.expectedSessionId !== undefined &&
      (entry.sessionId !== params.expectedSessionId ||
        entry.lifecycleRevision !== params.expectedLifecycleRevision)
    ) {
      return unknown;
    }
    const now = Date.now();
    const queue = entry.pluginNextTurnInjections?.[params.pluginId];
    const pending = Array.isArray(queue)
      ? queue.find(
          (item) => isPluginNextTurnInjectionRecord(item) && item.idempotencyKey === idempotencyKey,
        )
      : undefined;
    const retainedOutcome = ownOutcome(entry, params.pluginId, idempotencyKey);
    const outcome =
      retainedOutcome && retainedOutcome.retainUntil > now ? retainedOutcome : undefined;
    return {
      sessionKey: params.sessionKey,
      idempotencyKey,
      state:
        pending && !isExpired(pending, now)
          ? "pending"
          : outcome
            ? outcome.state
            : pending
              ? "expired"
              : "unknown",
      ...(outcome ? { settledAt: outcome.settledAt } : {}),
    } as PluginNextTurnInjectionStateResult;
  })();
  return params.shouldQuery && !params.shouldQuery() ? unknown : result;
}
