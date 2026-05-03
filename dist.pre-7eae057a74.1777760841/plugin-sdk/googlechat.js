import { t as formatDocsLink } from "../links-BtCHUQX8.js";
import { s as isSecretRef } from "../types.secrets-D9j6Z-gp.js";
import { r as buildChannelConfigSchema } from "../config-schema-DiJ8qU0S.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-BgECLQdh.js";
import { s as getChatChannelMeta } from "../registry-fsTw8jzj.js";
import { n as GoogleChatConfigSchema } from "../zod-schema.providers-core-Bp3vv_ly.js";
import { t as loadWebMedia } from "../web-media-MW6CtKWh.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-CGnRnlqc.js";
import { n as fetchRemoteMedia } from "../fetch-x7RcyCHM.js";
import { n as resolveChannelGroupRequireMention } from "../group-policy-BPlpo6Sn.js";
import { _ as readStringParam, a as createActionGate, l as jsonResult, m as readReactionParams, p as readNumberParam } from "../common-D1R9Gsy-.js";
import { n as missingTargetError } from "../target-errors-DwMT0jM-.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-Bk8RR-p3.js";
import { n as formatPairingApproveHint } from "../helpers-C_fY8blz.js";
import { t as createAccountListHelpers } from "../account-helpers-DmMyNxOH.js";
import { n as emptyPluginConfigSchema } from "../config-schema-BXlA9hLi.js";
import { n as applySetupAccountConfigPatch, s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-B0_DD2vo.js";
import { i as resolveMentionGatingWithBypass, n as resolveInboundMentionDecision, r as resolveMentionGating } from "../mention-gating-Nag4TDUP.js";
import { r as runPassiveAccountLifecycle, t as createAccountStatusSink } from "../channel-lifecycle.core-CicSRw-d.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy, t as GROUP_POLICY_BLOCKED_LABEL } from "../runtime-group-policy-DgFYGny5.js";
import "../channel-policy-CX_gydMc.js";
import { n as isDangerousNameMatchingEnabled } from "../dangerous-name-matching-BaV3RTxY.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-C6HWZ6ES.js";
import { o as resolveDmGroupAccessWithLists } from "../dm-policy-shared-Ciwm0oRz.js";
import { c as listDirectoryUserEntriesFromAllowFrom, o as listDirectoryGroupEntriesFromMapKeys } from "../directory-config-helpers-k4DK9m6d.js";
import { t as resolveChannelMediaMaxBytes } from "../media-limits-Cjg17HFW.js";
import { Q as splitSetupEntries, X as setTopLevelChannelDmPolicyWithAllowFrom, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-DRvZV2lB.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../pairing-message-CU1aIkxt.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-CR0pMzMv.js";
import { n as createChannelPairingController } from "../channel-pairing-KFP6Mlrw.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-BMV2LHcC.js";
import { t as extractToolSend } from "../tool-send-Bl2rJUiA.js";
import { a as createWebhookInFlightLimiter, i as beginWebhookRequestPipelineOrReject, s as readJsonWebhookBodyOrReject } from "../webhook-request-guards-CY81CAci.js";
import { n as resolveWebhookPath } from "../webhook-path-DMUBIvn-.js";
import { c as resolveWebhookTargets, l as withResolvedWebhookRequestPipeline, n as registerWebhookTargetWithPluginRoute, o as resolveWebhookTargetWithAuthOrReject } from "../webhook-targets-CWt7PoKD.js";
import "../webhook-ingress-CatMjWw6.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-B-EEngUV.js";
import { r as resolveInboundRouteEnvelopeBuilderWithRuntime } from "../inbound-envelope-BnCYq0-2.js";
import "../web-media-CxJHnDS2.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-B5_ejkO_.js";
import { t as chunkTextForOutbound } from "../text-chunking-DYoPYUFQ.js";
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
