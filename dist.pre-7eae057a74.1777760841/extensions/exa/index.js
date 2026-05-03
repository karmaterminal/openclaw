import { t as definePluginEntry } from "../../plugin-entry-55f8k4W7.js";
import { t as createExaWebSearchProvider } from "../../exa-web-search-provider-D8QVuK1n.js";
//#region extensions/exa/index.ts
var exa_default = definePluginEntry({
	id: "exa",
	name: "Exa Plugin",
	description: "Bundled Exa web search plugin",
	register(api) {
		api.registerWebSearchProvider(createExaWebSearchProvider());
	}
});
//#endregion
export { exa_default as default };
