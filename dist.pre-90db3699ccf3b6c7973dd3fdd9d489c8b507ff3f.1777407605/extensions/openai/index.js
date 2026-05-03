import { a as buildProviderToolCompatFamilyHooks } from "../../provider-tools-BZjC4gb0.js";
import { t as definePluginEntry } from "../../plugin-entry-C5CNAgRN.js";
import { r as resolvePluginConfigObject } from "../../config-runtime-ByTE4rnO.js";
import { t as buildOpenAICodexCliBackend } from "../../cli-backend-CN26QpQC.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-s_1E2P3k.js";
import { n as openaiCodexMediaUnderstandingProvider, r as openaiMediaUnderstandingProvider } from "../../media-understanding-provider-HX6bmEyt.js";
import { t as openAiMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-B_HLDYaq.js";
import { t as buildOpenAICodexProviderPlugin } from "../../openai-codex-provider-l2AQ_MFr.js";
import { t as buildOpenAIProvider } from "../../openai-provider-Dn_eHxgX.js";
import { i as resolveOpenAISystemPromptContribution, r as resolveOpenAIPromptOverlayMode } from "../../prompt-overlay-wsZv8Vmb.js";
import { t as buildOpenAIRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-BqyumjBh.js";
import { t as buildOpenAIRealtimeVoiceProvider } from "../../realtime-voice-provider-BFMJsXBh.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-C9jLrTJT.js";
import { t as buildOpenAIVideoGenerationProvider } from "../../video-generation-provider-DVxLpYEd.js";
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
