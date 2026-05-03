import { t as definePluginEntry } from "../../plugin-entry-DX3V0eaU.js";
import { n as buildMinimaxPortalImageGenerationProvider, t as buildMinimaxImageGenerationProvider } from "../../image-generation-provider-CLK5PYsg.js";
import { n as minimaxPortalMediaUnderstandingProvider, t as minimaxMediaUnderstandingProvider } from "../../media-understanding-provider-xhet9Xf8.js";
import { n as buildMinimaxPortalMusicGenerationProvider, t as buildMinimaxMusicGenerationProvider } from "../../music-generation-provider-BGrqHVBB.js";
import { t as registerMinimaxProviders } from "../../provider-registration-CKZ-_EYQ.js";
import { t as buildMinimaxSpeechProvider } from "../../speech-provider-CrAihrpZ.js";
import { t as createMiniMaxWebSearchProvider } from "../../minimax-web-search-provider-CohcUlwg.js";
import { n as buildMinimaxVideoGenerationProvider, t as buildMinimaxPortalVideoGenerationProvider } from "../../video-generation-provider-DcZh87in.js";
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
		api.registerMusicGenerationProvider(buildMinimaxPortalMusicGenerationProvider());
		api.registerVideoGenerationProvider(buildMinimaxVideoGenerationProvider());
		api.registerVideoGenerationProvider(buildMinimaxPortalVideoGenerationProvider());
		api.registerSpeechProvider(buildMinimaxSpeechProvider());
		api.registerWebSearchProvider(createMiniMaxWebSearchProvider());
	}
});
//#endregion
export { minimax_default as default };
