/** Session-list effects of an accepted Gateway agent run. */
import { emitSessionsChanged } from "../server-methods/session-change-event.js";
import type { StartAgentRunExecutionParams } from "./agent-run-execution-types.js";

/** Announces a newly created session and the send into it, unless visible effects are suppressed. */
export function emitAgentRunSessionChanges(params: StartAgentRunExecutionParams): void {
  if (
    !params.suppressVisibleSessionEffects &&
    params.requestedSessionKey &&
    params.resolvedSessionKey &&
    params.isNewSession
  ) {
    emitSessionsChanged(params.context, {
      sessionKey: params.resolvedSessionKey,
      agentId: params.activeSessionAgentId,
      reason: "create",
    });
  }
  if (!params.suppressVisibleSessionEffects && params.resolvedSessionKey) {
    emitSessionsChanged(
      params.context,
      {
        sessionKey: params.resolvedSessionKey,
        agentId: params.activeSessionAgentId,
        reason: "send",
      },
      { accessChanged: false },
    );
  }
}
