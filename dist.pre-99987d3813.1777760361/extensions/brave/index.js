import { t as definePluginEntry } from "../../plugin-entry-DX3V0eaU.js";
import { t as createBraveWebSearchProvider } from "../../brave-web-search-provider-CRY0Ym5s.js";
//#region extensions/brave/index.ts
var brave_default = definePluginEntry({
	id: "brave",
	name: "Brave Plugin",
	description: "Bundled Brave plugin",
	register(api) {
		api.registerWebSearchProvider(createBraveWebSearchProvider());
	}
});
//#endregion
export { brave_default as default };
