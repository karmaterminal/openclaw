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
    sessionKey: string;
    assertCurrent: () => void;
  },
): Promise<ReturnType<typeof errorShape> | undefined> {
  const queueKeys = [
    ...params.target.storeKeys,
    params.target.canonicalKey,
    params.sessionId,
  ].filter((key) => key !== undefined);
  // Process scopes may use the requested alias, canonical key, or session id.
  // Clear only completed records so reset/delete cannot erase another scope's
  // output or hide a background process whose owner has not confirmed exit.
  runtime.clearFinishedSessionsForScopes([...queueKeys, params.key]);
  try {
    await clearSessionResetRuntimeState(queueKeys, {
      activeReplySessionId: params.sessionId,
      agentId: runtime.agentId,
      sessionKey: runtime.sessionKey,
      assertCurrent: runtime.assertCurrent,
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
