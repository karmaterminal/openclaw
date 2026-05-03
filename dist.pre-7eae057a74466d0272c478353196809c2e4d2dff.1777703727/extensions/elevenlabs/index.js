import { t as definePluginEntry } from "../../plugin-entry-CWUvi2Bu.js";
import { t as elevenLabsMediaUnderstandingProvider } from "../../media-understanding-provider-DuOp3hPf.js";
import { n as buildElevenLabsRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-D13s-ccc.js";
import { t as buildElevenLabsSpeechProvider } from "../../speech-provider-DhK5ZY-2.js";
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
