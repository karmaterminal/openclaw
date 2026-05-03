import { i as resolveSignalAccount, n as listSignalAccountIds, r as resolveDefaultSignalAccountId, t as listEnabledSignalAccounts } from "../../accounts-B34fyc6N.js";
import { a as isSignalSenderAllowed, c as resolveSignalRecipient, d as looksLikeSignalTargetId, f as normalizeSignalMessagingTarget, i as isSignalGroupAllowed, l as resolveSignalSender, n as formatSignalSenderDisplay, o as normalizeSignalAllowRecipient, r as formatSignalSenderId, s as resolveSignalPeerId, t as formatSignalPairingIdLine, u as looksLikeUuid } from "../../identity-zSin1HgO.js";
import { i as resolveSignalOutboundTarget, n as createSignalPluginBase, r as signalSetupWizard, t as signalPlugin } from "../../channel-CVoXMoTX.js";
import { n as markdownToSignalTextChunks, t as markdownToSignalText } from "../../format-B2quwrMG.js";
import { n as sendReactionSignal, t as removeReactionSignal } from "../../reaction-runtime-api-DksOss_2.js";
import { n as resolveSignalReactionLevel, t as signalMessageActions } from "../../message-actions-DbZZAXoC.js";
import { r as normalizeSignalAccountInput, s as signalSetupAdapter } from "../../setup-core-ONOPf7xQ.js";
import { i as pickAsset, n as installSignalCli, r as looksLikeArchive, t as extractSignalCliArchive } from "../../install-signal-cli-a2n9qMHL.js";
import { t as monitorSignalProvider } from "../../monitor-BvN-R_ni.js";
import { n as sendReadReceiptSignal, r as sendTypingSignal, t as sendMessageSignal } from "../../send-jApDD3AW.js";
import { t as probeSignal } from "../../probe-DBAg_8bd.js";
//#region extensions/signal/src/channel.setup.ts
const signalSetupPlugin = { ...createSignalPluginBase({
	setupWizard: signalSetupWizard,
	setup: signalSetupAdapter
}) };
//#endregion
export { extractSignalCliArchive, formatSignalPairingIdLine, formatSignalSenderDisplay, formatSignalSenderId, installSignalCli, isSignalGroupAllowed, isSignalSenderAllowed, listEnabledSignalAccounts, listSignalAccountIds, looksLikeArchive, looksLikeSignalTargetId, looksLikeUuid, markdownToSignalText, markdownToSignalTextChunks, monitorSignalProvider, normalizeSignalAccountInput, normalizeSignalAllowRecipient, normalizeSignalMessagingTarget, pickAsset, probeSignal, removeReactionSignal, resolveDefaultSignalAccountId, resolveSignalAccount, resolveSignalOutboundTarget, resolveSignalPeerId, resolveSignalReactionLevel, resolveSignalRecipient, resolveSignalSender, sendMessageSignal, sendReactionSignal, sendReadReceiptSignal, sendTypingSignal, signalMessageActions, signalPlugin, signalSetupPlugin };
