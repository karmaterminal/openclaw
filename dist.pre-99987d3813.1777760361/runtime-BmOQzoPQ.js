import { n as normalizeAccountId } from "./account-id-N6BXsI_x.js";
import { t as resolveAccountEntry } from "./account-lookup-BPl9W5uD.js";
import { t as createPluginRuntimeStore } from "./runtime-store-CY3SIBqj.js";
import "./account-resolution-BT3feYTs.js";
//#region extensions/line/src/group-keys.ts
function resolveLineGroupLookupIds(groupId) {
	const normalized = groupId?.trim();
	if (!normalized) return [];
	if (normalized.startsWith("group:") || normalized.startsWith("room:")) {
		const rawId = normalized.split(":").slice(1).join(":");
		return rawId ? [rawId, normalized] : [normalized];
	}
	return [
		normalized,
		`group:${normalized}`,
		`room:${normalized}`
	];
}
function resolveLineGroupConfigEntry(groups, params) {
	if (!groups) return;
	for (const candidate of resolveLineGroupLookupIds(params.groupId)) {
		const hit = groups[candidate];
		if (hit) return hit;
	}
	for (const candidate of resolveLineGroupLookupIds(params.roomId)) {
		const hit = groups[candidate];
		if (hit) return hit;
	}
	return groups["*"];
}
function resolveLineGroupsConfig(cfg, accountId) {
	const lineConfig = cfg.channels?.line;
	if (!lineConfig) return;
	const normalizedAccountId = normalizeAccountId(accountId);
	return resolveAccountEntry(lineConfig.accounts, normalizedAccountId)?.groups ?? lineConfig.groups;
}
function resolveExactLineGroupConfigKey(params) {
	const groups = resolveLineGroupsConfig(params.cfg, params.accountId);
	if (!groups) return;
	return resolveLineGroupLookupIds(params.groupId).find((candidate) => Object.hasOwn(groups, candidate));
}
//#endregion
//#region extensions/line/src/runtime.ts
const { setRuntime: setLineRuntime, clearRuntime: clearLineRuntime, getRuntime: getLineRuntime } = createPluginRuntimeStore({
	pluginId: "line",
	errorMessage: "LINE runtime not initialized - plugin not registered"
});
//#endregion
export { resolveLineGroupLookupIds as a, resolveLineGroupConfigEntry as i, setLineRuntime as n, resolveLineGroupsConfig as o, resolveExactLineGroupConfigKey as r, getLineRuntime as t };
