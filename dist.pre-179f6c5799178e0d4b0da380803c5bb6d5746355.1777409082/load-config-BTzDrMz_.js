import { i as getRuntimeConfig, m as readSourceConfigSnapshotForWrite } from "./io-CgtDzW1a.js";
import { u as setRuntimeConfigSnapshot } from "./runtime-snapshot-TLmoelW7.js";
import "./config-C9V3s22v.js";
import "./command-secret-gateway-D_WFogjX.js";
import { i as getModelsCommandSecretTargetIds } from "./command-secret-targets-BTc97zIa.js";
import { t as resolveCommandConfigWithSecrets } from "./command-config-resolution-DdVuD8-s.js";
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
