import { r as normalizeProviderId } from "./provider-id-Ct2qVXr0.js";
import "./provider-model-shared-BupW1wb7.js";
import "./provider-stream-shared-D5BvSWI3.js";
import { i as streamWithPayloadPatch } from "./moonshot-thinking-stream-wrappers-DgcmkMib.js";
import { t as isFireworksKimiModelId } from "./model-id-C3z6FRk4.js";
import { streamSimple } from "@mariozechner/pi-ai";
//#region extensions/fireworks/stream.ts
function isFireworksProviderId(providerId) {
	const normalized = normalizeProviderId(providerId);
	return normalized === "fireworks" || normalized === "fireworks-ai";
}
function createFireworksKimiThinkingDisabledWrapper(baseStreamFn) {
	const underlying = baseStreamFn ?? streamSimple;
	return (model, context, options) => streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
		payloadObj.thinking = { type: "disabled" };
		delete payloadObj.reasoning;
		delete payloadObj.reasoning_effort;
		delete payloadObj.reasoningEffort;
	});
}
function wrapFireworksProviderStream(ctx) {
	if (!isFireworksProviderId(ctx.provider) || ctx.model?.api !== "openai-completions" || !isFireworksKimiModelId(ctx.modelId)) return;
	return createFireworksKimiThinkingDisabledWrapper(ctx.streamFn);
}
//#endregion
export { wrapFireworksProviderStream as n, createFireworksKimiThinkingDisabledWrapper as t };
