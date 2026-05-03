import { t as clearPluginDiscoveryCache } from "./discovery-DoO9rWnu.js";
import { t as sanitizeTerminalText } from "./safe-text-DC97lJF2.js";
import { v as resolveDefaultAgentWorkspaceDir } from "./workspace-DGJIk8rw.js";
import { b as resolveAgentWorkspaceDir, x as resolveDefaultAgentId, y as resolveAgentDir } from "./agent-scope-D-T17Rdc.js";
import { t as resolveOpenClawAgentDir } from "./agent-paths-yYk0N-bh.js";
import "./auth-profiles-k8Wc2Eeh.js";
import { o as upsertAuthProfile } from "./profiles-DQiFenPb.js";
import { t as applyAuthProfileConfig } from "./provider-auth-helpers-DDc3aiuG.js";
import { t as enablePluginInConfig } from "./enable-Bm0sLHVk.js";
import { t as isRemoteEnvironment } from "./remote-env-ClKFn2dv.js";
import { t as createVpsAwareOAuthHandlers } from "./provider-oauth-flow-CJRkE0m-.js";
import { n as applyProviderAuthConfigPatch, t as applyDefaultModel } from "./provider-auth-choice-helpers-ByRkI8zI.js";
import { t as ensureOnboardingPluginInstalled } from "./onboarding-plugin-install-yvJbsSFS.js";
import { n as openUrl } from "./browser-open-Dw-IkHZl.js";
import { n as resolveProviderInstallCatalogEntry } from "./provider-install-catalog-CDTJPWoY.js";
//#region src/plugins/provider-auth-choice.ts
function restoreConfiguredPrimaryModel(nextConfig, originalConfig) {
	const originalModel = originalConfig.agents?.defaults?.model;
	const nextAgents = nextConfig.agents;
	const nextDefaults = nextAgents?.defaults;
	if (!nextDefaults) return nextConfig;
	if (originalModel !== void 0) return {
		...nextConfig,
		agents: {
			...nextAgents,
			defaults: {
				...nextDefaults,
				model: originalModel
			}
		}
	};
	const { model: _model, ...restDefaults } = nextDefaults;
	return {
		...nextConfig,
		agents: {
			...nextAgents,
			defaults: restDefaults
		}
	};
}
let providerAuthChoiceDeps = { loadPluginProviderRuntime: async () => import("./provider-auth-choice.runtime-BBgfhRF5.js") };
async function loadPluginProviderRuntime() {
	return await providerAuthChoiceDeps.loadPluginProviderRuntime();
}
async function runProviderPluginAuthMethod(params) {
	const agentId = params.agentId ?? resolveDefaultAgentId(params.config);
	const defaultAgentId = resolveDefaultAgentId(params.config);
	const agentDir = params.agentDir ?? (agentId === defaultAgentId ? resolveOpenClawAgentDir() : resolveAgentDir(params.config, agentId));
	const workspaceDir = params.workspaceDir ?? resolveAgentWorkspaceDir(params.config, agentId) ?? resolveDefaultAgentWorkspaceDir();
	const result = await params.method.run({
		config: params.config,
		env: params.env,
		agentDir,
		workspaceDir,
		prompter: params.prompter,
		runtime: params.runtime,
		opts: params.opts,
		secretInputMode: params.secretInputMode,
		allowSecretRefPrompt: params.allowSecretRefPrompt,
		isRemote: isRemoteEnvironment(),
		openUrl: async (url) => {
			await openUrl(url);
		},
		oauth: { createVpsAwareHandlers: (opts) => createVpsAwareOAuthHandlers(opts) }
	});
	let nextConfig = params.config;
	if (result.configPatch) nextConfig = applyProviderAuthConfigPatch(nextConfig, result.configPatch, { replaceDefaultModels: result.replaceDefaultModels });
	for (const profile of result.profiles) {
		upsertAuthProfile({
			profileId: profile.profileId,
			credential: profile.credential,
			agentDir
		});
		nextConfig = applyAuthProfileConfig(nextConfig, {
			profileId: profile.profileId,
			provider: profile.credential.provider,
			mode: profile.credential.type === "token" ? "token" : profile.credential.type,
			..."email" in profile.credential && profile.credential.email ? { email: profile.credential.email } : {},
			..."displayName" in profile.credential && profile.credential.displayName ? { displayName: profile.credential.displayName } : {}
		});
	}
	if (params.emitNotes !== false && result.notes && result.notes.length > 0) await params.prompter.note(result.notes.join("\n"), "Provider notes");
	return {
		config: nextConfig,
		defaultModel: result.defaultModel
	};
}
async function applyAuthChoiceLoadedPluginProvider(params) {
	const agentId = params.agentId ?? resolveDefaultAgentId(params.config);
	const workspaceDir = resolveAgentWorkspaceDir(params.config, agentId) ?? resolveDefaultAgentWorkspaceDir();
	let nextConfig = params.config;
	let enabledConfig = params.config;
	const { resolvePluginProviders, resolveProviderPluginChoice, runProviderModelSelectedHook } = await loadPluginProviderRuntime();
	const installCatalogEntry = resolveProviderInstallCatalogEntry(params.authChoice, {
		config: nextConfig,
		workspaceDir,
		env: params.env,
		includeUntrustedWorkspacePlugins: false
	});
	if (installCatalogEntry) {
		const enableResult = enablePluginInConfig(nextConfig, installCatalogEntry.pluginId);
		if (!enableResult.enabled) {
			const safeLabel = sanitizeTerminalText(installCatalogEntry.label);
			await params.prompter.note(`${safeLabel} plugin is disabled (${enableResult.reason ?? "blocked"}).`, safeLabel);
			return { config: nextConfig };
		}
		enabledConfig = enableResult.config;
	}
	let providers = resolvePluginProviders({
		config: enabledConfig,
		workspaceDir,
		env: params.env,
		mode: "setup"
	});
	let resolved = resolveProviderPluginChoice({
		providers,
		choice: params.authChoice
	});
	if (!resolved && installCatalogEntry) {
		const installResult = await ensureOnboardingPluginInstalled({
			cfg: nextConfig,
			entry: {
				pluginId: installCatalogEntry.pluginId,
				label: installCatalogEntry.label,
				install: installCatalogEntry.install
			},
			prompter: params.prompter,
			runtime: params.runtime,
			workspaceDir
		});
		if (!installResult.installed) return {
			config: installResult.cfg,
			retrySelection: true
		};
		nextConfig = installResult.cfg;
		clearPluginDiscoveryCache();
		providers = resolvePluginProviders({
			config: nextConfig,
			workspaceDir,
			env: params.env,
			mode: "setup"
		});
		resolved = resolveProviderPluginChoice({
			providers,
			choice: params.authChoice
		});
	}
	if (!resolved) return nextConfig === params.config ? null : {
		config: nextConfig,
		retrySelection: true
	};
	if (nextConfig === params.config && enabledConfig !== params.config) nextConfig = enabledConfig;
	const applied = await runProviderPluginAuthMethod({
		config: nextConfig,
		env: params.env,
		runtime: params.runtime,
		prompter: params.prompter,
		method: resolved.method,
		agentDir: params.agentDir,
		agentId: params.agentId,
		workspaceDir,
		secretInputMode: params.opts?.secretInputMode,
		allowSecretRefPrompt: false,
		opts: params.opts
	});
	nextConfig = applied.config;
	let agentModelOverride;
	if (applied.defaultModel) {
		if (params.setDefaultModel) {
			nextConfig = applyDefaultModel(nextConfig, applied.defaultModel);
			await runProviderModelSelectedHook({
				config: nextConfig,
				model: applied.defaultModel,
				prompter: params.prompter,
				agentDir: params.agentDir,
				workspaceDir
			});
			await params.prompter.note(`Default model set to ${applied.defaultModel}`, "Model configured");
			return { config: nextConfig };
		}
		nextConfig = restoreConfiguredPrimaryModel(nextConfig, params.config);
		agentModelOverride = applied.defaultModel;
	}
	return {
		config: nextConfig,
		agentModelOverride
	};
}
//#endregion
export { runProviderPluginAuthMethod as n, applyAuthChoiceLoadedPluginProvider as t };
