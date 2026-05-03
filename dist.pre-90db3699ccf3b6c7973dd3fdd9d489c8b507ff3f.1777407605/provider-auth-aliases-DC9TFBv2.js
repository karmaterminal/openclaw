import { s as normalizeOptionalLowercaseString } from "./string-coerce-CjxCKZ6B.js";
import { t as loadPluginManifestRegistry } from "./manifest-registry-_hxKCS2K.js";
import { r as normalizeProviderId } from "./provider-id-ZTkpwCTd.js";
//#region src/plugins/plugin-config-trust.ts
function normalizePluginConfigId(id) {
	return normalizeOptionalLowercaseString(id) ?? "";
}
function hasPluginConfigId(list, pluginId) {
	return Array.isArray(list) && list.some((entry) => normalizePluginConfigId(entry) === pluginId);
}
function findPluginConfigEntry(entries, pluginId) {
	if (!entries || typeof entries !== "object" || Array.isArray(entries)) return;
	for (const [key, value] of Object.entries(entries)) {
		if (normalizePluginConfigId(key) !== pluginId) continue;
		return value && typeof value === "object" && !Array.isArray(value) ? value : {};
	}
}
function isWorkspacePluginAllowedByConfig(params) {
	const pluginsConfig = params.config?.plugins;
	if (pluginsConfig?.enabled === false) return false;
	const pluginId = normalizePluginConfigId(params.plugin.id);
	if (!pluginId || hasPluginConfigId(pluginsConfig?.deny, pluginId)) return false;
	const entry = findPluginConfigEntry(pluginsConfig?.entries, pluginId);
	if (entry?.enabled === false) return false;
	if (entry?.enabled === true || hasPluginConfigId(pluginsConfig?.allow, pluginId)) return true;
	return params.isImplicitlyAllowed?.(pluginId) ?? false;
}
//#endregion
//#region src/agents/provider-auth-aliases.ts
const PROVIDER_AUTH_ALIAS_ORIGIN_PRIORITY = {
	config: 0,
	bundled: 1,
	global: 2,
	workspace: 3
};
function resolveProviderAuthAliasOriginPriority(origin) {
	if (!origin) return Number.MAX_SAFE_INTEGER;
	return PROVIDER_AUTH_ALIAS_ORIGIN_PRIORITY[origin] ?? Number.MAX_SAFE_INTEGER;
}
function isWorkspacePluginTrustedForAuthAliases(plugin, config) {
	return isWorkspacePluginAllowedByConfig({
		config,
		isImplicitlyAllowed: (pluginId) => normalizePluginConfigId(config?.plugins?.slots?.contextEngine) === pluginId,
		plugin
	});
}
function shouldUsePluginAuthAliases(plugin, params) {
	if (plugin.origin !== "workspace" || params?.includeUntrustedWorkspacePlugins === true) return true;
	return isWorkspacePluginTrustedForAuthAliases(plugin, params?.config);
}
function resolveProviderAuthAliasMap(params) {
	const registry = loadPluginManifestRegistry({
		config: params?.config,
		workspaceDir: params?.workspaceDir,
		env: params?.env
	});
	const preferredAliases = /* @__PURE__ */ new Map();
	const aliases = Object.create(null);
	for (const plugin of registry.plugins) {
		if (!shouldUsePluginAuthAliases(plugin, params)) continue;
		for (const [alias, target] of Object.entries(plugin.providerAuthAliases ?? {}).toSorted(([left], [right]) => left.localeCompare(right))) {
			const normalizedAlias = normalizeProviderId(alias);
			const normalizedTarget = normalizeProviderId(target);
			if (normalizedAlias && normalizedTarget) {
				const existing = preferredAliases.get(normalizedAlias);
				if (!existing || resolveProviderAuthAliasOriginPriority(plugin.origin) < resolveProviderAuthAliasOriginPriority(existing.origin)) preferredAliases.set(normalizedAlias, {
					origin: plugin.origin,
					target: normalizedTarget
				});
			}
		}
	}
	for (const [alias, candidate] of preferredAliases) aliases[alias] = candidate.target;
	return aliases;
}
function resolveProviderIdForAuth(provider, params) {
	const normalized = normalizeProviderId(provider);
	if (!normalized) return normalized;
	return resolveProviderAuthAliasMap(params)[normalized] ?? normalized;
}
//#endregion
export { normalizePluginConfigId as i, resolveProviderIdForAuth as n, isWorkspacePluginAllowedByConfig as r, resolveProviderAuthAliasMap as t };
