import { m as resolveUserPath } from "./utils-BMRcljdi.js";
import { a as resolveRuntimePluginRegistry } from "./loader-Dbq7I8n7.js";
import { l as getActivePluginRuntimeSubagentMode } from "./runtime-BLsgx2-v.js";
//#region src/agents/runtime-plugins.ts
function ensureRuntimePluginsLoaded(params) {
	const workspaceDir = typeof params.workspaceDir === "string" && params.workspaceDir.trim() ? resolveUserPath(params.workspaceDir) : void 0;
	const allowGatewaySubagentBinding = params.allowGatewaySubagentBinding === true || getActivePluginRuntimeSubagentMode() === "gateway-bindable";
	resolveRuntimePluginRegistry({
		config: params.config,
		workspaceDir,
		runtimeOptions: allowGatewaySubagentBinding ? { allowGatewaySubagentBinding: true } : void 0
	});
}
//#endregion
export { ensureRuntimePluginsLoaded as t };
