import "./session-binding-service-DFVUkX4d.js";
import "./binding-registry-Dn2B9G2h.js";
import "./conversation-binding-MkP7TyTv.js";
import "./session-CESQy2y1.js";
import "./pairing-store-BySps0XL.js";
import "./dm-policy-shared-v2D_A37H.js";
import "./binding-targets-BoPYg-3G.js";
import "./binding-routing-B0vnKIBc.js";
import "./thread-bindings-policy-_uwXx0Qf.js";
import "./pairing-labels-BBf2pOJu.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-xnAEQU1D.js");
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
