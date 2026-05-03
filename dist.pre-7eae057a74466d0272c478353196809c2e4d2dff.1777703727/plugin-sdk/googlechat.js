import { t as formatDocsLink } from "../links-BtCHUQX8.js";
import { s as isSecretRef } from "../types.secrets-D9j6Z-gp.js";
import { r as buildChannelConfigSchema } from "../config-schema-DiJ8qU0S.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-BgECLQdh.js";
import { s as getChatChannelMeta } from "../registry-fsTw8jzj.js";
import { n as GoogleChatConfigSchema } from "../zod-schema.providers-core-Bp3vv_ly.js";
import { t as loadWebMedia } from "../web-media-BSRbIzTp.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-CyazlQiu.js";
import { n as fetchRemoteMedia } from "../fetch-CmGoByOT.js";
import { n as resolveChannelGroupRequireMention } from "../group-policy-CZ_c_sgP.js";
import { a as createActionGate, f as readNumberParam, g as readStringParam, l as jsonResult, p as readReactionParams } from "../common-B4GKOdcO.js";
import { n as missingTargetError } from "../target-errors-C26mORP7.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-_JhRSMYy.js";
import { n as formatPairingApproveHint } from "../helpers-nSennZYu.js";
import { t as createAccountListHelpers } from "../account-helpers-Djgvda_o.js";
import { n as emptyPluginConfigSchema } from "../config-schema-BkNA2J7m.js";
import { n as applySetupAccountConfigPatch, s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-BccLvWeE.js";
import { i as resolveMentionGatingWithBypass, n as resolveInboundMentionDecision, r as resolveMentionGating } from "../mention-gating-BXUHROwD.js";
import { r as runPassiveAccountLifecycle, t as createAccountStatusSink } from "../channel-lifecycle.core-CavdpUe1.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy, t as GROUP_POLICY_BLOCKED_LABEL } from "../runtime-group-policy-CprfbzN5.js";
import "../channel-policy-DlcrBTH1.js";
import { n as isDangerousNameMatchingEnabled } from "../dangerous-name-matching-BwMl_K7M.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-Dsm22n39.js";
import { o as resolveDmGroupAccessWithLists } from "../dm-policy-shared-DYG5WBEw.js";
import { c as listDirectoryUserEntriesFromAllowFrom, o as listDirectoryGroupEntriesFromMapKeys } from "../directory-config-helpers-BIhXE6rt.js";
import { t as resolveChannelMediaMaxBytes } from "../media-limits-CQ77xKpH.js";
import { Q as splitSetupEntries, X as setTopLevelChannelDmPolicyWithAllowFrom, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-BUrFPAqw.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../pairing-message-BzFRA-MK.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-DXBaPgkC.js";
import { n as createChannelPairingController } from "../channel-pairing-CeFF5BgJ.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-Cm_NW4Lp.js";
import { t as extractToolSend } from "../tool-send-Bqy0rOad.js";
import { a as createWebhookInFlightLimiter, i as beginWebhookRequestPipelineOrReject, s as readJsonWebhookBodyOrReject } from "../webhook-request-guards-BCuEm3up.js";
import { n as resolveWebhookPath } from "../webhook-path-9C8-ffAp.js";
import { c as resolveWebhookTargets, l as withResolvedWebhookRequestPipeline, n as registerWebhookTargetWithPluginRoute, o as resolveWebhookTargetWithAuthOrReject } from "../webhook-targets-BWFPxkiw.js";
import "../webhook-ingress-Bk8ReztY.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CjfxAeX0.js";
import { r as resolveInboundRouteEnvelopeBuilderWithRuntime } from "../inbound-envelope-BXvHKf59.js";
import "../web-media-DpaCXSOO.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-D0xJ-HSU.js";
import { t as chunkTextForOutbound } from "../text-chunking-4eYeKebf.js";
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
