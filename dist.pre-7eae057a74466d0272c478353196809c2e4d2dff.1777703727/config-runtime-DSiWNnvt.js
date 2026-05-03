import "./types.secrets-D9j6Z-gp.js";
import "./resolve-configured-secret-input-string-C_06d8hH.js";
import "./io-BAiFlY00.js";
import "./agent-scope-BrwtzVtf.js";
import "./paths-aVTuLlts.js";
import "./store-Cf_mjUkP.js";
import "./reset-HKpb4_uS.js";
import "./session-key-cafqljAh.js";
import "./store-BTeu1CsQ.js";
import "./markdown-tables-B_c7unYC.js";
import "./logging-DemxZNeo.js";
import "./shared-CunA93Iy.js";
import "./model-overrides-Dnfnq7UW.js";
import "./commands-B8z3TRmK.js";
//#region src/plugin-sdk/config-runtime.ts
function requireRuntimeConfig(config, context) {
	if (config) return config;
	throw new Error(`${context} requires a resolved runtime config. Load and resolve config at the command or gateway boundary, then pass cfg through the runtime path.`);
}
function resolvePluginConfigObject(config, pluginId) {
	const plugins = config?.plugins && typeof config.plugins === "object" && !Array.isArray(config.plugins) ? config.plugins : void 0;
	const entry = (plugins?.entries && typeof plugins.entries === "object" && !Array.isArray(plugins.entries) ? plugins.entries : void 0)?.[pluginId];
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
	const pluginConfig = entry.config;
	return pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig) ? pluginConfig : void 0;
}
function resolveLivePluginConfigObject(runtimeConfigLoader, pluginId, startupPluginConfig) {
	if (typeof runtimeConfigLoader !== "function") return startupPluginConfig;
	return resolvePluginConfigObject(runtimeConfigLoader(), pluginId);
}
//#endregion
export { resolveLivePluginConfigObject as n, resolvePluginConfigObject as r, requireRuntimeConfig as t };
