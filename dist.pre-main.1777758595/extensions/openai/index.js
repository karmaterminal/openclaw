import { a as buildProviderToolCompatFamilyHooks } from "../../provider-tools-CvIfvzwB.js";
import { t as definePluginEntry } from "../../plugin-entry-DX3V0eaU.js";
import { r as resolvePluginConfigObject } from "../../plugin-config-runtime-vntqRpJP.js";
import { t as buildOpenAICodexCliBackend } from "../../cli-backend-CupjLNT2.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-kZ1sGL6v.js";
import { n as openaiCodexMediaUnderstandingProvider, r as openaiMediaUnderstandingProvider } from "../../media-understanding-provider-Bnhpytsc.js";
import { t as openAiMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-CrYQrXd7.js";
import { t as buildOpenAICodexProviderPlugin } from "../../openai-codex-provider-DbfKVtP4.js";
import { t as buildOpenAIProvider } from "../../openai-provider-CDEDmG0m.js";
import { i as resolveOpenAISystemPromptContribution, r as resolveOpenAIPromptOverlayMode } from "../../prompt-overlay-B93rq7lq.js";
import { t as buildOpenAIRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-qqKCMCNK.js";
import { t as buildOpenAIRealtimeVoiceProvider } from "../../realtime-voice-provider-BQEh359h.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-DdnTjpfz.js";
import { t as buildOpenAIVideoGenerationProvider } from "../../video-generation-provider-Bz4oSCuP.js";
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
