import { t as definePluginEntry } from "../../plugin-entry-55f8k4W7.js";
import { t as createBraveWebSearchProvider } from "../../brave-web-search-provider-BatJFxnY.js";
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
