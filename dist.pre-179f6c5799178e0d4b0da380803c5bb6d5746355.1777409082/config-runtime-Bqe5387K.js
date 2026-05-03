import "./types.secrets-v6szeegc.js";
import "./resolve-configured-secret-input-string-DmJLmmI4.js";
import "./io-CgtDzW1a.js";
import "./agent-scope-Cmx30dd2.js";
import "./store-YSRCrOf6.js";
import "./paths-C9Qq8LIv.js";
import "./reset-BUlbMwCL.js";
import "./session-key-CjFRjPG9.js";
import "./markdown-tables-DWH0HmSM.js";
import "./logging-ApQT1VhX.js";
import "./shared-CdJRJi2c.js";
import "./model-overrides-Do5ln7CT.js";
import "./commands-Dc5buJ2W.js";
import "./store-DObD_x30.js";
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
