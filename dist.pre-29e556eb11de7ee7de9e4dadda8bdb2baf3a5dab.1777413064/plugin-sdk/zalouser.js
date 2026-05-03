import { n as resolvePreferredOpenClawTmpDir } from "../tmp-openclaw-dir-CoGSA-7K.js";
import { h as MarkdownConfigSchema } from "../zod-schema.core-BR1v7ukx.js";
import { r as buildChannelConfigSchema } from "../config-schema-BEuj464I.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-C3j_3_su.js";
import { c as ToolPolicySchema } from "../zod-schema.agent-runtime-C-c82OTL.js";
import { i as loadBundledPluginPublicSurfaceModuleSync } from "../facade-loader-2P4UQTnv.js";
import { b as sendPayloadWithChunkedTextAndMedia, f as resolveOutboundMediaUrls, g as sendMediaWithLeadingCaption, i as deliverTextOrMediaReply, l as isNumericTargetId, m as resolveSendableOutboundReplyParts } from "../reply-payload-CTjR9c6j.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-BUwww05E.js";
import { n as formatPairingApproveHint } from "../helpers-CKc1HMZb.js";
import { t as createAccountListHelpers } from "../account-helpers-BvmdSMp6.js";
import { n as emptyPluginConfigSchema } from "../config-schema-7b31iocI.js";
import { l as patchScopedAccountConfig, n as applySetupAccountConfigPatch, s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-Tkd91h7K.js";
import { i as resolveMentionGatingWithBypass, n as resolveInboundMentionDecision, r as resolveMentionGating } from "../mention-gating-DK2KrT0w.js";
import { i as mergeAllowlist, o as summarizeMapping } from "../resolve-utils-BJKbGwAn.js";
import { t as formatAllowFromLowercase } from "../allow-from-BVa9WcRJ.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, i as resolveOpenProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../runtime-group-policy-xUD2PMwD.js";
import { n as isDangerousNameMatchingEnabled } from "../dangerous-name-matching-DuglfWYZ.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-Z-HJEE4g.js";
import { X as setTopLevelChannelDmPolicyWithAllowFrom, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-SGW0PZbn.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-C1Sr6WWN.js";
import { n as createChannelPairingController } from "../channel-pairing-DUoJRg5g.js";
import { t as buildBaseAccountStatusSnapshot } from "../status-helpers-Bzp8yHOi.js";
import { t as formatResolvedUnresolvedNote } from "../setup-CorfuImM.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-DMV0ajOs.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-Cc-64GEa.js";
import { t as chunkTextForOutbound } from "../text-chunking-CVRBM2pd.js";
import { a as resolveSenderCommandAuthorization } from "../command-auth-CCN-zfUG.js";
import { r as buildChannelSendResult } from "../channel-send-result-BCA2NgAQ.js";
import { t as resolveChannelAccountConfigBasePath } from "../config-paths-h7auRgQw.js";
//#region src/plugin-sdk/zalouser.ts
function loadFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "zalouser",
		artifactBasename: "contract-api.js"
	});
}
const collectZalouserSecurityAuditFindings = ((...args) => loadFacadeModule().collectZalouserSecurityAuditFindings(...args));
const zalouserSetup = createOptionalChannelSetupSurface({
	channel: "zalouser",
	label: "Zalo Personal",
	npmSpec: "@openclaw/zalouser",
	docsPath: "/channels/zalouser"
});
const zalouserSetupAdapter = zalouserSetup.setupAdapter;
const zalouserSetupWizard = zalouserSetup.setupWizard;
//#endregion
export { DEFAULT_ACCOUNT_ID, MarkdownConfigSchema, ToolPolicySchema, addWildcardAllowFrom, applyAccountNameToChannelSection, applySetupAccountConfigPatch, buildBaseAccountStatusSnapshot, buildChannelConfigSchema, buildChannelSendResult, chunkTextForOutbound, collectZalouserSecurityAuditFindings, createAccountListHelpers, createChannelPairingController, createChannelReplyPipeline, deleteAccountFromConfigSection, deliverTextOrMediaReply, emptyPluginConfigSchema, evaluateGroupRouteAccessForPolicy, formatAllowFromLowercase, formatPairingApproveHint, formatResolvedUnresolvedNote, isDangerousNameMatchingEnabled, isNumericTargetId, loadOutboundMediaFromUrl, mergeAllowFromEntries, mergeAllowlist, migrateBaseNameToDefaultAccount, normalizeAccountId, patchScopedAccountConfig, resolveChannelAccountConfigBasePath, resolveDefaultGroupPolicy, resolveInboundMentionDecision, resolveMentionGating, resolveMentionGatingWithBypass, resolveOpenProviderRuntimeGroupPolicy, resolveOutboundMediaUrls, resolvePreferredOpenClawTmpDir, resolveSendableOutboundReplyParts, resolveSenderCommandAuthorization, resolveSenderScopedGroupPolicy, sendMediaWithLeadingCaption, sendPayloadWithChunkedTextAndMedia, setAccountEnabledInConfigSection, setTopLevelChannelDmPolicyWithAllowFrom, summarizeMapping, warnMissingProviderGroupPolicyFallbackOnce, zalouserSetupAdapter, zalouserSetupWizard };
