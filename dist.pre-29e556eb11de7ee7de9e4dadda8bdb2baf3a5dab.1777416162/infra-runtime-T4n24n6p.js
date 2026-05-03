import "./errors-Jbvi20TW.js";
import "./env-BgREcPbG.js";
import "./file-lock-CSKcwxlX.js";
import "./heartbeat-summary-BtkRii-E.js";
import "./ssrf-CD_2fLNF.js";
import "./undici-global-dispatcher-C00f4BrA.js";
import "./fetch-guard-CXs9BnMd.js";
import "./fs-safe-oiDsgdG5.js";
import "./exec-approvals-CZzmozBt.js";
import "./proxy-fetch-Oi0l9J8k.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-3eRFHUJ0.js";
import "./system-events-BjB5IdNm.js";
import "./retry-DPXHP2FO.js";
import "./secret-file-CJhEz3SM.js";
import "./http-body-q87N2AgC.js";
import "./exec-approval-reply-ebp3Wua1.js";
import "./approval-native-runtime-Bz3t4Boi.js";
import "./exec-approval-command-display-DbllZxHW.js";
import "./exec-approval-session-target-PmWB5KSF.js";
import "./heartbeat-visibility-DR3ZY7ew.js";
import "./transport-ready-ClN6TU-9.js";
import "./identity-CRGVU3u_.js";
import "./retry-policy-BMnPslrc.js";
import "./ssrf-policy-BjvXpuK0.js";
//#region src/plugin-sdk/infra-runtime.ts
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-BdWMNAVw.js");
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
