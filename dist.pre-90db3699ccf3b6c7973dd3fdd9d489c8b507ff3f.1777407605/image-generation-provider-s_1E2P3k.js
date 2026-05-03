import { o as postJsonRequest, t as assertOkOrThrowHttpError, u as resolveProviderHttpRequestConfig } from "./shared-Dte4u43k.js";
import { t as isProviderApiKeyConfigured } from "./provider-auth-Co_LMlTd.js";
import "./provider-http-BpNDJXy2.js";
import { l as resolveApiKeyForProvider } from "./provider-auth-runtime-PHht0fxa.js";
import { i as OPENAI_DEFAULT_IMAGE_MODEL } from "./default-models-B4dPXEnc.js";
import { a as resolveConfiguredOpenAIBaseUrl, o as toOpenAIDataUrl } from "./shared-YDsEZK_W.js";
//#region extensions/openai/image-generation-provider.ts
const DEFAULT_OPENAI_IMAGE_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OUTPUT_MIME = "image/png";
const DEFAULT_SIZE = "1024x1024";
const OPENAI_SUPPORTED_SIZES = [
	"1024x1024",
	"1536x1024",
	"1024x1536",
	"2048x2048",
	"2048x1152",
	"3840x2160",
	"2160x3840"
];
const OPENAI_MAX_INPUT_IMAGES = 5;
const MOCK_OPENAI_PROVIDER_ID = "mock-openai";
const AZURE_HOSTNAME_SUFFIXES = [
	".openai.azure.com",
	".services.ai.azure.com",
	".cognitiveservices.azure.com"
];
const DEFAULT_AZURE_OPENAI_API_VERSION = "2024-12-01-preview";
function isAzureOpenAIBaseUrl(baseUrl) {
	const trimmed = baseUrl?.trim();
	if (!trimmed) return false;
	try {
		const hostname = new URL(trimmed).hostname.toLowerCase();
		return AZURE_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
	} catch {
		return false;
	}
}
function resolveAzureApiVersion() {
	return process.env.AZURE_OPENAI_API_VERSION?.trim() || DEFAULT_AZURE_OPENAI_API_VERSION;
}
function buildAzureImageUrl(rawBaseUrl, model, action) {
	return `${rawBaseUrl.replace(/\/+$/, "").replace(/\/openai\/v1$/, "").replace(/\/v1$/, "")}/openai/deployments/${model}/images/${action}?api-version=${resolveAzureApiVersion()}`;
}
function shouldAllowPrivateImageEndpoint(req) {
	if (req.provider === MOCK_OPENAI_PROVIDER_ID) return true;
	const baseUrl = resolveConfiguredOpenAIBaseUrl(req.cfg);
	if (!baseUrl.startsWith("http://127.0.0.1:") && !baseUrl.startsWith("http://localhost:")) return false;
	return process.env.OPENCLAW_QA_ALLOW_LOCAL_IMAGE_PROVIDER === "1";
}
function buildOpenAIImageGenerationProvider() {
	return {
		id: "openai",
		label: "OpenAI",
		defaultModel: OPENAI_DEFAULT_IMAGE_MODEL,
		models: [OPENAI_DEFAULT_IMAGE_MODEL],
		isConfigured: ({ agentDir }) => isProviderApiKeyConfigured({
			provider: "openai",
			agentDir
		}),
		capabilities: {
			generate: {
				maxCount: 4,
				supportsSize: true,
				supportsAspectRatio: false,
				supportsResolution: false
			},
			edit: {
				enabled: true,
				maxCount: 4,
				maxInputImages: OPENAI_MAX_INPUT_IMAGES,
				supportsSize: true,
				supportsAspectRatio: false,
				supportsResolution: false
			},
			geometry: { sizes: [...OPENAI_SUPPORTED_SIZES] }
		},
		async generateImage(req) {
			const inputImages = req.inputImages ?? [];
			const isEdit = inputImages.length > 0;
			const auth = await resolveApiKeyForProvider({
				provider: "openai",
				cfg: req.cfg,
				agentDir: req.agentDir,
				store: req.authStore
			});
			if (!auth.apiKey) throw new Error("OpenAI API key missing");
			const rawBaseUrl = resolveConfiguredOpenAIBaseUrl(req.cfg);
			const isAzure = isAzureOpenAIBaseUrl(rawBaseUrl);
			const { baseUrl, allowPrivateNetwork, headers, dispatcherPolicy } = resolveProviderHttpRequestConfig({
				baseUrl: rawBaseUrl,
				defaultBaseUrl: DEFAULT_OPENAI_IMAGE_BASE_URL,
				allowPrivateNetwork: shouldAllowPrivateImageEndpoint(req),
				defaultHeaders: isAzure ? { "api-key": auth.apiKey } : { Authorization: `Bearer ${auth.apiKey}` },
				provider: "openai",
				capability: "image",
				transport: "http"
			});
			const model = req.model || "gpt-image-2";
			const count = req.count ?? 1;
			const size = req.size ?? DEFAULT_SIZE;
			const url = isAzure ? buildAzureImageUrl(rawBaseUrl, model, isEdit ? "edits" : "generations") : `${baseUrl}/images/${isEdit ? "edits" : "generations"}`;
			const { response, release } = isEdit ? await (() => {
				const jsonHeaders = new Headers(headers);
				jsonHeaders.set("Content-Type", "application/json");
				return postJsonRequest({
					url,
					headers: jsonHeaders,
					body: {
						model,
						prompt: req.prompt,
						n: count,
						size,
						images: inputImages.map((image) => ({ image_url: toOpenAIDataUrl(image.buffer, image.mimeType?.trim() || DEFAULT_OUTPUT_MIME) }))
					},
					timeoutMs: req.timeoutMs,
					fetchFn: fetch,
					allowPrivateNetwork,
					dispatcherPolicy
				});
			})() : await (() => {
				const jsonHeaders = new Headers(headers);
				jsonHeaders.set("Content-Type", "application/json");
				return postJsonRequest({
					url,
					headers: jsonHeaders,
					body: {
						model,
						prompt: req.prompt,
						n: count,
						size
					},
					timeoutMs: req.timeoutMs,
					fetchFn: fetch,
					allowPrivateNetwork,
					dispatcherPolicy
				});
			})();
			try {
				await assertOkOrThrowHttpError(response, isEdit ? "OpenAI image edit failed" : "OpenAI image generation failed");
				return {
					images: ((await response.json()).data ?? []).map((entry, index) => {
						if (!entry.b64_json) return null;
						return Object.assign({
							buffer: Buffer.from(entry.b64_json, `base64`),
							mimeType: DEFAULT_OUTPUT_MIME,
							fileName: `image-${index + 1}.png`
						}, entry.revised_prompt ? { revisedPrompt: entry.revised_prompt } : {});
					}).filter((entry) => entry !== null),
					model
				};
			} finally {
				await release();
			}
		}
	};
}
//#endregion
export { buildOpenAIImageGenerationProvider as t };
