import { c as normalizeOptionalString } from "./string-coerce-CjxCKZ6B.js";
import { n as getBundledChannelPlugin } from "./bundled-Djgswlqd.js";
import { a as normalizeAnyChannelId } from "./registry-CGsqKAN1.js";
import { n as listLoadedChannelPlugins, t as getLoadedChannelPluginById } from "./registry-loaded-DtXD7Ilc.js";
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
