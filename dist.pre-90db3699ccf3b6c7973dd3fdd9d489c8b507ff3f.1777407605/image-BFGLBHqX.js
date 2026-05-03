import { i as resolveProviderRequestCapabilities } from "./provider-attribution-2AJ1WJ1n.js";
import { n as ensureOpenClawModelsJson } from "./models-config-DXUZyX32.js";
import { S as normalizeModelRef } from "./model-selection-cli-BCNxTSmc.js";
import "./model-selection-B7RNWcLj.js";
import { t as requireApiKey } from "./model-auth-runtime-shared-7xTwSNzs.js";
import { r as getApiKeyForModel, s as resolveApiKeyForProvider } from "./model-auth-CnLreLvU.js";
import { t as registerProviderStreamForModel } from "./provider-stream-BUlKLyKX.js";
import { i as coerceImageAssistantText, r as minimaxUnderstandImage, s as hasImageReasoningOnlyResponse, t as isMinimaxVlmModel } from "./minimax-vlm-ftT8h8mi.js";
import { complete } from "@mariozechner/pi-ai";
//#region src/media-understanding/image.ts
let piModelDiscoveryRuntimePromise = null;
function loadPiModelDiscoveryRuntime() {
	piModelDiscoveryRuntimePromise ??= import("./agents/pi-model-discovery-runtime.js");
	return piModelDiscoveryRuntimePromise;
}
function resolveImageToolMaxTokens(modelMaxTokens, requestedMaxTokens = 4096) {
	if (typeof modelMaxTokens !== "number" || !Number.isFinite(modelMaxTokens) || modelMaxTokens <= 0) return requestedMaxTokens;
	return Math.min(requestedMaxTokens, modelMaxTokens);
}
function isRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isNativeResponsesReasoningPayload(model) {
	if (model.api !== "openai-responses" && model.api !== "azure-openai-responses" && model.api !== "openai-codex-responses") return false;
	return resolveProviderRequestCapabilities({
		provider: model.provider,
		api: model.api,
		baseUrl: model.baseUrl,
		capability: "image",
		transport: "media-understanding"
	}).usesKnownNativeOpenAIRoute;
}
function removeReasoningInclude(value) {
	if (!Array.isArray(value)) return value;
	const next = value.filter((entry) => entry !== "reasoning.encrypted_content");
	return next.length > 0 ? next : void 0;
}
function disableReasoningForImageRetryPayload(payload, model) {
	if (!isRecord(payload)) return;
	const next = { ...payload };
	delete next.reasoning;
	delete next.reasoning_effort;
	const include = removeReasoningInclude(next.include);
	if (include === void 0) delete next.include;
	else next.include = include;
	if (isNativeResponsesReasoningPayload(model)) next.reasoning = { effort: "none" };
	return next;
}
function isImageModelNoTextError(err) {
	return err instanceof Error && /^Image model returned no text\b/.test(err.message);
}
async function resolveImageRuntime(params) {
	await ensureOpenClawModelsJson(params.cfg, params.agentDir);
	const { discoverAuthStorage, discoverModels } = await loadPiModelDiscoveryRuntime();
	const authStorage = discoverAuthStorage(params.agentDir);
	const modelRegistry = discoverModels(authStorage, params.agentDir);
	const resolvedRef = normalizeModelRef(params.provider, params.model);
	const model = modelRegistry.find(resolvedRef.provider, resolvedRef.model);
	if (!model) throw new Error(`Unknown model: ${resolvedRef.provider}/${resolvedRef.model}`);
	if (!model.input?.includes("image")) throw new Error(`Model does not support images: ${params.provider}/${params.model}`);
	const apiKey = requireApiKey(await getApiKeyForModel({
		model,
		cfg: params.cfg,
		agentDir: params.agentDir,
		profileId: params.profile,
		preferredProfile: params.preferredProfile,
		store: params.authStore
	}), model.provider);
	authStorage.setRuntimeApiKey(model.provider, apiKey);
	return {
		apiKey,
		model
	};
}
function buildImageContext(prompt, images) {
	return {
		systemPrompt: prompt,
		messages: [{
			role: "user",
			content: images.map((image) => ({
				type: "image",
				data: image.buffer.toString("base64"),
				mimeType: image.mime ?? "image/jpeg"
			})),
			timestamp: Date.now()
		}]
	};
}
async function describeImagesWithMinimax(params) {
	const responses = [];
	for (const [index, image] of params.images.entries()) {
		const prompt = params.images.length > 1 ? `${params.prompt}\n\nDescribe image ${index + 1} of ${params.images.length} independently.` : params.prompt;
		const text = await minimaxUnderstandImage({
			apiKey: params.apiKey,
			prompt,
			imageDataUrl: `data:${image.mime ?? "image/jpeg"};base64,${image.buffer.toString("base64")}`,
			modelBaseUrl: params.modelBaseUrl
		});
		responses.push(params.images.length > 1 ? `Image ${index + 1}:\n${text.trim()}` : text.trim());
	}
	return {
		text: responses.join("\n\n").trim(),
		model: params.modelId
	};
}
function isUnknownModelError(err) {
	return err instanceof Error && /^Unknown model:/i.test(err.message);
}
function resolveConfiguredProviderBaseUrl(cfg, provider) {
	const direct = cfg.models?.providers?.[provider];
	if (typeof direct?.baseUrl === "string" && direct.baseUrl.trim()) return direct.baseUrl.trim();
}
async function resolveMinimaxVlmFallbackRuntime(params) {
	return {
		apiKey: requireApiKey(await resolveApiKeyForProvider({
			provider: params.provider,
			cfg: params.cfg,
			profileId: params.profile,
			preferredProfile: params.preferredProfile,
			agentDir: params.agentDir
		}), params.provider),
		modelBaseUrl: resolveConfiguredProviderBaseUrl(params.cfg, params.provider)
	};
}
async function describeImagesWithModel(params) {
	const prompt = params.prompt ?? "Describe the image.";
	let apiKey;
	let model;
	try {
		const resolved = await resolveImageRuntime(params);
		apiKey = resolved.apiKey;
		model = resolved.model;
	} catch (err) {
		if (!isMinimaxVlmModel(params.provider, params.model) || !isUnknownModelError(err)) throw err;
		const fallback = await resolveMinimaxVlmFallbackRuntime(params);
		return await describeImagesWithMinimax({
			apiKey: fallback.apiKey,
			modelId: params.model,
			modelBaseUrl: fallback.modelBaseUrl,
			prompt,
			images: params.images
		});
	}
	if (isMinimaxVlmModel(model.provider, model.id)) return await describeImagesWithMinimax({
		apiKey,
		modelId: model.id,
		modelBaseUrl: model.baseUrl,
		prompt,
		images: params.images
	});
	registerProviderStreamForModel({
		model,
		cfg: params.cfg,
		agentDir: params.agentDir
	});
	const context = buildImageContext(prompt, params.images);
	const controller = new AbortController();
	const timeout = typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs) && params.timeoutMs > 0 ? setTimeout(() => controller.abort(), params.timeoutMs) : void 0;
	const maxTokens = resolveImageToolMaxTokens(model.maxTokens, params.maxTokens ?? 512);
	const completeImage = async (onPayload) => await complete(model, context, {
		apiKey,
		maxTokens,
		signal: controller.signal,
		...onPayload ? { onPayload } : {}
	});
	try {
		const message = await completeImage();
		try {
			return {
				text: coerceImageAssistantText({
					message,
					provider: model.provider,
					model: model.id
				}),
				model: model.id
			};
		} catch (err) {
			if (!isImageModelNoTextError(err) || !hasImageReasoningOnlyResponse(message)) throw err;
		}
		return {
			text: coerceImageAssistantText({
				message: await completeImage(disableReasoningForImageRetryPayload),
				provider: model.provider,
				model: model.id
			}),
			model: model.id
		};
	} finally {
		clearTimeout(timeout);
	}
}
async function describeImageWithModel(params) {
	return await describeImagesWithModel({
		images: [{
			buffer: params.buffer,
			fileName: params.fileName,
			mime: params.mime
		}],
		model: params.model,
		provider: params.provider,
		prompt: params.prompt,
		maxTokens: params.maxTokens,
		timeoutMs: params.timeoutMs,
		profile: params.profile,
		preferredProfile: params.preferredProfile,
		authStore: params.authStore,
		agentDir: params.agentDir,
		cfg: params.cfg
	});
}
//#endregion
export { describeImageWithModel, describeImagesWithModel };
