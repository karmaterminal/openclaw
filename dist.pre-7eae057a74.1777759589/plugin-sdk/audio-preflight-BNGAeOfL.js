import "./run-with-concurrency-CuSLxX3g.js";
import "./config-D5IaD4Ev.js";
import { L as logVerbose, z as shouldLogVerbose } from "./logger-Bl138Nx7.js";
import "./paths-0d8fBoC4.js";
import "./accounts-CDeh50cR.js";
import "./plugins-B3kpmHAh.js";
import "./thinking-BBd5fW7-.js";
import "./accounts-hXrSi_8B.js";
import "./image-ops-ZzuoW5g9.js";
import "./pi-embedded-helpers-Cd6r48nR.js";
import "./accounts-Bm5XfM0j.js";
import "./github-copilot-token-CKKBybuX.js";
import "./paths-D764z9IH.js";
import { i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, p as isAudioAttachment, t as runAudioTranscription } from "./audio-transcription-runner-BeZg5ipc.js";
import "./image-CvzKMYR7.js";
import "./chrome-DI43G0eR.js";
import "./skills-CbuRJQEj.js";
import "./path-alias-guards-CoYTMiOE.js";
import "./redact-C3rEm8A0.js";
import "./errors-B2jpHiod.js";
import "./fs-safe-D51tGdcB.js";
import "./proxy-env-DjJLsF2d.js";
import "./store-BBzpT7bm.js";
import "./tool-images-C381d9jB.js";
import "./fetch-guard-CN82-iNQ.js";
import "./api-key-rotation-BEXcTrRK.js";
import "./local-roots-DbAi6R2a.js";
import "./proxy-fetch-C-fXKPD2.js";

//#region src/media-understanding/audio-preflight.ts
/**
* Transcribes the first audio attachment BEFORE mention checking.
* This allows voice notes to be processed in group chats with requireMention: true.
* Returns the transcript or undefined if transcription fails or no audio is found.
*/
async function transcribeFirstAudio(params) {
	const { ctx, cfg } = params;
	const audioConfig = cfg.tools?.media?.audio;
	if (!audioConfig || audioConfig.enabled === false) return;
	const attachments = normalizeMediaAttachments(ctx);
	if (!attachments || attachments.length === 0) return;
	const firstAudio = attachments.find((att) => att && isAudioAttachment(att) && !att.alreadyTranscribed);
	if (!firstAudio) return;
	if (shouldLogVerbose()) logVerbose(`audio-preflight: transcribing attachment ${firstAudio.index} for mention check`);
	try {
		const { transcript } = await runAudioTranscription({
			ctx,
			cfg,
			attachments,
			agentDir: params.agentDir,
			providers: params.providers,
			activeModel: params.activeModel,
			localPathRoots: resolveMediaAttachmentLocalRoots({
				cfg,
				ctx
			})
		});
		if (!transcript) return;
		firstAudio.alreadyTranscribed = true;
		if (shouldLogVerbose()) logVerbose(`audio-preflight: transcribed ${transcript.length} chars from attachment ${firstAudio.index}`);
		return transcript;
	} catch (err) {
		if (shouldLogVerbose()) logVerbose(`audio-preflight: transcription failed: ${String(err)}`);
		return;
	}
}

//#endregion
export { transcribeFirstAudio };