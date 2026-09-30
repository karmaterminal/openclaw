import { ErrorCodes, errorShape } from "../../packages/gateway-protocol/src/index.js";
import { SessionContinuationResetError } from "../auto-reply/continuation/session-reset.js";
import { clearSessionResetRuntimeState } from "../auto-reply/reply/session-reset-cleanup.js";

/**
 * Clears finished process records, queued follow-ups, pending system events, and
 * continuation custody for every alias of one session scope. A continuation
 * cancellation that cannot persist surfaces as UNAVAILABLE so reset/delete retries.
 */
export async function clearSessionScopeRuntimeState(
  params: {
    key: string;
    target: { canonicalKey: string; storeKeys: readonly string[] };
    sessionId?: string;
    reason: "new" | "reset" | "delete";
  },
  runtime: {
    agentId: string;
    clearFinishedSessionsForScopes: (scopeKeys: Iterable<string>) => void;
  },
): Promise<ReturnType<typeof errorShape> | undefined> {
  const queueKeys = new Set<string>(params.target.storeKeys);
  queueKeys.add(params.target.canonicalKey);
  if (params.sessionId) {
    queueKeys.add(params.sessionId);
  }
  // Process scopes may use the requested alias, canonical key, or session id.
  // Clear only completed records so reset/delete cannot erase another scope's
  // output or hide a background process whose owner has not confirmed exit.
  const processScopeKeys = new Set(queueKeys);
  processScopeKeys.add(params.key);
  runtime.clearFinishedSessionsForScopes(processScopeKeys);
  try {
    await clearSessionResetRuntimeState([...queueKeys], {
      activeReplySessionId: params.sessionId,
      agentId: runtime.agentId,
      reason: params.reason,
    });
  } catch (error) {
    if (error instanceof SessionContinuationResetError) {
      return errorShape(ErrorCodes.UNAVAILABLE, error.message);
    }
    throw error;
  }
  return undefined;
}
