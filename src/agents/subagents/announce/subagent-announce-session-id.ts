// Synchronous session-incarnation read for checks that run inside a
// synchronous state transaction (delegate-artifact finalization). Session
// loads elsewhere in announce are async worker reads; this one cannot be.
import { getRuntimeConfig } from "../../../config/config.js";
import { resolveSessionStorePathCore } from "../../../config/sessions.js";
import { loadSessionEntryReadOnly } from "../../../config/sessions/session-accessor.js";
import { tryResolveSubagentRequesterAgentId } from "./subagent-announce-delivery.runtime.js";

/** The session's current incarnation ID, read synchronously. */
export function readSessionIdByKeySync(sessionKey: string): string | undefined {
  const cfg = getRuntimeConfig();
  const agentId = tryResolveSubagentRequesterAgentId(cfg, sessionKey);
  if (!agentId) {
    return undefined;
  }
  const storePath = resolveSessionStorePathCore(cfg.session?.store, { agentId });
  return loadSessionEntryReadOnly({ storePath, sessionKey, agentId })?.sessionId;
}
