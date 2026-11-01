import type { SessionEntry } from "../config/sessions.js";
import { readResolvedSessionEntriesInWorker } from "../config/sessions/session-accessor.entry.js";
import type {
  LogicalSessionAccessScope,
  ResolvedSessionEntryAccessTarget,
} from "../config/sessions/session-accessor.types.js";
import { createWorkerSessionPlacementStore } from "../gateway/worker-environments/placement-store.js";
import { listSessionBindingsBySessionAsync } from "../infra/outbound/session-binding-service.js";

export function isSubagentInjectionRoute(sessionKey: string): boolean {
  return /^agent:[^:]+:subagent:/.test(sessionKey);
}

export function matchesInjectionRouteGeneration(
  selected: ResolvedSessionEntryAccessTarget | undefined,
  canonicalKey: string,
  entry: SessionEntry,
): boolean {
  return Boolean(
    selected?.entry &&
    selected.canonicalKey === canonicalKey &&
    selected.entry.sessionId === entry.sessionId &&
    selected.entry.lifecycleRevision === entry.lifecycleRevision,
  );
}

export function injectionRouteAdmissionReason(params: {
  selected: ResolvedSessionEntryAccessTarget;
  canonicalKey: string;
  requestedKey: string;
  entry: SessionEntry;
  expectedSessionId?: string;
  expectedLifecycleRevision?: string;
  unsupportedRoute: boolean;
}): "invalid" | "stale_session" | "unsupported_route" | "harness_does_not_drain" | undefined {
  const { selected, canonicalKey, requestedKey, entry } = params;
  if (!matchesInjectionRouteGeneration(selected, canonicalKey, entry)) {
    return "stale_session";
  }
  if (
    isSubagentInjectionRoute(canonicalKey) &&
    (params.expectedSessionId === undefined || params.expectedLifecycleRevision === undefined)
  ) {
    return "invalid";
  }
  if (
    params.expectedSessionId !== undefined &&
    (entry.sessionId !== params.expectedSessionId ||
      entry.lifecycleRevision !== params.expectedLifecycleRevision)
  ) {
    return "stale_session";
  }
  if (params.unsupportedRoute || isUnsupportedInjectionRoute(canonicalKey, entry)) {
    return "unsupported_route";
  }
  if (
    entry.agentHarnessId === "codex" ||
    entry.agentHarnessId === "copilot" ||
    /(?:^|:)harness:(?:codex|copilot)(?::|$)/.test(requestedKey)
  ) {
    return "harness_does_not_drain";
  }
  return undefined;
}

export async function prepareInjectionRoute(
  scope: LogicalSessionAccessScope,
  skipWhenEmpty = false,
): Promise<{ selected: ResolvedSessionEntryAccessTarget | undefined; unsupportedRoute: boolean }> {
  const selected = (
    await readResolvedSessionEntriesInWorker({ ...scope, sessionKeys: [scope.sessionKey] })
  ).get(scope.sessionKey);
  const entry = selected?.entry;
  const empty = !entry?.pluginNextTurnInjections && !entry?.pluginNextTurnInjectionOutcomes;
  const unsupportedRoute =
    selected && entry && !(skipWhenEmpty && empty)
      ? await isUnsupportedInjectionRouteNow(selected.canonicalKey, selected.agentId, entry)
      : true;
  return { selected, unsupportedRoute };
}

/** A current external binding or nonlocal placement defeats row-only locality. */
export async function hasLocalSubagentInjectionRoute(params: {
  sessionKey: string;
  sessionId: string;
  agentId: string;
}): Promise<boolean> {
  try {
    if ((await listSessionBindingsBySessionAsync(params.sessionKey)).length > 0) {
      return false;
    }
    const placement = (
      await createWorkerSessionPlacementStore().readProjection([params.sessionId], {
        current: true,
      })
    ).placements.get(params.sessionId);
    return (
      !placement ||
      (placement.sessionId === params.sessionId &&
        placement.sessionKey === params.sessionKey &&
        placement.agentId === params.agentId &&
        placement.state === "local")
    );
  } catch {
    return false;
  }
}

/** Recheck external route facts at both enqueue and drain; this is not an atomic locality fence. */
export async function isUnsupportedInjectionRouteNow(
  sessionKey: string,
  agentId: string,
  entry: SessionEntry,
): Promise<boolean> {
  return (
    isUnsupportedInjectionRoute(sessionKey, entry) ||
    (isSubagentInjectionRoute(sessionKey) &&
      !(await hasLocalSubagentInjectionRoute({
        sessionKey,
        sessionId: entry.sessionId!,
        agentId,
      })))
  );
}

export function isUnsupportedInjectionRoute(sessionKey: string, entry: SessionEntry): boolean {
  // Local route proof is stricter than admission: main/channel sessions may
  // drain here even though absence of a route never proves host locality.
  if (/^(?:agent:[^:]+:)?(?:cron|hook):/.test(sessionKey)) {
    return true;
  }
  if (!isSubagentInjectionRoute(sessionKey)) {
    return false;
  }
  // A subagent without a current generation cannot prove host locality.
  if (!entry.sessionId || !entry.lifecycleRevision || entry.delivery?.kind === "external") {
    return true;
  }
  const legacy = entry as SessionEntry & Record<string, unknown>;
  return Boolean(
    entry.groupChannel ||
    entry.groupId ||
    [
      "route",
      "deliveryContext",
      "origin",
      "provider",
      "channel",
      "lastProvider",
      "lastChannel",
      "lastTo",
      "lastAccountId",
      "lastThreadId",
    ].some((key) => legacy[key] != null),
  );
}
