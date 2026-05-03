import { n as resolvePreferredOpenClawTmpDir } from "../tmp-openclaw-dir-CWQcmOLf.js";
import { h as MarkdownConfigSchema } from "../zod-schema.core-Bi0Ke4ns.js";
import { r as buildChannelConfigSchema } from "../config-schema-CNOE4EfY.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-DWChvwa8.js";
import { c as ToolPolicySchema } from "../zod-schema.agent-runtime-BDlEXxX3.js";
import { i as loadBundledPluginPublicSurfaceModuleSync } from "../facade-loader-CSyHK1XM.js";
import { b as sendPayloadWithChunkedTextAndMedia, f as resolveOutboundMediaUrls, g as sendMediaWithLeadingCaption, i as deliverTextOrMediaReply, l as isNumericTargetId, m as resolveSendableOutboundReplyParts } from "../reply-payload-kJANadVo.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-C4ORopgz.js";
import { n as formatPairingApproveHint } from "../helpers-CdDG09w4.js";
import { t as createAccountListHelpers } from "../account-helpers-DIhdXOQH.js";
import { n as emptyPluginConfigSchema } from "../config-schema-2J3lBwCn.js";
import { l as patchScopedAccountConfig, n as applySetupAccountConfigPatch, s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-D2FCSunP.js";
import { i as resolveMentionGatingWithBypass, n as resolveInboundMentionDecision, r as resolveMentionGating } from "../mention-gating-CKuPxaSQ.js";
import { i as mergeAllowlist, o as summarizeMapping } from "../resolve-utils-DD3ZksVU.js";
import { t as formatAllowFromLowercase } from "../allow-from-BbtSe3el.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, i as resolveOpenProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../runtime-group-policy-C6LDEhXP.js";
import { n as isDangerousNameMatchingEnabled } from "../dangerous-name-matching-CiUaGEwk.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-CAKBAsAc.js";
import { X as setTopLevelChannelDmPolicyWithAllowFrom, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-hupe-kT7.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-BS4-Z0kM.js";
import { n as createChannelPairingController } from "../channel-pairing-J21HARkM.js";
import { t as buildBaseAccountStatusSnapshot } from "../status-helpers-BJQYcoys.js";
import { t as formatResolvedUnresolvedNote } from "../setup-CYjzKSDC.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CiBZcClL.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-fw18dk38.js";
import { t as chunkTextForOutbound } from "../text-chunking-Do7UsKJv.js";
import { a as resolveSenderCommandAuthorization } from "../command-auth-HAC-UFGI.js";
import { r as buildChannelSendResult } from "../channel-send-result-Nse0U3Cg.js";
import { t as resolveChannelAccountConfigBasePath } from "../config-paths-BMVWkYvk.js";
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
