import { resolveAgentMainSessionKey } from "../config/sessions/main-session.js";
import { resolveSessionStorePathCore } from "../config/sessions/paths.js";
import { readSessionEntryReadOnlyInWorker } from "../config/sessions/session-entry-read-runtime.js";
import type { InternalSessionEntry } from "../config/sessions/types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  resolveSessionStoreAgentId,
  resolveSessionStoreKey,
} from "../gateway/session-store-key.js";
import { createWorkerSessionPlacementStore } from "../gateway/worker-environments/placement-store.js";
import { listSessionBindingsBySessionAsync } from "../infra/outbound/session-binding-service.js";

export type PluginLocalSessionRoute = {
  sessionKey: string;
  exists: boolean;
  onHost: boolean;
  /** Exact persisted row identity; absent when no row can be proved. */
  sessionId: string | null;
  lifecycleRevision: string | null;
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
  // Cron and hook keys can be routed by schedulers outside this row. Only a
  // subagent row has a positive host-local proof without another authority.
  if (!rest.startsWith("subagent:")) {
    return true;
  }
  // Older rows can retain route hints alongside an internal/absent canonical delivery.
  // Such a row cannot prove host locality until the legacy metadata is reconciled.
  const legacyRoute = entry as InternalSessionEntry & Record<string, unknown>;
  return (
    entry.delivery?.kind === "external" ||
    Boolean(entry.groupChannel || entry.groupId) ||
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
    ].some((field) => legacyRoute[field] != null)
  );
}

/** Read-only, exact session-store proof; never creates a session or sends to a route. */
export async function resolvePluginLocalSessionRoute(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
}): Promise<PluginLocalSessionRoute> {
  const raw = typeof params.sessionKey === "string" ? params.sessionKey.trim() : "";
  try {
    const sessionKey = raw ? resolveSessionStoreKey({ cfg: params.cfg, sessionKey: raw }) : "";
    const absent = {
      sessionKey,
      exists: false,
      onHost: false,
      sessionId: null,
      lifecycleRevision: null,
    };
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
    // The session row does not own worker locality. Read the current placement
    // projection for this exact row before claiming it is executable here.
    let onHost = false;
    if (
      existing.lifecycleRevision &&
      sessionKey !== "global" &&
      !hasOffHostRoute(params.cfg, sessionKey, agentId, existing)
    ) {
      // A thread-bound child can have internal row delivery while its active
      // conversation binding routes replies directly to the external thread.
      // Row fields alone cannot establish a host-local route.
      const bindings = await listSessionBindingsBySessionAsync(sessionKey);
      if (bindings.length > 0) {
        return {
          sessionKey,
          exists: true,
          onHost: false,
          sessionId: existing.sessionId,
          lifecycleRevision: existing.lifecycleRevision,
        };
      }
      const placement = (
        await createWorkerSessionPlacementStore().readProjection([existing.sessionId], {
          current: true,
        })
      ).placements.get(existing.sessionId);
      onHost =
        !placement ||
        (placement.sessionId === existing.sessionId &&
          placement.sessionKey === sessionKey &&
          placement.agentId === agentId &&
          placement.state === "local");
    }
    return {
      sessionKey,
      exists: true,
      onHost,
      sessionId: existing.sessionId,
      lifecycleRevision: existing.lifecycleRevision ?? null,
    };
  } catch {
    // An unreadable/transient store cannot prove that a target is local.
    return {
      sessionKey: raw,
      exists: false,
      onHost: false,
      sessionId: null,
      lifecycleRevision: null,
    };
  }
}
