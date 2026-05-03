import "./session-binding-service-ii4VW_6o.js";
import "./binding-registry-BFwnGqTr.js";
import "./conversation-binding-TfOuSzmZ.js";
import "./session-BOTFjGuR.js";
import "./pairing-store-0WlWJwl7.js";
import "./dm-policy-shared-Bf6mvNz-.js";
import "./binding-targets-a7u8m_ZE.js";
import "./binding-routing-8FwzR7GC.js";
import "./thread-bindings-policy-CZgONwMa.js";
import "./pairing-labels-CmpsEsW2.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-_KUdjZHk.js");
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
