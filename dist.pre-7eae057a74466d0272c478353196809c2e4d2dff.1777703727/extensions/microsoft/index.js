import { t as definePluginEntry } from "../../plugin-entry-CWUvi2Bu.js";
import { t as buildMicrosoftSpeechProvider } from "../../speech-provider-DgbdMmJs.js";
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
