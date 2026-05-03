import { t as definePluginEntry } from "../../plugin-entry-C5CNAgRN.js";
import { n as buildMinimaxPortalImageGenerationProvider, t as buildMinimaxImageGenerationProvider } from "../../image-generation-provider-DCTuryqf.js";
import { n as minimaxPortalMediaUnderstandingProvider, t as minimaxMediaUnderstandingProvider } from "../../media-understanding-provider-BgsiUkeS.js";
import { t as buildMinimaxMusicGenerationProvider } from "../../music-generation-provider-CJjQdUBB.js";
import { t as registerMinimaxProviders } from "../../provider-registration-DAiPS-7j.js";
import { t as buildMinimaxSpeechProvider } from "../../speech-provider-C3-uXIGY.js";
import { t as createMiniMaxWebSearchProvider } from "../../minimax-web-search-provider-0EazmdfX.js";
import { t as buildMinimaxVideoGenerationProvider } from "../../video-generation-provider-C6OIQhe7.js";
//#region extensions/minimax/index.ts
var minimax_default = definePluginEntry({
	id: "minimax",
	name: "MiniMax",
	description: "Bundled MiniMax API-key and OAuth provider plugin",
	register(api) {
		registerMinimaxProviders(api);
		api.registerMediaUnderstandingProvider(minimaxMediaUnderstandingProvider);
		api.registerMediaUnderstandingProvider(minimaxPortalMediaUnderstandingProvider);
		api.registerImageGenerationProvider(buildMinimaxImageGenerationProvider());
		api.registerImageGenerationProvider(buildMinimaxPortalImageGenerationProvider());
		api.registerMusicGenerationProvider(buildMinimaxMusicGenerationProvider());
		api.registerVideoGenerationProvider(buildMinimaxVideoGenerationProvider());
		api.registerSpeechProvider(buildMinimaxSpeechProvider());
		api.registerWebSearchProvider(createMiniMaxWebSearchProvider());
	}
});
//#endregion
export { minimax_default as default };
