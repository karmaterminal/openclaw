import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveRuntimePluginRegistry } from "../plugins/loader.js";
import { getGatewayBindablePluginRegistry } from "../plugins/runtime.js";
import { resolveUserPath } from "../utils.js";

export function ensureRuntimePluginsLoaded(params: {
  config?: OpenClawConfig;
  workspaceDir?: string | null;
  allowGatewaySubagentBinding?: boolean;
}): void {
  // Reuse the pinned gateway startup snapshot when it exists. The gateway's
  // process-wide active registry can later drift to a default-mode registry via
  // unrelated provider/config loads, but lifecycle helpers still want the
  // original gateway-bindable runtime surfaces instead of triggering a fresh
  // synchronous plugin load.
  if (params.allowGatewaySubagentBinding === true && getGatewayBindablePluginRegistry()) {
    return;
  }
  const workspaceDir =
    typeof params.workspaceDir === "string" && params.workspaceDir.trim()
      ? resolveUserPath(params.workspaceDir)
      : undefined;
  const loadOptions = {
    config: params.config,
    workspaceDir,
    runtimeOptions: params.allowGatewaySubagentBinding
      ? {
          allowGatewaySubagentBinding: true,
        }
      : undefined,
  };
  resolveRuntimePluginRegistry(loadOptions);
}
