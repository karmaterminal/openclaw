import { a as loadConfig } from "./io-CgtDzW1a.js";
import "./store-YSRCrOf6.js";
import { i as resolveMainSessionKey } from "./main-session-DlEMU4Ot.js";
import { u as resolveStorePath } from "./paths-C9Qq8LIv.js";
import "./reset-BUlbMwCL.js";
import "./session-key-CjFRjPG9.js";
import { t as deliveryContextFromSession } from "./delivery-context.shared-Cjcgi24o.js";
import { t as loadSessionStore } from "./store-load-DghVySJ7.js";
import "./transcript-DGwh8iNr.js";
import { t as parseSessionThreadInfo } from "./thread-info-C8F9QXHt.js";
import "./targets-DvmOptgv.js";
//#region src/config/sessions/main-session.runtime.ts
function resolveMainSessionKeyFromConfig() {
	return resolveMainSessionKey(loadConfig());
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
		const store = loadSessionStore(resolveStorePath(loadConfig().session?.store));
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
export { resolveMainSessionKeyFromConfig as n, extractDeliveryInfo as t };
