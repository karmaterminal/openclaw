import { t as definePluginEntry } from "../../plugin-entry-Bd-NQPpx.js";
import { t as createPerplexityWebSearchProvider } from "../../perplexity-web-search-provider-C9y2p28G.js";
//#region extensions/perplexity/index.ts
var perplexity_default = definePluginEntry({
	id: "perplexity",
	name: "Perplexity Plugin",
	description: "Bundled Perplexity plugin",
	register(api) {
		api.registerWebSearchProvider(createPerplexityWebSearchProvider());
	}
});
//#endregion
export { perplexity_default as default };
