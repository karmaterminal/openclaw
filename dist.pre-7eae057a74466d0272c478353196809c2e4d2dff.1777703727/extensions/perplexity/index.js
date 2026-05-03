import { t as definePluginEntry } from "../../plugin-entry-CWUvi2Bu.js";
import { t as createPerplexityWebSearchProvider } from "../../perplexity-web-search-provider-C0w6g804.js";
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
