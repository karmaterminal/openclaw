import { t as definePluginEntry } from "../../plugin-entry-C5CNAgRN.js";
import { t as elevenLabsMediaUnderstandingProvider } from "../../media-understanding-provider-BSeklHwB.js";
import { n as buildElevenLabsRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-CNSFcCkq.js";
import { t as buildElevenLabsSpeechProvider } from "../../speech-provider-B5XUnOES.js";
//#region extensions/elevenlabs/index.ts
var elevenlabs_default = definePluginEntry({
	id: "elevenlabs",
	name: "ElevenLabs Speech",
	description: "Bundled ElevenLabs speech provider",
	register(api) {
		api.registerSpeechProvider(buildElevenLabsSpeechProvider());
		api.registerMediaUnderstandingProvider(elevenLabsMediaUnderstandingProvider);
		api.registerRealtimeTranscriptionProvider(buildElevenLabsRealtimeTranscriptionProvider());
	}
});
//#endregion
export { elevenlabs_default as default };
