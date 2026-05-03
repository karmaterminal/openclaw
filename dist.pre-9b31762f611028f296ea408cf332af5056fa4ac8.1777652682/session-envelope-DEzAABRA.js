import "./sessions-CQdlpJUR.js";
import { u as resolveStorePath } from "./paths-DOSS0HMP.js";
import { n as readSessionUpdatedAt } from "./store-BD0Vlvaq.js";
import { a as resolveEnvelopeFormatOptions } from "./envelope-CZaqnWho.js";
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
