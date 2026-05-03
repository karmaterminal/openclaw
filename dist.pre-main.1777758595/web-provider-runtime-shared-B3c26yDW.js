import { i as normalizePluginIdScope, n as hasExplicitPluginIdScope } from "./plugin-scope-utbpAtQu.js";
import { r as withActivatedPluginIds } from "./activation-context-CBRSxyff.js";
import { i as isPluginRegistryLoadInFlight, l as resolveRuntimePluginRegistry, o as loadOpenClawPlugins, s as resolveCompatibleRuntimePluginRegistry } from "./loader-UaaxQ4fP.js";
import { c as getActivePluginRegistryWorkspaceDir } from "./runtime-B-5HHEpR.js";
import { n as buildPluginRuntimeLoadOptionsFromValues, r as createPluginRuntimeLoaderLogger } from "./load-context-3FXdJZ3d.js";
//#region src/plugins/web-provider-runtime-shared.ts
function resolveWebProviderLoadOptions(params, deps) {
	const env = params.env ?? process.env;
	const workspaceDir = params.workspaceDir ?? getActivePluginRegistryWorkspaceDir();
	const { config, activationSourceConfig, autoEnabledReasons } = deps.resolveBundledResolutionConfig({
		...params,
		workspaceDir,
		env
	});
	const onlyPluginIds = normalizePluginIdScope(deps.resolveCandidatePluginIds({
		config,
		workspaceDir,
		env,
		onlyPluginIds: params.onlyPluginIds,
		origin: params.origin
	}));
	return buildPluginRuntimeLoadOptionsFromValues({
		env,
		config,
		activationSourceConfig,
		autoEnabledReasons,
		workspaceDir,
		logger: createPluginRuntimeLoaderLogger()
	}, {
		cache: params.cache ?? false,
		activate: params.activate ?? false,
		...hasExplicitPluginIdScope(onlyPluginIds) ? { onlyPluginIds } : {}
	});
}
function resolvePluginWebProviders(params, deps) {
	const env = params.env ?? process.env;
	const workspaceDir = params.workspaceDir ?? getActivePluginRegistryWorkspaceDir();
	if (params.mode === "setup") {
		const pluginIds = deps.resolveCandidatePluginIds({
			config: params.config,
			workspaceDir,
			env,
			onlyPluginIds: params.onlyPluginIds,
			origin: params.origin
		}) ?? [];
		if (pluginIds.length === 0) return [];
		if (params.activate !== true) {
			const bundledArtifactProviders = deps.resolveBundledPublicArtifactProviders?.({
				config: params.config,
				workspaceDir,
				env,
				bundledAllowlistCompat: params.bundledAllowlistCompat,
				onlyPluginIds: pluginIds
			});
			if (bundledArtifactProviders) return bundledArtifactProviders;
		}
		const registry = loadOpenClawPlugins(buildPluginRuntimeLoadOptionsFromValues({
			config: withActivatedPluginIds({
				config: params.config,
				pluginIds
			}),
			activationSourceConfig: params.config,
			autoEnabledReasons: {},
			workspaceDir,
			env,
			logger: createPluginRuntimeLoaderLogger()
		}, {
			onlyPluginIds: pluginIds,
			cache: params.cache ?? false,
			activate: params.activate ?? false
		}));
		return deps.mapRegistryProviders({
			registry,
			onlyPluginIds: pluginIds
		});
	}
	const loadOptions = resolveWebProviderLoadOptions(params, deps);
	const compatible = resolveCompatibleRuntimePluginRegistry(loadOptions);
	if (compatible) return deps.mapRegistryProviders({
		registry: compatible,
		onlyPluginIds: params.onlyPluginIds
	});
	if (isPluginRegistryLoadInFlight(loadOptions)) return [];
	return deps.mapRegistryProviders({
		registry: loadOpenClawPlugins(loadOptions),
		onlyPluginIds: params.onlyPluginIds
	});
}
function resolveRuntimeWebProviders(params, deps) {
	const runtimeRegistry = resolveRuntimePluginRegistry(params.config === void 0 ? void 0 : resolveWebProviderLoadOptions(params, deps));
	if (runtimeRegistry) return deps.mapRegistryProviders({
		registry: runtimeRegistry,
		onlyPluginIds: params.onlyPluginIds
	});
	return resolvePluginWebProviders(params, deps);
}
//#endregion
export { resolveRuntimeWebProviders as n, resolvePluginWebProviders as t };
