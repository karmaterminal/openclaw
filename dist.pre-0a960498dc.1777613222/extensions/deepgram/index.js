import { t as definePluginEntry } from "../../plugin-entry-BMrQ8lmP.js";
import { t as deepgramMediaUnderstandingProvider } from "../../media-understanding-provider-m6xmT2JQ.js";
import { n as buildDeepgramRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-01pHkBkW.js";
//#region extensions/deepgram/index.ts
var deepgram_default = definePluginEntry({
	id: "deepgram",
	name: "Deepgram Media Understanding",
	description: "Bundled Deepgram audio transcription provider",
	register(api) {
		api.registerMediaUnderstandingProvider(deepgramMediaUnderstandingProvider);
		api.registerRealtimeTranscriptionProvider(buildDeepgramRealtimeTranscriptionProvider());
	}
});
//#endregion
export { deepgram_default as default };
