import { n as readSessionUpdatedAt } from "./store-COeaE7A7.js";
import "./sessions-THKm0e_w.js";
import { u as resolveStorePath } from "./paths-D6msg0S1.js";
import { a as resolveEnvelopeFormatOptions } from "./envelope-CW3I8HR8.js";
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
