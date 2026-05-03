import { u as resolveStorePath } from "./paths-aVTuLlts.js";
import { n as readSessionUpdatedAt } from "./store-Cf_mjUkP.js";
import "./sessions-CTeI8wwA.js";
import { a as resolveEnvelopeFormatOptions } from "./envelope-BNyxP4l7.js";
//#region src/channels/session-envelope.ts
function resolveInboundSessionEnvelopeContext(params) {
	const storePath = resolveStorePath(params.cfg.session?.store, { agentId: params.agentId });
	return {
		storePath,
		envelopeOptions: resolveEnvelopeFormatOptions(params.cfg),
		previousTimestamp: readSessionUpdatedAt({
			storePath,
			sessionKey: params.sessionKey
		})
	};
}
//#endregion
export { resolveInboundSessionEnvelopeContext as t };
