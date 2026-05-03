import { c as normalizeOptionalString } from "./string-coerce-C1IzJjqi.js";
import { n as getBundledChannelPlugin } from "./bundled-DHzeyK6_.js";
import { a as normalizeAnyChannelId } from "./registry-CW3lfH7N.js";
import { n as listLoadedChannelPlugins, t as getLoadedChannelPluginById } from "./registry-loaded-Dgf_rPt-.js";
//#region src/channels/plugins/registry.ts
function listChannelPlugins() {
	return listLoadedChannelPlugins();
}
function getLoadedChannelPlugin(id) {
	const resolvedId = normalizeOptionalString(id) ?? "";
	if (!resolvedId) return;
	return getLoadedChannelPluginById(resolvedId);
}
function getChannelPlugin(id) {
	const resolvedId = normalizeOptionalString(id) ?? "";
	if (!resolvedId) return;
	return getLoadedChannelPlugin(resolvedId) ?? getBundledChannelPlugin(resolvedId);
}
function normalizeChannelId(raw) {
	return normalizeAnyChannelId(raw);
}
//#endregion
export { normalizeChannelId as i, getLoadedChannelPlugin as n, listChannelPlugins as r, getChannelPlugin as t };
