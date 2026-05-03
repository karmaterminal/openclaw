import { t as definePluginEntry } from "../../plugin-entry-Bd-NQPpx.js";
import { n as buildMinimaxPortalImageGenerationProvider, t as buildMinimaxImageGenerationProvider } from "../../image-generation-provider-h1XqKYIM.js";
import { n as minimaxPortalMediaUnderstandingProvider, t as minimaxMediaUnderstandingProvider } from "../../media-understanding-provider-k3j6xZoV.js";
import { t as buildMinimaxMusicGenerationProvider } from "../../music-generation-provider-DGtOHy9L.js";
import { t as registerMinimaxProviders } from "../../provider-registration-GGbxWlNi.js";
import { t as buildMinimaxSpeechProvider } from "../../speech-provider-inM7xdGL.js";
import { t as createMiniMaxWebSearchProvider } from "../../minimax-web-search-provider-CGSc-Ptt.js";
import { t as buildMinimaxVideoGenerationProvider } from "../../video-generation-provider-FtIgyUqZ.js";
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
