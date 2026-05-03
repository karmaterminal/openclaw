import { buildGoogleGeminiCliBackend } from "./cli-backend.js";
import { createGoogleVertexProvider } from "./provider-contract-api.js";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
//#region extensions/google/setup-api.ts
var setup_api_default = definePluginEntry({
	id: "google",
	name: "Google Setup",
	description: "Lightweight Google setup hooks",
	register(api) {
		api.registerProvider(createGoogleVertexProvider());
		api.registerCliBackend(buildGoogleGeminiCliBackend());
	}
});
//#endregion
export { setup_api_default as default };
