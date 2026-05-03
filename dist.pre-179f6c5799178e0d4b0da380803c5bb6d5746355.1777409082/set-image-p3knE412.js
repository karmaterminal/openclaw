import { n as resolveAgentModelPrimaryValue } from "./model-input-nfgC47df.js";
import { n as logConfigUpdated } from "./logging-ApQT1VhX.js";
import { t as applyDefaultModelPrimaryUpdate, u as updateConfig } from "./shared-CdJRJi2c.js";
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
export { modelsSetImageCommand as t };
