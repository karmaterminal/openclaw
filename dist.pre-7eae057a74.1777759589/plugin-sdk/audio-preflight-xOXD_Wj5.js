import "./run-with-concurrency-qFOkp49n.js";
import "./accounts-DS7iiFs-.js";
import "./paths-MKyEVmEb.js";
import "./github-copilot-token-D5fdS6xD.js";
import "./config-Btd0LI-j.js";
import { L as logVerbose, z as shouldLogVerbose } from "./logger-z1vqlUc1.js";
import "./thinking-kR5jJN3L.js";
import "./image-ops-Bg3knMR1.js";
import "./pi-embedded-helpers-uc3eMRHd.js";
import "./plugins-B4GwK3Rj.js";
import "./accounts-Dn1kIROL.js";
import "./accounts-DgVbHcmh.js";
import "./paths-NcyWgkDa.js";
import "./redact-DIGZ7dEc.js";
import "./errors-C-TFeu_U.js";
import "./path-alias-guards-CMpHLrQn.js";
import "./fs-safe-B8jm0acc.js";
import "./ssrf-CiWM-of0.js";
import "./fetch-guard-D2yx3er1.js";
import "./local-roots-ByEATgKL.js";
import "./tool-images-t66pDtTt.js";
import { f as isAudioAttachment, i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, t as runAudioTranscription } from "./audio-transcription-runner-B3Pg_S9T.js";
import "./skills-BjwW8PZ9.js";
import "./chrome-CGcutr3J.js";
import "./store-DkmbY1dw.js";
import "./image-BlsOf15Z.js";
import "./api-key-rotation-Cme_A8jS.js";
import "./proxy-fetch-DxlXp4Yi.js";

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