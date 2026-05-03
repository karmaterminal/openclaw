import { t as applyAnthropicEphemeralCacheControlMarkers } from "./anthropic-payload-policy-DCY2mD_d.js";
import { r as hasCopilotVisionInput, t as buildCopilotDynamicHeaders } from "./copilot-dynamic-headers-CQIVDyZ0.js";
import "./provider-stream-shared-CtbEGrd3.js";
import { i as streamWithPayloadPatch } from "./moonshot-thinking-stream-wrappers-W33Eaioh.js";
import { n as rewriteCopilotResponsePayloadConnectionBoundIds } from "./connection-bound-ids-CHspi4HW.js";
import { streamSimple } from "@mariozechner/pi-ai";
//#region extensions/github-copilot/stream.ts
function patchOnPayloadResult(result) {
	if (result && typeof result === "object" && "then" in result) return Promise.resolve(result).then((next) => {
		rewriteCopilotResponsePayloadConnectionBoundIds(next);
		return next;
	});
	rewriteCopilotResponsePayloadConnectionBoundIds(result);
	return result;
}
function wrapCopilotAnthropicStream(baseStreamFn) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		if (model.provider !== "github-copilot" || model.api !== "anthropic-messages") return underlying(model, context, options);
		return streamWithPayloadPatch(underlying, model, context, {
			...options,
			headers: {
				...buildCopilotDynamicHeaders({
					messages: context.messages,
					hasImages: hasCopilotVisionInput(context.messages)
				}),
				...options?.headers
			}
		}, applyAnthropicEphemeralCacheControlMarkers);
	};
}
function wrapCopilotOpenAIResponsesStream(baseStreamFn) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => {
		if (model.provider !== "github-copilot" || model.api !== "openai-responses") return underlying(model, context, options);
		const originalOnPayload = options?.onPayload;
		return underlying(model, context, {
			...options,
			onPayload: (payload, payloadModel) => {
				rewriteCopilotResponsePayloadConnectionBoundIds(payload);
				return patchOnPayloadResult(originalOnPayload?.(payload, payloadModel));
			}
		});
	};
}
function wrapCopilotProviderStream(ctx) {
	return wrapCopilotOpenAIResponsesStream(wrapCopilotAnthropicStream(ctx.streamFn));
}
//#endregion
export { wrapCopilotOpenAIResponsesStream as n, wrapCopilotProviderStream as r, wrapCopilotAnthropicStream as t };
