import { a as resolveServicePrefixedAllowTarget, c as resolveServicePrefixedTarget, i as parseChatTargetPrefixesOrThrow, o as resolveServicePrefixedChatTarget, r as parseChatAllowTargetPrefixes, s as resolveServicePrefixedOrChatAllowTarget, t as createAllowedChatSenderMatcher } from "../../chat-target-prefixes-C4FJbyQQ.js";
import { a as listIMessageAccountIds, i as listEnabledIMessageAccounts, o as resolveDefaultIMessageAccountId, s as resolveIMessageAccount } from "../../media-contract-5zCQVHi9.js";
import { a as formatIMessageChatTarget, c as looksLikeIMessageExplicitTargetId, d as parseIMessageTarget, f as looksLikeIMessageTargetId, i as resolveIMessageConversationIdFromTarget, l as normalizeIMessageHandle, n as matchIMessageAcpConversation, o as inferIMessageTargetChatType, p as normalizeIMessageMessagingTarget, r as normalizeIMessageAcpConversationId, s as isAllowedIMessageSender, t as resolveIMessageInboundConversationId, u as parseIMessageAllowTarget } from "../../conversation-id-DKHOiOgc.js";
import { n as createIMessageConversationBindingManager, t as __testing } from "../../conversation-bindings-BUrEjfL7.js";
import { n as resolveIMessageGroupToolPolicy, t as resolveIMessageGroupRequireMention } from "../../group-policy-ClwKKlqn.js";
import { a as imessageSetupAdapter } from "../../setup-core-DJaLeOwC.js";
import { n as createIMessagePluginBase, r as imessageSetupWizard, t as imessagePlugin } from "../../channel-DM-nsDpn.js";
import { t as IMESSAGE_LEGACY_OUTBOUND_SEND_DEP_KEYS } from "../../outbound-send-deps-ClDjyDU0.js";
import { r as DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS, t as probeIMessage } from "../../probe-Dl3CWeIH.js";
//#region extensions/imessage/src/channel.setup.ts
const imessageSetupPlugin = { ...createIMessagePluginBase({
	setupWizard: imessageSetupWizard,
	setup: imessageSetupAdapter
}) };
//#endregion
export { DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS, IMESSAGE_LEGACY_OUTBOUND_SEND_DEP_KEYS, __testing, createAllowedChatSenderMatcher, createIMessageConversationBindingManager, formatIMessageChatTarget, imessagePlugin, imessageSetupPlugin, inferIMessageTargetChatType, isAllowedIMessageSender, listEnabledIMessageAccounts, listIMessageAccountIds, looksLikeIMessageExplicitTargetId, looksLikeIMessageTargetId, matchIMessageAcpConversation, normalizeIMessageAcpConversationId, normalizeIMessageHandle, normalizeIMessageMessagingTarget, parseChatAllowTargetPrefixes, parseChatTargetPrefixesOrThrow, parseIMessageAllowTarget, parseIMessageTarget, probeIMessage, resolveDefaultIMessageAccountId, resolveIMessageAccount, resolveIMessageConversationIdFromTarget, resolveIMessageGroupRequireMention, resolveIMessageGroupToolPolicy, resolveIMessageInboundConversationId, resolveServicePrefixedAllowTarget, resolveServicePrefixedChatTarget, resolveServicePrefixedOrChatAllowTarget, resolveServicePrefixedTarget };
