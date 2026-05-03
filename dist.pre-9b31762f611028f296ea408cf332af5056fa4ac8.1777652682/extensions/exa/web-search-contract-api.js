import { t as createExaWebSearchProviderBase } from "../../exa-web-search-provider.shared-Bx3l8jvj.js";
//#region extensions/exa/web-search-contract-api.ts
function createExaWebSearchProvider() {
	return {
		...createExaWebSearchProviderBase(),
		createTool: () => null
	};
}
//#endregion
export { createExaWebSearchProvider };
