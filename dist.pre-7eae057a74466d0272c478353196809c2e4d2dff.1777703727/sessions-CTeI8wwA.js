import { a as loadConfig } from "./io-BAiFlY00.js";
import { i as resolveMainSessionKey } from "./main-session-CIzfmmGG.js";
import "./combined-store-gateway-CkkdsQIa.js";
import { u as resolveStorePath } from "./paths-aVTuLlts.js";
import { t as deliveryContextFromSession } from "./delivery-context.shared-DfK3EqOH.js";
import { t as loadSessionStore } from "./store-load-Z1IBOlxt.js";
import "./targets-tkuUY4DL.js";
import "./store-Cf_mjUkP.js";
import "./reset-HKpb4_uS.js";
import "./session-key-cafqljAh.js";
import "./transcript-DGj408mP.js";
import { t as parseSessionThreadInfo } from "./thread-info-BF4Fx9om.js";
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
