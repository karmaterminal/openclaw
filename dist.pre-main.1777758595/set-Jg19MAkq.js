import { n as resolveAgentModelPrimaryValue } from "./model-input-Cz2QqM8B.js";
import { n as logConfigUpdated } from "./logging-YO-7Q2O7.js";
import { t as applyDefaultModelPrimaryUpdate, u as updateConfig } from "./shared-DjY3liej.js";
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
export { modelsSetCommand };
