import { o as resolveManifestCommandAliasOwnerInRegistry } from "./manifest-Zs95qtmO.js";
import { t as loadPluginManifestRegistry } from "./manifest-registry-D3girPWo.js";
//#region src/plugins/manifest-command-aliases.runtime.ts
function resolveManifestCommandAliasOwner(params) {
	const registry = params.registry ?? loadPluginManifestRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	return resolveManifestCommandAliasOwnerInRegistry({
		command: params.command,
		registry
	});
}
//#endregion
export { resolveManifestCommandAliasOwner as t };
