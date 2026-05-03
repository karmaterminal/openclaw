import { t as truncateCloseReason } from "./close-reason-BWueR-oj.js";
//#region src/gateway/server.ts
async function loadServerImpl() {
	return await import("./server.impl-CXQ2tRiW.js");
}
async function startGatewayServer(...args) {
	return await (await loadServerImpl()).startGatewayServer(...args);
}
async function __resetModelCatalogCacheForTest() {
	(await loadServerImpl()).__resetModelCatalogCacheForTest();
}
//#endregion
export { __resetModelCatalogCacheForTest, startGatewayServer, truncateCloseReason };
