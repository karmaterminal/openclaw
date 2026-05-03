import { t as definePluginEntry } from "../../plugin-entry-BMrQ8lmP.js";
import { n as buildMinimaxPortalImageGenerationProvider, t as buildMinimaxImageGenerationProvider } from "../../image-generation-provider-D1tQXUwj.js";
import { n as minimaxPortalMediaUnderstandingProvider, t as minimaxMediaUnderstandingProvider } from "../../media-understanding-provider-DGmooEcw.js";
import { t as buildMinimaxMusicGenerationProvider } from "../../music-generation-provider-DRJYmmwX.js";
import { t as registerMinimaxProviders } from "../../provider-registration-Fq_9phEo.js";
import { t as buildMinimaxSpeechProvider } from "../../speech-provider-Q85T1MMz.js";
import { t as createMiniMaxWebSearchProvider } from "../../minimax-web-search-provider-CjA30eR2.js";
import { t as buildMinimaxVideoGenerationProvider } from "../../video-generation-provider-C1Gco3V4.js";
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
