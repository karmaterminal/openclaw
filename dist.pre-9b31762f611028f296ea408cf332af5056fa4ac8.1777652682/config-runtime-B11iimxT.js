import "./types.secrets-D9j6Z-gp.js";
import "./resolve-configured-secret-input-string-B8BJ929l.js";
import "./io-HGX0xk55.js";
import "./agent-scope-zHoqFGPE.js";
import "./paths-DOSS0HMP.js";
import "./store-BD0Vlvaq.js";
import "./reset-B5boTJ4-.js";
import "./session-key-DWUX-Bck.js";
import "./markdown-tables-DYZeQXpS.js";
import "./logging-C9JM33r1.js";
import "./shared-RkAzCrGm.js";
import "./model-overrides-Pj01nWc5.js";
import "./commands-NBhIEn8_.js";
import "./store-CWMFIAuz.js";
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
