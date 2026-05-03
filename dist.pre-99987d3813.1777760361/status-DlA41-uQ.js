import { s as normalizeOptionalLowercaseString } from "./string-coerce-Bje8XVt9.js";
import { o as resolveCompatibilityHostVersion } from "./version-BidqAEUl.js";
import { n as resolveBundledPluginsDir } from "./bundled-dir-Dn1Nq3AQ.js";
import { r as hasKind } from "./slots-CAvK4-o3.js";
import { t as tracePluginLifecyclePhase } from "./plugin-lifecycle-trace-8GvEu_3k.js";
import { i as loadPluginManifest } from "./manifest-gzgxnRAf.js";
import { o as normalizePluginsConfig } from "./config-state-Bl1k5f-r.js";
import { t as loadPluginManifestRegistryForInstalledIndex } from "./manifest-registry-installed-DGOaHw15.js";
import { v as loadPluginRegistrySnapshotWithMetadata } from "./plugin-registry-x83fIWqx.js";
import { n as resolveDefaultAgentWorkspaceDir } from "./workspace-default-Dshtffqb.js";
import { i as passesManifestOwnerBasePolicy } from "./manifest-owner-policy-tKd5748G.js";
import { i as getRuntimeConfig } from "./io-DTtpq82f.js";
import { n as withBundledPluginEnablementCompat, t as withBundledPluginAllowlistCompat } from "./bundled-compat-BHRkfZny.js";
import { t as normalizeOpenClawVersionBase } from "./version-BbxzGxHr.js";
import "./config-DbmohW6s.js";
import { n as resolveBundledProviderCompatPluginIds } from "./providers-CwWI2Ypp.js";
import { i as listPotentialConfiguredChannelIds, r as listExplicitlyDisabledChannelIdsForConfig } from "./config-presence-DP7bplaC.js";
import { t as applyPluginAutoEnable } from "./plugin-auto-enable-CrRnVsLK.js";
import { o as loadOpenClawPlugins } from "./loader-UaaxQ4fP.js";
import { n as inspectBundleMcpRuntimeSupport } from "./bundle-mcp-BXGGempB.js";
import { S as createEmptyPluginRegistry, u as listImportedRuntimePluginIds } from "./runtime-B-5HHEpR.js";
import { n as listImportedBundledPluginFacadeIds } from "./facade-loader-BG_nByyl.js";
import "./facade-runtime-B-vF0TMQ.js";
import { i as resolvePluginRuntimeLoadContext, t as buildPluginRuntimeLoadOptions } from "./load-context-3FXdJZ3d.js";
import "./workspace-DSIvVEKH.js";
import { t as inspectBundleLspRuntimeSupport } from "./bundle-lsp-Q3_9fjtd.js";
import { a as resolveGatewayStartupPluginIds, d as listExplicitConfiguredChannelIdsForConfig, f as resolveConfiguredChannelPluginIds } from "./channel-plugin-ids-B15YKct5.js";
import { t as loadPluginMetadataRegistrySnapshot } from "./metadata-registry-loader-DljwdFMX.js";
import fs from "node:fs";
import path from "node:path";
//#region src/plugins/effective-plugin-ids.ts
function collectConfiguredChannelIds(config, activationSourceConfig, env) {
	const disabled = new Set([...listExplicitlyDisabledChannelIdsForConfig(config), ...listExplicitlyDisabledChannelIdsForConfig(activationSourceConfig)]);
	return [...new Set([...listPotentialConfiguredChannelIds(config, env, { includePersistedAuthState: false }), ...listExplicitConfiguredChannelIdsForConfig(activationSourceConfig)])].map((channelId) => normalizeOptionalLowercaseString(channelId)).filter((channelId) => {
		if (!channelId) return false;
		return !disabled.has(channelId);
	}).toSorted((left, right) => left.localeCompare(right));
}
function collectBundledChannelOwnerPluginIds(params) {
	const plugins = normalizePluginsConfig(params.config.plugins);
	const channelIds = new Set(params.channelIds.map((channelId) => normalizeOptionalLowercaseString(channelId)).filter((channelId) => Boolean(channelId)));
	if (channelIds.size === 0) return [];
	const bundledDir = params.bundledPluginsDir ?? resolveBundledPluginsDir(params.env);
	if (!bundledDir) return [];
	let entries;
	try {
		entries = fs.readdirSync(bundledDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const pluginIds = /* @__PURE__ */ new Set();
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const manifest = loadPluginManifest(path.join(bundledDir, entry.name), false);
		if (!manifest.ok) continue;
		if ((manifest.manifest.channels ?? []).some((channelId) => channelIds.has(normalizeOptionalLowercaseString(channelId) ?? ""))) {
			const pluginId = normalizeOptionalLowercaseString(manifest.manifest.id);
			if (pluginId && passesManifestOwnerBasePolicy({
				plugin: { id: pluginId },
				normalizedConfig: plugins,
				allowRestrictiveAllowlistBypass: true
			})) pluginIds.add(pluginId);
		}
	}
	return [...pluginIds].toSorted((left, right) => left.localeCompare(right));
}
function collectExplicitEffectivePluginIds(config) {
	const plugins = normalizePluginsConfig(config.plugins);
	if (!plugins.enabled) return [];
	const ids = new Set(plugins.allow);
	for (const [pluginId, entry] of Object.entries(plugins.entries)) if (entry?.enabled === true && (plugins.allow.length === 0 || plugins.allow.includes(pluginId))) ids.add(pluginId);
	for (const pluginId of plugins.deny) ids.delete(pluginId);
	for (const [pluginId, entry] of Object.entries(plugins.entries)) if (entry?.enabled === false) ids.delete(pluginId);
	return [...ids].toSorted((left, right) => left.localeCompare(right));
}
function resolveEffectivePluginIds(params) {
	const effectiveConfig = applyPluginAutoEnable({
		config: params.config,
		env: params.env
	}).config;
	const ids = new Set(collectExplicitEffectivePluginIds(effectiveConfig));
	const configuredChannelIds = collectConfiguredChannelIds(effectiveConfig, params.config, params.env);
	for (const pluginId of resolveConfiguredChannelPluginIds({
		config: effectiveConfig,
		activationSourceConfig: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	})) ids.add(pluginId);
	for (const pluginId of collectBundledChannelOwnerPluginIds({
		config: effectiveConfig,
		channelIds: configuredChannelIds,
		env: params.env,
		...params.bundledPluginsDir ? { bundledPluginsDir: params.bundledPluginsDir } : {}
	})) ids.add(pluginId);
	for (const pluginId of resolveGatewayStartupPluginIds({
		config: effectiveConfig,
		activationSourceConfig: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env
	})) ids.add(pluginId);
	return [...ids].toSorted((left, right) => left.localeCompare(right));
}
//#endregion
//#region src/plugins/inspect-shape.ts
function buildPluginCapabilityEntries(plugin) {
	return [
		{
			kind: "cli-backend",
			ids: plugin.cliBackendIds ?? []
		},
		{
			kind: "text-inference",
			ids: plugin.providerIds
		},
		{
			kind: "speech",
			ids: plugin.speechProviderIds
		},
		{
			kind: "realtime-transcription",
			ids: plugin.realtimeTranscriptionProviderIds
		},
		{
			kind: "realtime-voice",
			ids: plugin.realtimeVoiceProviderIds
		},
		{
			kind: "media-understanding",
			ids: plugin.mediaUnderstandingProviderIds
		},
		{
			kind: "image-generation",
			ids: plugin.imageGenerationProviderIds
		},
		{
			kind: "web-search",
			ids: plugin.webSearchProviderIds
		},
		{
			kind: "agent-harness",
			ids: plugin.agentHarnessIds
		},
		{
			kind: "context-engine",
			ids: plugin.status === "loaded" && hasKind(plugin.kind, "context-engine") ? plugin.contextEngineIds ?? [] : []
		},
		{
			kind: "channel",
			ids: plugin.channelIds
		}
	].filter((entry) => entry.ids.length > 0);
}
function derivePluginInspectShape(params) {
	if (params.capabilityCount > 1) return "hybrid-capability";
	if (params.capabilityCount === 1) return "plain-capability";
	if (params.typedHookCount + params.customHookCount > 0 && params.toolCount === 0 && params.commandCount === 0 && params.cliCount === 0 && params.serviceCount === 0 && params.gatewayDiscoveryServiceCount === 0 && params.gatewayMethodCount === 0 && params.httpRouteCount === 0) return "hook-only";
	return "non-capability";
}
function buildPluginShapeSummary(params) {
	const capabilities = buildPluginCapabilityEntries(params.plugin);
	const typedHookCount = params.report.typedHooks.filter((entry) => entry.pluginId === params.plugin.id).length;
	const customHookCount = params.report.hooks.filter((entry) => entry.pluginId === params.plugin.id).length;
	const toolCount = params.report.tools.filter((entry) => entry.pluginId === params.plugin.id).length;
	const capabilityCount = capabilities.length;
	return {
		shape: derivePluginInspectShape({
			capabilityCount,
			typedHookCount,
			customHookCount,
			toolCount,
			commandCount: params.plugin.commands.length,
			cliCount: params.plugin.cliCommands.length,
			serviceCount: params.plugin.services.length,
			gatewayDiscoveryServiceCount: params.plugin.gatewayDiscoveryServiceIds.length,
			gatewayMethodCount: params.plugin.gatewayMethods.length,
			httpRouteCount: params.plugin.httpRoutes
		}),
		capabilityMode: capabilityCount === 0 ? "none" : capabilityCount === 1 ? "plain" : "hybrid",
		capabilityCount,
		capabilities,
		usesLegacyBeforeAgentStart: params.report.typedHooks.some((entry) => entry.pluginId === params.plugin.id && entry.hookName === "before_agent_start")
	};
}
//#endregion
//#region src/plugins/status.ts
function buildCompatibilityNoticesForInspect(inspect) {
	const warnings = [];
	if (inspect.usesLegacyBeforeAgentStart) warnings.push({
		pluginId: inspect.plugin.id,
		code: "legacy-before-agent-start",
		compatCode: "legacy-before-agent-start",
		severity: "warn",
		message: "still uses legacy before_agent_start; keep regression coverage on this plugin, and prefer before_model_resolve/before_prompt_build for new work."
	});
	if (inspect.plugin.compat?.includes("legacy-implicit-startup-sidecar")) warnings.push({
		pluginId: inspect.plugin.id,
		code: "legacy-implicit-startup-sidecar",
		compatCode: "legacy-implicit-startup-sidecar",
		severity: "warn",
		message: "relies on deprecated implicit startup loading; add activation.onStartup: true for startup work or activation.onStartup: false for startup-lazy plugins."
	});
	if (inspect.shape === "hook-only") warnings.push({
		pluginId: inspect.plugin.id,
		code: "hook-only",
		compatCode: "hook-only-plugin-shape",
		severity: "info",
		message: "is hook-only. This remains a supported compatibility path, but it has not migrated to explicit capability registration yet."
	});
	return warnings;
}
function resolveReportedPluginVersion(plugin, env) {
	if (plugin.origin !== "bundled") return plugin.version;
	return normalizeOpenClawVersionBase(resolveCompatibilityHostVersion(env)) ?? normalizeOpenClawVersionBase(plugin.version) ?? plugin.version;
}
function buildPluginRecordFromInstalledIndex(plugin, manifest) {
	const format = plugin.format ?? manifest?.format ?? "openclaw";
	const bundleFormat = plugin.bundleFormat ?? manifest?.bundleFormat;
	return {
		id: plugin.pluginId,
		name: manifest?.name ?? plugin.packageName ?? plugin.pluginId,
		...plugin.packageVersion || manifest?.version ? { version: plugin.packageVersion ?? manifest?.version } : {},
		...manifest?.description ? { description: manifest.description } : {},
		format,
		...bundleFormat ? { bundleFormat } : {},
		...manifest?.kind ? { kind: manifest.kind } : {},
		source: plugin.source ?? plugin.manifestPath,
		rootDir: plugin.rootDir,
		origin: plugin.origin,
		enabled: plugin.enabled,
		compat: plugin.compat,
		syntheticAuthRefs: [...plugin.syntheticAuthRefs ?? manifest?.syntheticAuthRefs ?? []],
		status: plugin.enabled ? "loaded" : "disabled",
		toolNames: [],
		hookNames: [],
		channelIds: [...manifest?.channels ?? []],
		cliBackendIds: [...manifest?.cliBackends ?? [], ...manifest?.setup?.cliBackends ?? []],
		providerIds: [...manifest?.providers ?? []],
		speechProviderIds: [],
		realtimeTranscriptionProviderIds: [],
		realtimeVoiceProviderIds: [],
		mediaUnderstandingProviderIds: [],
		imageGenerationProviderIds: [],
		videoGenerationProviderIds: [],
		musicGenerationProviderIds: [],
		webFetchProviderIds: [],
		webSearchProviderIds: [],
		migrationProviderIds: [],
		memoryEmbeddingProviderIds: [],
		agentHarnessIds: [],
		gatewayMethods: [],
		cliCommands: [],
		services: [],
		gatewayDiscoveryServiceIds: [],
		commands: [...manifest?.commandAliases?.map((alias) => alias.name) ?? []],
		httpRoutes: 0,
		hookCount: 0,
		configSchema: false,
		contracts: {}
	};
}
function buildPluginRegistrySnapshotReport(params) {
	const config = params?.config ?? getRuntimeConfig();
	const result = tracePluginLifecyclePhase("plugin registry snapshot", () => loadPluginRegistrySnapshotWithMetadata({
		config,
		env: params?.env,
		workspaceDir: params?.workspaceDir
	}), { surface: "status" });
	const manifestRegistry = loadPluginManifestRegistryForInstalledIndex({
		index: result.snapshot,
		config,
		env: params?.env,
		workspaceDir: params?.workspaceDir,
		includeDisabled: true
	});
	const manifestByPluginId = new Map(manifestRegistry.plugins.map((plugin) => [plugin.id, plugin]));
	return {
		workspaceDir: params?.workspaceDir,
		...createEmptyPluginRegistry(),
		plugins: result.snapshot.plugins.map((plugin) => buildPluginRecordFromInstalledIndex(plugin, manifestByPluginId.get(plugin.pluginId))),
		diagnostics: [...result.snapshot.diagnostics],
		registrySource: result.source,
		registryDiagnostics: result.diagnostics
	};
}
function buildPluginReport(params, loadModules) {
	const baseContext = resolvePluginRuntimeLoadContext({
		config: params?.config ?? getRuntimeConfig(),
		env: params?.env,
		logger: params?.logger,
		workspaceDir: params?.workspaceDir
	});
	const workspaceDir = baseContext.workspaceDir ?? resolveDefaultAgentWorkspaceDir();
	const context = workspaceDir === baseContext.workspaceDir ? baseContext : {
		...baseContext,
		workspaceDir
	};
	const rawConfig = context.rawConfig;
	const config = context.config;
	const bundledProviderIds = resolveBundledProviderCompatPluginIds({
		config,
		workspaceDir,
		env: params?.env
	});
	const runtimeCompatConfig = withBundledPluginEnablementCompat({
		config: withBundledPluginAllowlistCompat({
			config,
			pluginIds: bundledProviderIds
		}),
		pluginIds: bundledProviderIds
	});
	const onlyPluginIds = params?.effectiveOnly === true ? resolveEffectivePluginIds({
		config: rawConfig,
		workspaceDir,
		env: params?.env ?? process.env
	}) : params?.onlyPluginIds === void 0 ? void 0 : [...params.onlyPluginIds];
	const registry = loadModules ? tracePluginLifecyclePhase("runtime plugin registry load", () => loadOpenClawPlugins(buildPluginRuntimeLoadOptions(context, {
		config: runtimeCompatConfig,
		activationSourceConfig: rawConfig,
		workspaceDir,
		env: params?.env,
		loadModules,
		activate: false,
		cache: false,
		onlyPluginIds
	})), {
		surface: "status",
		onlyPluginCount: onlyPluginIds?.length
	}) : tracePluginLifecyclePhase("plugin registry snapshot", () => loadPluginMetadataRegistrySnapshot({
		config: runtimeCompatConfig,
		activationSourceConfig: rawConfig,
		workspaceDir,
		env: params?.env,
		logger: params?.logger,
		loadModules: false,
		onlyPluginIds
	}), {
		surface: "status",
		onlyPluginCount: onlyPluginIds?.length
	});
	const importedPluginIds = new Set([
		...loadModules ? registry.plugins.filter((plugin) => plugin.status === "loaded" && plugin.format !== "bundle").map((plugin) => plugin.id) : [],
		...listImportedRuntimePluginIds(),
		...listImportedBundledPluginFacadeIds()
	]);
	return {
		workspaceDir,
		...registry,
		plugins: registry.plugins.map((plugin) => Object.assign({}, plugin, {
			imported: plugin.format !== `bundle` && importedPluginIds.has(plugin.id),
			version: resolveReportedPluginVersion(plugin, params?.env)
		}))
	};
}
function buildPluginSnapshotReport(params) {
	return buildPluginReport(params, false);
}
function buildPluginDiagnosticsReport(params) {
	return buildPluginReport(params, true);
}
function buildPluginInspectReport(params) {
	const rawConfig = params.config ?? getRuntimeConfig();
	const config = resolvePluginRuntimeLoadContext({
		config: rawConfig,
		env: params.env,
		logger: params.logger,
		workspaceDir: params.workspaceDir
	}).config;
	const report = params.report ?? buildPluginDiagnosticsReport({
		config: rawConfig,
		logger: params.logger,
		workspaceDir: params.workspaceDir,
		env: params.env
	});
	const plugin = report.plugins.find((entry) => entry.id === params.id || entry.name === params.id);
	if (!plugin) return null;
	const typedHooks = report.typedHooks.filter((entry) => entry.pluginId === plugin.id).map((entry) => ({
		name: entry.hookName,
		priority: entry.priority
	})).toSorted((a, b) => a.name.localeCompare(b.name));
	const customHooks = report.hooks.filter((entry) => entry.pluginId === plugin.id).map((entry) => ({
		name: entry.entry.hook.name,
		events: [...entry.events].toSorted()
	})).toSorted((a, b) => a.name.localeCompare(b.name));
	const tools = report.tools.filter((entry) => entry.pluginId === plugin.id).map((entry) => ({
		names: [...entry.names],
		optional: entry.optional
	}));
	const diagnostics = report.diagnostics.filter((entry) => entry.pluginId === plugin.id);
	const policyEntry = normalizePluginsConfig(config.plugins).entries[plugin.id];
	const shapeSummary = buildPluginShapeSummary({
		plugin,
		report
	});
	const shape = shapeSummary.shape;
	let mcpServers = [];
	if (plugin.format === "bundle" && plugin.bundleFormat && plugin.rootDir) {
		const mcpSupport = inspectBundleMcpRuntimeSupport({
			pluginId: plugin.id,
			rootDir: plugin.rootDir,
			bundleFormat: plugin.bundleFormat
		});
		mcpServers = [...mcpSupport.supportedServerNames.map((name) => ({
			name,
			hasStdioTransport: true
		})), ...mcpSupport.unsupportedServerNames.map((name) => ({
			name,
			hasStdioTransport: false
		}))];
	}
	let lspServers = [];
	if (plugin.format === "bundle" && plugin.bundleFormat && plugin.rootDir) {
		const lspSupport = inspectBundleLspRuntimeSupport({
			pluginId: plugin.id,
			rootDir: plugin.rootDir,
			bundleFormat: plugin.bundleFormat
		});
		lspServers = [...lspSupport.supportedServerNames.map((name) => ({
			name,
			hasStdioTransport: true
		})), ...lspSupport.unsupportedServerNames.map((name) => ({
			name,
			hasStdioTransport: false
		}))];
	}
	const usesLegacyBeforeAgentStart = shapeSummary.usesLegacyBeforeAgentStart;
	const compatibility = buildCompatibilityNoticesForInspect({
		plugin,
		shape,
		usesLegacyBeforeAgentStart
	});
	return {
		workspaceDir: report.workspaceDir,
		plugin,
		shape,
		capabilityMode: shapeSummary.capabilityMode,
		capabilityCount: shapeSummary.capabilityCount,
		capabilities: shapeSummary.capabilities,
		typedHooks,
		customHooks,
		tools,
		commands: [...plugin.commands],
		cliCommands: [...plugin.cliCommands],
		services: [...plugin.services],
		gatewayDiscoveryServices: [...plugin.gatewayDiscoveryServiceIds],
		gatewayMethods: [...plugin.gatewayMethods],
		mcpServers,
		lspServers,
		httpRouteCount: plugin.httpRoutes,
		bundleCapabilities: plugin.bundleCapabilities ?? [],
		diagnostics,
		policy: {
			allowPromptInjection: policyEntry?.hooks?.allowPromptInjection,
			allowConversationAccess: policyEntry?.hooks?.allowConversationAccess,
			allowModelOverride: policyEntry?.subagent?.allowModelOverride,
			allowedModels: [...policyEntry?.subagent?.allowedModels ?? []],
			hasAllowedModelsConfig: policyEntry?.subagent?.hasAllowedModelsConfig === true
		},
		usesLegacyBeforeAgentStart,
		compatibility
	};
}
function buildAllPluginInspectReports(params) {
	const rawConfig = params?.config ?? getRuntimeConfig();
	const report = params?.report ?? buildPluginDiagnosticsReport({
		config: rawConfig,
		logger: params?.logger,
		workspaceDir: params?.workspaceDir,
		env: params?.env
	});
	return report.plugins.map((plugin) => buildPluginInspectReport({
		id: plugin.id,
		config: rawConfig,
		logger: params?.logger,
		report
	})).filter((entry) => entry !== null);
}
function buildPluginCompatibilityWarnings(params) {
	return buildPluginCompatibilityNotices(params).map(formatPluginCompatibilityNotice);
}
function buildPluginCompatibilityNotices(params) {
	return buildAllPluginInspectReports(params).flatMap((inspect) => inspect.compatibility);
}
function buildPluginCompatibilitySnapshotNotices(params) {
	const report = buildPluginSnapshotReport(params);
	return buildPluginCompatibilityNotices({
		...params,
		report
	});
}
function formatPluginCompatibilityNotice(notice) {
	return `${notice.pluginId} ${notice.message}`;
}
function summarizePluginCompatibility(notices) {
	return {
		noticeCount: notices.length,
		pluginCount: new Set(notices.map((notice) => notice.pluginId)).size
	};
}
//#endregion
export { buildPluginDiagnosticsReport as a, buildPluginSnapshotReport as c, buildPluginCompatibilityWarnings as i, formatPluginCompatibilityNotice as l, buildPluginCompatibilityNotices as n, buildPluginInspectReport as o, buildPluginCompatibilitySnapshotNotices as r, buildPluginRegistrySnapshotReport as s, buildAllPluginInspectReports as t, summarizePluginCompatibility as u };
