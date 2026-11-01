import { randomUUID } from "node:crypto";
import { isPromiseLike } from "@openclaw/normalization-core/promise-like";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import type { SessionEntry } from "../config/sessions.js";
import { readResolvedSessionEntryInWorker } from "../config/sessions/session-accessor.entry.js";
import { updateResolvedSessionEntry } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolvePromptInjectionAllowed } from "./hook-policy-decisions.js";
import {
  ownOutcome,
  pruneOutcomes,
  reconcileLateExpiredInjections,
  settle,
} from "./host-hook-injection-outcomes.js";
import {
  injectionRouteAdmissionReason,
  isUnsupportedInjectionRoute,
  matchesInjectionRouteGeneration,
  prepareInjectionRoute,
} from "./host-hook-injection-route.js";
import {
  hasEnhancedNextTurnInjectionFields,
  hasValidInjectionGenerationFence,
  isExpired,
  isPluginNextTurnInjectionPlacement,
  isPluginNextTurnInjectionRecord,
} from "./host-hook-injection-validation.js";
import { dispatchSettlements, type SettlementNotice } from "./host-hook-settlement-dispatch.js";
import type {
  PluginNextTurnInjectionState,
  PluginNextTurnInjectionStateResult,
} from "./host-hook-turn-types.js";
import {
  buildPluginAgentTurnPrepareContext,
  renderPluginNextTurnInjectionText as renderInjection,
  isPluginJsonValue,
  type PluginAgentTurnPrepareResult,
  type PluginJsonValue,
  type PluginNextTurnInjection,
  type PluginNextTurnInjectionEnqueueResult,
  type PluginNextTurnInjectionRecord,
  type PluginSessionExtensionProjection,
  type PluginSessionExtensionRegistration,
} from "./host-hooks.js";
import { getPluginRegistryForContext } from "./runtime/gateway-request-scope.js";
import { normalizeSessionEntrySlotKey } from "./session-entry-slot-keys.js";

const log = createSubsystemLogger("plugins/host-hook-state");
const MAX_PLUGIN_NEXT_TURN_INJECTION_TEXT_LENGTH = 32 * 1024;
const MAX_PLUGIN_NEXT_TURN_INJECTION_IDEMPOTENCY_KEY_LENGTH = 512;
const MAX_PLUGIN_NEXT_TURN_INJECTIONS_PER_SESSION = 32;
const DEFAULT_DRAINED_NEXT_TURN_INJECTIONS_PER_PLUGIN = 32;
const DEFAULT_DRAINED_NEXT_TURN_INJECTION_BYTES_PER_PLUGIN = 64 * 1024;
const MAX_OUTCOMES_PER_PLUGIN_SESSION = 256;
const MAX_OUTCOME_RETENTION_MS = 86_400_000;
type MutableSessionEntry = SessionEntry & Record<string, unknown>;
export { getPluginNextTurnInjectionState } from "./host-hook-injection-query.js";
export async function withdrawPluginNextTurnInjection(params: {
  cfg: OpenClawConfig;
  pluginId: string;
  sessionKey: string;
  agentId?: string;
  idempotencyKey: string;
  expectedSessionId?: string;
  expectedLifecycleRevision?: string;
  shouldWithdraw?: () => boolean;
}): Promise<PluginNextTurnInjectionStateResult> {
  const idempotencyKey = params.idempotencyKey.trim();
  if (
    !hasValidInjectionGenerationFence(params.expectedSessionId, params.expectedLifecycleRevision)
  ) {
    return { sessionKey: params.sessionKey, idempotencyKey, state: "unknown" };
  }
  if (params.shouldWithdraw && !params.shouldWithdraw()) {
    return {
      sessionKey: params.sessionKey,
      idempotencyKey,
      state: "unknown",
    };
  }
  const now = Date.now();
  const notices: SettlementNotice[] = [];
  const updated = await updateResolvedSessionEntry(
    { cfg: params.cfg, sessionKey: params.sessionKey, agentId: params.agentId },
    (entry) => {
      if (params.shouldWithdraw && !params.shouldWithdraw()) {
        return { state: "unknown" as const, settledAt: undefined };
      }
      if (
        params.expectedSessionId !== undefined &&
        (entry.sessionId !== params.expectedSessionId ||
          entry.lifecycleRevision !== params.expectedLifecycleRevision)
      ) {
        return { state: "unknown" as const, settledAt: undefined };
      }
      pruneOutcomes(entry, params.pluginId, now);
      const queue = entry.pluginNextTurnInjections?.[params.pluginId];
      const entries = Array.isArray(queue) ? queue : [];
      const pending = entries.find(
        (item) => isPluginNextTurnInjectionRecord(item) && item.idempotencyKey === idempotencyKey,
      );
      if (pending) {
        settle(
          entry,
          params.pluginId,
          pending,
          isExpired(pending, now) ? "expired" : "withdrawn",
          now,
          notices,
        );
        entry.pluginNextTurnInjections![params.pluginId] = entries.filter(
          (item) => item !== pending,
        );
        entry.updatedAt = now;
      }
      const outcome = ownOutcome(entry, params.pluginId, idempotencyKey);
      return {
        state: (outcome?.state ?? "unknown") as PluginNextTurnInjectionState,
        settledAt: outcome?.settledAt,
      };
    },
  );
  void dispatchSettlements(notices, {
    cfg: params.cfg,
    sessionKey: updated.canonicalKey,
    agentId: params.agentId,
  });
  return {
    sessionKey: params.sessionKey,
    idempotencyKey,
    state: updated.found ? updated.result.state : "unknown",
    settledAt: updated.found ? updated.result.settledAt : undefined,
  };
}
export async function enqueuePluginNextTurnInjection(params: {
  cfg: OpenClawConfig;
  pluginId: string;
  pluginName?: string;
  injection: PluginNextTurnInjection;
  now?: number;
  shouldEnqueue?: () => boolean;
}): Promise<PluginNextTurnInjectionEnqueueResult> {
  const sessionKey = normalizeOptionalString(params.injection.sessionKey) ?? "";
  if (!sessionKey) {
    return { enqueued: false, id: "", sessionKey };
  }
  const text = normalizeOptionalString(params.injection.text);
  if (
    !text ||
    !hasValidInjectionGenerationFence(
      params.injection.expectedSessionId,
      params.injection.expectedLifecycleRevision,
    ) ||
    text.length > MAX_PLUGIN_NEXT_TURN_INJECTION_TEXT_LENGTH ||
    Buffer.byteLength(text, "utf8") >
      (params.cfg.plugins?.entries?.[params.pluginId]?.hooks?.nextTurnInjectionDrainMaxBytes ??
        DEFAULT_DRAINED_NEXT_TURN_INJECTION_BYTES_PER_PLUGIN) ||
    (params.injection.metadata !== undefined && !isPluginJsonValue(params.injection.metadata)) ||
    (params.injection.idempotencyKey !== undefined &&
      (typeof params.injection.idempotencyKey !== "string" ||
        params.injection.idempotencyKey.trim().length === 0 ||
        params.injection.idempotencyKey.length >
          MAX_PLUGIN_NEXT_TURN_INJECTION_IDEMPOTENCY_KEY_LENGTH)) ||
    (params.injection.placement !== undefined &&
      !isPluginNextTurnInjectionPlacement(params.injection.placement)) ||
    (params.injection.ttlMs !== undefined &&
      (!Number.isFinite(params.injection.ttlMs) || params.injection.ttlMs < 0))
  ) {
    return { enqueued: false, id: "", sessionKey };
  }
  const now = params.now ?? Date.now();
  const requested = params.injection;
  const enhanced = hasEnhancedNextTurnInjectionFields(requested);
  if (
    (requested.expiresAt !== undefined &&
      (!Number.isFinite(requested.expiresAt) ||
        requested.expiresAt <= now ||
        requested.expiresAt > now + MAX_OUTCOME_RETENTION_MS)) ||
    (requested.notBefore !== undefined &&
      (!Number.isFinite(requested.notBefore) ||
        requested.notBefore >= (requested.expiresAt ?? now + MAX_OUTCOME_RETENTION_MS - 5_000))) ||
    (requested.outcomeRetainUntil !== undefined &&
      (!Number.isFinite(requested.outcomeRetainUntil) ||
        requested.outcomeRetainUntil > now + MAX_OUTCOME_RETENTION_MS)) ||
    (requested.supersedeKey !== undefined &&
      (!requested.supersedeKey.trim() || requested.supersedeKey.length > 512)) ||
    (requested.expectedSupersededKey !== undefined &&
      (!requested.expectedSupersededKey.trim() || requested.expectedSupersededKey.length > 512)) ||
    (requested.provenance !== undefined &&
      (typeof requested.provenance !== "object" ||
        requested.provenance === null ||
        typeof requested.provenance.source !== "string" ||
        !requested.provenance.source.trim() ||
        requested.provenance.source.length > 256)) ||
    ((requested.supersedeKey || requested.expectedSupersededKey || requested.outcomeRetainUntil) &&
      !requested.idempotencyKey)
  ) {
    return {
      enqueued: false,
      id: "",
      sessionKey,
      reason:
        requested.expiresAt !== undefined && requested.expiresAt <= now ? "expired" : "invalid",
    };
  }
  const injection = { ...params.injection };
  const expectedSupersededKey = injection.expectedSupersededKey?.trim();
  const record: PluginNextTurnInjectionRecord = {
    id: injection.idempotencyKey?.trim() || randomUUID(),
    pluginId: params.pluginId,
    pluginName: params.pluginName,
    text,
    idempotencyKey: injection.idempotencyKey?.trim() || undefined,
    placement: injection.placement ?? "prepend_context",
    ttlMs: injection.ttlMs,
    expiresAt: injection.expiresAt ?? now + MAX_OUTCOME_RETENTION_MS - 5_000,
    notBefore: injection.notBefore,
    supersedeKey: injection.supersedeKey,
    outcomeRetainUntil: injection.outcomeRetainUntil,
    provenance: injection.provenance,
    createdAt: now,
    metadata: injection.metadata,
  };
  const scope = { cfg: params.cfg, sessionKey, agentId: params.injection.agentId };
  const notices: SettlementNotice[] = [];
  // Broker reads cannot be nested inside a session-row mutation. Binding or
  // placement may still change after this read without changing row identity.
  const { selected, unsupportedRoute } = await prepareInjectionRoute(scope);
  const selectedEntry = selected?.entry;
  if (!selected || !selectedEntry) {
    return { enqueued: false, id: "", sessionKey, reason: "missing_session" };
  }
  const updated = await updateResolvedSessionEntry(scope, (entry, context) => {
    if (params.shouldEnqueue && !params.shouldEnqueue()) {
      return { enqueued: false, id: "", reason: "invalid" as const };
    }
    const routeReason = injectionRouteAdmissionReason({
      selected,
      canonicalKey: context.canonicalKey,
      requestedKey: sessionKey,
      entry,
      expectedSessionId: injection.expectedSessionId,
      expectedLifecycleRevision: injection.expectedLifecycleRevision,
      unsupportedRoute,
    });
    if (routeReason) {
      return { enqueued: false, id: "", reason: routeReason };
    }
    const injections = { ...entry.pluginNextTurnInjections };
    pruneOutcomes(entry, params.pluginId, now);
    const rawExisting = injections[params.pluginId];
    const existing = (Array.isArray(rawExisting) ? rawExisting : []).filter(
      (candidate): candidate is PluginNextTurnInjectionRecord => {
        if (!isPluginNextTurnInjectionRecord(candidate)) {
          return false;
        }
        if (!isExpired(candidate, now)) {
          return true;
        }
        settle(entry, params.pluginId, candidate, "expired", now, notices);
        return false;
      },
    );
    const duplicate = record.idempotencyKey
      ? existing.find((candidate) => candidate.idempotencyKey === record.idempotencyKey)
      : undefined;
    const settled = record.idempotencyKey
      ? ownOutcome(entry, params.pluginId, record.idempotencyKey)
      : undefined;
    const predecessor = record.supersedeKey
      ? existing.find((item) => item.supersedeKey === record.supersedeKey)
      : undefined;
    const expectedState: PluginNextTurnInjectionState | undefined = expectedSupersededKey
      ? existing.some((item) => item.idempotencyKey === expectedSupersededKey)
        ? "pending"
        : (ownOutcome(entry, params.pluginId, expectedSupersededKey)?.state ?? "unknown")
      : undefined;
    const conflict =
      expectedSupersededKey &&
      (predecessor?.idempotencyKey !== expectedSupersededKey || expectedState !== "pending");
    const capacity =
      (record.idempotencyKey !== undefined &&
        Object.keys(entry.pluginNextTurnInjectionOutcomes?.[params.pluginId] ?? {}).length >=
          MAX_OUTCOMES_PER_PLUGIN_SESSION) ||
      existing.length - (predecessor ? 1 : 0) >= MAX_PLUGIN_NEXT_TURN_INJECTIONS_PER_SESSION;
    const enqueued = !duplicate && !settled && !conflict && !capacity;
    if (enqueued && predecessor) {
      settle(entry, params.pluginId, predecessor, "withdrawn", now, notices);
    }
    injections[params.pluginId] = enqueued
      ? [...existing.filter((item) => item !== predecessor), record]
      : existing;
    entry.pluginNextTurnInjections = injections;
    if (enqueued) {
      entry.updatedAt = now;
    }
    return {
      enqueued,
      id: duplicate?.id ?? record.id,
      ...(!enhanced || enqueued
        ? {}
        : {
            reason:
              duplicate || settled
                ? ("duplicate" as const)
                : conflict
                  ? ("supersede_conflict" as const)
                  : ("capacity" as const),
            state: duplicate ? ("pending" as const) : (settled?.state ?? expectedState),
          }),
    };
  });
  if (!updated.found) {
    return { enqueued: false, id: "", sessionKey, reason: "missing_session" };
  }
  void dispatchSettlements(notices, {
    cfg: params.cfg,
    sessionKey: updated.canonicalKey,
    agentId: params.injection.agentId,
  });
  return { ...updated.result, sessionKey: updated.canonicalKey };
}

async function drainPluginNextTurnInjections(
  params: Parameters<typeof drainPluginNextTurnInjectionContext>[0],
): Promise<{
  records: PluginNextTurnInjectionRecord[];
  notices: SettlementNotice[];
  canonicalKey: string;
  sessionId?: string;
  lifecycleRevision?: string;
}> {
  const sessionKey = params.sessionKey?.trim();
  if (!sessionKey) {
    return { records: [], notices: [], canonicalKey: "" };
  }
  const scope = { cfg: params.cfg, sessionKey, agentId: params.agentId };
  const { selected, unsupportedRoute } = await prepareInjectionRoute(scope, true);
  const selectedEntry = selected?.entry;
  if (
    (!selectedEntry?.pluginNextTurnInjections ||
      Object.keys(selectedEntry.pluginNextTurnInjections).length === 0) &&
    (!selectedEntry?.pluginNextTurnInjectionOutcomes ||
      Object.keys(selectedEntry.pluginNextTurnInjectionOutcomes).length === 0)
  ) {
    return { records: [], notices: [], canonicalKey: sessionKey };
  }
  const notices: SettlementNotice[] = [];
  const updated = await updateResolvedSessionEntry(scope, (entry, context) => {
    if (!matchesInjectionRouteGeneration(selected, context.canonicalKey, entry)) {
      return {
        records: [],
        sessionId: entry.sessionId,
        lifecycleRevision: entry.lifecycleRevision,
      };
    }
    if (unsupportedRoute || isUnsupportedInjectionRoute(context.canonicalKey, entry)) {
      return {
        records: [],
        sessionId: entry.sessionId,
        lifecycleRevision: entry.lifecycleRevision,
      };
    }
    const now = params.clock?.() ?? Date.now();
    for (const pluginId of Object.keys(entry.pluginNextTurnInjectionOutcomes ?? {})) {
      pruneOutcomes(entry, pluginId, now);
    }
    if (!entry?.pluginNextTurnInjections) {
      return {
        records: [],
        sessionId: entry.sessionId,
        lifecycleRevision: entry.lifecycleRevision,
      };
    }
    const activePluginIds = new Set(
      (getPluginRegistryForContext()?.plugins ?? [])
        .filter((plugin) => plugin.status === "loaded")
        .map((plugin) => plugin.id),
    );
    const drained: PluginNextTurnInjectionRecord[] = [];
    const retained: NonNullable<SessionEntry["pluginNextTurnInjections"]> = {};
    let totalEntries = 0,
      totalBytes = 0;
    const totalPlacements = new Set<PluginNextTurnInjectionRecord["placement"]>();
    for (const [pluginId, entries] of Object.entries(entry.pluginNextTurnInjections)) {
      // Guard against malformed/hand-edited persisted state — a non-array value
      // here would crash .filter and break prompt-building for the session.
      if (!Array.isArray(entries)) {
        continue;
      }
      const allowed =
        activePluginIds.has(pluginId) &&
        resolvePromptInjectionAllowed(params.cfg.plugins?.entries?.[pluginId]?.hooks);
      const drainLimits = params.cfg.plugins?.entries?.[pluginId]?.hooks;
      const maxEntries =
        drainLimits?.nextTurnInjectionDrainMaxEntries ??
        DEFAULT_DRAINED_NEXT_TURN_INJECTIONS_PER_PLUGIN;
      const maxBytes =
        drainLimits?.nextTurnInjectionDrainMaxBytes ??
        DEFAULT_DRAINED_NEXT_TURN_INJECTION_BYTES_PER_PLUGIN;
      let drainedEntriesForPlugin = 0;
      let drainedBytesForPlugin = 0;
      const pluginPlacements = new Set<PluginNextTurnInjectionRecord["placement"]>();
      let budgetBlocked = false;
      for (const candidate of entries) {
        if (!isPluginNextTurnInjectionRecord(candidate)) {
          continue;
        }
        if (isExpired(candidate, now)) {
          settle(entry, pluginId, candidate, "expired", now, notices);
        } else if (!allowed) {
          if (candidate.expiresAt !== undefined) {
            (retained[pluginId] ??= []).push(candidate);
          } else {
            settle(entry, pluginId, candidate, "discarded", now, notices);
          }
        } else if (candidate.notBefore !== undefined && now < candidate.notBefore) {
          budgetBlocked = true;
          (retained[pluginId] ??= []).push(candidate);
        } else {
          const renderedBytes = Buffer.byteLength(renderInjection(candidate), "utf8");
          const pluginBytes = renderedBytes + (pluginPlacements.has(candidate.placement) ? 2 : 0);
          const aggregateBytes = renderedBytes + (totalPlacements.has(candidate.placement) ? 2 : 0);
          if (
            renderedBytes > Math.min(DEFAULT_DRAINED_NEXT_TURN_INJECTION_BYTES_PER_PLUGIN, maxBytes)
          ) {
            settle(entry, pluginId, candidate, "discarded", now, notices);
            continue;
          }
          if (
            budgetBlocked ||
            drainedEntriesForPlugin >= maxEntries ||
            drainedBytesForPlugin + pluginBytes > maxBytes ||
            totalEntries >= DEFAULT_DRAINED_NEXT_TURN_INJECTIONS_PER_PLUGIN ||
            totalBytes + aggregateBytes > DEFAULT_DRAINED_NEXT_TURN_INJECTION_BYTES_PER_PLUGIN
          ) {
            budgetBlocked = true;
            (retained[pluginId] ??= []).push(candidate);
            continue;
          }
          drained.push(candidate);
          drainedEntriesForPlugin += 1;
          drainedBytesForPlugin += pluginBytes;
          pluginPlacements.add(candidate.placement);
          totalEntries += 1;
          totalBytes += aggregateBytes;
          totalPlacements.add(candidate.placement);
          settle(entry, pluginId, candidate, "consumed", now, notices);
        }
      }
    }
    drained.sort((left, right) => left.createdAt - right.createdAt);
    // A drain is the consume boundary for this session queue. Inactive plugin
    // records are stale owner state and are discarded with expired records.
    if (Object.keys(retained).length) {
      entry.pluginNextTurnInjections = retained;
    } else {
      delete entry.pluginNextTurnInjections;
    }
    if (drained.length > 0) {
      entry.updatedAt = now;
    }
    return {
      records: drained,
      sessionId: entry.sessionId,
      lifecycleRevision: entry.lifecycleRevision,
    };
  });
  return {
    records: updated.found ? updated.result.records : [],
    notices,
    canonicalKey: updated.canonicalKey,
    sessionId: updated.found ? updated.result.sessionId : undefined,
    lifecycleRevision: updated.found ? updated.result.lifecycleRevision : undefined,
  };
}

export async function drainPluginNextTurnInjectionContext(params: {
  cfg: OpenClawConfig;
  sessionKey?: string;
  agentId?: string;
  /** Host clock seam for deterministic expiry-boundary tests. */
  clock?: () => number;
}): Promise<PluginAgentTurnPrepareResult & { queuedInjections: PluginNextTurnInjectionRecord[] }> {
  const drained = await drainPluginNextTurnInjections(params);
  let queuedInjections = drained.records;
  while (queuedInjections.length > 0) {
    const now = params.clock?.() ?? Date.now();
    const expired = queuedInjections.filter((record) => isExpired(record, now));
    if (expired.length === 0) {
      break;
    }
    queuedInjections = queuedInjections.filter((record) => !isExpired(record, now));
    if (drained.sessionId) {
      await reconcileLateExpiredInjections({
        scope: { cfg: params.cfg, sessionKey: params.sessionKey!.trim(), agentId: params.agentId },
        sessionId: drained.sessionId,
        lifecycleRevision: drained.lifecycleRevision,
        expired,
        notices: drained.notices,
        now,
      });
    }
  }
  void dispatchSettlements(drained.notices, {
    cfg: params.cfg,
    sessionKey: drained.canonicalKey,
    agentId: params.agentId,
  });
  return {
    queuedInjections,
    ...buildPluginAgentTurnPrepareContext({ queuedInjections }),
  };
}

export async function getPluginSessionExtensionState(params: {
  cfg: OpenClawConfig;
  pluginId: string;
  sessionKey?: string;
  agentId?: string;
}): Promise<Record<string, PluginJsonValue> | undefined> {
  const pluginId = params.pluginId.trim();
  const sessionKey = normalizeOptionalString(params.sessionKey);
  if (!pluginId || !sessionKey) {
    return undefined;
  }
  const entry = await readResolvedSessionEntryInWorker({
    cfg: params.cfg,
    sessionKey,
    agentId: params.agentId,
  });
  const value = entry?.pluginExtensions?.[pluginId] as Record<string, PluginJsonValue> | undefined;
  return value ? structuredClone(value) : undefined;
}

export async function patchPluginSessionExtension(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  agentId?: string;
  pluginId: string;
  namespace: string;
  value?: PluginJsonValue;
  unset?: boolean;
  assertCurrent?: () => void;
}): Promise<{ ok: true; key: string; value?: PluginJsonValue } | { ok: false; error: string }> {
  const namespace = params.namespace.trim();
  const pluginId = params.pluginId.trim();
  if (!pluginId || !namespace) {
    return { ok: false, error: "pluginId and namespace are required" };
  }
  if (params.unset === true && params.value !== undefined) {
    return { ok: false, error: "plugin session extension cannot specify both unset and value" };
  }
  if (params.value !== undefined && !isPluginJsonValue(params.value)) {
    return { ok: false, error: "plugin session extension value must be JSON-compatible" };
  }
  if (params.unset !== true && params.value === undefined) {
    return { ok: false, error: "plugin session extension value is required unless unset is true" };
  }
  const nextPluginValue = params.value as PluginJsonValue;
  const registry = getPluginRegistryForContext();
  const registration = (registry?.sessionExtensions ?? []).find(
    (entry) => entry.pluginId === pluginId && entry.extension.namespace === namespace,
  );
  if (!registration) {
    return { ok: false, error: `unknown plugin session extension: ${pluginId}/${namespace}` };
  }
  const slotKey = registration.extension.sessionEntrySlotKey;
  const updated = await updateResolvedSessionEntry(
    {
      cfg: params.cfg,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
    },
    (entry, context) => {
      params.assertCurrent?.();
      const entryRecord = entry as MutableSessionEntry;
      const pluginExtensions = { ...entry.pluginExtensions };
      const pluginState = { ...pluginExtensions[pluginId] };
      if (params.unset === true) {
        delete pluginState[namespace];
      } else {
        pluginState[namespace] = structuredClone(nextPluginValue);
      }
      if (Object.keys(pluginState).length > 0) {
        pluginExtensions[pluginId] = pluginState;
      } else {
        delete pluginExtensions[pluginId];
      }
      if (Object.keys(pluginExtensions).length > 0) {
        entry.pluginExtensions = pluginExtensions;
      } else {
        delete entry.pluginExtensions;
      }
      const storedSlotKeys = { ...entry.pluginExtensionSlotKeys };
      const pluginSlotKeys = { ...storedSlotKeys[pluginId] };
      const previousSlotKey = normalizeSessionEntrySlotKey(pluginSlotKeys[namespace]);
      if (previousSlotKey.ok && previousSlotKey.key !== slotKey) {
        delete entryRecord[previousSlotKey.key];
      }
      if (slotKey && params.unset !== true) {
        pluginSlotKeys[namespace] = slotKey;
      } else {
        delete pluginSlotKeys[namespace];
      }
      if (Object.keys(pluginSlotKeys).length > 0) {
        storedSlotKeys[pluginId] = pluginSlotKeys;
      } else {
        delete storedSlotKeys[pluginId];
      }
      if (Object.keys(storedSlotKeys).length > 0) {
        entry.pluginExtensionSlotKeys = storedSlotKeys;
      } else {
        delete entry.pluginExtensionSlotKeys;
      }
      if (slotKey) {
        const projected = projectSessionExtensionValue({
          pluginId: registration.pluginId,
          namespace: registration.extension.namespace,
          project: registration.extension.project,
          sessionKey: context.canonicalKey,
          sessionId: entry.sessionId,
          state: params.unset === true ? undefined : nextPluginValue,
        });
        if (projected === undefined) {
          delete entryRecord[slotKey];
        } else {
          entryRecord[slotKey] = projected;
        }
      }
      entry.updatedAt = Date.now();
      return pluginState[namespace] as PluginJsonValue | undefined;
    },
  );
  if (!updated.found) {
    return { ok: false, error: `unknown session key: ${params.sessionKey}` };
  }
  return { ok: true, key: updated.canonicalKey, value: updated.result };
}

export function projectPluginSessionExtensionsSync(params: {
  sessionKey: string;
  entry: SessionEntry;
}): PluginSessionExtensionProjection[] {
  const registry = getPluginRegistryForContext();
  const extensions = registry?.sessionExtensions ?? [];
  if (extensions.length === 0) {
    return [];
  }
  const projections: PluginSessionExtensionProjection[] = [];
  for (const registration of extensions) {
    const state = params.entry.pluginExtensions?.[registration.pluginId]?.[
      registration.extension.namespace
    ] as PluginJsonValue | undefined;
    const projected = projectSessionExtensionValue({
      pluginId: registration.pluginId,
      namespace: registration.extension.namespace,
      project: registration.extension.project,
      sessionKey: params.sessionKey,
      sessionId: params.entry.sessionId,
      state,
    });
    if (projected !== undefined) {
      projections.push({
        pluginId: registration.pluginId,
        namespace: registration.extension.namespace,
        value: projected,
      });
    }
  }
  return projections;
}

function projectSessionExtensionValue(params: {
  pluginId: string;
  namespace: string;
  project?: PluginSessionExtensionRegistration["project"];
  sessionKey: string;
  sessionId?: string;
  state: PluginJsonValue | undefined;
}): PluginJsonValue | undefined {
  if (params.state === undefined) {
    return undefined;
  }
  let projected: unknown;
  try {
    projected = params.project
      ? params.project({
          sessionKey: params.sessionKey,
          sessionId: params.sessionId,
          state: params.state,
        })
      : params.state;
  } catch (error) {
    log.warn(
      `plugin session extension projection failed: plugin=${params.pluginId} namespace=${params.namespace} error=${String(error)}`,
    );
    return undefined;
  }
  if (isPromiseLike(projected)) {
    void Promise.resolve(projected).catch(() => undefined);
    return undefined;
  }
  return isPluginJsonValue(projected) ? structuredClone(projected) : undefined;
}
