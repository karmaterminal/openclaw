import { i as resolveCacheTtlMs, r as isCacheEnabled, t as createExpiringMapCache } from "./cache-utils-BGj7Si0m.js";
//#region src/config/sessions/store-cache.ts
const DEFAULT_SESSION_STORE_TTL_MS = 45e3;
const SESSION_STORE_CACHE = createExpiringMapCache({ ttlMs: getSessionStoreTtl });
const SESSION_STORE_SERIALIZED_CACHE = createExpiringMapCache({ ttlMs: getSessionStoreTtl });
function getSessionStoreTtl() {
	return resolveCacheTtlMs({
		envValue: process.env.OPENCLAW_SESSION_CACHE_TTL_MS,
		defaultTtlMs: DEFAULT_SESSION_STORE_TTL_MS
	});
}
function isSessionStoreCacheEnabled() {
	return isCacheEnabled(getSessionStoreTtl());
}
function clearSessionStoreCaches() {
	SESSION_STORE_CACHE.clear();
	SESSION_STORE_SERIALIZED_CACHE.clear();
}
function invalidateSessionStoreCache(storePath) {
	SESSION_STORE_CACHE.delete(storePath);
	SESSION_STORE_SERIALIZED_CACHE.delete(storePath);
}
function getSerializedSessionStore(storePath) {
	return SESSION_STORE_SERIALIZED_CACHE.get(storePath);
}
function setSerializedSessionStore(storePath, serialized) {
	if (serialized === void 0) {
		SESSION_STORE_SERIALIZED_CACHE.delete(storePath);
		return;
	}
	SESSION_STORE_SERIALIZED_CACHE.set(storePath, serialized);
}
function dropSessionStoreObjectCache(storePath) {
	SESSION_STORE_CACHE.delete(storePath);
	SESSION_STORE_SERIALIZED_CACHE.delete(storePath);
}
function readSessionStoreCache(params) {
	const cached = SESSION_STORE_CACHE.get(params.storePath);
	if (!cached) return null;
	if (params.mtimeMs !== cached.mtimeMs || params.sizeBytes !== cached.sizeBytes) {
		invalidateSessionStoreCache(params.storePath);
		return null;
	}
	return structuredClone(cached.store);
}
function writeSessionStoreCache(params) {
	SESSION_STORE_CACHE.set(params.storePath, {
		store: structuredClone(params.store),
		mtimeMs: params.mtimeMs,
		sizeBytes: params.sizeBytes
	});
}
//#endregion
export { readSessionStoreCache as a, isSessionStoreCacheEnabled as i, dropSessionStoreObjectCache as n, setSerializedSessionStore as o, getSerializedSessionStore as r, writeSessionStoreCache as s, clearSessionStoreCaches as t };
