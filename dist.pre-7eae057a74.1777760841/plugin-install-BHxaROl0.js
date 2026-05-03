import { t as createSubsystemLogger } from "./subsystem-CWI_MDy_.js";
import { t as clearPluginDiscoveryCache } from "./discovery-Cl_DV0ky.js";
import { b as resolveAgentWorkspaceDir, x as resolveDefaultAgentId } from "./agent-scope-BrwtzVtf.js";
import { t as applyPluginAutoEnable } from "./plugin-auto-enable-D6f8l-OI.js";
import { r as loadOpenClawPlugins } from "./loader-B4BgeLlc.js";
import { t as getActivePluginChannelRegistry } from "./runtime-KwvU2Qvz.js";
import { d as resolveDiscoverableScopedChannelPluginIds } from "./channel-plugin-ids-DWcJCb10.js";
import { t as ensureOnboardingPluginInstalled } from "./onboarding-plugin-install-1yBvCeFJ.js";
import { t as getTrustedChannelPluginCatalogEntry } from "./trusted-catalog-D3MVI8oO.js";
//#region src/plugins/logger.ts
function createPluginLoaderLogger(logger) {
	return {
		info: (msg) => logger.info(msg),
		warn: (msg) => logger.warn(msg),
		error: (msg) => logger.error(msg),
		debug: (msg) => logger.debug?.(msg)
	};
}
//#endregion
//#region src/commands/channel-setup/plugin-install.ts
function toOnboardingPluginInstallEntry(entry) {
	return {
		pluginId: entry.pluginId ?? entry.id,
		label: entry.meta.label,
		install: entry.install
	};
}
async function ensureChannelSetupPluginInstalled(params) {
	const result = await ensureOnboardingPluginInstalled({
		cfg: params.cfg,
		entry: toOnboardingPluginInstallEntry(params.entry),
		prompter: params.prompter,
		runtime: params.runtime,
		workspaceDir: params.workspaceDir
	});
	return {
		cfg: result.cfg,
		installed: result.installed,
		pluginId: result.pluginId,
		status: result.status
	};
}
function reloadChannelSetupPluginRegistry(params) {
	loadChannelSetupPluginRegistry(params);
}
function loadChannelSetupPluginRegistry(params) {
	clearPluginDiscoveryCache();
	const autoEnabled = applyPluginAutoEnable({
		config: params.cfg,
		env: process.env
	});
	const resolvedConfig = autoEnabled.config;
	const workspaceDir = params.workspaceDir ?? resolveAgentWorkspaceDir(resolvedConfig, resolveDefaultAgentId(resolvedConfig));
	const log = createSubsystemLogger("plugins");
	return loadOpenClawPlugins({
		config: resolvedConfig,
		activationSourceConfig: params.cfg,
		autoEnabledReasons: autoEnabled.autoEnabledReasons,
		workspaceDir,
		cache: false,
		logger: createPluginLoaderLogger(log),
		onlyPluginIds: params.onlyPluginIds,
		includeSetupOnlyChannelPlugins: true,
		forceSetupOnlyChannelPlugins: params.forceSetupOnlyChannelPlugins ?? params.installRuntimeDeps === false,
		activate: params.activate,
		installBundledRuntimeDeps: params.installRuntimeDeps !== false
	});
}
function resolveScopedChannelPluginId(params) {
	const explicitPluginId = params.pluginId?.trim();
	if (explicitPluginId) return explicitPluginId;
	return getTrustedChannelPluginCatalogEntry(params.channel, {
		cfg: params.cfg,
		workspaceDir: params.workspaceDir
	})?.pluginId ?? resolveUniqueManifestScopedChannelPluginId(params);
}
function resolveUniqueManifestScopedChannelPluginId(params) {
	const matches = resolveDiscoverableScopedChannelPluginIds({
		config: params.cfg,
		channelIds: [params.channel],
		workspaceDir: params.workspaceDir,
		env: process.env,
		cache: false
	});
	return matches.length === 1 ? matches[0] : void 0;
}
function reloadChannelSetupPluginRegistryForChannel(params) {
	const activeRegistry = getActivePluginChannelRegistry();
	const scopedPluginId = resolveScopedChannelPluginId({
		cfg: params.cfg,
		channel: params.channel,
		pluginId: params.pluginId,
		workspaceDir: params.workspaceDir
	});
	const onlyPluginIds = activeRegistry?.plugins.length || !scopedPluginId ? void 0 : [scopedPluginId];
	loadChannelSetupPluginRegistry({
		...params,
		onlyPluginIds
	});
}
function loadChannelSetupPluginRegistrySnapshotForChannel(params) {
	const scopedPluginId = resolveScopedChannelPluginId({
		cfg: params.cfg,
		channel: params.channel,
		pluginId: params.pluginId,
		workspaceDir: params.workspaceDir
	});
	return loadChannelSetupPluginRegistry({
		...params,
		...scopedPluginId ? { onlyPluginIds: [scopedPluginId] } : {},
		activate: false
	});
}
//#endregion
export { reloadChannelSetupPluginRegistryForChannel as i, loadChannelSetupPluginRegistrySnapshotForChannel as n, reloadChannelSetupPluginRegistry as r, ensureChannelSetupPluginInstalled as t };
