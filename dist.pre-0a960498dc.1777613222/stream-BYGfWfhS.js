import "./provider-stream-shared-CGhK5p6V.js";
import { i as streamWithPayloadPatch } from "./moonshot-thinking-stream-wrappers-D6A9v9aw.js";
//#region extensions/deepseek/stream.ts
function isDeepSeekV4ModelId(modelId) {
	return modelId === "deepseek-v4-flash" || modelId === "deepseek-v4-pro";
}
function isDisabledThinkingLevel(thinkingLevel) {
	const normalized = typeof thinkingLevel === "string" ? thinkingLevel.toLowerCase() : "";
	return normalized === "off" || normalized === "none";
}
function resolveDeepSeekReasoningEffort(thinkingLevel) {
	return thinkingLevel === "xhigh" || thinkingLevel === "max" ? "max" : "high";
}
function stripDeepSeekReasoningContent(payload) {
	if (!Array.isArray(payload.messages)) return;
	for (const message of payload.messages) {
		if (!message || typeof message !== "object") continue;
		delete message.reasoning_content;
	}
}
function createDeepSeekV4ThinkingWrapper(baseStreamFn, thinkingLevel) {
	if (!baseStreamFn) return;
	const underlying = baseStreamFn;
	return (model, context, options) => {
		if (model.provider !== "deepseek" || !isDeepSeekV4ModelId(model.id)) return underlying(model, context, options);
		return streamWithPayloadPatch(underlying, model, context, options, (payload) => {
			if (isDisabledThinkingLevel(thinkingLevel)) {
				payload.thinking = { type: "disabled" };
				delete payload.reasoning_effort;
				delete payload.reasoning;
				stripDeepSeekReasoningContent(payload);
				return;
			}
			payload.thinking = { type: "enabled" };
			payload.reasoning_effort = resolveDeepSeekReasoningEffort(thinkingLevel);
		});
	};
}
//#endregion
export { createDeepSeekV4ThinkingWrapper as t };
