import { t as definePluginEntry } from "../../plugin-entry-C5CNAgRN.js";
import { n as migrateElevenLabsLegacyTalkConfig } from "../../config-compat-pAla4TLe.js";
//#region extensions/elevenlabs/setup-api.ts
var setup_api_default = definePluginEntry({
	id: "elevenlabs",
	name: "ElevenLabs Setup",
	description: "Lightweight ElevenLabs setup hooks",
	register(api) {
		api.registerConfigMigration((config) => migrateElevenLabsLegacyTalkConfig(config));
	}
});
//#endregion
export { setup_api_default as default };
