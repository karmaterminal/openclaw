import "./errors-Jbvi20TW.js";
import "./env-CcBRbhYW.js";
import "./file-lock-CkPKmAyO.js";
import "./system-events-Cg3E-qpj.js";
import "./ssrf-8eMK8Dvc.js";
import "./fs-safe-BR8l9k2p.js";
import "./undici-global-dispatcher-D8hGe3AM.js";
import "./fetch-guard-CyazlQiu.js";
import "./retry-BLYeyYK_.js";
import "./exec-approvals-CGvrumYQ.js";
import "./heartbeat-summary-C5hALghw.js";
import "./proxy-fetch-C1inHy-b.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-wqMqDNov.js";
import "./secret-file-DB_8Vsb0.js";
import "./http-body-BgcenmrU.js";
import "./exec-approval-reply-CLbnGT1U.js";
import "./approval-native-runtime-UExgL5NT.js";
import "./exec-approval-command-display-D4Jabxn2.js";
import "./exec-approval-session-target-C4IaBNbz.js";
import "./heartbeat-visibility-BTTpip5y.js";
import "./transport-ready-CMA4Uv38.js";
import "./identity-wCzoCfVG.js";
import "./retry-policy-CuLJPQoB.js";
import "./ssrf-policy-0KQNa5MO.js";
//#region src/plugin-sdk/infra-runtime.ts
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-CctJ5kev.js");
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
