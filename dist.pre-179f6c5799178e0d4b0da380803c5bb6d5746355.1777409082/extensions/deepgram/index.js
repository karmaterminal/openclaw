import { t as definePluginEntry } from "../../plugin-entry-Bd-NQPpx.js";
import { t as deepgramMediaUnderstandingProvider } from "../../media-understanding-provider-DOd2seUu.js";
import { n as buildDeepgramRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-BVoHU2AX.js";
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
