import { t as formatDocsLink } from "../links-rWevNMpC.js";
import { o as isSecretRef } from "../types.secrets-v6szeegc.js";
import { r as buildChannelConfigSchema } from "../config-schema-CNOE4EfY.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-DWChvwa8.js";
import { s as getChatChannelMeta } from "../registry-CW3lfH7N.js";
import { n as GoogleChatConfigSchema } from "../zod-schema.providers-core-I4XTf8vQ.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-LAmyTYUM.js";
import { a as createActionGate, f as readNumberParam, g as readStringParam, l as jsonResult, p as readReactionParams } from "../common-CiiKqT5H.js";
import { t as loadWebMedia } from "../web-media-Cfnn4itl.js";
import { n as fetchRemoteMedia } from "../fetch-L_eW1odx.js";
import { n as resolveChannelGroupRequireMention } from "../group-policy-D7UpbBIi.js";
import { n as missingTargetError } from "../target-errors-BxvHBkXn.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-C4ORopgz.js";
import { n as formatPairingApproveHint } from "../helpers-CdDG09w4.js";
import { t as createAccountListHelpers } from "../account-helpers-DIhdXOQH.js";
import { n as emptyPluginConfigSchema } from "../config-schema-2J3lBwCn.js";
import { n as applySetupAccountConfigPatch, s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-D2FCSunP.js";
import { i as resolveMentionGatingWithBypass, n as resolveInboundMentionDecision, r as resolveMentionGating } from "../mention-gating-CKuPxaSQ.js";
import { r as runPassiveAccountLifecycle, t as createAccountStatusSink } from "../channel-lifecycle.core-B6TjxQ7O.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy, t as GROUP_POLICY_BLOCKED_LABEL } from "../runtime-group-policy-C6LDEhXP.js";
import "../channel-policy-Cl9eciR_.js";
import { n as isDangerousNameMatchingEnabled } from "../dangerous-name-matching-CiUaGEwk.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-CAKBAsAc.js";
import { o as resolveDmGroupAccessWithLists } from "../dm-policy-shared-C4gD5QZm.js";
import { c as listDirectoryUserEntriesFromAllowFrom, o as listDirectoryGroupEntriesFromMapKeys } from "../directory-config-helpers-aHY_Da38.js";
import { t as resolveChannelMediaMaxBytes } from "../media-limits-Dc7-ip3g.js";
import { Q as splitSetupEntries, X as setTopLevelChannelDmPolicyWithAllowFrom, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-hupe-kT7.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../pairing-message-Bv-ba-Xw.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-BS4-Z0kM.js";
import { n as createChannelPairingController } from "../channel-pairing-J21HARkM.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-BJQYcoys.js";
import { t as extractToolSend } from "../tool-send-D-mmw_3P.js";
import { a as createWebhookInFlightLimiter, i as beginWebhookRequestPipelineOrReject, s as readJsonWebhookBodyOrReject } from "../webhook-request-guards-D66StMnH.js";
import { n as resolveWebhookPath } from "../webhook-path-D9opjpz6.js";
import { c as resolveWebhookTargets, l as withResolvedWebhookRequestPipeline, n as registerWebhookTargetWithPluginRoute, o as resolveWebhookTargetWithAuthOrReject } from "../webhook-targets-Cgswfzay.js";
import "../webhook-ingress-DJHUcvA_.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CiBZcClL.js";
import { r as resolveInboundRouteEnvelopeBuilderWithRuntime } from "../inbound-envelope-pQ88f5VM.js";
import "../web-media-C7qZPF01.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-fw18dk38.js";
import { t as chunkTextForOutbound } from "../text-chunking-Do7UsKJv.js";
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
