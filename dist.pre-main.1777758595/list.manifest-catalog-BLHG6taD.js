import { i as normalizeModelCatalogProviderId } from "./normalize-LsFBYX5H.js";
import { s as planManifestModelCatalogRows } from "./manifest-gzgxnRAf.js";
import { t as loadPluginManifestRegistryForInstalledIndex } from "./manifest-registry-installed-DGOaHw15.js";
import { _ as loadPluginRegistrySnapshot, h as isPluginEnabled, l as resolvePluginContributionOwners, p as getPluginRecord } from "./plugin-registry-x83fIWqx.js";
//#region src/commands/models/list.manifest-catalog.ts
function loadManifestCatalogRowsForPluginIds(params) {
	if (params.pluginIds && params.pluginIds.length === 0) return [];
	const plan = planManifestModelCatalogRows({
		registry: loadPluginManifestRegistryForInstalledIndex({
			index: params.index,
			config: params.cfg,
			env: params.env,
			pluginIds: params.pluginIds
		}),
		...params.providerFilter ? { providerFilter: params.providerFilter } : {}
	});
	const eligibleProviders = new Set(plan.entries.filter((entry) => params.mode === "static-authoritative" ? entry.discovery === "static" : entry.discovery !== "runtime").map((entry) => entry.provider));
	if (eligibleProviders.size === 0) return [];
	return plan.rows.filter((row) => eligibleProviders.has(row.provider));
}
function resolveConventionModelCatalogPluginIds(params) {
	const record = getPluginRecord({
		index: params.index,
		pluginId: params.providerFilter
	});
	if (!record || !isPluginEnabled({
		index: params.index,
		pluginId: record.pluginId,
		config: params.cfg
	})) return [];
	return [record.pluginId];
}
function resolveDeclaredModelCatalogPluginIds(params) {
	return resolvePluginContributionOwners({
		index: params.index,
		config: params.cfg,
		contribution: "modelCatalogProviders",
		matches: params.providerFilter
	});
}
function loadManifestCatalogRowsForList(params) {
	const providerFilter = params.providerFilter ? normalizeModelCatalogProviderId(params.providerFilter) : void 0;
	const mode = params.mode ?? "static-authoritative";
	const index = loadPluginRegistrySnapshot({
		config: params.cfg,
		env: params.env
	});
	if (!providerFilter) return loadManifestCatalogRowsForPluginIds({
		cfg: params.cfg,
		env: params.env,
		index,
		mode
	});
	const conventionRows = loadManifestCatalogRowsForPluginIds({
		cfg: params.cfg,
		env: params.env,
		index,
		mode,
		pluginIds: resolveConventionModelCatalogPluginIds({
			cfg: params.cfg,
			index,
			providerFilter
		}),
		providerFilter
	});
	if (conventionRows.length > 0) return conventionRows;
	return loadManifestCatalogRowsForPluginIds({
		cfg: params.cfg,
		env: params.env,
		index,
		mode,
		pluginIds: resolveDeclaredModelCatalogPluginIds({
			cfg: params.cfg,
			index,
			providerFilter
		}),
		providerFilter
	});
}
function loadStaticManifestCatalogRowsForList(params) {
	return loadManifestCatalogRowsForList({
		...params,
		mode: "static-authoritative"
	});
}
function loadSupplementalManifestCatalogRowsForList(params) {
	return loadManifestCatalogRowsForList({
		...params,
		mode: "supplemental"
	});
}
//#endregion
export { loadStaticManifestCatalogRowsForList as n, loadSupplementalManifestCatalogRowsForList as r, loadManifestCatalogRowsForList as t };
