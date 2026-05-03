import "./session-binding-service-BFKwvZlA.js";
import "./binding-registry-B3IhZ52J.js";
import "./conversation-binding-Dftvj4R_.js";
import "./session-Dd2qgqX5.js";
import "./pairing-store-CphFkf8Y.js";
import "./dm-policy-shared-Ciwm0oRz.js";
import "./binding-targets-DGeMD9xm.js";
import "./binding-routing-yuLwi2CC.js";
import "./thread-bindings-policy-BJtpkwNK.js";
import "./pairing-labels-DDLCv239.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-Cvx5sOdx.js");
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
