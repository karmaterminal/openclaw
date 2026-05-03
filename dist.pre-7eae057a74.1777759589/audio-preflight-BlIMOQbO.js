import "./run-with-concurrency-CzKd3TyW.js";
import "./paths-CaA28K0s.js";
import { L as logVerbose, z as shouldLogVerbose } from "./logger-03l-fZAz.js";
import "./model-selection-WyEm58rO.js";
import "./github-copilot-token-BWXANsA6.js";
import "./thinking-DKbNkKkp.js";
import "./plugins-DHwBwfve.js";
import "./accounts-CjXLO-eS.js";
import "./accounts-D47cE1ev.js";
import "./image-ops-CC5vYCmm.js";
import "./pi-embedded-helpers-CsoQ6d1E.js";
import "./chrome-QCDzWwCu.js";
import "./skills-BJG_E0cH.js";
import "./path-alias-guards-CJ-rXOZR.js";
import "./redact-BYyl-Ec1.js";
import "./errors-LUTSBF6A.js";
import "./fs-safe-BmvYOXgE.js";
import "./proxy-env-PcpFUT_T.js";
import "./store-zFtMoFf9.js";
import "./accounts-BQsXpBVA.js";
import "./paths-BtoBqtXI.js";
import "./tool-images-BkmC1jGw.js";
import "./image-CIRn5hMY.js";
import { g as isAudioAttachment, i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, t as runAudioTranscription } from "./audio-transcription-runner-CHMcAk_j.js";
import "./fetch-ty_paxDm.js";
import "./fetch-guard-C-snW-z9.js";
import "./api-key-rotation-BqhV26Z0.js";
import "./proxy-fetch-ukJ5M9an.js";

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