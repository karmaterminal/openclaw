import { a as buildProviderToolCompatFamilyHooks } from "../../provider-tools-Bc9LVw6R.js";
import { t as definePluginEntry } from "../../plugin-entry-Bd-NQPpx.js";
import { r as resolvePluginConfigObject } from "../../config-runtime-Bqe5387K.js";
import { t as buildOpenAICodexCliBackend } from "../../cli-backend-BM6vwxbR.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-CgnLwt5s.js";
import { n as openaiCodexMediaUnderstandingProvider, r as openaiMediaUnderstandingProvider } from "../../media-understanding-provider-Bh7IvkI1.js";
import { t as openAiMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-mFgKXJKi.js";
import { t as buildOpenAICodexProviderPlugin } from "../../openai-codex-provider-DmwsJoMW.js";
import { t as buildOpenAIProvider } from "../../openai-provider-C9kd9apo.js";
import { i as resolveOpenAISystemPromptContribution, r as resolveOpenAIPromptOverlayMode } from "../../prompt-overlay-Dk9uiFfs.js";
import { t as buildOpenAIRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-Ca9xmJdk.js";
import { t as buildOpenAIRealtimeVoiceProvider } from "../../realtime-voice-provider-DrC4MHLO.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-DKEksqMN.js";
import { t as buildOpenAIVideoGenerationProvider } from "../../video-generation-provider-BrEFoAU9.js";
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
