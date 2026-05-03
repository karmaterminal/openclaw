import { t as formatDocsLink } from "../links-BtCHUQX8.js";
import { s as isSecretRef } from "../types.secrets-D9j6Z-gp.js";
import { r as buildChannelConfigSchema } from "../config-schema-OPypi1r3.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-C3j_3_su.js";
import { s as getChatChannelMeta } from "../registry-B9khhdbq.js";
import { n as GoogleChatConfigSchema } from "../zod-schema.providers-core-pwraLvTt.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-5Cmu0jDX.js";
import { a as createActionGate, f as readNumberParam, g as readStringParam, l as jsonResult, p as readReactionParams } from "../common-B-ADznUd.js";
import { t as loadWebMedia } from "../web-media-BbckQqQN.js";
import { n as fetchRemoteMedia } from "../fetch-DOH2LvQG.js";
import { n as resolveChannelGroupRequireMention } from "../group-policy-BdLEPMDy.js";
import { n as missingTargetError } from "../target-errors-BxvHBkXn.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-xGgW25ph.js";
import { n as formatPairingApproveHint } from "../helpers-B7mjmIZr.js";
import { t as createAccountListHelpers } from "../account-helpers-Dc5rCzoi.js";
import { n as emptyPluginConfigSchema } from "../config-schema-Db8uIJi-.js";
import { n as applySetupAccountConfigPatch, s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-P3bVHWjM.js";
import { i as resolveMentionGatingWithBypass, n as resolveInboundMentionDecision, r as resolveMentionGating } from "../mention-gating-C2K3rSdY.js";
import { r as runPassiveAccountLifecycle, t as createAccountStatusSink } from "../channel-lifecycle.core-DnEHhnwk.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy, t as GROUP_POLICY_BLOCKED_LABEL } from "../runtime-group-policy-CX-BIMex.js";
import "../channel-policy-bYI4GGC4.js";
import { n as isDangerousNameMatchingEnabled } from "../dangerous-name-matching-I5PfgBjR.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-DnyCrhTl.js";
import { o as resolveDmGroupAccessWithLists } from "../dm-policy-shared-BJth4iHD.js";
import { c as listDirectoryUserEntriesFromAllowFrom, o as listDirectoryGroupEntriesFromMapKeys } from "../directory-config-helpers-DKJBxo_z.js";
import { t as resolveChannelMediaMaxBytes } from "../media-limits-C5cR4ACY.js";
import { Q as splitSetupEntries, X as setTopLevelChannelDmPolicyWithAllowFrom, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-xYUM67Xd.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../pairing-message-BsYveNuW.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-D2KHRdRa.js";
import { n as createChannelPairingController } from "../channel-pairing-_Cp-CTX3.js";
import { r as buildComputedAccountStatusSnapshot } from "../status-helpers-C2uknUoo.js";
import { t as extractToolSend } from "../tool-send-BbGlthSM.js";
import { a as createWebhookInFlightLimiter, i as beginWebhookRequestPipelineOrReject, s as readJsonWebhookBodyOrReject } from "../webhook-request-guards-BDcp31xN.js";
import { n as resolveWebhookPath } from "../webhook-path-Dr9dy6qw.js";
import { c as resolveWebhookTargets, l as withResolvedWebhookRequestPipeline, n as registerWebhookTargetWithPluginRoute, o as resolveWebhookTargetWithAuthOrReject } from "../webhook-targets-CaOppdUF.js";
import "../webhook-ingress-OluK3LE3.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-DtlXf9Sc.js";
import { r as resolveInboundRouteEnvelopeBuilderWithRuntime } from "../inbound-envelope-C91AxtLX.js";
import "../web-media-CSQ8_52c.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-CYC6XJ8s.js";
import { t as chunkTextForOutbound } from "../text-chunking-D8yliY5A.js";
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
