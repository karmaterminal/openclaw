import { t as createExaWebSearchProviderBase } from "../../exa-web-search-provider.shared-Dxra8wql.js";
//#region extensions/exa/web-search-contract-api.ts
function createExaWebSearchProvider() {
	return {
		...createExaWebSearchProviderBase(),
		createTool: () => null
	};
}
//#endregion
export { createExaWebSearchProvider };
