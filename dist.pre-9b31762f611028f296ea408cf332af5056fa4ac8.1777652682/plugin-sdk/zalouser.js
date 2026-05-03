import { n as resolvePreferredOpenClawTmpDir } from "../tmp-openclaw-dir-CWQcmOLf.js";
import { h as MarkdownConfigSchema } from "../zod-schema.core-FcJGI_qL.js";
import { r as buildChannelConfigSchema } from "../config-schema-OPypi1r3.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-C3j_3_su.js";
import { c as ToolPolicySchema } from "../zod-schema.agent-runtime-Da3-jd-w.js";
import { i as loadBundledPluginPublicSurfaceModuleSync } from "../facade-loader-CoH-C6gj.js";
import { b as sendPayloadWithChunkedTextAndMedia, f as resolveOutboundMediaUrls, g as sendMediaWithLeadingCaption, i as deliverTextOrMediaReply, l as isNumericTargetId, m as resolveSendableOutboundReplyParts } from "../reply-payload-BHlpKYDP.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-xGgW25ph.js";
import { n as formatPairingApproveHint } from "../helpers-B7mjmIZr.js";
import { t as createAccountListHelpers } from "../account-helpers-Dc5rCzoi.js";
import { n as emptyPluginConfigSchema } from "../config-schema-Db8uIJi-.js";
import { l as patchScopedAccountConfig, n as applySetupAccountConfigPatch, s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-P3bVHWjM.js";
import { i as resolveMentionGatingWithBypass, n as resolveInboundMentionDecision, r as resolveMentionGating } from "../mention-gating-C2K3rSdY.js";
import { i as mergeAllowlist, o as summarizeMapping } from "../resolve-utils-D4_YqLEY.js";
import { t as formatAllowFromLowercase } from "../allow-from-HD6thJ9h.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, i as resolveOpenProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../runtime-group-policy-CX-BIMex.js";
import { n as isDangerousNameMatchingEnabled } from "../dangerous-name-matching-I5PfgBjR.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-DnyCrhTl.js";
import { X as setTopLevelChannelDmPolicyWithAllowFrom, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-xYUM67Xd.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-D2KHRdRa.js";
import { n as createChannelPairingController } from "../channel-pairing-_Cp-CTX3.js";
import { t as buildBaseAccountStatusSnapshot } from "../status-helpers-C2uknUoo.js";
import { t as formatResolvedUnresolvedNote } from "../setup-CNPAlM7z.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-DtlXf9Sc.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-CYC6XJ8s.js";
import { t as chunkTextForOutbound } from "../text-chunking-D8yliY5A.js";
import { a as resolveSenderCommandAuthorization } from "../command-auth-BDqre-TP.js";
import { r as buildChannelSendResult } from "../channel-send-result-C3Bidvxg.js";
import { t as resolveChannelAccountConfigBasePath } from "../config-paths-P5Nj6vcQ.js";
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
