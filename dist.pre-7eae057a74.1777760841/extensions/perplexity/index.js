import { t as definePluginEntry } from "../../plugin-entry-55f8k4W7.js";
import { t as createPerplexityWebSearchProvider } from "../../perplexity-web-search-provider-JO_6HA1i.js";
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
