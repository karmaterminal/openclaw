import { c as normalizeOptionalString, s as normalizeOptionalLowercaseString } from "./string-coerce-CjxCKZ6B.js";
import { t as getActivePluginChannelRegistry } from "./runtime-Cym-fqI8.js";
//#region src/auto-reply/reply/channel-context.ts
function resolveCommandSurfaceChannel(params) {
	return normalizeOptionalLowercaseString(params.ctx.OriginatingChannel ?? params.command.channel ?? params.ctx.Surface ?? params.ctx.Provider) ?? "";
}
function resolveChannelAccountId(params) {
	const accountId = normalizeOptionalString(params.ctx.AccountId) ?? "";
	if (accountId) return accountId;
	const channel = resolveCommandSurfaceChannel(params);
	const plugin = getActivePluginChannelRegistry()?.channels.find((entry) => entry.plugin.id === channel)?.plugin;
	return normalizeOptionalString(plugin?.config.defaultAccountId?.(params.cfg)) || "default";
}
//#endregion
export { resolveCommandSurfaceChannel as n, resolveChannelAccountId as t };
