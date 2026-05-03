import { a as buildProviderToolCompatFamilyHooks } from "../../provider-tools-CXA0m1Yh.js";
import { t as definePluginEntry } from "../../plugin-entry-55f8k4W7.js";
import { r as resolvePluginConfigObject } from "../../config-runtime-woal72b3.js";
import { t as buildOpenAICodexCliBackend } from "../../cli-backend-CzFpEiC0.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-BkqR_lhk.js";
import { n as openaiCodexMediaUnderstandingProvider, r as openaiMediaUnderstandingProvider } from "../../media-understanding-provider-BImPTAjR.js";
import { t as openAiMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-BkXdVh7f.js";
import { t as buildOpenAICodexProviderPlugin } from "../../openai-codex-provider-D3QkM0VH.js";
import { t as buildOpenAIProvider } from "../../openai-provider-D-p6NSNQ.js";
import { i as resolveOpenAISystemPromptContribution, r as resolveOpenAIPromptOverlayMode } from "../../prompt-overlay-DQpMMkB_.js";
import { t as buildOpenAIRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-BW8BovpX.js";
import { t as buildOpenAIRealtimeVoiceProvider } from "../../realtime-voice-provider-95OlUtKU.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-CIvpaAcx.js";
import { t as buildOpenAIVideoGenerationProvider } from "../../video-generation-provider-BNYNuLfV.js";
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
