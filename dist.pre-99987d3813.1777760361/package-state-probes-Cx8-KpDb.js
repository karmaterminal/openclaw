import { c as normalizeOptionalString } from "./string-coerce-Bje8XVt9.js";
import { i as formatErrorMessage } from "./errors-RZvg4nzL.js";
import { n as isJavaScriptModulePath } from "./jiti-loader-cache-CWT-ihI3.js";
import { t as createSubsystemLogger } from "./subsystem-W9_E260X.js";
import { t as listChannelCatalogEntries } from "./channel-catalog-registry-DoMW7W47.js";
import { m as resolveExistingPluginModulePath, p as loadChannelPluginModule } from "./bundled-CDosciCV.js";
//#region src/channels/plugins/package-state-probes.ts
const log = createSubsystemLogger("channels");
function resolveChannelPackageStateMetadata(entry, metadataKey) {
	const metadata = entry.channel[metadataKey];
	if (!metadata || typeof metadata !== "object") return null;
	const specifier = normalizeOptionalString(metadata.specifier) ?? "";
	const exportName = normalizeOptionalString(metadata.exportName) ?? "";
	if (!specifier || !exportName) return null;
	return {
		specifier,
		exportName
	};
}
function listChannelPackageStateCatalog(metadataKey) {
	return listChannelCatalogEntries({ origin: "bundled" }).filter((entry) => Boolean(resolveChannelPackageStateMetadata(entry, metadataKey)));
}
function resolveChannelPackageStateChecker(params) {
	const metadata = resolveChannelPackageStateMetadata(params.entry, params.metadataKey);
	if (!metadata) return null;
	try {
		const checker = loadChannelPluginModule({
			modulePath: resolveExistingPluginModulePath(params.entry.rootDir, metadata.specifier),
			rootDir: params.entry.rootDir,
			shouldTryNativeRequire: isJavaScriptModulePath
		})[metadata.exportName];
		if (typeof checker !== "function") throw new Error(`missing ${params.metadataKey} export ${metadata.exportName}`);
		return checker;
	} catch (error) {
		const detail = formatErrorMessage(error);
		log.warn(`[channels] failed to load ${params.metadataKey} checker for ${params.entry.pluginId}: ${detail}`);
		return null;
	}
}
function listBundledChannelIdsForPackageState(metadataKey) {
	return listChannelPackageStateCatalog(metadataKey).map((entry) => entry.pluginId);
}
function hasBundledChannelPackageState(params) {
	const entry = listChannelPackageStateCatalog(params.metadataKey).find((candidate) => candidate.pluginId === params.channelId);
	if (!entry) return false;
	const checker = resolveChannelPackageStateChecker({
		entry,
		metadataKey: params.metadataKey
	});
	return checker ? checker({
		cfg: params.cfg,
		env: params.env
	}) : false;
}
//#endregion
export { listBundledChannelIdsForPackageState as n, hasBundledChannelPackageState as t };
