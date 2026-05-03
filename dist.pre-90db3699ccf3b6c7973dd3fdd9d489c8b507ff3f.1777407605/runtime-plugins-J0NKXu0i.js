import { m as resolveUserPath } from "./utils-CB8xp0O4.js";
import { a as resolveRuntimePluginRegistry } from "./loader-708jrx4Y.js";
//#region src/agents/runtime-plugins.ts
function ensureRuntimePluginsLoaded(params) {
	const workspaceDir = typeof params.workspaceDir === "string" && params.workspaceDir.trim() ? resolveUserPath(params.workspaceDir) : void 0;
	resolveRuntimePluginRegistry({
		config: params.config,
		workspaceDir,
		runtimeOptions: params.allowGatewaySubagentBinding ? { allowGatewaySubagentBinding: true } : void 0
	});
}
//#endregion
export { ensureRuntimePluginsLoaded as t };
