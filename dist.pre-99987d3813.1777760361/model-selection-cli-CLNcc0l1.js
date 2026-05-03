import { r as normalizeProviderId } from "./provider-id-X2THsZiv.js";
import { t as loadPluginManifestRegistryForInstalledIndex } from "./manifest-registry-installed-DGOaHw15.js";
import { _ as loadPluginRegistrySnapshot } from "./plugin-registry-x83fIWqx.js";
import { t as resolveAgentModelFallbackValues } from "./model-input-Cz2QqM8B.js";
import { t as getActiveRuntimePluginRegistry } from "./active-runtime-registry-DnC640Ei.js";
import { d as resolveAllowedModelRefFromAliasIndex, i as buildModelAliasIndex, o as getModelRefStatusWithFallbackModels } from "./model-selection-shared-C_hgcjGe.js";
import { createRequire } from "node:module";
//#region src/agents/model-selection-resolve.ts
function resolveDefaultFallbackModels(cfg) {
	return resolveAgentModelFallbackValues(cfg.agents?.defaults?.model);
}
function getModelRefStatus(params) {
	const { cfg, catalog, ref, defaultProvider, defaultModel } = params;
	return getModelRefStatusWithFallbackModels({
		cfg,
		catalog,
		ref,
		defaultProvider,
		defaultModel,
		fallbackModels: resolveDefaultFallbackModels(cfg)
	});
}
function resolveAllowedModelRef(params) {
	const aliasIndex = buildModelAliasIndex({
		cfg: params.cfg,
		defaultProvider: params.defaultProvider
	});
	return resolveAllowedModelRefFromAliasIndex({
		cfg: params.cfg,
		raw: params.raw,
		defaultProvider: params.defaultProvider,
		aliasIndex,
		getStatus: (ref) => getModelRefStatus({
			cfg: params.cfg,
			catalog: params.catalog,
			ref,
			defaultProvider: params.defaultProvider,
			defaultModel: params.defaultModel
		})
	});
}
//#endregion
//#region src/plugins/cli-backends.runtime.ts
function resolveRuntimeCliBackends() {
	return (getActiveRuntimePluginRegistry()?.cliBackends ?? []).map((entry) => Object.assign({}, entry.backend, { pluginId: entry.pluginId }));
}
//#endregion
//#region src/plugins/setup-registry.runtime.ts
const require = createRequire(import.meta.url);
const SETUP_REGISTRY_RUNTIME_CANDIDATES = ["./setup-registry.js", "./setup-registry.ts"];
let setupRegistryRuntimeModule;
function resolveBundledSetupCliBackends() {
	return loadPluginManifestRegistryForInstalledIndex({ index: loadPluginRegistrySnapshot({}) }).plugins.flatMap((plugin) => {
		if (plugin.origin !== "bundled") return [];
		return [...plugin.cliBackends, ...plugin.setup?.cliBackends ?? []].map((backendId) => ({
			pluginId: plugin.id,
			backend: { id: backendId }
		}));
	});
}
function loadSetupRegistryRuntime() {
	if (setupRegistryRuntimeModule !== void 0) return setupRegistryRuntimeModule;
	for (const candidate of SETUP_REGISTRY_RUNTIME_CANDIDATES) try {
		setupRegistryRuntimeModule = require(candidate);
		return setupRegistryRuntimeModule;
	} catch {}
	return null;
}
function resolvePluginSetupCliBackendRuntime(params) {
	const normalized = normalizeProviderId(params.backend);
	const runtime = loadSetupRegistryRuntime();
	if (runtime !== null) return runtime.resolvePluginSetupCliBackend(params);
	return resolveBundledSetupCliBackends().find((entry) => normalizeProviderId(entry.backend.id) === normalized);
}
//#endregion
//#region src/agents/model-selection-cli.ts
function isCliProvider(provider, cfg) {
	const normalized = normalizeProviderId(provider);
	const backends = cfg?.agents?.defaults?.cliBackends ?? {};
	if (Object.keys(backends).some((key) => normalizeProviderId(key) === normalized)) return true;
	if (resolveRuntimeCliBackends().some((backend) => normalizeProviderId(backend.id) === normalized)) return true;
	if (resolvePluginSetupCliBackendRuntime({ backend: normalized })) return true;
	return false;
}
//#endregion
export { resolveAllowedModelRef as i, resolveRuntimeCliBackends as n, getModelRefStatus as r, isCliProvider as t };
