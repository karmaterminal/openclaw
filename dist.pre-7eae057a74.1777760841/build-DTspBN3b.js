import { n as resolveProviderIdForAuth } from "./provider-auth-aliases-DyEhp0I9.js";
import { r as isGpt5ModelId } from "./gpt5-prompt-overlay-dRy_hvvl.js";
import { F as resolveProviderSystemPromptContribution, tt as resolveProviderFollowupFallbackRoute } from "./provider-runtime-BwXob-b1.js";
import { r as isSilentReplyPayloadText } from "./tokens-DO03xcy8.js";
import { m as resolveSendableOutboundReplyParts } from "./reply-payload-DnFwi8F_.js";
import { Q as resolveTranscriptPolicy } from "./wait-for-idle-before-flush-Sx8pU5uq.js";
import { a as resolvePreparedExtraParams } from "./extra-params-BkbfNWhf.js";
import { a as normalizeProviderToolSchemas, i as logProviderToolSchemaDiagnostics } from "./tool-result-middleware-BA_E8fAr.js";
import { t as normalizeEmbeddedAgentRuntime } from "./runtime-D2ktg8dF.js";
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
	if (!isGpt5ModelId(params.model) || !isEmbeddedPiRunResult(params.result)) return null;
	if (params.result.meta.aborted || params.hasDirectlySentBlockReply === true || params.hasBlockReplyPipelineOutput === true || hasVisibleNonErrorPayload(params.result)) return null;
	if (hasOutboundSideEffects(params.result)) return null;
	const harnessClassification = classifyHarnessResult({
		provider: params.provider,
		model: params.model,
		result: params.result
	});
	if (harnessClassification) return harnessClassification;
	const payloads = params.result.payloads ?? [];
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
	const errorText = payloads.filter((payload) => payload?.isError === true).map((payload) => typeof payload.text === "string" ? payload.text : "").join("\n");
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
//#region src/agents/runtime-plan/auth.ts
const CODEX_HARNESS_AUTH_PROVIDER = "openai-codex";
function resolveHarnessAuthProvider(params) {
	const harnessId = normalizeEmbeddedAgentRuntime(params.harnessId);
	const runtime = normalizeEmbeddedAgentRuntime(params.harnessRuntime);
	return harnessId === "codex" || runtime === "codex" ? CODEX_HARNESS_AUTH_PROVIDER : void 0;
}
function buildAgentRuntimeAuthPlan(params) {
	const aliasLookupParams = {
		config: params.config,
		workspaceDir: params.workspaceDir
	};
	const providerForAuth = resolveProviderIdForAuth(params.provider, aliasLookupParams);
	const authProfileProviderForAuth = resolveProviderIdForAuth(params.authProfileProvider ?? params.provider, aliasLookupParams);
	const harnessAuthProvider = resolveHarnessAuthProvider(params);
	const harnessProviderForAuth = harnessAuthProvider ? resolveProviderIdForAuth(harnessAuthProvider, aliasLookupParams) : void 0;
	const harnessCanForwardProfile = params.allowHarnessAuthProfileForwarding !== false && harnessProviderForAuth && harnessProviderForAuth === authProfileProviderForAuth;
	const canForwardProfile = providerForAuth === authProfileProviderForAuth || harnessCanForwardProfile;
	return {
		providerForAuth,
		authProfileProviderForAuth,
		...harnessProviderForAuth ? { harnessAuthProvider: harnessProviderForAuth } : {},
		...canForwardProfile ? { forwardedAuthProfileId: params.sessionAuthProfileId } : {}
	};
}
//#endregion
//#region src/agents/runtime-plan/build.ts
function formatResolvedRef(params) {
	return `${params.provider}/${params.modelId}`;
}
function hasMedia(payload) {
	return resolveSendableOutboundReplyParts(payload).hasMedia;
}
function buildAgentRuntimeDeliveryPlan(params) {
	return {
		isSilentPayload(payload) {
			return isSilentReplyPayloadText(payload.text, "NO_REPLY") && !hasMedia(payload);
		},
		resolveFollowupRoute(routeParams) {
			return resolveProviderFollowupFallbackRoute({
				provider: params.provider,
				config: params.config,
				workspaceDir: params.workspaceDir,
				context: {
					config: params.config,
					agentDir: params.agentDir,
					workspaceDir: params.workspaceDir,
					provider: params.provider,
					modelId: params.modelId,
					payload: routeParams.payload,
					originatingChannel: routeParams.originatingChannel,
					originatingTo: routeParams.originatingTo,
					originRoutable: routeParams.originRoutable,
					dispatcherAvailable: routeParams.dispatcherAvailable
				}
			});
		}
	};
}
function buildAgentRuntimeOutcomePlan() {
	return { classifyRunResult: classifyEmbeddedPiRunResultForModelFallback };
}
function buildAgentRuntimePlan(params) {
	const modelApi = params.modelApi ?? params.model?.api ?? void 0;
	const transport = params.resolvedTransport;
	const auth = buildAgentRuntimeAuthPlan({
		provider: params.provider,
		authProfileProvider: params.authProfileProvider,
		sessionAuthProfileId: params.sessionAuthProfileId,
		config: params.config,
		workspaceDir: params.workspaceDir,
		harnessId: params.harnessId,
		harnessRuntime: params.harnessRuntime,
		allowHarnessAuthProfileForwarding: params.allowHarnessAuthProfileForwarding
	});
	const resolvedRef = {
		provider: params.provider,
		modelId: params.modelId,
		...modelApi ? { modelApi } : {},
		...params.harnessId ? { harnessId: params.harnessId } : {},
		...transport ? { transport } : {}
	};
	const toolContext = {
		provider: params.provider,
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: process.env,
		modelId: params.modelId,
		modelApi,
		model: params.model
	};
	const resolveToolContext = (overrides) => ({
		...toolContext,
		...overrides?.workspaceDir !== void 0 ? { workspaceDir: overrides.workspaceDir } : {},
		...overrides?.modelApi !== void 0 ? { modelApi: overrides.modelApi } : {},
		...overrides?.model !== void 0 ? { model: overrides.model } : {}
	});
	const resolveTranscriptRuntimePolicy = (overrides) => resolveTranscriptPolicy({
		provider: params.provider,
		modelId: params.modelId,
		config: params.config,
		workspaceDir: overrides?.workspaceDir ?? params.workspaceDir,
		env: process.env,
		modelApi: overrides?.modelApi ?? modelApi,
		model: overrides?.model ?? params.model
	});
	const resolveTransportExtraParams = (overrides = {}) => resolvePreparedExtraParams({
		cfg: params.config,
		provider: params.provider,
		modelId: params.modelId,
		agentDir: params.agentDir,
		workspaceDir: overrides.workspaceDir ?? params.workspaceDir,
		extraParamsOverride: overrides.extraParamsOverride ?? params.extraParamsOverride,
		thinkingLevel: overrides.thinkingLevel ?? params.thinkingLevel,
		agentId: overrides.agentId ?? params.agentId,
		model: overrides.model ?? params.model,
		resolvedTransport: overrides.resolvedTransport ?? transport
	});
	return {
		resolvedRef,
		auth,
		prompt: {
			provider: params.provider,
			modelId: params.modelId,
			resolveSystemPromptContribution(context) {
				return resolveProviderSystemPromptContribution({
					provider: params.provider,
					config: params.config,
					workspaceDir: context.workspaceDir ?? params.workspaceDir,
					context
				});
			}
		},
		tools: {
			normalize(tools, overrides) {
				return normalizeProviderToolSchemas({
					...resolveToolContext(overrides),
					tools
				});
			},
			logDiagnostics(tools, overrides) {
				logProviderToolSchemaDiagnostics({
					...resolveToolContext(overrides),
					tools
				});
			}
		},
		transcript: {
			policy: resolveTranscriptRuntimePolicy(),
			resolvePolicy: resolveTranscriptRuntimePolicy
		},
		delivery: buildAgentRuntimeDeliveryPlan(params),
		outcome: buildAgentRuntimeOutcomePlan(),
		transport: {
			extraParams: resolveTransportExtraParams(),
			resolveExtraParams: resolveTransportExtraParams
		},
		observability: {
			resolvedRef: formatResolvedRef({
				provider: params.provider,
				modelId: params.modelId
			}),
			provider: params.provider,
			modelId: params.modelId,
			...modelApi ? { modelApi } : {},
			...params.harnessId ? { harnessId: params.harnessId } : {},
			...auth.forwardedAuthProfileId ? { authProfileId: auth.forwardedAuthProfileId } : {},
			...transport ? { transport } : {}
		}
	};
}
//#endregion
export { buildAgentRuntimeAuthPlan as i, buildAgentRuntimeOutcomePlan as n, buildAgentRuntimePlan as r, buildAgentRuntimeDeliveryPlan as t };
