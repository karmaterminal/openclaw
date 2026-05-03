import { a as resolveRuntimePluginRegistry } from "./loader-708jrx4Y.js";
import { o as getMemoryRuntime } from "./memory-state-By3bF34d.js";
import { i as resolvePluginRuntimeLoadContext, t as buildPluginRuntimeLoadOptions } from "./load-context-B77Zu07N.js";
//#region src/plugins/memory-runtime.ts
function ensureMemoryRuntime(cfg) {
	const current = getMemoryRuntime();
	if (current || !cfg) return current;
	resolveRuntimePluginRegistry(buildPluginRuntimeLoadOptions(resolvePluginRuntimeLoadContext({ config: cfg })));
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
