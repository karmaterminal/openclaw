import { i as getRuntimeConfig, m as readSourceConfigSnapshotForWrite } from "./io-CBRjt33P.js";
import { u as setRuntimeConfigSnapshot } from "./runtime-snapshot-C54O1-gI.js";
import "./config-BjiV0z87.js";
import "./command-secret-gateway-D5MGM6PE.js";
import { i as getModelsCommandSecretTargetIds } from "./command-secret-targets-DM2pXoIP.js";
import { t as resolveCommandConfigWithSecrets } from "./command-config-resolution-C5rpiBrn.js";
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
