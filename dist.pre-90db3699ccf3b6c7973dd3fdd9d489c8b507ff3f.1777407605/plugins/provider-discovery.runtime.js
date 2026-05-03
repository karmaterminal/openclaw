import { t as getCachedPluginJitiLoader } from "../jiti-loader-cache-Bat69wam.js";
import { t as loadPluginManifestRegistry } from "../manifest-registry-_hxKCS2K.js";
import { u as resolveDiscoveredProviderPluginIds } from "../plugin-auto-enable-DdH3n9V8.js";
import { i as withProfile } from "../plugin-load-profile-kP6V6eFL.js";
import { n as resolvePluginProviders } from "../providers.runtime-CeArq6YC.js";
//#region src/plugins/source-loader.ts
function createPluginSourceLoader() {
	const loaders = /* @__PURE__ */ new Map();
	return (modulePath) => {
		const jiti = getCachedPluginJitiLoader({
			cache: loaders,
			modulePath,
			importerUrl: import.meta.url,
			jitiFilename: import.meta.url
		});
		return withProfile({
			pluginId: "(direct)",
			source: modulePath
		}, "source-loader", () => jiti(modulePath));
	};
}
//#endregion
//#region src/plugins/provider-discovery.runtime.ts
function normalizeDiscoveryModule(value) {
	const resolved = value && typeof value === "object" && "default" in value && value.default !== void 0 ? value.default : value;
	if (Array.isArray(resolved)) return resolved;
	if (resolved && typeof resolved === "object" && "id" in resolved) return [resolved];
	if (value && typeof value === "object" && !Array.isArray(value)) {
		const record = value;
		if (Array.isArray(record.providers)) return record.providers;
		if (record.provider) return [record.provider];
	}
	return [];
}
function resolveProviderDiscoveryEntryPlugins(params) {
	const pluginIds = resolveDiscoveredProviderPluginIds(params);
	const pluginIdSet = new Set(pluginIds);
	const records = loadPluginManifestRegistry(params).plugins.filter((plugin) => plugin.providerDiscoverySource && pluginIdSet.has(plugin.id));
	if (records.length === 0) return [];
	if (params.requireCompleteDiscoveryEntryCoverage && records.length < pluginIdSet.size) return [];
	const loadSource = createPluginSourceLoader();
	const providers = [];
	for (const manifest of records) try {
		const moduleExport = loadSource(manifest.providerDiscoverySource);
		providers.push(...normalizeDiscoveryModule(moduleExport).map((provider) => Object.assign({}, provider, { pluginId: manifest.id })));
	} catch {
		return [];
	}
	return providers;
}
function resolvePluginDiscoveryProvidersRuntime(params) {
	const entryProviders = resolveProviderDiscoveryEntryPlugins(params);
	if (entryProviders.length > 0) return entryProviders;
	return resolvePluginProviders({
		...params,
		bundledProviderAllowlistCompat: true
	});
}
//#endregion
export { resolvePluginDiscoveryProvidersRuntime };
