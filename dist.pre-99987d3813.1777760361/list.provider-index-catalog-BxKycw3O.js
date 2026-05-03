import { i as normalizeModelCatalogProviderId } from "./normalize-LsFBYX5H.js";
import { l as loadOpenClawProviderIndex, o as planProviderIndexModelCatalogRows } from "./manifest-gzgxnRAf.js";
import { o as normalizePluginsConfig, s as resolveEffectiveEnableState } from "./config-state-Bl1k5f-r.js";
//#region src/commands/models/list.provider-index-catalog.ts
function loadProviderIndexCatalogRowsForList(params) {
	const providerFilter = params.providerFilter ? normalizeModelCatalogProviderId(params.providerFilter) : void 0;
	return planProviderIndexModelCatalogRows({
		index: loadOpenClawProviderIndex(),
		...providerFilter ? { providerFilter } : {}
	}).entries.filter((entry) => resolveEffectiveEnableState({
		id: entry.pluginId,
		origin: "bundled",
		config: normalizePluginsConfig(params.cfg.plugins),
		rootConfig: params.cfg,
		enabledByDefault: true
	}).enabled).flatMap((entry) => entry.rows);
}
//#endregion
export { loadProviderIndexCatalogRowsForList };
