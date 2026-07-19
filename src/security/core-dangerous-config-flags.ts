// Detects dangerous core config flags during security audits.
import type { OpenClawConfig } from "../config/types.openclaw.js";

type ApplyPatchConfig = NonNullable<
  NonNullable<NonNullable<OpenClawConfig["tools"]>["exec"]>["applyPatch"]
>;

export function getAgentDangerousFlagPathSegment(agent: unknown, index: number): string {
  const id =
    agent &&
    typeof agent === "object" &&
    !Array.isArray(agent) &&
    typeof (agent as { id?: unknown }).id === "string" &&
    (agent as { id: string }).id.length > 0
      ? (agent as { id: string }).id
      : undefined;
  return id ? `agents.list[id=${JSON.stringify(id)}]` : `agents.list[${index}]`;
}

function activeAllowedRootsCount(params: {
  applyPatch: ApplyPatchConfig | undefined;
  fsWorkspaceOnly: boolean | undefined;
}): number {
  if (
    params.applyPatch?.enabled === false ||
    params.applyPatch?.workspaceOnly === false ||
    params.fsWorkspaceOnly === true
  ) {
    return 0;
  }
  const allowedRoots = params.applyPatch?.allowedRoots;
  return Array.isArray(allowedRoots) ? allowedRoots.length : 0;
}

/** List enabled core config flags that intentionally weaken security posture. */
export function collectCoreInsecureOrDangerousFlags(cfg: OpenClawConfig): string[] {
  const enabledFlags: string[] = [];
  if (cfg.gateway?.controlUi?.allowInsecureAuth === true) {
    enabledFlags.push("gateway.controlUi.allowInsecureAuth=true");
  }
  if (cfg.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback === true) {
    enabledFlags.push("gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback=true");
  }
  if (cfg.gateway?.controlUi?.dangerouslyDisableDeviceAuth === true) {
    enabledFlags.push("gateway.controlUi.dangerouslyDisableDeviceAuth=true");
  }
  if (cfg.hooks?.gmail?.allowUnsafeExternalContent === true) {
    enabledFlags.push("hooks.gmail.allowUnsafeExternalContent=true");
  }
  if (Array.isArray(cfg.hooks?.mappings)) {
    for (const [index, mapping] of cfg.hooks.mappings.entries()) {
      if (mapping?.allowUnsafeExternalContent === true) {
        enabledFlags.push(`hooks.mappings[${index}].allowUnsafeExternalContent=true`);
      }
    }
  }
  if (cfg.tools?.exec?.applyPatch?.workspaceOnly === false) {
    enabledFlags.push("tools.exec.applyPatch.workspaceOnly=false");
  }
  const globalApplyPatch = cfg.tools?.exec?.applyPatch;
  const globalFsWorkspaceOnly = cfg.tools?.fs?.workspaceOnly;
  const globalAllowedRootsCount = activeAllowedRootsCount({
    applyPatch: globalApplyPatch,
    fsWorkspaceOnly: globalFsWorkspaceOnly,
  });
  if (globalAllowedRootsCount > 0) {
    enabledFlags.push(`tools.exec.applyPatch.allowedRoots configured (${globalAllowedRootsCount})`);
  }
  if (Array.isArray(cfg.agents?.list)) {
    for (const [index, agent] of cfg.agents.list.entries()) {
      const agentApplyPatch = agent?.tools?.exec?.applyPatch;
      const effectiveApplyPatch = agentApplyPatch ?? globalApplyPatch;
      const effectiveFsWorkspaceOnly = agent?.tools?.fs?.workspaceOnly ?? globalFsWorkspaceOnly;
      const allowedRootsCount = activeAllowedRootsCount({
        applyPatch: effectiveApplyPatch,
        fsWorkspaceOnly: effectiveFsWorkspaceOnly,
      });
      const agentDefinesAllowedRoots = (agentApplyPatch?.allowedRoots?.length ?? 0) > 0;
      const inheritedRootsBecomeActive =
        agentApplyPatch === undefined && globalAllowedRootsCount === 0 && allowedRootsCount > 0;
      if (allowedRootsCount > 0 && (agentDefinesAllowedRoots || inheritedRootsBecomeActive)) {
        enabledFlags.push(
          `${getAgentDangerousFlagPathSegment(agent, index)}.tools.exec.applyPatch.allowedRoots configured (${allowedRootsCount})`,
        );
      }
    }
  }
  // Suppressions are not insecure by themselves, but they hide audit findings
  // and should be visible in dangerous-flag snapshots.
  const auditSuppressionCount = cfg.security?.audit?.suppressions?.length ?? 0;
  if (auditSuppressionCount > 0) {
    enabledFlags.push(`security.audit.suppressions configured (${auditSuppressionCount})`);
  }
  return enabledFlags;
}
