import { n as getLoadedChannelPlugin, t as getChannelPlugin } from "./registry-CaUS2Z2d.js";
import { s as isDeliverableMessageChannel, u as normalizeMessageChannel } from "./message-channel-Bk_YHfQg.js";
import "./plugins-BcqWcAy9.js";
import { a as getActivePluginRegistry } from "./runtime-Cym-fqI8.js";
import { t as bootstrapOutboundChannelPlugin } from "./channel-bootstrap.runtime-DhQhNuY6.js";
//#region src/infra/outbound/channel-resolution.ts
function normalizeDeliverableOutboundChannel(raw) {
	const normalized = normalizeMessageChannel(raw);
	if (!normalized || !isDeliverableMessageChannel(normalized)) return;
	return normalized;
}
function maybeBootstrapChannelPlugin(params) {
	bootstrapOutboundChannelPlugin(params);
}
function resolveDirectFromActiveRegistry(channel) {
	const activeRegistry = getActivePluginRegistry();
	if (!activeRegistry) return;
	for (const entry of activeRegistry.channels) {
		const plugin = entry?.plugin;
		if (plugin?.id === channel) return plugin;
	}
}
function resolveOutboundChannelPlugin(params) {
	const normalized = normalizeDeliverableOutboundChannel(params.channel);
	if (!normalized) return;
	const resolveLoaded = () => getLoadedChannelPlugin(normalized);
	const resolve = () => getChannelPlugin(normalized);
	const current = resolveLoaded();
	if (current) return current;
	const directCurrent = resolveDirectFromActiveRegistry(normalized);
	if (directCurrent) return directCurrent;
	maybeBootstrapChannelPlugin({
		channel: normalized,
		cfg: params.cfg
	});
	return resolveLoaded() ?? resolveDirectFromActiveRegistry(normalized) ?? resolve();
}
//#endregion
export { resolveOutboundChannelPlugin as n, normalizeDeliverableOutboundChannel as t };
