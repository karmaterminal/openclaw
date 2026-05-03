import { t as definePluginEntry } from "../../plugin-entry-BDOZ5Arw.js";
import { n as buildMinimaxPortalImageGenerationProvider, t as buildMinimaxImageGenerationProvider } from "../../image-generation-provider-DBrWgZoh.js";
import { n as minimaxPortalMediaUnderstandingProvider, t as minimaxMediaUnderstandingProvider } from "../../media-understanding-provider-CT9tp0oY.js";
import { t as buildMinimaxMusicGenerationProvider } from "../../music-generation-provider-BAEaK3Mr.js";
import { t as registerMinimaxProviders } from "../../provider-registration-DZnROfSS.js";
import { t as buildMinimaxSpeechProvider } from "../../speech-provider-B0FnJwuQ.js";
import { t as createMiniMaxWebSearchProvider } from "../../minimax-web-search-provider-CSMXxYmJ.js";
import { t as buildMinimaxVideoGenerationProvider } from "../../video-generation-provider-BRQOqnMx.js";
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
