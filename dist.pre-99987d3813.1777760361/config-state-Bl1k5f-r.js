import { c as normalizeOptionalString, s as normalizeOptionalLowercaseString } from "./string-coerce-Bje8XVt9.js";
import { n as defaultSlotIdForKey } from "./slots-CAvK4-o3.js";
import { i as normalizePluginsConfigWithResolver, r as isBundledChannelEnabledByChannelConfig$1, t as hasExplicitPluginConfig$1 } from "./config-normalization-shared-BPlfcB-I.js";
import { n as listBundledPluginMetadata } from "./bundled-plugin-metadata-BHkK13pu.js";
import { a as toPluginActivationState, i as resolvePluginActivationDecisionShared, n as createPluginEnableStateResolver, r as resolveMemorySlotDecisionShared, t as createEffectiveEnableStateResolver } from "./config-activation-shared-BwJwE1WI.js";
//#region src/plugins/config-state.ts
const BUILT_IN_PLUGIN_ALIAS_FALLBACKS = [
	["openai-codex", "openai"],
	["google-gemini-cli", "google"],
	["minimax-portal", "minimax"],
	["minimax-portal-auth", "minimax"]
];
const BUILT_IN_PLUGIN_ALIAS_LOOKUP = new Map([...BUILT_IN_PLUGIN_ALIAS_FALLBACKS, ...BUILT_IN_PLUGIN_ALIAS_FALLBACKS.map(([, pluginId]) => [pluginId, pluginId])]);
let bundledPluginAliasLookup;
function getBundledPluginAliasLookup() {
	if (bundledPluginAliasLookup) return bundledPluginAliasLookup;
	const lookup = /* @__PURE__ */ new Map();
	for (const plugin of listBundledPluginMetadata({ includeChannelConfigs: false })) {
		const pluginId = normalizeOptionalLowercaseString(plugin.manifest.id);
		if (pluginId) lookup.set(pluginId, plugin.manifest.id);
		for (const providerId of plugin.manifest.providers ?? []) {
			const normalizedProviderId = normalizeOptionalLowercaseString(providerId);
			if (normalizedProviderId) lookup.set(normalizedProviderId, plugin.manifest.id);
		}
		for (const legacyPluginId of plugin.manifest.legacyPluginIds ?? []) {
			const normalizedLegacyPluginId = normalizeOptionalLowercaseString(legacyPluginId);
			if (normalizedLegacyPluginId) lookup.set(normalizedLegacyPluginId, plugin.manifest.id);
		}
	}
	for (const [alias, pluginId] of BUILT_IN_PLUGIN_ALIAS_FALLBACKS) lookup.set(alias, pluginId);
	bundledPluginAliasLookup = lookup;
	return bundledPluginAliasLookup;
}
function normalizePluginIdWithLookup(id, getAliasLookup) {
	const trimmed = normalizeOptionalString(id) ?? "";
	const normalized = normalizeOptionalLowercaseString(trimmed) ?? "";
	const builtInAlias = BUILT_IN_PLUGIN_ALIAS_LOOKUP.get(normalized);
	if (builtInAlias) return builtInAlias;
	return getAliasLookup().get(normalized) ?? trimmed;
}
function createScopedPluginIdNormalizer() {
	let lookup;
	return (id) => normalizePluginIdWithLookup(id, () => {
		lookup ??= getBundledPluginAliasLookup();
		return lookup;
	});
}
function normalizePluginId(id) {
	return normalizePluginIdWithLookup(id, getBundledPluginAliasLookup);
}
const normalizePluginsConfig = (config) => {
	return normalizePluginsConfigWithResolver(config, createScopedPluginIdNormalizer());
};
function createPluginActivationSource(params) {
	return {
		plugins: params.plugins ?? normalizePluginsConfig(params.config?.plugins),
		rootConfig: params.config
	};
}
const hasExplicitMemorySlot = (plugins) => Boolean(plugins?.slots && Object.prototype.hasOwnProperty.call(plugins.slots, "memory"));
const hasExplicitMemoryEntry = (plugins) => Boolean(plugins?.entries && Object.prototype.hasOwnProperty.call(plugins.entries, defaultSlotIdForKey("memory")));
const hasExplicitPluginConfig = (plugins) => hasExplicitPluginConfig$1(plugins);
function applyTestPluginDefaults(cfg, env = process.env) {
	if (!env.VITEST) return cfg;
	const plugins = cfg.plugins;
	if (hasExplicitPluginConfig(plugins)) {
		if (hasExplicitMemorySlot(plugins) || hasExplicitMemoryEntry(plugins)) return cfg;
		return {
			...cfg,
			plugins: {
				...plugins,
				slots: {
					...plugins?.slots,
					memory: "none"
				}
			}
		};
	}
	return {
		...cfg,
		plugins: {
			...plugins,
			enabled: false,
			slots: {
				...plugins?.slots,
				memory: "none"
			}
		}
	};
}
function isTestDefaultMemorySlotDisabled(cfg, env = process.env) {
	if (!env.VITEST) return false;
	const plugins = cfg.plugins;
	if (hasExplicitMemorySlot(plugins) || hasExplicitMemoryEntry(plugins)) return false;
	return true;
}
function resolvePluginActivationState(params) {
	return toPluginActivationState(resolvePluginActivationDecisionShared({
		...params,
		activationSource: params.activationSource ?? createPluginActivationSource({
			config: params.rootConfig,
			plugins: params.config
		}),
		allowBundledChannelExplicitBypassesAllowlist: true,
		isBundledChannelEnabledByChannelConfig
	}));
}
const resolveEnableState = createPluginEnableStateResolver(resolvePluginActivationState);
const isBundledChannelEnabledByChannelConfig = isBundledChannelEnabledByChannelConfig$1;
const resolveEffectiveEnableState = createEffectiveEnableStateResolver(resolveEffectivePluginActivationState);
function resolveEffectivePluginActivationState(params) {
	return resolvePluginActivationState(params);
}
function resolveMemorySlotDecision(params) {
	return resolveMemorySlotDecisionShared(params);
}
//#endregion
export { normalizePluginId as a, resolveEffectivePluginActivationState as c, isTestDefaultMemorySlotDisabled as i, resolveEnableState as l, createPluginActivationSource as n, normalizePluginsConfig as o, hasExplicitPluginConfig as r, resolveEffectiveEnableState as s, applyTestPluginDefaults as t, resolveMemorySlotDecision as u };
