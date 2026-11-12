import {
  ErrorCodes,
  validateSessionsRecoverParams,
} from "../../../packages/gateway-protocol/src/index.js";
import { captureGatewayOperatorRunAuthority } from "../operator-run-authority.js";
import { ADMIN_SCOPE } from "../operator-scopes.js";
import { recoverGatewaySessionTombstone } from "../session-tombstone-recovery.js";
import { respondError } from "./response.js";
import { emitSessionsChanged } from "./session-change-event.js";
import { requireSessionKey } from "./sessions-shared.js";
import type { GatewayRequestHandlers } from "./types.js";
import { assertValidParams } from "./validation.js";

export const sessionRecoverHandlers: GatewayRequestHandlers = {
  "sessions.recover": async ({
    params,
    respond,
    context,
    client,
    sessionMutationAuthorization,
    hasCurrentClientAuthority,
    signal,
  }) => {
    if (!assertValidParams(params, validateSessionsRecoverParams, "sessions.recover", respond)) {
      return;
    }
    const key = requireSessionKey(params.key, respond);
    if (!key) {
      return;
    }
    const captured = await captureGatewayOperatorRunAuthority({
      client,
      context,
      hasCurrentClientAuthority,
      invocationAuthority: {
        assertCurrent: () => sessionMutationAuthorization?.assertCurrent(),
        signal,
      },
    });
    try {
      // Lifting a restart refusal is owner/operator work, never an agent or plugin caller's.
      if (!captured?.authority.scopes.includes(ADMIN_SCOPE)) {
        respondError(
          respond,
          ErrorCodes.FORBIDDEN,
          "sessions.recover requires owner or operator authority with operator.admin",
        );
        return;
      }
      const authority = captured.authority;
      const result = await recoverGatewaySessionTombstone({
        key,
        ...(params.agentId ? { agentId: params.agentId } : {}),
        expectedSessionId: params.expectedSessionId,
        assertCurrent: () => {
          signal?.throwIfAborted();
          authority.assertCurrent();
          sessionMutationAuthorization?.assertCurrent();
        },
      });
      if (!result.ok) {
        respond(false, undefined, result.error);
        return;
      }
      const { agentId, ...payload } = result;
      respond(true, payload, undefined);
      if (result.recovered) {
        emitSessionsChanged(context, { sessionKey: result.key, agentId, reason: "recovery" });
      }
    } finally {
      captured?.release();
    }
  },
};
