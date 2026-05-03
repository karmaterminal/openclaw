import { a as buildProviderToolCompatFamilyHooks } from "../../provider-tools-BodUI8uW.js";
import { t as definePluginEntry } from "../../plugin-entry-BDOZ5Arw.js";
import { r as resolvePluginConfigObject } from "../../config-runtime-BTOpAzcU.js";
import { t as buildOpenAICodexCliBackend } from "../../cli-backend-Blgk9Etx.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-CKUTWrrI.js";
import { n as openaiCodexMediaUnderstandingProvider, r as openaiMediaUnderstandingProvider } from "../../media-understanding-provider-DmPK9f2M.js";
import { t as openAiMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-DT93IWHj.js";
import { t as buildOpenAICodexProviderPlugin } from "../../openai-codex-provider-Dx7DMUW-.js";
import { t as buildOpenAIProvider } from "../../openai-provider-DKIW9nuD.js";
import { i as resolveOpenAISystemPromptContribution, r as resolveOpenAIPromptOverlayMode } from "../../prompt-overlay-Betfmvli.js";
import { t as buildOpenAIRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-36Ms83Er.js";
import { t as buildOpenAIRealtimeVoiceProvider } from "../../realtime-voice-provider-Chn4Q9sh.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-C5yg_Il_.js";
import { t as buildOpenAIVideoGenerationProvider } from "../../video-generation-provider-bKBLqw_p.js";
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
