import { n as resolveAgentModelPrimaryValue } from "./model-input-nfgC47df.js";
import { n as logConfigUpdated } from "./logging-ApQT1VhX.js";
import { t as applyDefaultModelPrimaryUpdate, u as updateConfig } from "./shared-CdJRJi2c.js";
//#region src/commands/models/set.ts
async function modelsSetCommand(modelRaw, runtime) {
	const updated = await updateConfig((cfg) => {
		return applyDefaultModelPrimaryUpdate({
			cfg,
			modelRaw,
			field: "model"
		});
	});
	logConfigUpdated(runtime);
	runtime.log(`Default model: ${resolveAgentModelPrimaryValue(updated.agents?.defaults?.model) ?? modelRaw}`);
}
//#endregion
export { modelsSetCommand as t };
