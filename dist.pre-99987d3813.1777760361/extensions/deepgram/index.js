import { t as definePluginEntry } from "../../plugin-entry-DX3V0eaU.js";
import { t as deepgramMediaUnderstandingProvider } from "../../media-understanding-provider-p0hCwqr9.js";
import { n as buildDeepgramRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-B3YlNwTf.js";
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
