import { n as resolveAgentModelPrimaryValue } from "./model-input-Lqm5A3qq.js";
import { n as logConfigUpdated } from "./logging-DemxZNeo.js";
import { t as applyDefaultModelPrimaryUpdate, u as updateConfig } from "./shared-CunA93Iy.js";
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
