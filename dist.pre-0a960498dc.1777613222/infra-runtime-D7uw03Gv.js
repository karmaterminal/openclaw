import "./errors-Jbvi20TW.js";
import "./tmp-openclaw-dir-CWQcmOLf.js";
import "./env-DM4mWVZJ.js";
import "./file-lock-CkPKmAyO.js";
import "./heartbeat-summary-BtMTWWUE.js";
import "./ssrf-Bg0Ww888.js";
import "./undici-global-dispatcher-DKeDDYkU.js";
import "./fetch-guard-5Cmu0jDX.js";
import "./fs-safe-C6LQEdgq.js";
import "./exec-approvals-C2hB7k4d.js";
import "./proxy-fetch-DHlJZ-uL.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-B6vQfob4.js";
import "./system-events-DV5kbtQJ.js";
import "./retry-Bj9pu2qB.js";
import "./secret-file-CHYb9iSl.js";
import "./http-body-DDG39e3E.js";
import "./exec-approval-reply-DNPJ0YYI.js";
import "./approval-native-runtime-C5ExH6AH.js";
import "./exec-approval-command-display-6-Gq8g38.js";
import "./exec-approval-session-target-BYZyRGia.js";
import "./heartbeat-visibility-Bqihl9je.js";
import "./transport-ready-wmocZ7Ft.js";
import "./identity-DkN-K9O1.js";
import "./retry-policy-rUBg4FaA.js";
import "./ssrf-policy-4hVeW7dY.js";
//#region src/plugin-sdk/infra-runtime.ts
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-lZk7LYvD.js");
	return await outboundDeliverRuntimePromise;
}
async function drainPendingDeliveries(opts) {
	const deliver = opts.deliver ?? (await loadOutboundDeliverRuntime()).deliverOutboundPayloads;
	await drainPendingDeliveries$1({
		...opts,
		deliver
	});
}
//#endregion
export { drainPendingDeliveries as t };
