import type { SessionEntry } from "../config/sessions.js";
import { createWorkerSessionPlacementStore } from "../gateway/worker-environments/placement-store.js";
import { listSessionBindingsBySessionAsync } from "../infra/outbound/session-binding-service.js";

export function isSubagentInjectionRoute(sessionKey: string): boolean {
  return /^agent:[^:]+:subagent:/.test(sessionKey);
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
  if (entry.delivery?.kind === "external" || /^(?:agent:[^:]+:)?(?:cron|hook):/.test(sessionKey)) {
    return true;
  }
  if (!isSubagentInjectionRoute(sessionKey)) {
    return false;
  }
  // A subagent without a current generation cannot prove host locality.
  if (!entry.sessionId || !entry.lifecycleRevision) {
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
