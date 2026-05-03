import "./run-with-concurrency-BdEQVn3N.js";
import "./accounts-CaPSfWnM.js";
import "./paths-MKyEVmEb.js";
import "./github-copilot-token-D5fdS6xD.js";
import "./config-CaBllgGy.js";
import { L as logVerbose, z as shouldLogVerbose } from "./logger-COmHOvdm.js";
import "./thinking-CPOP0NIr.js";
import "./image-ops-CdDZeWxZ.js";
import "./pi-embedded-helpers-ChoQnOq_.js";
import "./plugins-DyG8cu5U.js";
import "./accounts-DD7y5M6h.js";
import "./accounts-B_HBMJks.js";
import "./paths-B2ytnsaB.js";
import "./redact-DZTeCKgA.js";
import "./errors-x0EvNKYN.js";
import "./path-alias-guards-DlbgzmZl.js";
import "./fs-safe-Obb1u_C-.js";
import "./ssrf-BesSxuU6.js";
import "./fetch-guard-DNPVy4JO.js";
import "./local-roots-BHJ4izDa.js";
import "./tool-images-D6K-0Fi2.js";
import { f as isAudioAttachment, i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, t as runAudioTranscription } from "./audio-transcription-runner-Dsjf5zdW.js";
import "./skills-CqN_AYcL.js";
import "./chrome-Beue5DYX.js";
import "./store-iFyY2mI0.js";
import "./image-BthBXHfu.js";
import "./api-key-rotation-BWJtN56K.js";
import "./proxy-fetch-BZAtM2fT.js";

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