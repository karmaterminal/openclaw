import { n as resolveManifestCommandAliasOwnerInRegistry } from "./manifest-command-aliases-BmZ00BHB.js";
import { n as loadPluginManifestRegistryForPluginRegistry } from "./plugin-registry-x83fIWqx.js";
//#region src/plugins/manifest-command-aliases.runtime.ts
function resolveManifestCommandAliasOwner(params) {
	const registry = params.registry ?? loadPluginManifestRegistryForPluginRegistry({
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env,
		includeDisabled: true
	});
	return resolveManifestCommandAliasOwnerInRegistry({
		command: params.command,
		registry
	});
}
//#endregion
export { resolveManifestCommandAliasOwner };
