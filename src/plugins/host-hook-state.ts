import { randomUUID } from "node:crypto";
import { isPromiseLike } from "@openclaw/normalization-core/promise-like";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import type { SessionEntry } from "../config/sessions.js";
import { readResolvedSessionEntryInWorker } from "../config/sessions/session-accessor.entry.js";
import { updateResolvedSessionEntry } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolvePromptInjectionAllowed } from "./hook-policy-decisions.js";
import type {
  PluginNextTurnInjectionSettlement,
  PluginNextTurnInjectionState,
  PluginNextTurnInjectionStateResult,
} from "./host-hook-turn-types.js";
import {
  buildPluginAgentTurnPrepareContext,
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
type SettlementNotice = { pluginId: string; event: PluginNextTurnInjectionSettlement };

async function notifySettlements(notices: SettlementNotice[], sessionKey: string) {
  const registry = getPluginRegistryForContext();
  for (const { pluginId, event } of notices) {
    event.sessionKey = sessionKey;
    if (!registry?.plugins.some((plugin) => plugin.id === pluginId && plugin.status === "loaded")) {
      continue;
    }
    for (const registration of registry.nextTurnInjectionSettlementHandlers ?? []) {
      if (registration.pluginId !== pluginId) {
        continue;
      }
      try {
        await registration.handler(event);
      } catch (error) {
        log.warn(`next-turn settlement notification failed for ${pluginId}: ${String(error)}`);
      }
    }
  }
}

type MutableSessionEntry = SessionEntry & Record<string, unknown>;

function isPluginNextTurnInjectionPlacement(
  value: unknown,
): value is PluginNextTurnInjectionRecord["placement"] {
  return value === "prepend_context" || value === "append_context";
}

function isPluginNextTurnInjectionRecord(value: unknown): value is PluginNextTurnInjectionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PluginNextTurnInjectionRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.pluginId === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt) &&
    isPluginNextTurnInjectionPlacement(candidate.placement) &&
    (candidate.ttlMs === undefined ||
      (typeof candidate.ttlMs === "number" &&
        Number.isFinite(candidate.ttlMs) &&
        candidate.ttlMs >= 0)) &&
    (candidate.idempotencyKey === undefined || typeof candidate.idempotencyKey === "string") &&
    (candidate.expiresAt === undefined ||
      (typeof candidate.expiresAt === "number" && Number.isFinite(candidate.expiresAt))) &&
    (candidate.notBefore === undefined ||
      (typeof candidate.notBefore === "number" && Number.isFinite(candidate.notBefore))) &&
    (candidate.supersedeKey === undefined || typeof candidate.supersedeKey === "string") &&
    (candidate.outcomeRetainUntil === undefined ||
      (typeof candidate.outcomeRetainUntil === "number" &&
        Number.isFinite(candidate.outcomeRetainUntil))) &&
    (candidate.provenance === undefined ||
      (typeof candidate.provenance === "object" &&
        candidate.provenance !== null &&
        typeof candidate.provenance.source === "string"))
  );
}

function isExpired(entry: unknown, now: number) {
  if (!isPluginNextTurnInjectionRecord(entry)) {
    return true;
  }
  return (
    (entry.expiresAt !== undefined && now >= entry.expiresAt) ||
    (entry.ttlMs !== undefined && now - entry.createdAt > entry.ttlMs)
  );
}

function settle(
  entry: MutableSessionEntry,
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
  if (byPlugin[pluginId]?.[record.idempotencyKey]) {
    return;
  }
  notices?.push({
    pluginId,
    event: { sessionKey: "", idempotencyKey: record.idempotencyKey, state, settledAt: now },
  });
  (byPlugin[pluginId] ??= {})[record.idempotencyKey] = {
    state,
    settledAt: now,
    retainUntil: Math.max(record.expiresAt ?? 0, record.outcomeRetainUntil ?? 0, now) + 5_000,
  };
}

function pruneOutcomes(entry: MutableSessionEntry, pluginId: string, now: number) {
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

export async function getPluginNextTurnInjectionState(params: {
  cfg: OpenClawConfig;
  pluginId: string;
  sessionKey: string;
  agentId?: string;
  idempotencyKey: string;
}): Promise<PluginNextTurnInjectionStateResult> {
  const entry = await readResolvedSessionEntryInWorker({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
  });
  const now = Date.now();
  const pending = entry?.pluginNextTurnInjections?.[params.pluginId]?.find(
    (item) => item.idempotencyKey === params.idempotencyKey,
  );
  const outcome =
    entry?.pluginNextTurnInjectionOutcomes?.[params.pluginId]?.[params.idempotencyKey];
  return {
    sessionKey: params.sessionKey,
    idempotencyKey: params.idempotencyKey,
    state:
      pending && !isExpired(pending, now)
        ? "pending"
        : outcome && outcome.retainUntil > now
          ? outcome.state
          : pending
            ? "expired"
            : "unknown",
    settledAt: outcome?.settledAt,
  };
}

export async function withdrawPluginNextTurnInjection(params: {
  cfg: OpenClawConfig;
  pluginId: string;
  sessionKey: string;
  agentId?: string;
  idempotencyKey: string;
}): Promise<PluginNextTurnInjectionStateResult> {
  const now = Date.now();
  const notices: SettlementNotice[] = [];
  const updated = await updateResolvedSessionEntry(
    { cfg: params.cfg, sessionKey: params.sessionKey, agentId: params.agentId },
    (entry) => {
      pruneOutcomes(entry, params.pluginId, now);
      const entries = entry.pluginNextTurnInjections?.[params.pluginId] ?? [];
      const pending = entries.find((item) => item.idempotencyKey === params.idempotencyKey);
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
      const outcome =
        entry.pluginNextTurnInjectionOutcomes?.[params.pluginId]?.[params.idempotencyKey];
      return {
        state: (outcome?.state ?? "unknown") as PluginNextTurnInjectionState,
        settledAt: outcome?.settledAt,
      };
    },
  );
  await notifySettlements(notices, updated.canonicalKey);
  return {
    sessionKey: params.sessionKey,
    idempotencyKey: params.idempotencyKey,
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
}): Promise<PluginNextTurnInjectionEnqueueResult> {
  const sessionKey = normalizeOptionalString(params.injection.sessionKey) ?? "";
  if (!sessionKey) {
    return { enqueued: false, id: "", sessionKey };
  }
  const text = normalizeOptionalString(params.injection.text);
  if (
    !text ||
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
  const enhanced =
    requested.expiresAt !== undefined ||
    requested.notBefore !== undefined ||
    requested.supersedeKey !== undefined ||
    requested.expectedSupersededKey !== undefined ||
    requested.outcomeRetainUntil !== undefined ||
    requested.provenance !== undefined;
  if (
    (requested.expiresAt !== undefined &&
      (!Number.isFinite(requested.expiresAt) || requested.expiresAt <= now)) ||
    (requested.notBefore !== undefined &&
      (!Number.isFinite(requested.notBefore) ||
        (requested.expiresAt !== undefined && requested.notBefore >= requested.expiresAt))) ||
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
  const record: PluginNextTurnInjectionRecord = {
    id: injection.idempotencyKey?.trim() || randomUUID(),
    pluginId: params.pluginId,
    pluginName: params.pluginName,
    text,
    idempotencyKey: injection.idempotencyKey?.trim() || undefined,
    placement: injection.placement ?? "prepend_context",
    ttlMs: injection.ttlMs,
    expiresAt: injection.expiresAt,
    notBefore: injection.notBefore,
    supersedeKey: injection.supersedeKey,
    outcomeRetainUntil: injection.outcomeRetainUntil,
    provenance: injection.provenance,
    createdAt: now,
    metadata: injection.metadata,
  };
  const scope = { cfg: params.cfg, sessionKey, agentId: params.injection.agentId };
  const notices: SettlementNotice[] = [];
  const updated = await updateResolvedSessionEntry(scope, (entry) => {
    if (
      entry.agentHarnessId === "codex" ||
      entry.agentHarnessId === "copilot" ||
      /(?:^|:)harness:(?:codex|copilot)(?::|$)/.test(sessionKey)
    ) {
      return { enqueued: false, id: "", reason: "harness_does_not_drain" as const };
    }
    const injections = { ...entry.pluginNextTurnInjections };
    pruneOutcomes(entry, params.pluginId, now);
    // Guard against malformed/hand-edited persisted state — a non-array value
    // here would crash the spread/filter and break the whole session's enqueue.
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
      ? entry.pluginNextTurnInjectionOutcomes?.[params.pluginId]?.[record.idempotencyKey]
      : undefined;
    const predecessor = record.supersedeKey
      ? existing.find((item) => item.supersedeKey === record.supersedeKey)
      : undefined;
    const expectedState: PluginNextTurnInjectionState | undefined = injection.expectedSupersededKey
      ? existing.some((item) => item.idempotencyKey === injection.expectedSupersededKey)
        ? "pending"
        : (entry.pluginNextTurnInjectionOutcomes?.[params.pluginId]?.[
            injection.expectedSupersededKey
          ]?.state ?? "unknown")
      : undefined;
    const conflict =
      injection.expectedSupersededKey &&
      (predecessor?.idempotencyKey !== injection.expectedSupersededKey ||
        expectedState !== "pending");
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
  await notifySettlements(notices, updated.canonicalKey);
  return { ...updated.result, sessionKey: updated.canonicalKey };
}

async function drainPluginNextTurnInjections(
  params: Parameters<typeof drainPluginNextTurnInjectionContext>[0],
): Promise<PluginNextTurnInjectionRecord[]> {
  const sessionKey = params.sessionKey?.trim();
  if (!sessionKey) {
    return [];
  }
  const scope = { cfg: params.cfg, sessionKey, agentId: params.agentId };
  const selectedEntry = await readResolvedSessionEntryInWorker(scope);
  // Empty queues need no qualified mutation target. Concurrent enqueues wait for the next turn.
  if (
    !selectedEntry?.pluginNextTurnInjections ||
    Object.keys(selectedEntry.pluginNextTurnInjections).length === 0
  ) {
    return [];
  }
  const now = Date.now();
  const notices: SettlementNotice[] = [];
  const updated = await updateResolvedSessionEntry(scope, (entry) => {
    if (!entry?.pluginNextTurnInjections) {
      return [];
    }
    const activePluginIds = new Set(
      (getPluginRegistryForContext()?.plugins ?? [])
        .filter((plugin) => plugin.status === "loaded")
        .map((plugin) => plugin.id),
    );
    const drained: PluginNextTurnInjectionRecord[] = [];
    const retained: NonNullable<SessionEntry["pluginNextTurnInjections"]> = {};
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
          (retained[pluginId] ??= []).push(candidate);
        } else {
          const bytes = Buffer.byteLength(candidate.text, "utf8");
          if (bytes > DEFAULT_DRAINED_NEXT_TURN_INJECTION_BYTES_PER_PLUGIN) {
            settle(entry, pluginId, candidate, "discarded", now, notices);
            continue;
          }
          if (drainedEntriesForPlugin >= maxEntries || drainedBytesForPlugin + bytes > maxBytes) {
            (retained[pluginId] ??= []).push(candidate);
            continue;
          }
          drained.push(candidate);
          drainedEntriesForPlugin += 1;
          drainedBytesForPlugin += bytes;
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
    return drained;
  });
  await notifySettlements(notices, updated.canonicalKey);
  return updated.found ? updated.result : [];
}

export async function drainPluginNextTurnInjectionContext(params: {
  cfg: OpenClawConfig;
  sessionKey?: string;
  agentId?: string;
}): Promise<PluginAgentTurnPrepareResult & { queuedInjections: PluginNextTurnInjectionRecord[] }> {
  const queuedInjections = await drainPluginNextTurnInjections(params);
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
  // Promote the projected value into a top-level SessionEntry slot when the
  // extension opted in via `sessionEntrySlotKey`. The slot is a read-only
  // mirror: writes still go through patchSessionExtension; the host overwrites
  // the slot value on every patch and clears it on unset.
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
  // Both plugin projections and persisted state must satisfy the same size and shape bounds.
  return isPluginJsonValue(projected) ? structuredClone(projected) : undefined;
}
