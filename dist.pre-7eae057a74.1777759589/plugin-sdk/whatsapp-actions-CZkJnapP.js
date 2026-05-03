import "./run-with-concurrency-qFOkp49n.js";
import { i as resolveWhatsAppAccount } from "./accounts-DS7iiFs-.js";
import "./paths-MKyEVmEb.js";
import "./github-copilot-token-D5fdS6xD.js";
import "./config-Btd0LI-j.js";
import "./logger-z1vqlUc1.js";
import "./image-ops-Bg3knMR1.js";
import "./plugins-B4GwK3Rj.js";
import "./path-alias-guards-CMpHLrQn.js";
import "./fs-safe-B8jm0acc.js";
import "./ssrf-CiWM-of0.js";
import "./fetch-guard-D2yx3er1.js";
import "./local-roots-ByEATgKL.js";
import "./ir-D9uGTnj_.js";
import "./render-HmipMDlP.js";
import "./tables-C1s_3rDs.js";
import "./tool-images-t66pDtTt.js";
import { f as readReactionParams, h as readStringParam, i as ToolAuthorizationError, l as jsonResult, o as createActionGate } from "./target-errors-CQWb4fJ7.js";
import { t as resolveWhatsAppOutboundTarget } from "./resolve-outbound-target-DluaETf4.js";
import { r as sendReactionWhatsApp } from "./outbound-CFx_3_uZ.js";

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