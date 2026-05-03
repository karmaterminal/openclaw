import { n as resolveOutboundSendDep } from "./send-deps-Bvg_8Idg.js";
import { t as resolveChannelMediaMaxBytes } from "./media-limits-CQ77xKpH.js";
import { J as setSetupChannelEnabled } from "./setup-wizard-helpers-BUrFPAqw.js";
import { t as PAIRING_APPROVED_MESSAGE } from "./pairing-message-BzFRA-MK.js";
import { t as detectBinary } from "./detect-binary-ClY2Pbct.js";
import { l as createDetectedBinaryStatus } from "./setup-wizard-proxy-rki1cKc8.js";
import "./setup-CIbZfN_l.js";
import "./setup-tools-p2pyBz-y.js";
import "./outbound-runtime-DZ1ygMJM.js";
import { s as resolveIMessageAccount } from "./media-contract-C2h3l3If.js";
import "./conversation-id-B2KC5gsn.js";
import { i as imessageDmPolicy, o as imessageSetupStatusBase, r as imessageCompletionNote, t as createIMessageCliPathTextInput } from "./setup-core-CKHN7cs2.js";
import { t as IMESSAGE_LEGACY_OUTBOUND_SEND_DEP_KEYS } from "./outbound-send-deps-BJxdCHBN.js";
import { t as probeIMessage } from "./probe-B-RNUm5Z.js";
import { n as sendMessageIMessage, t as monitorIMessageProvider } from "./monitor-C_9qUek8.js";
//#region extensions/imessage/src/setup-surface.ts
const channel = "imessage";
const imessageSetupWizard = {
	channel,
	status: createDetectedBinaryStatus({
		channelLabel: "iMessage",
		binaryLabel: "imsg",
		configuredLabel: imessageSetupStatusBase.configuredLabel,
		unconfiguredLabel: imessageSetupStatusBase.unconfiguredLabel,
		configuredHint: imessageSetupStatusBase.configuredHint,
		unconfiguredHint: imessageSetupStatusBase.unconfiguredHint,
		configuredScore: imessageSetupStatusBase.configuredScore,
		unconfiguredScore: imessageSetupStatusBase.unconfiguredScore,
		resolveConfigured: imessageSetupStatusBase.resolveConfigured,
		resolveBinaryPath: ({ cfg, accountId }) => resolveIMessageAccount({
			cfg,
			accountId
		}).config.cliPath ?? "imsg",
		detectBinary
	}),
	credentials: [],
	textInputs: [createIMessageCliPathTextInput(async ({ currentValue }) => {
		return !await detectBinary(currentValue ?? "imsg");
	})],
	completionNote: imessageCompletionNote,
	dmPolicy: imessageDmPolicy,
	disable: (cfg) => setSetupChannelEnabled(cfg, channel, false)
};
//#endregion
//#region extensions/imessage/src/channel.runtime.ts
async function sendIMessageOutbound(params) {
	const send = resolveOutboundSendDep(params.deps, "imessage", { legacyKeys: IMESSAGE_LEGACY_OUTBOUND_SEND_DEP_KEYS }) ?? sendMessageIMessage;
	const maxBytes = resolveChannelMediaMaxBytes({
		cfg: params.cfg,
		resolveChannelLimitMb: ({ cfg, accountId }) => cfg.channels?.imessage?.accounts?.[accountId]?.mediaMaxMb ?? cfg.channels?.imessage?.mediaMaxMb,
		accountId: params.accountId
	});
	return await send(params.to, params.text, {
		config: params.cfg,
		...params.mediaUrl ? { mediaUrl: params.mediaUrl } : {},
		...params.mediaLocalRoots?.length ? { mediaLocalRoots: params.mediaLocalRoots } : {},
		maxBytes,
		accountId: params.accountId ?? void 0,
		replyToId: params.replyToId ?? void 0
	});
}
async function notifyIMessageApproval(params) {
	await sendMessageIMessage(params.id, PAIRING_APPROVED_MESSAGE, { config: params.cfg });
}
async function probeIMessageAccount(params) {
	return await probeIMessage(params?.timeoutMs, {
		cliPath: params?.cliPath,
		dbPath: params?.dbPath
	});
}
async function startIMessageGatewayAccount(ctx) {
	const account = ctx.account;
	const cliPath = account.config.cliPath?.trim() || "imsg";
	const dbPath = account.config.dbPath?.trim();
	ctx.setStatus({
		accountId: account.accountId,
		cliPath,
		dbPath: dbPath ?? null
	});
	ctx.log?.info?.(`[${account.accountId}] starting provider (${cliPath}${dbPath ? ` db=${dbPath}` : ""})`);
	return await monitorIMessageProvider({
		accountId: account.accountId,
		config: ctx.cfg,
		runtime: ctx.runtime,
		abortSignal: ctx.abortSignal
	});
}
//#endregion
export { imessageSetupWizard, notifyIMessageApproval, probeIMessageAccount, sendIMessageOutbound, startIMessageGatewayAccount };
