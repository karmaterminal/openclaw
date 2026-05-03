import { a as hasExplicitPluginIdScope } from "./persisted-auth-state-B9J5r59I.js";
import { r as loadOpenClawPlugins } from "./loader-B4BgeLlc.js";
import { i as resolvePluginRuntimeLoadContext, t as buildPluginRuntimeLoadOptions } from "./load-context-BcZRhpPd.js";
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
