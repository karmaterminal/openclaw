import { updateResolvedSessionEntry } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { ownOutcome, pruneOutcomes } from "./host-hook-injection-outcomes.js";
import { isExpired, isPluginNextTurnInjectionRecord } from "./host-hook-injection-validation.js";
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
  if (params.shouldQuery && !params.shouldQuery()) {
    return unknown;
  }
  const updated = await updateResolvedSessionEntry(
    { cfg: params.cfg, sessionKey: params.sessionKey, agentId: params.agentId },
    (entry) => {
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
      pruneOutcomes(entry, params.pluginId, now);
      const queue = entry.pluginNextTurnInjections?.[params.pluginId];
      const pending = Array.isArray(queue)
        ? queue.find(
            (item) =>
              isPluginNextTurnInjectionRecord(item) && item.idempotencyKey === idempotencyKey,
          )
        : undefined;
      const outcome = ownOutcome(entry, params.pluginId, idempotencyKey);
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
    },
  );
  return params.shouldQuery && !params.shouldQuery()
    ? unknown
    : updated.found
      ? updated.result
      : unknown;
}
