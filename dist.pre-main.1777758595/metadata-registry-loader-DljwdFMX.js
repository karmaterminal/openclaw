import { n as hasExplicitPluginIdScope } from "./plugin-scope-utbpAtQu.js";
import { o as loadOpenClawPlugins } from "./loader-UaaxQ4fP.js";
import { i as resolvePluginRuntimeLoadContext, t as buildPluginRuntimeLoadOptions } from "./load-context-3FXdJZ3d.js";
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
