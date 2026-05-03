import { createTokenjuiceOpenClawEmbeddedExtension } from "./runtime-api.js";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
//#region extensions/tokenjuice/index.ts
var tokenjuice_default = definePluginEntry({
	id: "tokenjuice",
	name: "tokenjuice",
	description: "Compacts exec and bash tool results with tokenjuice reducers.",
	register(api) {
		api.registerEmbeddedExtensionFactory(createTokenjuiceOpenClawEmbeddedExtension());
	}
});
//#endregion
export { tokenjuice_default as default };
