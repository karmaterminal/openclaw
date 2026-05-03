import { r as isGpt5ModelId } from "./gpt5-prompt-overlay-z9yjwG2h.js";
import { r as isSilentReplyPayloadText } from "./tokens-fh59FP1B.js";
//#region src/agents/pi-embedded-runner/result-fallback-classifier.ts
const EMPTY_TERMINAL_REPLY_RE = /Agent couldn't generate a response/i;
const PLAN_ONLY_TERMINAL_REPLY_RE = /Agent stopped after repeated plan-only turns/i;
function isEmbeddedPiRunResult(value) {
	return Boolean(value && typeof value === "object" && "meta" in value && value.meta && typeof value.meta === "object");
}
function hasVisibleNonErrorPayload(result) {
	return (result.payloads ?? []).some((payload) => {
		if (!payload || payload.isError === true || payload.isReasoning === true) return false;
		return (typeof payload.text === "string" ? payload.text.trim() : "").length > 0 || Boolean(payload.mediaUrl) || Array.isArray(payload.mediaUrls) && payload.mediaUrls.length > 0;
	});
}
function hasOutboundSideEffects(result) {
	return result.didSendViaMessagingTool === true || (result.messagingToolSentTexts?.length ?? 0) > 0 || (result.messagingToolSentMediaUrls?.length ?? 0) > 0 || (result.messagingToolSentTargets?.length ?? 0) > 0 || (result.successfulCronAdds ?? 0) > 0 || (result.meta.toolSummary?.calls ?? 0) > 0;
}
function hasDeliberateSilentTerminalReply(result) {
	return [result.meta.finalAssistantRawText, result.meta.finalAssistantVisibleText].some((text) => typeof text === "string" && isSilentReplyPayloadText(text));
}
function classifyHarnessResult(params) {
	switch (params.result.meta.agentHarnessResultClassification) {
		case "empty": return {
			message: `${params.provider}/${params.model} ended without a visible assistant reply`,
			reason: "format",
			code: "empty_result"
		};
		case "reasoning-only": return {
			message: `${params.provider}/${params.model} ended with reasoning only`,
			reason: "format",
			code: "reasoning_only_result"
		};
		case "planning-only": return {
			message: `${params.provider}/${params.model} exhausted plan-only retries without taking action`,
			reason: "format",
			code: "planning_only_result"
		};
		default: return null;
	}
}
function classifyEmbeddedPiRunResultForModelFallback(params) {
	if (!isEmbeddedPiRunResult(params.result)) return null;
	if (params.result.meta.aborted || params.hasDirectlySentBlockReply === true || params.hasBlockReplyPipelineOutput === true || hasVisibleNonErrorPayload(params.result)) return null;
	if (hasOutboundSideEffects(params.result)) return null;
	const harnessClassification = classifyHarnessResult({
		provider: params.provider,
		model: params.model,
		result: params.result
	});
	if (harnessClassification) return harnessClassification;
	const payloads = params.result.payloads ?? [];
	const errorText = payloads.filter((payload) => payload?.isError === true).map((payload) => typeof payload.text === "string" ? payload.text : "").join("\n");
	if (EMPTY_TERMINAL_REPLY_RE.test(errorText)) return {
		message: `${params.provider}/${params.model} ended with an incomplete terminal response`,
		reason: "format",
		code: "incomplete_result"
	};
	if (!isGpt5ModelId(params.model)) return null;
	if (payloads.length === 0 && hasDeliberateSilentTerminalReply(params.result)) return null;
	if (payloads.length === 0) return {
		message: `${params.provider}/${params.model} ended without a visible assistant reply`,
		reason: "format",
		code: "empty_result"
	};
	if (payloads.every((payload) => payload.isReasoning === true)) return {
		message: `${params.provider}/${params.model} ended with reasoning only`,
		reason: "format",
		code: "reasoning_only_result"
	};
	if (PLAN_ONLY_TERMINAL_REPLY_RE.test(errorText)) return {
		message: `${params.provider}/${params.model} exhausted plan-only retries without taking action`,
		reason: "format",
		code: "planning_only_result"
	};
	if (!EMPTY_TERMINAL_REPLY_RE.test(errorText)) return null;
	return {
		message: `${params.provider}/${params.model} ended with an incomplete terminal response`,
		reason: "format",
		code: "incomplete_result"
	};
}
//#endregion
export { classifyEmbeddedPiRunResultForModelFallback as t };
