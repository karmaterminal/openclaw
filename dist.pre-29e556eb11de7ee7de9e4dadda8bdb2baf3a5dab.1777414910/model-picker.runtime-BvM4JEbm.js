import { n as resolvePluginProviders } from "./providers.runtime-BLJxwcEk.js";
import { i as runProviderModelSelectedHook, n as resolveProviderPluginChoice } from "./provider-wizard-Du1JtHb9.js";
import { n as resolveProviderModelPickerFlowEntries, t as resolveProviderModelPickerFlowContributions } from "./provider-flow-BThflHGI.js";
import { n as runProviderPluginAuthMethod } from "./provider-auth-choice-LHeHfVyz.js";
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
