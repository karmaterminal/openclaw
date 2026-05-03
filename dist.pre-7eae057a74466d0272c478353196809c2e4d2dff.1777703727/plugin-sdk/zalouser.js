import { n as resolvePreferredOpenClawTmpDir } from "../tmp-openclaw-dir-CoGSA-7K.js";
import { h as MarkdownConfigSchema } from "../zod-schema.core-CJHlBmEK.js";
import { r as buildChannelConfigSchema } from "../config-schema-DiJ8qU0S.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-BgECLQdh.js";
import { c as ToolPolicySchema } from "../zod-schema.agent-runtime-DPx4Np-L.js";
import { i as loadBundledPluginPublicSurfaceModuleSync } from "../facade-loader-BoyVLIwT.js";
import { b as sendPayloadWithChunkedTextAndMedia, f as resolveOutboundMediaUrls, g as sendMediaWithLeadingCaption, i as deliverTextOrMediaReply, l as isNumericTargetId, m as resolveSendableOutboundReplyParts } from "../reply-payload-_j2fgAcF.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-_JhRSMYy.js";
import { n as formatPairingApproveHint } from "../helpers-nSennZYu.js";
import { t as createAccountListHelpers } from "../account-helpers-Djgvda_o.js";
import { n as emptyPluginConfigSchema } from "../config-schema-BkNA2J7m.js";
import { l as patchScopedAccountConfig, n as applySetupAccountConfigPatch, s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-BccLvWeE.js";
import { i as resolveMentionGatingWithBypass, n as resolveInboundMentionDecision, r as resolveMentionGating } from "../mention-gating-BXUHROwD.js";
import { i as mergeAllowlist, o as summarizeMapping } from "../resolve-utils-C4nNuL54.js";
import { t as formatAllowFromLowercase } from "../allow-from-BHx4eqs5.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, i as resolveOpenProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../runtime-group-policy-CprfbzN5.js";
import { n as isDangerousNameMatchingEnabled } from "../dangerous-name-matching-BwMl_K7M.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-Dsm22n39.js";
import { X as setTopLevelChannelDmPolicyWithAllowFrom, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-BUrFPAqw.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-DXBaPgkC.js";
import { n as createChannelPairingController } from "../channel-pairing-CeFF5BgJ.js";
import { t as buildBaseAccountStatusSnapshot } from "../status-helpers-Cm_NW4Lp.js";
import { t as formatResolvedUnresolvedNote } from "../setup-CIbZfN_l.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CjfxAeX0.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-D0xJ-HSU.js";
import { t as chunkTextForOutbound } from "../text-chunking-4eYeKebf.js";
import { a as resolveSenderCommandAuthorization } from "../command-auth-D5G8LwyB.js";
import { r as buildChannelSendResult } from "../channel-send-result-BVHjEH0g.js";
import { t as resolveChannelAccountConfigBasePath } from "../config-paths-De9GCM-2.js";
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
