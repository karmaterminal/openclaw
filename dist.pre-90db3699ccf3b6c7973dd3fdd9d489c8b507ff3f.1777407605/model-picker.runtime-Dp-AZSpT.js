import { n as resolvePluginProviders } from "./providers.runtime-CeArq6YC.js";
import { i as runProviderModelSelectedHook, n as resolveProviderPluginChoice } from "./provider-wizard-CQTgMEkj.js";
import { n as resolveProviderModelPickerFlowEntries, t as resolveProviderModelPickerFlowContributions } from "./provider-flow-B4ejaXW3.js";
import { n as runProviderPluginAuthMethod } from "./provider-auth-choice-kAIY-RbM.js";
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
