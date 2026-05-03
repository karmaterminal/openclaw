import { n as resolvePluginProviders } from "./providers.runtime-DSc95Nja.js";
import { i as runProviderModelSelectedHook, n as resolveProviderPluginChoice } from "./provider-wizard-C7Al6-nY.js";
import { n as resolveProviderModelPickerFlowEntries, t as resolveProviderModelPickerFlowContributions } from "./provider-flow-CQQlZ4au.js";
import { n as runProviderPluginAuthMethod } from "./provider-auth-choice-dzs_OyIA.js";
//#region src/commands/model-picker.runtime.ts
const modelPickerRuntime = {
	resolveProviderModelPickerContributions: resolveProviderModelPickerFlowContributions,
	resolveProviderModelPickerEntries: resolveProviderModelPickerFlowEntries,
	resolveProviderPluginChoice,
	runProviderModelSelectedHook,
	resolvePluginProviders,
	runProviderPluginAuthMethod
};
//#endregion
export { modelPickerRuntime };
