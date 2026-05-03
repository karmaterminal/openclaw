import { a as hasExplicitPluginIdScope } from "./persisted-auth-state-BzNkx9AZ.js";
import { r as loadOpenClawPlugins } from "./loader-DIJaLaot.js";
import { i as resolvePluginRuntimeLoadContext, t as buildPluginRuntimeLoadOptions } from "./load-context-3i3aDa2k.js";
//#region src/plugins/runtime/metadata-registry-loader.ts
function loadPluginMetadataRegistrySnapshot(options) {
	return loadOpenClawPlugins(buildPluginRuntimeLoadOptions(resolvePluginRuntimeLoadContext(options), {
		throwOnLoadError: true,
		cache: false,
		activate: false,
		mode: "validate",
		loadModules: options?.loadModules,
		...hasExplicitPluginIdScope(options?.onlyPluginIds) ? { onlyPluginIds: options?.onlyPluginIds } : {}
	}));
}
//#endregion
export { loadPluginMetadataRegistrySnapshot as t };
