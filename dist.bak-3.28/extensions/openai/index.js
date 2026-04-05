import { t as definePluginEntry } from "../../plugin-entry-BFhzQSoP.js";
import { t as buildOpenAIProvider } from "../../openai-provider-LLges_RS.js";
import { t as buildOpenAICodexCliBackend } from "../../cli-backend-hXz5jlVE.js";
import { t as buildOpenAIImageGenerationProvider } from "../../image-generation-provider-CFVpMtmf.js";
import { n as openaiCodexMediaUnderstandingProvider, r as openaiMediaUnderstandingProvider } from "../../media-understanding-provider-DNThU1Sh.js";
import { t as buildOpenAICodexProviderPlugin } from "../../openai-codex-provider-D-FI4gIM.js";
import { t as buildOpenAISpeechProvider } from "../../speech-provider-D8IZiiXZ.js";
//#region extensions/openai/index.ts
var openai_default = definePluginEntry({
	id: "openai",
	name: "OpenAI Provider",
	description: "Bundled OpenAI provider plugins",
	register(api) {
		api.registerCliBackend(buildOpenAICodexCliBackend());
		api.registerProvider(buildOpenAIProvider());
		api.registerProvider(buildOpenAICodexProviderPlugin());
		api.registerSpeechProvider(buildOpenAISpeechProvider());
		api.registerMediaUnderstandingProvider(openaiMediaUnderstandingProvider);
		api.registerMediaUnderstandingProvider(openaiCodexMediaUnderstandingProvider);
		api.registerImageGenerationProvider(buildOpenAIImageGenerationProvider());
	}
});
//#endregion
export { openai_default as default };
