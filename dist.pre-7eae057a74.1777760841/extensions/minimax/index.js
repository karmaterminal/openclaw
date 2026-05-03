import { t as definePluginEntry } from "../../plugin-entry-55f8k4W7.js";
import { n as buildMinimaxPortalImageGenerationProvider, t as buildMinimaxImageGenerationProvider } from "../../image-generation-provider-C3UHC-ER.js";
import { n as minimaxPortalMediaUnderstandingProvider, t as minimaxMediaUnderstandingProvider } from "../../media-understanding-provider-ThQAjaDU.js";
import { t as buildMinimaxMusicGenerationProvider } from "../../music-generation-provider-BznUMVlL.js";
import { t as registerMinimaxProviders } from "../../provider-registration-DfcNlJQ9.js";
import { t as buildMinimaxSpeechProvider } from "../../speech-provider-BZ09nPgJ.js";
import { t as createMiniMaxWebSearchProvider } from "../../minimax-web-search-provider-7cL4t1SB.js";
import { t as buildMinimaxVideoGenerationProvider } from "../../video-generation-provider-CpF6VI3I.js";
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
