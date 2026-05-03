import "./paths-BBP4yd-2.js";
import { a as logVerbose, c as shouldLogVerbose } from "./globals-DyWRcjQY.js";
import "./utils-xFiJOAuL.js";
import "./thinking-44rmAw5o.js";
import "./agent-scope-Ckfy1eLE.js";
import "./subsystem-D5pRlZe-.js";
import "./openclaw-root-DeEQQJyX.js";
import "./logger-DHGbafYr.js";
import "./exec-XzljJcHM.js";
import "./model-selection-B7i1xwmj.js";
import "./registry-XafKMtuN.js";
import "./github-copilot-token-b6kJVrW-.js";
import "./boolean-BsqeuxE6.js";
import "./env-BCNBCy-T.js";
import "./host-env-security-DkAVVuaw.js";
import "./env-vars-ausEv-bN.js";
import "./manifest-registry-DiKIwPkg.js";
import "./dock-izkws-7a.js";
import "./message-channel-Coo3AumC.js";
import "./plugins-C-DJ8VF0.js";
import "./sessions-hH4RZHXu.js";
import { d as isAudioAttachment, i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, t as runAudioTranscription } from "./audio-transcription-runner-D1-AS8lW.js";
import "./image-NqXQp4pe.js";
import "./models-config-DBOUE3xm.js";
import "./pi-embedded-helpers-B8Soklxw.js";
import "./sandbox-DV5q6tDX.js";
import "./tool-catalog-IBWCA-2a.js";
import "./chrome-kG6SrbKs.js";
import "./tailscale-C5C--kZ7.js";
import "./tailnet-DnnT7RoK.js";
import "./ws-B-4c8QAU.js";
import "./auth-5JNASLRO.js";
import "./server-context-BB0KK6cn.js";
import "./frontmatter-CPpXT7mj.js";
import "./skills-K_AvhMjw.js";
import "./path-alias-guards-BzAaCM2k.js";
import "./paths-DsAAtf_q.js";
import "./redact-BqKx9qRR.js";
import "./errors-Cy92QOI2.js";
import "./fs-safe-CzdOncES.js";
import "./proxy-env-C4oZExsB.js";
import "./image-ops-Ch2CLeu6.js";
import "./store-BlIp3Z05.js";
import "./ports-B0WT9bUh.js";
import "./trash-DAtocVs0.js";
import "./server-middleware-zHKzC2fG.js";
import "./accounts-Bs8C-nBJ.js";
import "./accounts-CE4KB6jl.js";
import "./logging-D3KTM1pH.js";
import "./accounts-BeOiY-ju.js";
import "./paths-D24h0XR4.js";
import "./chat-envelope-DL2R5pK6.js";
import "./tool-images-BEtbcBPl.js";
import "./tool-display-Cut-pYoU.js";
import "./fetch-guard-5TXduTad.js";
import "./api-key-rotation-nAjZn2ZC.js";
import "./local-roots-NtbX4ANR.js";
import "./model-catalog-CkbRflRC.js";
import "./proxy-fetch-B2HeV-cc.js";

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