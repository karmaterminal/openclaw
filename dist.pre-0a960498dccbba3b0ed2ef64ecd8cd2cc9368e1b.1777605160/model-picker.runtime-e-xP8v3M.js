import { n as resolvePluginProviders } from "./providers.runtime-BLJxwcEk.js";
import { i as runProviderModelSelectedHook, n as resolveProviderPluginChoice } from "./provider-wizard-DopNYgod.js";
import { n as resolveProviderModelPickerFlowEntries, t as resolveProviderModelPickerFlowContributions } from "./provider-flow-C9DT8sm_.js";
import { n as runProviderPluginAuthMethod } from "./provider-auth-choice-NvK_K0FO.js";
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
