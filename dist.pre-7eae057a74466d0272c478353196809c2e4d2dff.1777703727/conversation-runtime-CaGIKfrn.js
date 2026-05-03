import "./session-binding-service-BFKwvZlA.js";
import "./binding-registry-DmLbMKFG.js";
import "./conversation-binding-DDk7fQkn.js";
import "./session-CG4EqAXg.js";
import "./pairing-store-clcQq7Sw.js";
import "./dm-policy-shared-DYG5WBEw.js";
import "./binding-targets-NbUrGhqa.js";
import "./binding-routing-BADqTEm-.js";
import "./thread-bindings-policy-CDh_YMGH.js";
import "./pairing-labels-B_Capi9j.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-CvBF0ikC.js");
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
