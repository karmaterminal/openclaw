import { n as resolvePreferredOpenClawTmpDir } from "../tmp-openclaw-dir-CWQcmOLf.js";
import { h as MarkdownConfigSchema } from "../zod-schema.core-BO_PdpIg.js";
import { r as buildChannelConfigSchema } from "../config-schema-Bx16NlRy.js";
import { n as normalizeAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-BM1T6029.js";
import { c as ToolPolicySchema } from "../zod-schema.agent-runtime-DqjyzuKi.js";
import { i as loadBundledPluginPublicSurfaceModuleSync } from "../facade-loader-BNX9Xu_N.js";
import { b as sendPayloadWithChunkedTextAndMedia, f as resolveOutboundMediaUrls, g as sendMediaWithLeadingCaption, i as deliverTextOrMediaReply, l as isNumericTargetId, m as resolveSendableOutboundReplyParts } from "../reply-payload-Bp4halqE.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-BzagItDT.js";
import { n as formatPairingApproveHint } from "../helpers-DIuSKnxZ.js";
import { t as createAccountListHelpers } from "../account-helpers-DEi7CJ_w.js";
import { n as emptyPluginConfigSchema } from "../config-schema-TbKbeW26.js";
import { l as patchScopedAccountConfig, n as applySetupAccountConfigPatch, s as migrateBaseNameToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-Ch6SdLT5.js";
import { i as resolveMentionGatingWithBypass, n as resolveInboundMentionDecision, r as resolveMentionGating } from "../mention-gating-BKGfbk8Y.js";
import { i as mergeAllowlist, o as summarizeMapping } from "../resolve-utils-Bn2YXPji.js";
import { t as formatAllowFromLowercase } from "../allow-from-DZAza3yn.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, i as resolveOpenProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy } from "../runtime-group-policy-D59aD4e1.js";
import { n as isDangerousNameMatchingEnabled } from "../dangerous-name-matching-DMcbgBOp.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-ZknbY9S8.js";
import { X as setTopLevelChannelDmPolicyWithAllowFrom, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-D9irczka.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-CHJIyDeO.js";
import { n as createChannelPairingController } from "../channel-pairing-Di-QWGuY.js";
import { t as buildBaseAccountStatusSnapshot } from "../status-helpers-BVCd57BM.js";
import { t as formatResolvedUnresolvedNote } from "../setup-BGN2-Hqs.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CKSW_MiQ.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-CfH_b7TM.js";
import { t as chunkTextForOutbound } from "../text-chunking-NSR9jiEh.js";
import { a as resolveSenderCommandAuthorization } from "../command-auth-RVe99jtw.js";
import { r as buildChannelSendResult } from "../channel-send-result-CZ-BydSV.js";
import { t as resolveChannelAccountConfigBasePath } from "../config-paths-Hlb-Jv2v.js";
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
