import { t as formatDocsLink } from "../links-rWevNMpC.js";
import { o as isSecretRef } from "../types.secrets-BZ6RGKR0.js";
import { r as buildChannelConfigSchema } from "../config-schema-Bx16NlRy.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-BM1T6029.js";
import { s as getChatChannelMeta } from "../registry-CGsqKAN1.js";
import { n as GoogleChatConfigSchema } from "../zod-schema.providers-core-CXjNxjCG.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-NDEizKJq.js";
import { a as createActionGate, f as readNumberParam, g as readStringParam, l as jsonResult, p as readReactionParams } from "../common-BGcbYPyw.js";
import { t as loadWebMedia } from "../web-media-DDaJekDB.js";
import { n as fetchRemoteMedia } from "../fetch-CKlhIlXI.js";
import { n as resolveChannelGroupRequireMention } from "../group-policy-CEY2ADdg.js";
import { n as missingTargetError } from "../target-errors-V1PUylHc.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-BzagItDT.js";
import { n as formatPairingApproveHint } from "../helpers-DIuSKnxZ.js";
import { t as createAccountListHelpers } from "../account-helpers-DEi7CJ_w.js";
import { n as emptyPluginConfigSchema } from "../config-schema-TbKbeW26.js";
import { n as applySetupAccountConfigPatch, s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-Ch6SdLT5.js";
import { i as resolveMentionGatingWithBypass, n as resolveInboundMentionDecision, r as resolveMentionGating } from "../mention-gating-BKGfbk8Y.js";
import { r as runPassiveAccountLifecycle, t as createAccountStatusSink } from "../channel-lifecycle.core-CtqI7BO7.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy, t as GROUP_POLICY_BLOCKED_LABEL } from "../runtime-group-policy-D59aD4e1.js";
import "../channel-policy-2eyveIG3.js";
import { n as isDangerousNameMatchingEnabled } from "../dangerous-name-matching-DMcbgBOp.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-ZknbY9S8.js";
import { o as resolveDmGroupAccessWithLists } from "../dm-policy-shared-Bf6mvNz-.js";
import { c as listDirectoryUserEntriesFromAllowFrom, o as listDirectoryGroupEntriesFromMapKeys } from "../directory-config-helpers-sqK4lzqY.js";
import { t as resolveChannelMediaMaxBytes } from "../media-limits-Bs05bl9A.js";
import { Q as splitSetupEntries, X as setTopLevelChannelDmPolicyWithAllowFrom, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-D9irczka.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../pairing-message-Cr9eSf6F.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-CHJIyDeO.js";
import { n as createChannelPairingController } from "../channel-pairing-Di-QWGuY.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-BVCd57BM.js";
import { t as extractToolSend } from "../tool-send-BWTHOa0O.js";
import { a as createWebhookInFlightLimiter, i as beginWebhookRequestPipelineOrReject, s as readJsonWebhookBodyOrReject } from "../webhook-request-guards-BMnk847v.js";
import { n as resolveWebhookPath } from "../webhook-path-BIGunOZT.js";
import { c as resolveWebhookTargets, l as withResolvedWebhookRequestPipeline, n as registerWebhookTargetWithPluginRoute, o as resolveWebhookTargetWithAuthOrReject } from "../webhook-targets-C2_Acim_.js";
import "../webhook-ingress-BwLHLxph.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CKSW_MiQ.js";
import { r as resolveInboundRouteEnvelopeBuilderWithRuntime } from "../inbound-envelope-XMbnqfOv.js";
import "../web-media-BECDdbRC.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-CfH_b7TM.js";
import { t as chunkTextForOutbound } from "../text-chunking-NSR9jiEh.js";
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
