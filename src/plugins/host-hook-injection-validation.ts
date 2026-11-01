import type { PluginNextTurnInjectionRecord } from "./host-hooks.js";

export function isPluginNextTurnInjectionPlacement(
  value: unknown,
): value is PluginNextTurnInjectionRecord["placement"] {
  return value === "prepend_context" || value === "append_context";
}

export function isPluginNextTurnInjectionRecord(
  value: unknown,
): value is PluginNextTurnInjectionRecord {
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

export function isExpired(entry: unknown, now: number) {
  if (!isPluginNextTurnInjectionRecord(entry)) {
    return true;
  }
  return (
    (entry.expiresAt !== undefined && now >= entry.expiresAt) ||
    (entry.ttlMs !== undefined && now - entry.createdAt > entry.ttlMs)
  );
}
