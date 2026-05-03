import { a as logVerbose, c as shouldLogVerbose } from "./globals-d3aR1MYC.js";
import "./paths-BMo6kTge.js";
import "./subsystem-Cfn2Pryx.js";
import "./boolean-DtWR5bt3.js";
import "./auth-profiles-g_IwaokD.js";
import "./agent-scope-C5bklqr1.js";
import "./utils-cwpAMi-t.js";
import "./openclaw-root-BFfBQ6FD.js";
import "./logger-DB-PHqB2.js";
import "./exec-B45rafWZ.js";
import "./registry-BrR1Dq5T.js";
import "./github-copilot-token-Byc_YVYE.js";
import "./host-env-security-lcjXF83D.js";
import "./version-DdJhsIqk.js";
import "./env-vars-mSSOl7Rv.js";
import "./manifest-registry-OQDPluXW.js";
import "./dock-BaM5oTqE.js";
import "./frontmatter-D2o8_Jfu.js";
import "./skills-Ll6WzK-U.js";
import "./path-alias-guards-DbNvNQar.js";
import "./message-channel-CXgeX9no.js";
import "./sessions-hV-TIgW5.js";
import "./plugins-B4AetCpQ.js";
import "./accounts-CucAhPu5.js";
import "./accounts-DarjcXFz.js";
import "./logging-CcxUDNcI.js";
import "./accounts-DjUjM_0M.js";
import "./paths-DvFmz0MB.js";
import "./chat-envelope-D3RSz140.js";
import "./net-DULSGgS2.js";
import "./tailnet-D3gLcYwp.js";
import "./image-ops-WJSAG5_7.js";
import "./pi-embedded-helpers-RQ0iakKf.js";
import "./sandbox-Cl58Ljp3.js";
import "./tool-catalog-C04U7H3F.js";
import "./chrome-DEp-MaR1.js";
import "./tailscale-D4zNU-0Q.js";
import "./auth-l3KQ3Wf5.js";
import "./server-context-BxBFV2PX.js";
import "./paths-BaZIBy3U.js";
import "./redact-DwuqxSL3.js";
import "./errors-CIvF1JsC.js";
import "./fs-safe-CYrszQI6.js";
import "./proxy-env-BwTY9-9I.js";
import "./store-OqcrqyHY.js";
import "./ports-DA8HamoF.js";
import "./trash-Dq9t9uID.js";
import "./server-middleware-pRerXlG7.js";
import "./tool-images-J7V8AfTu.js";
import "./thinking-CrcT589P.js";
import "./models-config-CqksOjvw.js";
import "./model-catalog-Dt1OZnEX.js";
import "./fetch-Ccpbk46-.js";
import { _ as isAudioAttachment, i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, t as runAudioTranscription } from "./audio-transcription-runner-pmha7xer.js";
import "./fetch-guard-DDRvavBV.js";
import "./image-CDAh06e7.js";
import "./tool-display-DJA6wQza.js";
import "./api-key-rotation-CEy6dwiS.js";
import "./proxy-fetch-BSCpx7Yz.js";

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