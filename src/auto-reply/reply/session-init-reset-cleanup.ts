import type { SessionEntry } from "../../config/sessions/types.js";
import { SessionContinuationResetError } from "../continuation/session-reset.js";
import {
  clearSessionResetRuntimeState,
  SessionResetCleanupError,
} from "./session-reset-cleanup.js";

/**
 * Clears runtime state owned by the session a committed reset replaced. Lifecycle
 * reasons outside the reset family normalize to "reset"; a continuation
 * cancellation that cannot persist fails initialization so the reset is retried.
 */
export async function clearReplacedSessionRuntimeState(params: {
  sessionKey: string;
  agentId: string;
  previousSessionEntry: SessionEntry;
  previousSessionEndReason: string | undefined;
  signal?: AbortSignal;
}): Promise<void> {
  const { sessionKey, agentId, previousSessionEntry, previousSessionEndReason, signal } = params;
  try {
    await clearSessionResetRuntimeState([sessionKey, previousSessionEntry.sessionId], {
      activeReplySessionId: previousSessionEntry.sessionId,
      agentId,
      sessionKey,
      assertCurrent: () => signal?.throwIfAborted(),
      reason:
        previousSessionEndReason === "new" ||
        previousSessionEndReason === "reset" ||
        previousSessionEndReason === "idle" ||
        previousSessionEndReason === "daily"
          ? previousSessionEndReason
          : "reset",
    });
  } catch (error) {
    if (error instanceof SessionContinuationResetError) {
      throw new SessionResetCleanupError(error.message, { cause: error });
    }
    throw error;
  }
}
