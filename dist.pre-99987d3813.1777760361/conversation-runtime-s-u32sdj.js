import "./session-binding-service-CyE0msFO.js";
import "./binding-registry-DDVDIMWP.js";
import "./conversation-binding-Clz6DgP9.js";
import "./session-D3GwCPwf.js";
import "./pairing-store-Dn7XE0de.js";
import "./dm-policy-shared-D7Cgibny.js";
import "./binding-targets-DFtzWpZL.js";
import "./binding-routing-C8FQd7j6.js";
import "./thread-bindings-policy-BYJ_3uNp.js";
import "./pairing-labels-DYCuxi1s.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-CUx_ggit.js");
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
