import type { SessionEntry } from "../../config/sessions/types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { SessionContinuationResetError } from "../continuation/session-reset.js";
import {
  clearSessionResetRuntimeState,
  SessionResetCleanupError,
} from "./session-reset-cleanup.js";

const log = createSubsystemLogger("session-init");

/**
 * Clears runtime state owned by the session a committed reset replaced. Lifecycle
 * reasons outside the reset family normalize to "reset". The reset is already
 * committed, so cleanup is best-effort like upstream (warn and continue), except a
 * continuation cancellation that cannot persist: that durable authority must close,
 * so it fails initialization and the reset is retried.
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
    log.warn(`failed to clear reset runtime state for session ${sessionKey}: ${String(error)}`);
  }
}
