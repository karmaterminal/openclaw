import { a as loadConfig } from "./io-CBRjt33P.js";
import "./store-COeaE7A7.js";
import { i as resolveMainSessionKey } from "./main-session-B78uK7Dt.js";
import { u as resolveStorePath } from "./paths-D6msg0S1.js";
import "./reset-gyijnoip.js";
import "./session-key-BZJPY5Zs.js";
import { t as deliveryContextFromSession } from "./delivery-context.shared-j5hC5qb1.js";
import { t as loadSessionStore } from "./store-load-Bi019EcE.js";
import "./transcript-DTxF1v8R.js";
import { t as parseSessionThreadInfo } from "./thread-info-ln-WiDwd.js";
import "./targets-dcrMkLcJ.js";
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
