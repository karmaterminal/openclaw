import { t as definePluginEntry } from "../../plugin-entry-55f8k4W7.js";
import { t as elevenLabsMediaUnderstandingProvider } from "../../media-understanding-provider-QvQJ5e7n.js";
import { n as buildElevenLabsRealtimeTranscriptionProvider } from "../../realtime-transcription-provider-C9oLrBEr.js";
import { t as buildElevenLabsSpeechProvider } from "../../speech-provider-Gr0YRbg0.js";
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
