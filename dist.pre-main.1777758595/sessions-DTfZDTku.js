import { i as getRuntimeConfig } from "./io-DTtpq82f.js";
import { i as resolveMainSessionKey } from "./main-session-DImA1KnV.js";
import "./combined-store-gateway-Bud9w99a.js";
import { a as resolveSessionFilePathOptions, i as resolveSessionFilePath, u as resolveStorePath } from "./paths-BCOWYnec.js";
import { t as deliveryContextFromSession } from "./delivery-context.shared-DU5_-FxH.js";
import { t as loadSessionStore } from "./store-load-CDajuL7y.js";
import "./targets-BpkCD7v1.js";
import "./store-APN60wqF.js";
import "./reset-BlY-VzXZ.js";
import "./session-key-CwFwjoeJ.js";
import { o as parseSessionThreadInfo } from "./transcript-y-FZWM2K.js";
import fs from "node:fs";
//#region src/config/sessions/main-session.runtime.ts
function resolveMainSessionKeyFromConfig() {
	return resolveMainSessionKey(getRuntimeConfig());
}
//#endregion
//#region src/config/sessions/lifecycle.ts
function resolveTimestamp(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function parseTimestampMs(value) {
	if (typeof value === "number") return resolveTimestamp(value);
	if (typeof value !== "string" || !value.trim()) return;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : void 0;
}
function readFirstLine(filePath) {
	try {
		const fd = fs.openSync(filePath, "r");
		try {
			const buffer = Buffer.alloc(8192);
			const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
			if (bytesRead <= 0) return;
			const chunk = buffer.subarray(0, bytesRead).toString("utf8");
			const newline = chunk.indexOf("\n");
			return newline >= 0 ? chunk.slice(0, newline) : chunk;
		} finally {
			fs.closeSync(fd);
		}
	} catch {
		return;
	}
}
function readSessionHeaderStartedAtMs(params) {
	const sessionId = params.entry?.sessionId?.trim();
	if (!sessionId) return;
	const pathOptions = params.pathOptions ?? resolveSessionFilePathOptions({
		agentId: params.agentId,
		storePath: params.storePath
	});
	let sessionFile;
	try {
		sessionFile = resolveSessionFilePath(sessionId, params.entry, pathOptions);
	} catch {
		return;
	}
	const firstLine = readFirstLine(sessionFile);
	if (!firstLine) return;
	try {
		const header = JSON.parse(firstLine);
		if (header.type !== "session") return;
		if (typeof header.id === "string" && header.id.trim() && header.id !== sessionId) return;
		return parseTimestampMs(header.timestamp);
	} catch {
		return;
	}
}
function resolveSessionLifecycleTimestamps(params) {
	const entry = params.entry;
	if (!entry) return {};
	return {
		sessionStartedAt: resolveTimestamp(entry.sessionStartedAt) ?? readSessionHeaderStartedAtMs({
			entry,
			agentId: params.agentId,
			storePath: params.storePath,
			pathOptions: params.pathOptions
		}),
		lastInteractionAt: resolveTimestamp(entry.lastInteractionAt)
	};
}
//#endregion
//#region src/config/sessions/delivery-info.ts
function extractDeliveryInfo(sessionKey) {
	const hasRoutableDeliveryContext = (context) => Boolean(context?.channel && context?.to);
	const { baseSessionKey, threadId } = parseSessionThreadInfo(sessionKey);
	if (!sessionKey || !baseSessionKey) return {
		deliveryContext: void 0,
		threadId
	};
	let deliveryContext;
	try {
		const store = loadSessionStore(resolveStorePath(getRuntimeConfig().session?.store));
		let entry = store[sessionKey];
		let storedDeliveryContext = deliveryContextFromSession(entry);
		if (!hasRoutableDeliveryContext(storedDeliveryContext) && baseSessionKey !== sessionKey) {
			entry = store[baseSessionKey];
			storedDeliveryContext = deliveryContextFromSession(entry);
		}
		if (hasRoutableDeliveryContext(storedDeliveryContext)) deliveryContext = {
			channel: storedDeliveryContext.channel,
			to: storedDeliveryContext.to,
			accountId: storedDeliveryContext.accountId,
			threadId: storedDeliveryContext.threadId != null ? String(storedDeliveryContext.threadId) : void 0
		};
	} catch {}
	return {
		deliveryContext,
		threadId
	};
}
//#endregion
export { resolveMainSessionKeyFromConfig as i, readSessionHeaderStartedAtMs as n, resolveSessionLifecycleTimestamps as r, extractDeliveryInfo as t };
