import { t as definePluginEntry } from "../../plugin-entry-BDOZ5Arw.js";
import { n as buildMinimaxPortalImageGenerationProvider, t as buildMinimaxImageGenerationProvider } from "../../image-generation-provider-Bp0Ku584.js";
import { n as minimaxPortalMediaUnderstandingProvider, t as minimaxMediaUnderstandingProvider } from "../../media-understanding-provider-BqL6rYRp.js";
import { t as buildMinimaxMusicGenerationProvider } from "../../music-generation-provider-C2qG8wOi.js";
import { t as registerMinimaxProviders } from "../../provider-registration-BJm78gBL.js";
import { t as buildMinimaxSpeechProvider } from "../../speech-provider-DiwJjKB1.js";
import { t as createMiniMaxWebSearchProvider } from "../../minimax-web-search-provider-hy4Gz6QM.js";
import { t as buildMinimaxVideoGenerationProvider } from "../../video-generation-provider-6yX1wA-E.js";
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
