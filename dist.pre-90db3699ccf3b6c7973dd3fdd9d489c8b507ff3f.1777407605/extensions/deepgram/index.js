import { t as definePluginEntry } from "../../plugin-entry-C5CNAgRN.js";
import { t as deepgramMediaUnderstandingProvider } from "../../media-understanding-provider-Diqe9dK3.js";
import { n as buildDeepgramRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-B5MhGU3u.js";
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
