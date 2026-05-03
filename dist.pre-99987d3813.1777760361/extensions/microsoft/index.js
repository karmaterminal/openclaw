import { t as definePluginEntry } from "../../plugin-entry-DX3V0eaU.js";
import { t as buildMicrosoftSpeechProvider } from "../../speech-provider-D1eoexWi.js";
//#region extensions/microsoft/index.ts
var microsoft_default = definePluginEntry({
	id: "microsoft",
	name: "Microsoft Speech",
	description: "Bundled Microsoft speech provider",
	register(api) {
		api.registerSpeechProvider(buildMicrosoftSpeechProvider());
	}
});
//#endregion
export { microsoft_default as default };
