import { n as resolveAgentModelPrimaryValue } from "./model-input-Cz2QqM8B.js";
import { n as logConfigUpdated } from "./logging-YO-7Q2O7.js";
import { t as applyDefaultModelPrimaryUpdate, u as updateConfig } from "./shared-DjY3liej.js";
//#region src/commands/models/set-image.ts
async function modelsSetImageCommand(modelRaw, runtime) {
	const updated = await updateConfig((cfg) => {
		return applyDefaultModelPrimaryUpdate({
			cfg,
			modelRaw,
			field: "imageModel"
		});
	});
	logConfigUpdated(runtime);
	runtime.log(`Image model: ${resolveAgentModelPrimaryValue(updated.agents?.defaults?.imageModel) ?? modelRaw}`);
}
//#endregion
export { modelsSetImageCommand };
