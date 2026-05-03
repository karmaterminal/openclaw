import { t as formatDocsLink } from "../links-rWevNMpC.js";
import { s as isSecretRef } from "../types.secrets-Zn5Zyn7M.js";
import { r as buildChannelConfigSchema } from "../config-schema-BEuj464I.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-C3j_3_su.js";
import { s as getChatChannelMeta } from "../registry-B9khhdbq.js";
import { n as GoogleChatConfigSchema } from "../zod-schema.providers-core-Bl_XI-8U.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-CXs9BnMd.js";
import { a as createActionGate, f as readNumberParam, g as readStringParam, l as jsonResult, p as readReactionParams } from "../common-CKql4nPs.js";
import { t as loadWebMedia } from "../web-media-1yKSIgEY.js";
import { n as fetchRemoteMedia } from "../fetch-C1Ltj0rK.js";
import { n as resolveChannelGroupRequireMention } from "../group-policy-CT5xbEyP.js";
import { n as missingTargetError } from "../target-errors-ChiqfLTI.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-BUwww05E.js";
import { n as formatPairingApproveHint } from "../helpers-CKc1HMZb.js";
import { t as createAccountListHelpers } from "../account-helpers-BvmdSMp6.js";
import { n as emptyPluginConfigSchema } from "../config-schema-7b31iocI.js";
import { n as applySetupAccountConfigPatch, s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-Tkd91h7K.js";
import { i as resolveMentionGatingWithBypass, n as resolveInboundMentionDecision, r as resolveMentionGating } from "../mention-gating-DK2KrT0w.js";
import { r as runPassiveAccountLifecycle, t as createAccountStatusSink } from "../channel-lifecycle.core-F5URwzT-.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy, t as GROUP_POLICY_BLOCKED_LABEL } from "../runtime-group-policy-xUD2PMwD.js";
import "../channel-policy-C3JmxiGu.js";
import { n as isDangerousNameMatchingEnabled } from "../dangerous-name-matching-DuglfWYZ.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-Z-HJEE4g.js";
import { o as resolveDmGroupAccessWithLists } from "../dm-policy-shared-v2D_A37H.js";
import { c as listDirectoryUserEntriesFromAllowFrom, o as listDirectoryGroupEntriesFromMapKeys } from "../directory-config-helpers-DCMYjKSc.js";
import { t as resolveChannelMediaMaxBytes } from "../media-limits-q5Hb_t71.js";
import { Q as splitSetupEntries, X as setTopLevelChannelDmPolicyWithAllowFrom, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-SGW0PZbn.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../pairing-message-z4cKRnDu.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-C1Sr6WWN.js";
import { n as createChannelPairingController } from "../channel-pairing-DUoJRg5g.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-Bzp8yHOi.js";
import { t as extractToolSend } from "../tool-send-6saJuIQd.js";
import { a as createWebhookInFlightLimiter, i as beginWebhookRequestPipelineOrReject, s as readJsonWebhookBodyOrReject } from "../webhook-request-guards-oih9yid4.js";
import { n as resolveWebhookPath } from "../webhook-path-DIv5ki9p.js";
import { c as resolveWebhookTargets, l as withResolvedWebhookRequestPipeline, n as registerWebhookTargetWithPluginRoute, o as resolveWebhookTargetWithAuthOrReject } from "../webhook-targets-BiLVyyrM.js";
import "../webhook-ingress-BHSvugPC.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-DMV0ajOs.js";
import { r as resolveInboundRouteEnvelopeBuilderWithRuntime } from "../inbound-envelope-ctAh7grm.js";
import "../web-media-BAiBiLoM.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-DkEhfpco.js";
import { t as chunkTextForOutbound } from "../text-chunking-CUdhVfJz.js";
//#region src/plugin-sdk/googlechat.ts
function resolveGoogleChatGroupRequireMention(params) {
	return resolveChannelGroupRequireMention({
		cfg: params.cfg,
		channel: "googlechat",
		groupId: params.groupId,
		accountId: params.accountId
	});
}
const googlechatSetup = createOptionalChannelSetupSurface({
	channel: "googlechat",
	label: "Google Chat",
	npmSpec: "@openclaw/googlechat",
	docsPath: "/channels/googlechat"
});
const googlechatSetupAdapter = googlechatSetup.setupAdapter;
const googlechatSetupWizard = googlechatSetup.setupWizard;
//#endregion
export { DEFAULT_ACCOUNT_ID, GROUP_POLICY_BLOCKED_LABEL, GoogleChatConfigSchema, PAIRING_APPROVED_MESSAGE, addWildcardAllowFrom, applyAccountNameToChannelSection, applySetupAccountConfigPatch, beginWebhookRequestPipelineOrReject, buildChannelConfigSchema, buildComputedAccountStatusSnapshot, chunkTextForOutbound, createAccountListHelpers, createAccountStatusSink, createActionGate, createChannelPairingController, createChannelReplyPipeline, createWebhookInFlightLimiter, deleteAccountFromConfigSection, emptyPluginConfigSchema, evaluateGroupRouteAccessForPolicy, extractToolSend, fetchRemoteMedia, fetchWithSsrFGuard, formatDocsLink, formatPairingApproveHint, getChatChannelMeta, googlechatSetupAdapter, googlechatSetupWizard, isDangerousNameMatchingEnabled, isSecretRef, jsonResult, listDirectoryGroupEntriesFromMapKeys, listDirectoryUserEntriesFromAllowFrom, loadOutboundMediaFromUrl, loadWebMedia, mergeAllowFromEntries, migrateBaseNameToDefaultAccount, missingTargetError, normalizeAccountId, readJsonWebhookBodyOrReject, readNumberParam, readReactionParams, readStringParam, registerWebhookTargetWithPluginRoute, resolveAllowlistProviderRuntimeGroupPolicy, resolveChannelMediaMaxBytes, resolveDefaultGroupPolicy, resolveDmGroupAccessWithLists, resolveGoogleChatGroupRequireMention, resolveInboundMentionDecision, resolveInboundRouteEnvelopeBuilderWithRuntime, resolveMentionGating, resolveMentionGatingWithBypass, resolveSenderScopedGroupPolicy, resolveWebhookPath, resolveWebhookTargetWithAuthOrReject, resolveWebhookTargets, runPassiveAccountLifecycle, setAccountEnabledInConfigSection, setTopLevelChannelDmPolicyWithAllowFrom, splitSetupEntries, warnMissingProviderGroupPolicyFallbackOnce, withResolvedWebhookRequestPipeline };
