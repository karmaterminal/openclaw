import "./session-binding-service-_uxH6cqw.js";
import "./binding-registry-DUWVusMa.js";
import "./conversation-binding-DJso9HkO.js";
import "./session-akUbw5NY.js";
import "./pairing-store-BOyTiyUY.js";
import "./dm-policy-shared-BJth4iHD.js";
import "./binding-targets-DBhHjJZm.js";
import "./binding-routing-CwMcHFP_.js";
import "./thread-bindings-policy-DHnmWaCI.js";
import "./pairing-labels-ntKiNYP2.js";
//#region src/channels/session-meta.ts
let inboundSessionRuntimePromise = null;
function loadInboundSessionRuntime() {
	inboundSessionRuntimePromise ??= import("./inbound.runtime-gZZMX0UE.js");
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
