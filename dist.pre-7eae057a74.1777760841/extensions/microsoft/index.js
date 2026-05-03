import { t as definePluginEntry } from "../../plugin-entry-55f8k4W7.js";
import { t as buildMicrosoftSpeechProvider } from "../../speech-provider-tGDT3V38.js";
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
