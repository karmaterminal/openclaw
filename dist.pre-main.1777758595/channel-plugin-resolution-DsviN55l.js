import { s as normalizeOptionalLowercaseString } from "./string-coerce-Bje8XVt9.js";
import { S as resolveDefaultAgentId, x as resolveAgentWorkspaceDir } from "./agent-scope-DfXPuZUf.js";
import { a as normalizeChannelId, t as getChannelPlugin } from "./registry-BD-kXbDr.js";
import "./plugins-BBSdAu-6.js";
import { t as createClackPrompter } from "./clack-prompter-codgJDwL.js";
import { r as listChannelPluginCatalogEntries } from "./catalog-BN8jT5CN.js";
import { n as loadChannelSetupPluginRegistrySnapshotForChannel, t as ensureChannelSetupPluginInstalled } from "./plugin-install-B7zwNk8_.js";
import { r as listTrustedChannelPluginCatalogEntries, t as getTrustedChannelPluginCatalogEntry } from "./trusted-catalog-Dk_n0fPS.js";
//#region src/commands/channel-setup/channel-plugin-resolution.ts
function resolveWorkspaceDir(cfg) {
	return resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
}
function resolveResolvedChannelId(params) {
	const normalized = normalizeChannelId(params.rawChannel);
	if (normalized) return normalized;
	if (!params.catalogEntry) return;
	return normalizeChannelId(params.catalogEntry.id) ?? params.catalogEntry.id;
}
function resolveCatalogChannelEntry(raw, cfg) {
	const trimmed = normalizeOptionalLowercaseString(raw);
	if (!trimmed) return;
	return (cfg ? listTrustedChannelPluginCatalogEntries({
		cfg,
		workspaceDir: resolveWorkspaceDir(cfg)
	}) : listChannelPluginCatalogEntries({ excludeWorkspace: true })).find((entry) => {
		if (normalizeOptionalLowercaseString(entry.id) === trimmed) return true;
		return (entry.meta.aliases ?? []).some((alias) => normalizeOptionalLowercaseString(alias) === trimmed);
	});
}
function findScopedChannelPlugin(snapshot, channelId) {
	return snapshot.channels.find((entry) => entry.plugin.id === channelId)?.plugin ?? snapshot.channelSetups.find((entry) => entry.plugin.id === channelId)?.plugin;
}
function loadScopedChannelPlugin(params) {
	return findScopedChannelPlugin(loadChannelSetupPluginRegistrySnapshotForChannel({
		cfg: params.cfg,
		runtime: params.runtime,
		channel: params.channelId,
		...params.pluginId ? { pluginId: params.pluginId } : {},
		workspaceDir: params.workspaceDir
	}), params.channelId);
}
async function resolveInstallableChannelPlugin(params) {
	const supports = params.supports ?? (() => true);
	let nextCfg = params.cfg;
	const workspaceDir = resolveWorkspaceDir(nextCfg);
	const catalogEntry = (params.rawChannel ? resolveCatalogChannelEntry(params.rawChannel, nextCfg) : void 0) ?? (params.channelId ? getTrustedChannelPluginCatalogEntry(params.channelId, {
		cfg: nextCfg,
		workspaceDir
	}) : void 0);
	const channelId = params.channelId ?? resolveResolvedChannelId({
		rawChannel: params.rawChannel,
		catalogEntry
	});
	if (!channelId) return {
		cfg: nextCfg,
		catalogEntry,
		configChanged: false,
		pluginInstalled: false
	};
	const existing = getChannelPlugin(channelId);
	if (existing && supports(existing)) return {
		cfg: nextCfg,
		channelId,
		plugin: existing,
		catalogEntry,
		configChanged: false,
		pluginInstalled: false
	};
	const resolvedPluginId = catalogEntry?.pluginId;
	if (catalogEntry) {
		const scoped = loadScopedChannelPlugin({
			cfg: nextCfg,
			runtime: params.runtime,
			channelId,
			pluginId: resolvedPluginId,
			workspaceDir
		});
		if (scoped && supports(scoped)) return {
			cfg: nextCfg,
			channelId,
			plugin: scoped,
			catalogEntry,
			configChanged: false,
			pluginInstalled: false
		};
		if (params.allowInstall !== false) {
			const installResult = await ensureChannelSetupPluginInstalled({
				cfg: nextCfg,
				entry: catalogEntry,
				prompter: params.prompter ?? createClackPrompter(),
				runtime: params.runtime,
				workspaceDir
			});
			nextCfg = installResult.cfg;
			const installedPluginId = installResult.pluginId ?? resolvedPluginId;
			const installedPlugin = installResult.installed ? loadScopedChannelPlugin({
				cfg: nextCfg,
				runtime: params.runtime,
				channelId,
				pluginId: installedPluginId,
				workspaceDir: resolveWorkspaceDir(nextCfg)
			}) : void 0;
			return {
				cfg: nextCfg,
				channelId,
				plugin: installedPlugin ?? existing,
				catalogEntry: installedPluginId && catalogEntry.pluginId !== installedPluginId ? {
					...catalogEntry,
					pluginId: installedPluginId
				} : catalogEntry,
				configChanged: nextCfg !== params.cfg,
				pluginInstalled: installResult.installed
			};
		}
	}
	return {
		cfg: nextCfg,
		channelId,
		plugin: existing,
		catalogEntry,
		configChanged: false,
		pluginInstalled: false
	};
}
//#endregion
export { resolveInstallableChannelPlugin as n, resolveCatalogChannelEntry as t };
