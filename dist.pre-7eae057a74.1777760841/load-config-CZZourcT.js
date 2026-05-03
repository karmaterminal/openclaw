import { i as getRuntimeConfig, m as readSourceConfigSnapshotForWrite } from "./io-5jzTw2vS.js";
import { d as setRuntimeConfigSnapshot } from "./runtime-snapshot-BIo89a-e.js";
import "./config-CzLCUGML.js";
import "./command-secret-gateway-c3CuQsc5.js";
import { i as getModelsCommandSecretTargetIds } from "./command-secret-targets-B6TmmDok.js";
import { t as resolveCommandConfigWithSecrets } from "./command-config-resolution-DUbo4v5z.js";
//#region src/commands/models/load-config.ts
async function loadSourceConfigSnapshot(fallback) {
	try {
		const { snapshot } = await readSourceConfigSnapshotForWrite();
		if (snapshot.valid) return snapshot.sourceConfig;
	} catch {}
	return fallback;
}
async function loadModelsConfigWithSource(params) {
	const runtimeConfig = getRuntimeConfig();
	const sourceConfig = await loadSourceConfigSnapshot(runtimeConfig);
	const { resolvedConfig, diagnostics } = await resolveCommandConfigWithSecrets({
		config: runtimeConfig,
		commandName: params.commandName,
		targetIds: getModelsCommandSecretTargetIds(),
		runtime: params.runtime
	});
	setRuntimeConfigSnapshot(resolvedConfig, sourceConfig);
	return {
		sourceConfig,
		resolvedConfig,
		diagnostics
	};
}
async function loadModelsConfig(params) {
	return (await loadModelsConfigWithSource(params)).resolvedConfig;
}
//#endregion
export { loadModelsConfigWithSource as n, loadModelsConfig as t };
