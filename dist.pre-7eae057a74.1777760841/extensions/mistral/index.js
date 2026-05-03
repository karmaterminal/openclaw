import { t as defineSingleProviderPluginEntry } from "../../provider-entry-Bgqa39N9.js";
import { t as buildMistralProvider } from "../../provider-catalog-Cvbjg1Oy.js";
import { n as applyMistralConfig, t as MISTRAL_DEFAULT_MODEL_REF } from "../../onboard-CFxguiC-.js";
import { i as applyMistralModelCompat } from "../../api-CUjeZlhb.js";
import { t as mistralMediaUnderstandingProvider } from "../../media-understanding-provider-BASCh1qF.js";
import { t as mistralMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-th_gTTN_.js";
import { t as contributeMistralResolvedModelCompat } from "../../provider-compat-fQfWv-G3.js";
import { n as buildMistralRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-Cq8EtJx9.js";
//#region extensions/mistral/index.ts
const PROVIDER_ID = "mistral";
function buildMistralReplayPolicy() {
	return {
		sanitizeToolCallIds: true,
		toolCallIdMode: "strict9"
	};
}
var mistral_default = defineSingleProviderPluginEntry({
	id: PROVIDER_ID,
	name: "Mistral Provider",
	description: "Bundled Mistral provider plugin",
	provider: {
		label: "Mistral",
		docsPath: "/providers/models",
		auth: [{
			methodId: "api-key",
			label: "Mistral API key",
			hint: "API key",
			optionKey: "mistralApiKey",
			flagName: "--mistral-api-key",
			envVar: "MISTRAL_API_KEY",
			promptMessage: "Enter Mistral API key",
			defaultModel: MISTRAL_DEFAULT_MODEL_REF,
			applyConfig: (cfg) => applyMistralConfig(cfg),
			wizard: { groupLabel: "Mistral AI" }
		}],
		catalog: {
			buildProvider: buildMistralProvider,
			allowExplicitBaseUrl: true
		},
		matchesContextOverflowError: ({ errorMessage }) => /\bmistral\b.*(?:input.*too long|token limit.*exceeded)/i.test(errorMessage),
		normalizeResolvedModel: ({ model }) => applyMistralModelCompat(model),
		contributeResolvedModelCompat: ({ modelId, model }) => contributeMistralResolvedModelCompat({
			modelId,
			model
		}),
		resolveThinkingProfile: ({ modelId }) => modelId === "mistral-small-latest" ? {
			levels: [{ id: "off" }, { id: "high" }],
			defaultLevel: "off"
		} : void 0,
		buildReplayPolicy: () => buildMistralReplayPolicy()
	},
	register(api) {
		api.registerMemoryEmbeddingProvider(mistralMemoryEmbeddingProviderAdapter);
		api.registerMediaUnderstandingProvider(mistralMediaUnderstandingProvider);
		api.registerRealtimeTranscriptionProvider(buildMistralRealtimeTranscriptionProvider());
	}
});
//#endregion
export { buildMistralReplayPolicy, mistral_default as default };
