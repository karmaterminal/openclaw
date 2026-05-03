import { i as getRuntimeConfig } from "./io-CBRjt33P.js";
import "./config-BjiV0z87.js";
import { r as loadModelCatalog, s as resetModelCatalogCacheForTest } from "./model-catalog-CyQ5zC3m.js";
//#region src/gateway/server-model-catalog.ts
function __resetModelCatalogCacheForTest() {
	resetModelCatalogCacheForTest();
}
async function loadGatewayModelCatalog(params) {
	return await loadModelCatalog({ config: (params?.getConfig ?? getRuntimeConfig)() });
}
//#endregion
export { loadGatewayModelCatalog as n, __resetModelCatalogCacheForTest as t };
