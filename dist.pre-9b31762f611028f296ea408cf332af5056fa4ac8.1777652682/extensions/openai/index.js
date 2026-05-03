import { a as buildProviderToolCompatFamilyHooks } from "../../provider-tools-B8pChW2t.js";
import { t as definePluginEntry } from "../../plugin-entry-BMrQ8lmP.js";
import { r as resolvePluginConfigObject } from "../../config-runtime-B11iimxT.js";
import { t as buildOpenAICodexCliBackend } from "../../cli-backend-CxyUWVST.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-uZJupkyO.js";
import { n as openaiCodexMediaUnderstandingProvider, r as openaiMediaUnderstandingProvider } from "../../media-understanding-provider-BFbGqgRR.js";
import { t as openAiMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-Buu12sCM.js";
import { t as buildOpenAICodexProviderPlugin } from "../../openai-codex-provider-BTwaommN.js";
import { t as buildOpenAIProvider } from "../../openai-provider-36pWIXjL.js";
import { i as resolveOpenAISystemPromptContribution, r as resolveOpenAIPromptOverlayMode } from "../../prompt-overlay-B4NqjF7W.js";
import { t as buildOpenAIRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-BIH_Vkj_.js";
import { t as buildOpenAIRealtimeVoiceProvider } from "../../realtime-voice-provider-CM4_w5CO.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-DZaLh20j.js";
import { t as buildOpenAIVideoGenerationProvider } from "../../video-generation-provider-BgULMoJH.js";
//#region extensions/openai/index.ts
var openai_default = definePluginEntry({
	id: "openai",
	name: "OpenAI Provider",
	description: "Bundled OpenAI provider plugins",
	register(api) {
		const openAIToolCompatHooks = buildProviderToolCompatFamilyHooks("openai");
		const buildProviderWithPromptContribution = (provider) => ({
			...provider,
			...openAIToolCompatHooks,
			resolveSystemPromptContribution: (ctx) => {
				const pluginConfig = resolvePluginConfigObject(ctx.config, "openai") ?? (ctx.config ? void 0 : api.pluginConfig);
				return resolveOpenAISystemPromptContribution({
					config: ctx.config,
					legacyPluginConfig: pluginConfig,
					mode: resolveOpenAIPromptOverlayMode(pluginConfig),
					modelProviderId: provider.id,
					modelId: ctx.modelId
				});
			}
		});
		api.registerCliBackend(buildOpenAICodexCliBackend());
		api.registerProvider(buildProviderWithPromptContribution(buildOpenAIProvider()));
		api.registerProvider(buildProviderWithPromptContribution(buildOpenAICodexProviderPlugin()));
		api.registerMemoryEmbeddingProvider(openAiMemoryEmbeddingProviderAdapter);
		api.registerImageGenerationProvider(buildOpenAIImageGenerationProvider());
		api.registerRealtimeTranscriptionProvider(buildOpenAIRealtimeTranscriptionProvider());
		api.registerRealtimeVoiceProvider(buildOpenAIRealtimeVoiceProvider());
		api.registerSpeechProvider(buildOpenAISpeechProvider());
		api.registerMediaUnderstandingProvider(openaiMediaUnderstandingProvider);
		api.registerMediaUnderstandingProvider(openaiCodexMediaUnderstandingProvider);
		api.registerVideoGenerationProvider(buildOpenAIVideoGenerationProvider());
	}
});
//#endregion
export { openai_default as default };
