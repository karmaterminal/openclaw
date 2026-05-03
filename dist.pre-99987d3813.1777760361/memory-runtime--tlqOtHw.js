import { o as normalizePluginsConfig } from "./config-state-Bl1k5f-r.js";
import { l as resolveRuntimePluginRegistry } from "./loader-UaaxQ4fP.js";
import { s as getMemoryRuntime } from "./memory-state-CvGBZ376.js";
import { i as resolvePluginRuntimeLoadContext, t as buildPluginRuntimeLoadOptions } from "./load-context-3FXdJZ3d.js";
//#region src/plugins/memory-runtime.ts
function resolveMemoryRuntimePluginIds(config) {
	const memorySlot = normalizePluginsConfig(config.plugins).slots.memory;
	return typeof memorySlot === "string" && memorySlot.trim().length > 0 ? [memorySlot] : [];
}
function ensureMemoryRuntime(cfg) {
	const current = getMemoryRuntime();
	if (current || !cfg) return current;
	const context = resolvePluginRuntimeLoadContext({ config: cfg });
	const onlyPluginIds = resolveMemoryRuntimePluginIds(context.config);
	if (onlyPluginIds.length === 0) return getMemoryRuntime();
	resolveRuntimePluginRegistry(buildPluginRuntimeLoadOptions(context, { onlyPluginIds }));
	return getMemoryRuntime();
}
async function getActiveMemorySearchManager(params) {
	const runtime = ensureMemoryRuntime(params.cfg);
	if (!runtime) return {
		manager: null,
		error: "memory plugin unavailable"
	};
	return await runtime.getMemorySearchManager(params);
}
function resolveActiveMemoryBackendConfig(params) {
	return ensureMemoryRuntime(params.cfg)?.resolveMemoryBackendConfig(params) ?? null;
}
async function closeActiveMemorySearchManagers(cfg) {
	await getMemoryRuntime()?.closeAllMemorySearchManagers?.();
}
//#endregion
export { getActiveMemorySearchManager as n, resolveActiveMemoryBackendConfig as r, closeActiveMemorySearchManagers as t };
