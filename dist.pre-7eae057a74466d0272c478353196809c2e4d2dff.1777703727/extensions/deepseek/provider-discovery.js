import { t as buildDeepSeekProvider } from "../../provider-catalog-Lc_6KISi.js";
//#region extensions/deepseek/provider-discovery.ts
const deepSeekProviderDiscovery = {
	id: "deepseek",
	label: "DeepSeek",
	docsPath: "/providers/deepseek",
	auth: [],
	staticCatalog: {
		order: "simple",
		run: async () => ({ provider: buildDeepSeekProvider() })
	}
};
//#endregion
export { deepSeekProviderDiscovery, deepSeekProviderDiscovery as default };
