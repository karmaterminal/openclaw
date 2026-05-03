import { t as definePluginEntry } from "../../plugin-entry-55f8k4W7.js";
import { t as groqMediaUnderstandingProvider } from "../../media-understanding-provider-BP_2U1Pb.js";
//#region extensions/groq/index.ts
var groq_default = definePluginEntry({
	id: "groq",
	name: "Groq Media Understanding",
	description: "Bundled Groq audio transcription provider",
	register(api) {
		api.registerMediaUnderstandingProvider(groqMediaUnderstandingProvider);
	}
});
//#endregion
export { groq_default as default };
