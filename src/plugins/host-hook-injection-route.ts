import type { SessionEntry } from "../config/sessions.js";

export function isUnsupportedInjectionRoute(sessionKey: string, entry: SessionEntry): boolean {
  // Local route proof is stricter than admission: main/channel sessions may
  // drain here even though absence of a route never proves host locality.
  if (entry.delivery?.kind === "external" || /^(?:agent:[^:]+:)?(?:cron|hook):/.test(sessionKey)) {
    return true;
  }
  if (!/^agent:[^:]+:subagent:/.test(sessionKey)) {
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
