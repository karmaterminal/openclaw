import { r as parseStrictNonNegativeInteger } from "./parse-finite-number-ZzHtJU1g.js";
import fs from "node:fs";
//#region src/config/cache-utils.ts
function resolveCacheTtlMs(params) {
	const { envValue, defaultTtlMs } = params;
	if (envValue) {
		const parsed = parseStrictNonNegativeInteger(envValue);
		if (parsed !== void 0) return parsed;
	}
	return defaultTtlMs;
}
function isCacheEnabled(ttlMs) {
	return ttlMs > 0;
}
function resolveCacheNumeric(value) {
	return typeof value === "function" ? value() : value;
}
function resolvePruneIntervalMs(ttlMs, pruneIntervalMs) {
	if (typeof pruneIntervalMs === "function") return Math.max(0, Math.floor(pruneIntervalMs(ttlMs)));
	if (typeof pruneIntervalMs === "number") return Math.max(0, Math.floor(pruneIntervalMs));
	return ttlMs;
}
function isCacheEntryExpired(storedAt, now, ttlMs) {
	return now - storedAt > ttlMs;
}
function createExpiringMapCache(options) {
	const cache = /* @__PURE__ */ new Map();
	const now = options.clock ?? (() => Date.now());
	let lastPruneAt = 0;
	function getTtlMs() {
		return Math.max(0, Math.floor(resolveCacheNumeric(options.ttlMs)));
	}
	function maybePruneExpiredEntries(nowMs, ttlMs) {
		if (!isCacheEnabled(ttlMs)) return;
		if (nowMs - lastPruneAt < resolvePruneIntervalMs(ttlMs, options.pruneIntervalMs)) return;
		for (const [key, entry] of cache.entries()) if (isCacheEntryExpired(entry.storedAt, nowMs, ttlMs)) cache.delete(key);
		lastPruneAt = nowMs;
	}
	return {
		get: (key) => {
			const ttlMs = getTtlMs();
			if (!isCacheEnabled(ttlMs)) return;
			const nowMs = now();
			maybePruneExpiredEntries(nowMs, ttlMs);
			const entry = cache.get(key);
			if (!entry) return;
			if (isCacheEntryExpired(entry.storedAt, nowMs, ttlMs)) {
				cache.delete(key);
				return;
			}
			return entry.value;
		},
		set: (key, value) => {
			const ttlMs = getTtlMs();
			if (!isCacheEnabled(ttlMs)) return;
			const nowMs = now();
			maybePruneExpiredEntries(nowMs, ttlMs);
			cache.set(key, {
				storedAt: nowMs,
				value
			});
		},
		delete: (key) => {
			cache.delete(key);
		},
		clear: () => {
			cache.clear();
			lastPruneAt = 0;
		},
		keys: () => [...cache.keys()],
		size: () => cache.size,
		pruneExpired: () => {
			const ttlMs = getTtlMs();
			if (!isCacheEnabled(ttlMs)) return;
			const nowMs = now();
			for (const [key, entry] of cache.entries()) if (isCacheEntryExpired(entry.storedAt, nowMs, ttlMs)) cache.delete(key);
			lastPruneAt = nowMs;
		}
	};
}
function getFileStatSnapshot(filePath) {
	try {
		const stats = fs.statSync(filePath);
		return {
			mtimeMs: stats.mtimeMs,
			sizeBytes: stats.size
		};
	} catch {
		return;
	}
}
//#endregion
//#region src/config/sessions/store-cache.ts
const DEFAULT_SESSION_STORE_TTL_MS = 45e3;
const SESSION_STORE_CACHE = createExpiringMapCache({ ttlMs: getSessionStoreTtl });
const SESSION_STORE_SERIALIZED_CACHE = createExpiringMapCache({ ttlMs: getSessionStoreTtl });
function cloneSessionStoreRecord(store, serialized) {
	return JSON.parse(serialized ?? JSON.stringify(store));
}
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
	return cloneSessionStoreRecord(cached.store, cached.serialized);
}
function writeSessionStoreCache(params) {
	SESSION_STORE_CACHE.set(params.storePath, {
		store: params.serialized === void 0 ? cloneSessionStoreRecord(params.store) : params.store,
		mtimeMs: params.mtimeMs,
		sizeBytes: params.sizeBytes,
		serialized: params.serialized
	});
}
//#endregion
export { isSessionStoreCacheEnabled as a, writeSessionStoreCache as c, isCacheEnabled as d, resolveCacheTtlMs as f, getSerializedSessionStore as i, createExpiringMapCache as l, cloneSessionStoreRecord as n, readSessionStoreCache as o, dropSessionStoreObjectCache as r, setSerializedSessionStore as s, clearSessionStoreCaches as t, getFileStatSnapshot as u };
