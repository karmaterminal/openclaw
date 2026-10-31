import type { SessionEntry } from "../config/sessions.js";
import { updateResolvedSessionEntry } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { SettlementNotice } from "./host-hook-settlement-dispatch.js";
import type { PluginNextTurnInjectionRecord } from "./host-hooks.js";

export function ownOutcome(entry: SessionEntry | undefined, pluginId: string, key: string) {
  const owned = Object.hasOwn(entry?.pluginNextTurnInjectionOutcomes ?? {}, pluginId)
    ? entry?.pluginNextTurnInjectionOutcomes?.[pluginId]
    : undefined;
  return owned && Object.hasOwn(owned, key) ? owned[key] : undefined;
}

export function settle(
  entry: SessionEntry,
  pluginId: string,
  record: PluginNextTurnInjectionRecord,
  state: "consumed" | "withdrawn" | "expired" | "discarded",
  now: number,
  notices?: SettlementNotice[],
) {
  if (!record.idempotencyKey) {
    return;
  }
  const byPlugin = (entry.pluginNextTurnInjectionOutcomes ??= {});
  if (ownOutcome(entry, pluginId, record.idempotencyKey)) {
    return;
  }
  notices?.push({
    pluginId,
    sessionId: entry.sessionId,
    lifecycleRevision: entry.lifecycleRevision,
    event: { sessionKey: "", idempotencyKey: record.idempotencyKey, state, settledAt: now },
  });
  if (!Object.hasOwn(byPlugin, pluginId)) {
    Object.defineProperty(byPlugin, pluginId, {
      value: {},
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  Object.defineProperty(byPlugin[pluginId], record.idempotencyKey, {
    enumerable: true,
    writable: true,
    configurable: true,
    value: {
      state,
      settledAt: now,
      retainUntil: Math.max(record.expiresAt ?? 0, record.outcomeRetainUntil ?? 0, now) + 5_000,
    },
  });
}

export function pruneOutcomes(entry: SessionEntry, pluginId: string, now: number) {
  const outcomes = entry.pluginNextTurnInjectionOutcomes?.[pluginId];
  if (!outcomes) {
    return;
  }
  for (const [key, outcome] of Object.entries(outcomes)) {
    if (outcome.retainUntil <= now) {
      delete outcomes[key];
    }
  }
}

/** Repair a post-commit expiry only if the original session and tombstone still match. */
export async function reconcileLateExpiredInjections(params: {
  scope: { cfg: OpenClawConfig; sessionKey: string; agentId?: string };
  sessionId: string;
  lifecycleRevision?: string;
  expired: readonly PluginNextTurnInjectionRecord[];
  notices: SettlementNotice[];
  now: number;
}): Promise<void> {
  const candidates = params.notices.filter(
    ({ pluginId, event }) =>
      event.state === "consumed" &&
      params.expired.some(
        (record) => record.pluginId === pluginId && record.idempotencyKey === event.idempotencyKey,
      ),
  );
  if (candidates.length === 0) {
    return;
  }
  if (!params.lifecycleRevision) {
    for (const notice of candidates) {
      params.notices.splice(params.notices.indexOf(notice), 1);
    }
    return;
  }
  const updated = await updateResolvedSessionEntry(params.scope, (entry) => {
    if (
      entry.sessionId !== params.sessionId ||
      entry.lifecycleRevision !== params.lifecycleRevision
    ) {
      return [] as number[];
    }
    const applied: number[] = [];
    for (const [index, { pluginId, event }] of candidates.entries()) {
      const outcome = ownOutcome(entry, pluginId, event.idempotencyKey);
      if (outcome?.state !== "consumed" || outcome.settledAt !== event.settledAt) {
        continue;
      }
      outcome.state = "expired";
      outcome.settledAt = params.now;
      outcome.retainUntil = Math.max(outcome.retainUntil, params.now + 5_000);
      applied.push(index);
    }
    return applied;
  });
  const applied = new Set(updated.found ? updated.result : []);
  for (const [index, notice] of candidates.entries()) {
    if (applied.has(index)) {
      notice.event.state = "expired";
      notice.event.settledAt = params.now;
    } else {
      // An intervening reset/replacement owns the current outcome; suppress the stale notice.
      params.notices.splice(params.notices.indexOf(notice), 1);
    }
  }
}
