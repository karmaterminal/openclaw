import "./run-with-concurrency-BdEQVn3N.js";
import { i as resolveWhatsAppAccount } from "./accounts-CaPSfWnM.js";
import "./paths-MKyEVmEb.js";
import "./github-copilot-token-D5fdS6xD.js";
import "./config-CaBllgGy.js";
import "./logger-COmHOvdm.js";
import "./image-ops-CdDZeWxZ.js";
import "./plugins-DyG8cu5U.js";
import "./path-alias-guards-DlbgzmZl.js";
import "./fs-safe-Obb1u_C-.js";
import "./ssrf-BesSxuU6.js";
import "./fetch-guard-DNPVy4JO.js";
import "./local-roots-BHJ4izDa.js";
import "./ir-KJsBrGQR.js";
import "./render-HmipMDlP.js";
import "./tables-BvG1jnGU.js";
import "./tool-images-D6K-0Fi2.js";
import { f as readReactionParams, h as readStringParam, i as ToolAuthorizationError, l as jsonResult, o as createActionGate } from "./target-errors-avCKYpTR.js";
import { t as resolveWhatsAppOutboundTarget } from "./resolve-outbound-target-BEjIo8Iw.js";
import { r as sendReactionWhatsApp } from "./outbound-B-yoOgEc.js";

//#region src/agents/tools/whatsapp-target-auth.ts
function resolveAuthorizedWhatsAppOutboundTarget(params) {
	const account = resolveWhatsAppAccount({
		cfg: params.cfg,
		accountId: params.accountId
	});
	const resolution = resolveWhatsAppOutboundTarget({
		to: params.chatJid,
		allowFrom: account.allowFrom ?? [],
		mode: "implicit"
	});
	if (!resolution.ok) throw new ToolAuthorizationError(`WhatsApp ${params.actionLabel} blocked: chatJid "${params.chatJid}" is not in the configured allowFrom list for account "${account.accountId}".`);
	return {
		to: resolution.to,
		accountId: account.accountId
	};
}

//#endregion
//#region src/agents/tools/whatsapp-actions.ts
async function handleWhatsAppAction(params, cfg) {
	const action = readStringParam(params, "action", { required: true });
	const isActionEnabled = createActionGate(cfg.channels?.whatsapp?.actions);
	if (action === "react") {
		if (!isActionEnabled("reactions")) throw new Error("WhatsApp reactions are disabled.");
		const chatJid = readStringParam(params, "chatJid", { required: true });
		const messageId = readStringParam(params, "messageId", { required: true });
		const { emoji, remove, isEmpty } = readReactionParams(params, { removeErrorMessage: "Emoji is required to remove a WhatsApp reaction." });
		const participant = readStringParam(params, "participant");
		const accountId = readStringParam(params, "accountId");
		const fromMeRaw = params.fromMe;
		const fromMe = typeof fromMeRaw === "boolean" ? fromMeRaw : void 0;
		const resolved = resolveAuthorizedWhatsAppOutboundTarget({
			cfg,
			chatJid,
			accountId,
			actionLabel: "reaction"
		});
		const resolvedEmoji = remove ? "" : emoji;
		await sendReactionWhatsApp(resolved.to, messageId, resolvedEmoji, {
			verbose: false,
			fromMe,
			participant: participant ?? void 0,
			accountId: resolved.accountId
		});
		if (!remove && !isEmpty) return jsonResult({
			ok: true,
			added: emoji
		});
		return jsonResult({
			ok: true,
			removed: true
		});
	}
	throw new Error(`Unsupported WhatsApp action: ${action}`);
}

//#endregion
export { handleWhatsAppAction };