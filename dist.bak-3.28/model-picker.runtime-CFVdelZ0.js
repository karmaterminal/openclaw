import { Es as resolvePluginProviders } from "./auth-profiles-D5vQ2NEm.js";
import { i as runProviderModelSelectedHook, n as resolveProviderPluginChoice } from "./provider-wizard-DTRQDwYW.js";
import { n as resolveProviderModelPickerFlowContributions, r as resolveProviderModelPickerFlowEntries } from "./provider-flow-B5oa2DLB.js";
import { n as runProviderPluginAuthMethod } from "./provider-auth-choice-DOL6LzAx.js";
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
