import { n as readSessionUpdatedAt } from "./store-YSRCrOf6.js";
import "./sessions-CD6GeuLj.js";
import { u as resolveStorePath } from "./paths-C9Qq8LIv.js";
import { a as resolveEnvelopeFormatOptions } from "./envelope-C8vEbSJB.js";
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
