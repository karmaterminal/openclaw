/** Builds the execution-identity facts carried on a native subagent gateway launch. */
import { isExecutionIdentityCollectionEnabled } from "../../../audit/audit-config.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { readParentExecutionIdentity } from "./execution-identity-spawn-context.js";
import type { SpawnSubagentContext } from "./subagent-spawn-contract.js";
import { buildSubagentExecutionSessionSpawnContext } from "./subagent-spawn-execution-identity.js";

export function buildSubagentSpawnGatewayIdentity(params: {
  cfg: OpenClawConfig;
  ctx: SpawnSubagentContext;
  requesterAgentId: string;
  requesterInternalKey: string;
  controllerSessionKey: string;
  childDepth: number;
  maxSpawnDepth: number | undefined;
  targetAgentId: string;
  sandboxMode: "inherit" | "require";
}) {
  const { cfg, ctx } = params;
  return {
    sessionSpawnContext: buildSubagentExecutionSessionSpawnContext({
      enabled: isExecutionIdentityCollectionEnabled(cfg),
      backend: "subagent",
      parentAgentId: params.requesterAgentId,
      requesterRef: params.requesterInternalKey,
      controllerRef: params.controllerSessionKey,
      depth: params.childDepth,
      maxDepth: params.maxSpawnDepth,
      targetAgentId: params.targetAgentId,
      sandbox: params.sandboxMode,
      inheritedToolAllowlist: ctx.inheritedToolAllowlist,
      inheritedToolDenylist: ctx.inheritedToolDenylist,
    }),
    parentExecutionIdentityToken: readParentExecutionIdentity(ctx),
  };
}
