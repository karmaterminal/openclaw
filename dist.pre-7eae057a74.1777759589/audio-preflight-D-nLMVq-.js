import "./run-with-concurrency-kEFC1Fle.js";
import "./paths-C6TxBCvO.js";
import { p as shouldLogVerbose, u as logVerbose } from "./subsystem-W834z9Wa.js";
import "./workspace-CPNwHoy5.js";
import "./logger-D4RcXHR-.js";
import "./model-selection-BNmx-5dK.js";
import "./github-copilot-token-D13V9YBz.js";
import "./legacy-names-Bkl4tjN-.js";
import "./thinking-BSI0A_UU.js";
import "./plugins-CicF7Sh0.js";
import "./accounts-DC0-no5N.js";
import "./accounts-CIZkE0D6.js";
import "./image-ops-B74f5UcL.js";
import "./pi-embedded-helpers-DfOkrX6e.js";
import "./chrome-D77jXkUt.js";
import "./frontmatter-BFHzrAY7.js";
import "./skills-Cz8U8OxJ.js";
import "./path-alias-guards-DBVdJRcc.js";
import "./redact-DGz6yigq.js";
import "./errors-DDrhcWHi.js";
import "./fs-safe-CeZ_BXcn.js";
import "./proxy-env-D9IYwjc-.js";
import "./store-CK_KPHGA.js";
import "./accounts-BKj4i_FA.js";
import "./paths-Cgd1FfOW.js";
import "./tool-images-CVs6nDvi.js";
import "./image-W9Gb15qU.js";
import { g as isAudioAttachment, i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, t as runAudioTranscription } from "./audio-transcription-runner-KEFoH8Ss.js";
import "./fetch-0LnRkPTm.js";
import "./fetch-guard-DesBvzYZ.js";
import "./api-key-rotation-B3SB7s0a.js";
import "./proxy-fetch-ChfJDZwG.js";

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