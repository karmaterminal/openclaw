import "./errors-Jbvi20TW.js";
import "./tmp-openclaw-dir-CWQcmOLf.js";
import "./env-Ddh8dE-m.js";
import "./file-lock-CkaSUEbR.js";
import "./heartbeat-summary-BwV1hxi3.js";
import "./ssrf-vXCRW9rS.js";
import "./undici-global-dispatcher-CSJ4AmVb.js";
import "./fetch-guard-LAmyTYUM.js";
import "./fs-safe-BsNurHhz.js";
import "./exec-approvals-B2scP4BT.js";
import "./proxy-fetch-CEPg-X3_.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-C3xV9Y1O.js";
import "./system-events-zzYXvZSs.js";
import "./retry-CRJDZ9Gh.js";
import "./secret-file-B4gcq3uD.js";
import "./http-body-B24Yv8Dz.js";
import "./exec-approval-reply-BRsfYrP2.js";
import "./approval-native-runtime-DEzcmm3U.js";
import "./exec-approval-command-display-CV8Kcz1M.js";
import "./exec-approval-session-target-JyZuzjF-.js";
import "./heartbeat-visibility-CChHV8ut.js";
import "./transport-ready-BUIiuIWp.js";
import "./identity-B2uMl_3g.js";
import "./retry-policy-CFmmjRLf.js";
import "./ssrf-policy-CYGp1dOP.js";
//#region src/plugin-sdk/infra-runtime.ts
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-B1fXupr2.js");
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
