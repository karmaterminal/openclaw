import { i as resolveSignalAccount, n as listSignalAccountIds, r as resolveDefaultSignalAccountId, t as listEnabledSignalAccounts } from "../../accounts-CB9DTp6A.js";
import { a as isSignalSenderAllowed, c as resolveSignalRecipient, d as looksLikeSignalTargetId, f as normalizeSignalMessagingTarget, i as isSignalGroupAllowed, l as resolveSignalSender, n as formatSignalSenderDisplay, o as normalizeSignalAllowRecipient, r as formatSignalSenderId, s as resolveSignalPeerId, t as formatSignalPairingIdLine, u as looksLikeUuid } from "../../identity-CP1rnAKf.js";
import { i as resolveSignalOutboundTarget, n as createSignalPluginBase, r as signalSetupWizard, t as signalPlugin } from "../../channel-BaNH8Aj-.js";
import { n as markdownToSignalTextChunks, t as markdownToSignalText } from "../../format-DdWv3GLC.js";
import { n as sendReactionSignal, t as removeReactionSignal } from "../../reaction-runtime-api-1Uebf-RW.js";
import { n as resolveSignalReactionLevel, t as signalMessageActions } from "../../message-actions-DFZry9IT.js";
import { r as normalizeSignalAccountInput, s as signalSetupAdapter } from "../../setup-core-nN_-IlRJ.js";
import { i as pickAsset, n as installSignalCli, r as looksLikeArchive, t as extractSignalCliArchive } from "../../install-signal-cli-BhLd4guG.js";
import { t as monitorSignalProvider } from "../../monitor-dleNOZMM.js";
import { n as sendReadReceiptSignal, r as sendTypingSignal, t as sendMessageSignal } from "../../send-Ofid0olR.js";
import { t as probeSignal } from "../../probe-Y-H42ADF.js";
//#region extensions/signal/src/channel.setup.ts
const signalSetupPlugin = { ...createSignalPluginBase({
	setupWizard: signalSetupWizard,
	setup: signalSetupAdapter
}) };
//#endregion
export { extractSignalCliArchive, formatSignalPairingIdLine, formatSignalSenderDisplay, formatSignalSenderId, installSignalCli, isSignalGroupAllowed, isSignalSenderAllowed, listEnabledSignalAccounts, listSignalAccountIds, looksLikeArchive, looksLikeSignalTargetId, looksLikeUuid, markdownToSignalText, markdownToSignalTextChunks, monitorSignalProvider, normalizeSignalAccountInput, normalizeSignalAllowRecipient, normalizeSignalMessagingTarget, pickAsset, probeSignal, removeReactionSignal, resolveDefaultSignalAccountId, resolveSignalAccount, resolveSignalOutboundTarget, resolveSignalPeerId, resolveSignalReactionLevel, resolveSignalRecipient, resolveSignalSender, sendMessageSignal, sendReactionSignal, sendReadReceiptSignal, sendTypingSignal, signalMessageActions, signalPlugin, signalSetupPlugin };
