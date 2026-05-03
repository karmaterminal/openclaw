import "./types.secrets-BZ6RGKR0.js";
import "./resolve-configured-secret-input-string-DNH-eeyp.js";
import "./io-CBRjt33P.js";
import "./agent-scope-D-T17Rdc.js";
import "./store-COeaE7A7.js";
import "./paths-D6msg0S1.js";
import "./reset-gyijnoip.js";
import "./session-key-BZJPY5Zs.js";
import "./markdown-tables-CHjFDWB3.js";
import "./logging-DmIL52tI.js";
import "./shared-BBGZUNzS.js";
import "./model-overrides-Cz5vfT-o.js";
import "./commands-Cygg511T.js";
import "./store-Btnx_tCF.js";
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
