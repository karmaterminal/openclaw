import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  resolveCompatibleRuntimePluginRegistry,
  resolveRuntimePluginRegistry,
} from "../plugins/loader.js";
import { getGatewayBindablePluginRegistry } from "../plugins/runtime.js";
import { resolveUserPath } from "../utils.js";

function resolvePluginLoadOptions(params: {
  config?: OpenClawConfig;
  workspaceDir?: string | null;
  allowGatewaySubagentBinding?: boolean;
}) {
  const workspaceDir =
    typeof params.workspaceDir === "string" && params.workspaceDir.trim()
      ? resolveUserPath(params.workspaceDir)
      : undefined;
  return {
    config: params.config,
    workspaceDir,
    runtimeOptions: params.allowGatewaySubagentBinding
      ? {
          allowGatewaySubagentBinding: true,
        }
      : undefined,
  };
}

export function ensureRuntimePluginsLoaded(params: {
  config?: OpenClawConfig;
  workspaceDir?: string | null;
  allowGatewaySubagentBinding?: boolean;
}): void {
  // Reuse the pinned gateway startup snapshot when it exists. The gateway's
  // process-wide active registry can later drift to a default-mode registry via
  // unrelated provider/config loads, but gateway-owned callers still want the
  // startup runtime surfaces instead of forcing a fresh sync plugin load.
  if (params.allowGatewaySubagentBinding === true && getGatewayBindablePluginRegistry()) {
    return;
  }
  resolveRuntimePluginRegistry(resolvePluginLoadOptions(params));
}

/**
 * Read-only variant for best-effort lifecycle paths. Returns true when a
 * compatible runtime registry is already available and false otherwise. This
 * never triggers a fresh plugin load.
 */
export function ensureRuntimePluginsLoadedReadOnly(params: {
  config?: OpenClawConfig;
  workspaceDir?: string | null;
  allowGatewaySubagentBinding?: boolean;
}): boolean {
  if (params.allowGatewaySubagentBinding === true && getGatewayBindablePluginRegistry()) {
    return true;
  }
  return resolveCompatibleRuntimePluginRegistry(resolvePluginLoadOptions(params)) != null;
}
