import { c as getCurrentPluginMetadataSnapshotState, g as resolveInstalledPluginIndexPolicyHash, l as setCurrentPluginMetadataSnapshotState, s as clearCurrentPluginMetadataSnapshotState } from "./installed-plugin-index-store-cmmH3Flg.js";
//#region src/plugins/current-plugin-metadata-snapshot.ts
function normalizeLoadPaths(config) {
	const paths = config?.plugins?.load?.paths;
	if (!Array.isArray(paths)) return [];
	return paths.filter((entry) => typeof entry === "string");
}
function resolvePluginMetadataSnapshotConfigFingerprint(config, options = {}) {
	return JSON.stringify({
		policyHash: options.policyHash ?? resolveInstalledPluginIndexPolicyHash(config),
		pluginLoadPaths: normalizeLoadPaths(config)
	});
}
function setCurrentPluginMetadataSnapshot(snapshot, options = {}) {
	setCurrentPluginMetadataSnapshotState(snapshot, snapshot ? resolvePluginMetadataSnapshotConfigFingerprint(options.config, { policyHash: snapshot.policyHash }) : void 0);
}
function clearCurrentPluginMetadataSnapshot() {
	clearCurrentPluginMetadataSnapshotState();
}
function getCurrentPluginMetadataSnapshot(params = {}) {
	const { snapshot: rawSnapshot, configFingerprint } = getCurrentPluginMetadataSnapshotState();
	const snapshot = rawSnapshot;
	if (!snapshot) return;
	if (params.config && snapshot.policyHash !== resolveInstalledPluginIndexPolicyHash(params.config)) return;
	if (params.config && configFingerprint && configFingerprint !== resolvePluginMetadataSnapshotConfigFingerprint(params.config)) return;
	if (snapshot.workspaceDir !== void 0 && params.workspaceDir === void 0) return;
	if (params.workspaceDir !== void 0 && (snapshot.workspaceDir ?? "") !== (params.workspaceDir ?? "")) return;
	return snapshot;
}
//#endregion
export { getCurrentPluginMetadataSnapshot as n, setCurrentPluginMetadataSnapshot as r, clearCurrentPluginMetadataSnapshot as t };
