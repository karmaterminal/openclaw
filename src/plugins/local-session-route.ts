import { resolveAgentMainSessionKey } from "../config/sessions/main-session.js";
import { resolveSessionStorePathCore } from "../config/sessions/paths.js";
import { readSessionEntryReadOnlyInWorker } from "../config/sessions/session-entry-read-runtime.js";
import type { InternalSessionEntry } from "../config/sessions/types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  resolveSessionStoreAgentId,
  resolveSessionStoreKey,
} from "../gateway/session-store-key.js";

export type PluginLocalSessionRoute = {
  sessionKey: string;
  exists: boolean;
  onHost: boolean;
};

/** A missing route is not sufficient proof for a shared main or channel-shaped key. */
function hasOffHostRoute(
  cfg: OpenClawConfig,
  sessionKey: string,
  agentId: string,
  entry: InternalSessionEntry,
): boolean {
  if (sessionKey === resolveAgentMainSessionKey({ cfg, agentId })) {
    return true;
  }
  const rest = sessionKey.slice(`agent:${agentId}:`.length);
  // Channel plugins can introduce new key prefixes. Only host-owned session
  // families have a positive locality proof without an explicit route record.
  if (!/^(?:subagent|cron|hook):/.test(rest)) {
    return true;
  }
  return entry.delivery?.kind === "external" || Boolean(entry.groupChannel || entry.groupId);
}

/** Read-only, exact session-store proof; never creates a session or sends to a route. */
export async function resolvePluginLocalSessionRoute(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
}): Promise<PluginLocalSessionRoute> {
  const raw = typeof params.sessionKey === "string" ? params.sessionKey.trim() : "";
  try {
    const sessionKey = raw ? resolveSessionStoreKey({ cfg: params.cfg, sessionKey: raw }) : "";
    const absent = { sessionKey, exists: false, onHost: false };
    if (!sessionKey || sessionKey === "unknown") {
      return absent;
    }
    const agentId = resolveSessionStoreAgentId(params.cfg, sessionKey);
    const storePath = resolveSessionStorePathCore(params.cfg.session?.store, { agentId });
    // Exact persisted-key lookup only; a folded alias could name another opaque peer.
    const existing = await readSessionEntryReadOnlyInWorker({
      agentId,
      storePath,
      sessionKey,
      projection: "list",
    });
    if (!existing || !existing.sessionId) {
      return absent;
    }
    return {
      sessionKey,
      exists: true,
      onHost:
        sessionKey !== "global" && !hasOffHostRoute(params.cfg, sessionKey, agentId, existing),
    };
  } catch {
    // An unreadable/transient store cannot prove that a target is local.
    return { sessionKey: raw, exists: false, onHost: false };
  }
}
