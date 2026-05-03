import { i as resolveSignalAccount, n as listSignalAccountIds, r as resolveDefaultSignalAccountId, t as listEnabledSignalAccounts } from "../../accounts-DkJQtaMB.js";
import { a as isSignalSenderAllowed, c as resolveSignalRecipient, d as looksLikeSignalTargetId, f as normalizeSignalMessagingTarget, i as isSignalGroupAllowed, l as resolveSignalSender, n as formatSignalSenderDisplay, o as normalizeSignalAllowRecipient, r as formatSignalSenderId, s as resolveSignalPeerId, t as formatSignalPairingIdLine, u as looksLikeUuid } from "../../identity-BjDcSIg_.js";
import { i as resolveSignalOutboundTarget, n as createSignalPluginBase, r as signalSetupWizard, t as signalPlugin } from "../../channel-BaGwldZn.js";
import { n as markdownToSignalTextChunks, t as markdownToSignalText } from "../../format-C9tebdJt.js";
import { n as sendReactionSignal, t as removeReactionSignal } from "../../reaction-runtime-api-B1gPa5iJ.js";
import { n as resolveSignalReactionLevel, t as signalMessageActions } from "../../message-actions-CTNegspE.js";
import { r as normalizeSignalAccountInput, s as signalSetupAdapter } from "../../setup-core-CB02VGwa.js";
import { i as pickAsset, n as installSignalCli, r as looksLikeArchive, t as extractSignalCliArchive } from "../../install-signal-cli-B6_KSUzN.js";
import { t as monitorSignalProvider } from "../../monitor-4q2T5hEi.js";
import { n as sendReadReceiptSignal, r as sendTypingSignal, t as sendMessageSignal } from "../../send-DhKqTX_g.js";
import { t as probeSignal } from "../../probe-CJbxcvLZ.js";
//#region extensions/signal/src/channel.setup.ts
const signalSetupPlugin = { ...createSignalPluginBase({
	setupWizard: signalSetupWizard,
	setup: signalSetupAdapter
}) };
//#endregion
export { extractSignalCliArchive, formatSignalPairingIdLine, formatSignalSenderDisplay, formatSignalSenderId, installSignalCli, isSignalGroupAllowed, isSignalSenderAllowed, listEnabledSignalAccounts, listSignalAccountIds, looksLikeArchive, looksLikeSignalTargetId, looksLikeUuid, markdownToSignalText, markdownToSignalTextChunks, monitorSignalProvider, normalizeSignalAccountInput, normalizeSignalAllowRecipient, normalizeSignalMessagingTarget, pickAsset, probeSignal, removeReactionSignal, resolveDefaultSignalAccountId, resolveSignalAccount, resolveSignalOutboundTarget, resolveSignalPeerId, resolveSignalReactionLevel, resolveSignalRecipient, resolveSignalSender, sendMessageSignal, sendReactionSignal, sendReadReceiptSignal, sendTypingSignal, signalMessageActions, signalPlugin, signalSetupPlugin };
