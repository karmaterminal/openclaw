import { n as AcpRuntimeError, r as isAcpRuntimeError } from "../errors-B87_vHT9.js";
import { a as unregisterAcpRuntimeBackend, i as requireAcpRuntimeBackend, n as getAcpRuntimeBackend, r as registerAcpRuntimeBackend, t as __testing$1 } from "../registry-B8bmdUfS.js";
import { n as getAcpSessionManager, t as __testing$2 } from "../manager-BxBU1JKt.js";
import { n as readAcpSessionEntry } from "../session-meta-o1PpytVN.js";
import { t as tryDispatchAcpReplyHook } from "../acp-runtime-backend-B1LlFdmv.js";
//#region src/plugin-sdk/acp-runtime.ts
const __testing = new Proxy({}, {
	get(_target, prop, receiver) {
		if (Reflect.has(__testing$2, prop)) return Reflect.get(__testing$2, prop, receiver);
		return Reflect.get(__testing$1, prop, receiver);
	},
	has(_target, prop) {
		return Reflect.has(__testing$2, prop) || Reflect.has(__testing$1, prop);
	},
	ownKeys() {
		return Array.from(new Set([...Reflect.ownKeys(__testing$2), ...Reflect.ownKeys(__testing$1)]));
	},
	getOwnPropertyDescriptor(_target, prop) {
		if (Reflect.has(__testing$2, prop) || Reflect.has(__testing$1, prop)) return {
			configurable: true,
			enumerable: true
		};
	}
});
//#endregion
export { AcpRuntimeError, __testing, getAcpRuntimeBackend, getAcpSessionManager, isAcpRuntimeError, readAcpSessionEntry, registerAcpRuntimeBackend, requireAcpRuntimeBackend, tryDispatchAcpReplyHook, unregisterAcpRuntimeBackend };
