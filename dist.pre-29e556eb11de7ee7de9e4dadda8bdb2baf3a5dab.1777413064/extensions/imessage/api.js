import { a as resolveServicePrefixedAllowTarget, c as resolveServicePrefixedTarget, i as parseChatTargetPrefixesOrThrow, o as resolveServicePrefixedChatTarget, r as parseChatAllowTargetPrefixes, s as resolveServicePrefixedOrChatAllowTarget, t as createAllowedChatSenderMatcher } from "../../chat-target-prefixes-DgRsjseA.js";
import { a as listIMessageAccountIds, i as listEnabledIMessageAccounts, o as resolveDefaultIMessageAccountId, s as resolveIMessageAccount } from "../../media-contract-HRhLK-e7.js";
import { a as formatIMessageChatTarget, c as looksLikeIMessageExplicitTargetId, d as parseIMessageTarget, f as looksLikeIMessageTargetId, i as resolveIMessageConversationIdFromTarget, l as normalizeIMessageHandle, n as matchIMessageAcpConversation, o as inferIMessageTargetChatType, p as normalizeIMessageMessagingTarget, r as normalizeIMessageAcpConversationId, s as isAllowedIMessageSender, t as resolveIMessageInboundConversationId, u as parseIMessageAllowTarget } from "../../conversation-id--zASS1Bq.js";
import { n as createIMessageConversationBindingManager, t as __testing } from "../../conversation-bindings-C3dwqs9X.js";
import { n as resolveIMessageGroupToolPolicy, t as resolveIMessageGroupRequireMention } from "../../group-policy-DTVOe8Li.js";
import { a as imessageSetupAdapter } from "../../setup-core-TktYE9JX.js";
import { n as createIMessagePluginBase, r as imessageSetupWizard, t as imessagePlugin } from "../../channel-Dj3bE0Mc.js";
import { t as IMESSAGE_LEGACY_OUTBOUND_SEND_DEP_KEYS } from "../../outbound-send-deps-BUNC6P0r.js";
import { r as DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS, t as probeIMessage } from "../../probe-DvK976Do.js";
//#region extensions/imessage/src/channel.setup.ts
const imessageSetupPlugin = { ...createIMessagePluginBase({
	setupWizard: imessageSetupWizard,
	setup: imessageSetupAdapter
}) };
//#endregion
export { DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS, IMESSAGE_LEGACY_OUTBOUND_SEND_DEP_KEYS, __testing, createAllowedChatSenderMatcher, createIMessageConversationBindingManager, formatIMessageChatTarget, imessagePlugin, imessageSetupPlugin, inferIMessageTargetChatType, isAllowedIMessageSender, listEnabledIMessageAccounts, listIMessageAccountIds, looksLikeIMessageExplicitTargetId, looksLikeIMessageTargetId, matchIMessageAcpConversation, normalizeIMessageAcpConversationId, normalizeIMessageHandle, normalizeIMessageMessagingTarget, parseChatAllowTargetPrefixes, parseChatTargetPrefixesOrThrow, parseIMessageAllowTarget, parseIMessageTarget, probeIMessage, resolveDefaultIMessageAccountId, resolveIMessageAccount, resolveIMessageConversationIdFromTarget, resolveIMessageGroupRequireMention, resolveIMessageGroupToolPolicy, resolveIMessageInboundConversationId, resolveServicePrefixedAllowTarget, resolveServicePrefixedChatTarget, resolveServicePrefixedOrChatAllowTarget, resolveServicePrefixedTarget };
