import { t as definePluginEntry } from "../../plugin-entry-CWUvi2Bu.js";
import { n as buildMinimaxPortalImageGenerationProvider, t as buildMinimaxImageGenerationProvider } from "../../image-generation-provider-CAoHEc0C.js";
import { n as minimaxPortalMediaUnderstandingProvider, t as minimaxMediaUnderstandingProvider } from "../../media-understanding-provider-Bg1WN68r.js";
import { t as buildMinimaxMusicGenerationProvider } from "../../music-generation-provider-C1a3E4Vx.js";
import { t as registerMinimaxProviders } from "../../provider-registration-gYS5aEdg.js";
import { t as buildMinimaxSpeechProvider } from "../../speech-provider-NWuCvJBD.js";
import { t as createMiniMaxWebSearchProvider } from "../../minimax-web-search-provider-DzHaHzjd.js";
import { t as buildMinimaxVideoGenerationProvider } from "../../video-generation-provider-B-9WNsbZ.js";
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
