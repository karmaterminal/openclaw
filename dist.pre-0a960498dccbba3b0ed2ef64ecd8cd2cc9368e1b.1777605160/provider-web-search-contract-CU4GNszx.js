import { t as enablePluginInConfig } from "./provider-enable-config-Dk8CGuWR.js";
import { t as createBaseWebSearchProviderContractFields } from "./provider-web-search-contract-fields-0_2JVsMv.js";
//#region src/plugin-sdk/provider-web-search-contract.ts
function createWebSearchProviderContractFields(options) {
	const selectionPluginId = options.selectionPluginId;
	return {
		...createBaseWebSearchProviderContractFields(options),
		...selectionPluginId ? { applySelectionConfig: (config) => enablePluginInConfig(config, selectionPluginId).config } : {}
	};
}
//#endregion
export { createWebSearchProviderContractFields as t };
