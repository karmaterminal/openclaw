import { n as resolvePluginProviders } from "./providers.runtime-DR0JLRLu.js";
import { i as runProviderModelSelectedHook, n as resolveProviderPluginChoice } from "./provider-wizard-a2xKGwwf.js";
import { n as resolveProviderModelPickerFlowEntries, t as resolveProviderModelPickerFlowContributions } from "./provider-flow-D5i9RD-Z.js";
import { n as runProviderPluginAuthMethod } from "./provider-auth-choice-BFWzDezl.js";
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
