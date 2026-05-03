import { t as createDuckDuckGoWebSearchProviderBase } from "../../ddg-search-provider.shared-Cq6GS6KC.js";
//#region extensions/duckduckgo/web-search-contract-api.ts
function createDuckDuckGoWebSearchProvider() {
	return {
		...createDuckDuckGoWebSearchProviderBase(),
		createTool: () => null
	};
}
//#endregion
export { createDuckDuckGoWebSearchProvider };
