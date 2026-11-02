import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import type { SessionEntry } from "../config/sessions.js";
import { formatSqliteSessionFileMarker } from "../config/sessions/legacy-sqlite-marker.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { logVerbose } from "../globals.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { readGatewayBeforeResetPluginHookMessages } from "./session-reset-transcript.js";
import type { GatewaySessionStoreTarget } from "./session-utils-store.types.js";

export async function emitGatewayBeforeResetPluginHook(params: {
  cfg: OpenClawConfig;
  key: string;
  messages?: unknown[];
  target: GatewaySessionStoreTarget;
  storePath: string;
  entry?: SessionEntry;
  reason: "new" | "reset";
}): Promise<void> {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("before_reset")) {
    return;
  }

  const sessionKey = params.target.canonicalKey;
  const sessionId = params.entry?.sessionId;
  const agentId = params.target.agentId;
  const sessionFile = sessionId
    ? formatSqliteSessionFileMarker({ agentId, sessionId, storePath: params.storePath })
    : undefined;
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId);
  const messages =
    params.messages ??
    (await readGatewayBeforeResetPluginHookMessages({
      agentId,
      entry: params.entry,
      sessionId,
      sessionKey,
      storePath: params.storePath,
    }));

  void hookRunner
    .runBeforeReset(
      {
        sessionFile,
        messages,
        reason: params.reason,
      },
      {
        agentId,
        sessionKey,
        sessionId,
        workspaceDir,
      },
    )
    .catch((err: unknown) => {
      logVerbose(`before_reset hook failed: ${String(err)}`);
    });
}
