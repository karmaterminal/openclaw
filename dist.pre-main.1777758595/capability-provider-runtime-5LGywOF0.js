import { n as loadPluginManifestRegistryForPluginRegistry } from "./plugin-registry-x83fIWqx.js";
import { n as withBundledPluginEnablementCompat, r as withBundledPluginVitestCompat, t as withBundledPluginAllowlistCompat } from "./bundled-compat-BHRkfZny.js";
import { l as resolveRuntimePluginRegistry } from "./loader-UaaxQ4fP.js";
//#region src/plugins/capability-provider-runtime.ts
const CAPABILITY_CONTRACT_KEY = {
	memoryEmbeddingProviders: "memoryEmbeddingProviders",
	speechProviders: "speechProviders",
	realtimeTranscriptionProviders: "realtimeTranscriptionProviders",
	realtimeVoiceProviders: "realtimeVoiceProviders",
	mediaUnderstandingProviders: "mediaUnderstandingProviders",
	imageGenerationProviders: "imageGenerationProviders",
	videoGenerationProviders: "videoGenerationProviders",
	musicGenerationProviders: "musicGenerationProviders"
};
function resolveBundledCapabilityCompatPluginIds(params) {
	const env = process.env;
	const contractKey = CAPABILITY_CONTRACT_KEY[params.key];
	return loadPluginManifestRegistryForPluginRegistry({
		config: params.cfg,
		env,
		includeDisabled: true
	}).plugins.filter((plugin) => plugin.origin === "bundled" && (plugin.contracts?.[contractKey]?.length ?? 0) > 0 && (!params.providerId || (plugin.contracts?.[contractKey] ?? []).includes(params.providerId))).map((plugin) => plugin.id).toSorted((left, right) => left.localeCompare(right));
}
function resolveCapabilityProviderConfig(params) {
	const pluginIds = params.pluginIds ?? resolveBundledCapabilityCompatPluginIds(params);
	return withBundledPluginVitestCompat({
		config: withBundledPluginEnablementCompat({
			config: withBundledPluginAllowlistCompat({
				config: params.cfg,
				pluginIds
			}),
			pluginIds
		}),
		pluginIds,
		env: process.env
	});
}
function createCapabilityProviderFallbackLoadOptions(params) {
	const loadOptions = {
		...params.compatConfig === void 0 ? {} : { config: params.compatConfig },
		onlyPluginIds: params.pluginIds,
		activate: false
	};
	if (params.installBundledRuntimeDeps === false) loadOptions.installBundledRuntimeDeps = false;
	return loadOptions;
}
function arePluginsGloballyDisabled(cfg) {
	return cfg?.plugins?.enabled === false;
}
function findProviderById(entries, providerId) {
	const providerEntries = entries;
	for (const entry of providerEntries) if (entry.provider.id === providerId) return entry.provider;
}
function mergeCapabilityProviders(left, right) {
	const merged = /* @__PURE__ */ new Map();
	const unnamed = [];
	const addEntries = (entries) => {
		for (const entry of entries) {
			const provider = entry.provider;
			if (!provider.id) {
				unnamed.push(provider);
				continue;
			}
			if (!merged.has(provider.id)) merged.set(provider.id, provider);
		}
	};
	addEntries(left);
	addEntries(right);
	return [...merged.values(), ...unnamed];
}
function addObjectKeys(target, value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return;
	for (const key of Object.keys(value)) {
		const normalized = key.trim().toLowerCase();
		if (normalized) target.add(normalized);
	}
}
function addStringValue(target, value) {
	if (typeof value !== "string") return;
	const normalized = value.trim().toLowerCase();
	if (normalized) target.add(normalized);
}
function collectRequestedSpeechProviderIds(cfg) {
	const requested = /* @__PURE__ */ new Set();
	const tts = typeof cfg?.messages?.tts === "object" && cfg.messages.tts !== null ? cfg.messages.tts : void 0;
	addStringValue(requested, tts?.provider);
	addObjectKeys(requested, tts?.providers);
	addObjectKeys(requested, cfg?.models?.providers);
	return requested;
}
function removeActiveProviderIds(requested, entries) {
	for (const entry of entries) {
		const provider = entry.provider;
		if (typeof provider.id === "string") requested.delete(provider.id.toLowerCase());
		if (Array.isArray(provider.aliases)) {
			for (const alias of provider.aliases) if (typeof alias === "string") requested.delete(alias.toLowerCase());
		}
	}
}
function filterLoadedProvidersForRequestedConfig(params) {
	if (params.key !== "speechProviders") return [];
	if (params.requested.size === 0) return [];
	return params.entries.filter((entry) => {
		const provider = entry.provider;
		if (typeof provider.id === "string" && params.requested.has(provider.id.toLowerCase())) return true;
		if (Array.isArray(provider.aliases)) return provider.aliases.some((alias) => typeof alias === "string" && params.requested.has(alias.toLowerCase()));
		return false;
	});
}
function resolvePluginCapabilityProvider(params) {
	if (arePluginsGloballyDisabled(params.cfg)) return;
	const activeProvider = findProviderById(resolveRuntimePluginRegistry()?.[params.key] ?? [], params.providerId);
	if (activeProvider) return activeProvider;
	const pluginIds = resolveBundledCapabilityCompatPluginIds({
		key: params.key,
		cfg: params.cfg,
		providerId: params.providerId
	});
	if (pluginIds.length === 0) return;
	return findProviderById(resolveRuntimePluginRegistry(createCapabilityProviderFallbackLoadOptions({
		compatConfig: resolveCapabilityProviderConfig({
			key: params.key,
			cfg: params.cfg,
			pluginIds
		}),
		pluginIds,
		installBundledRuntimeDeps: params.installBundledRuntimeDeps
	}))?.[params.key] ?? [], params.providerId);
}
function resolvePluginCapabilityProviders(params) {
	if (arePluginsGloballyDisabled(params.cfg)) return [];
	const activeProviders = resolveRuntimePluginRegistry()?.[params.key] ?? [];
	if (activeProviders.length > 0 && params.key !== "memoryEmbeddingProviders" && params.key !== "speechProviders") return activeProviders.map((entry) => entry.provider);
	if (activeProviders.length > 0 && params.key === "speechProviders" && !params.cfg) return activeProviders.map((entry) => entry.provider);
	const missingRequestedSpeechProviders = activeProviders.length > 0 && params.key === "speechProviders" ? collectRequestedSpeechProviderIds(params.cfg) : void 0;
	if (missingRequestedSpeechProviders) {
		removeActiveProviderIds(missingRequestedSpeechProviders, activeProviders);
		if (missingRequestedSpeechProviders.size === 0) return activeProviders.map((entry) => entry.provider);
	}
	const pluginIds = resolveBundledCapabilityCompatPluginIds({
		key: params.key,
		cfg: params.cfg
	});
	const loadedProviders = resolveRuntimePluginRegistry(createCapabilityProviderFallbackLoadOptions({
		compatConfig: resolveCapabilityProviderConfig({
			key: params.key,
			cfg: params.cfg,
			pluginIds
		}),
		pluginIds,
		installBundledRuntimeDeps: params.installBundledRuntimeDeps
	}))?.[params.key] ?? [];
	if (params.key !== "memoryEmbeddingProviders") return mergeCapabilityProviders(activeProviders, activeProviders.length > 0 ? filterLoadedProvidersForRequestedConfig({
		key: params.key,
		requested: missingRequestedSpeechProviders ?? /* @__PURE__ */ new Set(),
		entries: loadedProviders
	}) : loadedProviders);
	return mergeCapabilityProviders(activeProviders, loadedProviders);
}
//#endregion
export { resolvePluginCapabilityProviders as n, resolvePluginCapabilityProvider as t };
