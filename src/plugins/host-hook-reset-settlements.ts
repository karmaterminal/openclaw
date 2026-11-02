import type { SessionEntry } from "../config/sessions.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { ownOutcome } from "./host-hook-injection-outcomes.js";
import { isPluginNextTurnInjectionRecord } from "./host-hook-injection-validation.js";
import { dispatchSettlements, type SettlementNotice } from "./host-hook-settlement-dispatch.js";

/** Emit only newly committed reset tombstones, using the successor row as the delivery fence. */
export function dispatchResetInjectionSettlements(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  agentId: string;
  previousEntry?: SessionEntry;
  nextEntry: SessionEntry;
}): void {
  const { previousEntry, nextEntry } = params;
  if (!previousEntry?.pluginNextTurnInjections || !nextEntry.sessionId) {
    return;
  }
  const notices: SettlementNotice[] = [];
  for (const [pluginId, records] of Object.entries(previousEntry.pluginNextTurnInjections)) {
    if (!Array.isArray(records)) {
      continue;
    }
    for (const record of records) {
      if (!isPluginNextTurnInjectionRecord(record) || !record.idempotencyKey) {
        continue;
      }
      const key = record.idempotencyKey;
      if (ownOutcome(previousEntry, pluginId, key)) {
        continue;
      }
      const outcome = ownOutcome(nextEntry, pluginId, key);
      if (
        !outcome ||
        (outcome.state !== "discarded" && outcome.state !== "expired") ||
        typeof outcome.settledAt !== "number"
      ) {
        continue;
      }
      notices.push({
        pluginId,
        sessionId: nextEntry.sessionId,
        lifecycleRevision: nextEntry.lifecycleRevision,
        event: {
          sessionKey: "",
          idempotencyKey: key,
          state: outcome.state,
          settledAt: outcome.settledAt,
        },
      });
    }
  }
  void dispatchSettlements(notices, {
    cfg: params.cfg,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
  });
}
