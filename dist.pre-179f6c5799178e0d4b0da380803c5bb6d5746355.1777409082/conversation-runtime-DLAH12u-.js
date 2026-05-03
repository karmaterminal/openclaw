import "./session-binding-service-DskOwwNl.js";
import "./binding-registry-CO-Y4Bln.js";
import "./conversation-binding-_-2OLApL.js";
import "./session-Bp9EYMJk.js";
import "./pairing-store-DpPnFAh7.js";
import "./dm-policy-shared-C4gD5QZm.js";
import "./binding-targets-jSVxpM66.js";
import "./binding-routing-DRD6Sm-2.js";
import "./thread-bindings-policy-BJD35wze.js";
import "./pairing-labels-CHh56G1u.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-RXvOWMbK.js");
	return inboundSessionRuntimePromise;
}
async function recordInboundSessionMetaSafe(params) {
	const runtime = await loadInboundSessionRuntime();
	const storePath = runtime.resolveStorePath(params.cfg.session?.store, { agentId: params.agentId });
	try {
		await runtime.recordSessionMetaFromInbound({
			storePath,
			sessionKey: params.sessionKey,
			ctx: params.ctx
		});
	} catch (err) {
		params.onError?.(err);
	}
}
//#endregion
export { recordInboundSessionMetaSafe as t };
