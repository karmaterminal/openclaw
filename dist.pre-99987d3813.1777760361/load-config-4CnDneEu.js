import { h as readSourceConfigSnapshotForWrite, i as getRuntimeConfig } from "./io-DTtpq82f.js";
import { _ as setRuntimeConfigSnapshot } from "./runtime-snapshot-DFeUzjt3.js";
import "./config-DbmohW6s.js";
import "./command-secret-gateway-TjUP5dxA.js";
import { i as getModelsCommandSecretTargetIds } from "./command-secret-targets-BKgQ9hgh.js";
import { t as resolveCommandConfigWithSecrets } from "./command-config-resolution-D9edSpCU.js";
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
