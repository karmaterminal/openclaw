import "./errors-Jbvi20TW.js";
import "./env-CcBRbhYW.js";
import "./file-lock-CkPKmAyO.js";
import "./system-events-Cg3E-qpj.js";
import "./ssrf-BidpExjG.js";
import "./fs-safe-DXglNiK0.js";
import "./undici-global-dispatcher-LU0hItIA.js";
import "./fetch-guard-CGnRnlqc.js";
import "./retry-BZqyJPWH.js";
import "./exec-approvals-DuykPV0F.js";
import "./heartbeat-summary-CEa7adaH.js";
import "./proxy-fetch-C_GQUApm.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-kOk4sY00.js";
import "./secret-file-C8iBdh0Y.js";
import "./http-body-Dhs0DUZa.js";
import "./exec-approval-reply-DN-gsrOY.js";
import "./approval-native-runtime-DOYtBAQt.js";
import "./exec-approval-command-display-BTgxaTZv.js";
import "./exec-approval-session-target-QO31Wo-X.js";
import "./heartbeat-visibility-DiKGmqwT.js";
import "./transport-ready-CMegFZxu.js";
import "./identity-Bc92Hjyl.js";
import "./retry-policy-B2jyqm4l.js";
import "./ssrf-policy-C7B9ULn6.js";
//#region src/plugin-sdk/infra-runtime.ts
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-o8ihvmPV.js");
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
