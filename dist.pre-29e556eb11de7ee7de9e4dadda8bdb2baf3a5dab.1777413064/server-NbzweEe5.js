import { t as truncateCloseReason } from "./close-reason-zh6po7Q3.js";
//#region src/gateway/server.ts
async function loadServerImpl() {
	return await import("./server.impl-CxDnzTbH.js");
}
async function startGatewayServer(...args) {
	return await (await loadServerImpl()).startGatewayServer(...args);
}
async function __resetModelCatalogCacheForTest() {
	(await loadServerImpl()).__resetModelCatalogCacheForTest();
}
//#endregion
export { __resetModelCatalogCacheForTest, startGatewayServer, truncateCloseReason };
