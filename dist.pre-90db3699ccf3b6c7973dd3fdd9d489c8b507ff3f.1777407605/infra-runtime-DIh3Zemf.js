import "./errors-CS5wW5eD.js";
import "./tmp-openclaw-dir-CWQcmOLf.js";
import "./env-Bm9OFWXY.js";
import "./file-lock-CrzCLqwC.js";
import "./heartbeat-summary-Bi99g3ud.js";
import "./ssrf-CTA9WgMa.js";
import "./fetch-guard-NDEizKJq.js";
import "./fs-safe-CH-zulhg.js";
import "./exec-approvals-CFEClmo3.js";
import "./proxy-fetch-fataTj-N.js";
import "./undici-global-dispatcher-CFDovg4g.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-CdLuFKIF.js";
import "./system-events-B-8iLjB8.js";
import "./retry-BCw6ad_F.js";
import "./secret-file-Ceekl8PS.js";
import "./http-body-CftN9uFX.js";
import "./exec-approval-reply-LzW_FneM.js";
import "./approval-native-runtime-BBNKTP8k.js";
import "./exec-approval-command-display-CsCDZxE7.js";
import "./exec-approval-session-target-BaFb3wOC.js";
import "./heartbeat-visibility-0SbliaMo.js";
import "./transport-ready-BvXcm0g1.js";
import "./identity-CmwcDkMF.js";
import "./retry-policy-DDAgewtL.js";
import "./ssrf-policy-CxFv5uAl.js";
//#region src/plugin-sdk/infra-runtime.ts
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-CXus64Fy.js");
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
