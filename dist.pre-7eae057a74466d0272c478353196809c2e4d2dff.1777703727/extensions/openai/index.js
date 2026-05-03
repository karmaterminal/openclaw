import { a as buildProviderToolCompatFamilyHooks } from "../../provider-tools-TcCnirb6.js";
import { t as definePluginEntry } from "../../plugin-entry-CWUvi2Bu.js";
import { r as resolvePluginConfigObject } from "../../config-runtime-DSiWNnvt.js";
import { t as buildOpenAICodexCliBackend } from "../../cli-backend-D5lJx59y.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-DFD7_2KB.js";
import { n as openaiCodexMediaUnderstandingProvider, r as openaiMediaUnderstandingProvider } from "../../media-understanding-provider-CEBoDuO_.js";
import { t as openAiMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-DTKORNCh.js";
import { t as buildOpenAICodexProviderPlugin } from "../../openai-codex-provider-B0S5ZxXv.js";
import { t as buildOpenAIProvider } from "../../openai-provider-Cmf3e9U6.js";
import { i as resolveOpenAISystemPromptContribution, r as resolveOpenAIPromptOverlayMode } from "../../prompt-overlay-B9H88Gkz.js";
import { t as buildOpenAIRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-D_h-Py1R.js";
import { t as buildOpenAIRealtimeVoiceProvider } from "../../realtime-voice-provider-wqZhdfHi.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-Bkt_gwQ3.js";
import { t as buildOpenAIVideoGenerationProvider } from "../../video-generation-provider-DFFx376L.js";
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
