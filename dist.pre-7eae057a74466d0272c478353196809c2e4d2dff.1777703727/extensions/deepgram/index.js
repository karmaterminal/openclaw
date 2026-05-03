import { t as definePluginEntry } from "../../plugin-entry-CWUvi2Bu.js";
import { t as deepgramMediaUnderstandingProvider } from "../../media-understanding-provider-DfxOmkNZ.js";
import { n as buildDeepgramRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-B_bl12AM.js";
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
