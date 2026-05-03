import { t as enablePluginInConfig } from "./provider-enable-config-DSJNawml.js";
import { t as createBaseWebSearchProviderContractFields } from "./provider-web-search-contract-fields-CfBM9H10.js";
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
