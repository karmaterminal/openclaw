import { r as redactSensitiveText } from "../redact-Bl2deF7j.js";
import { t as formatDocsLink } from "../links-BtCHUQX8.js";
import { l as normalizeResolvedSecretInputString, o as hasConfiguredSecretInput, u as normalizeSecretInputString } from "../types.secrets-D9j6Z-gp.js";
import { s as isPrivateOrLoopbackHost } from "../net-lcLTXl0l.js";
import { s as normalizeStringEntries } from "../string-normalization-Dv1B9Dxc.js";
import { h as MarkdownConfigSchema } from "../zod-schema.core-CJHlBmEK.js";
import { r as buildChannelConfigSchema } from "../config-schema-DiJ8qU0S.js";
import { n as normalizeAccountId, r as normalizeOptionalAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-BgECLQdh.js";
import { u as resolveAgentIdFromSessionKey } from "../session-key-Ba6CwwIP.js";
import { s as getChatChannelMeta } from "../registry-fsTw8jzj.js";
import { c as ToolPolicySchema } from "../zod-schema.agent-runtime-DPx4Np-L.js";
import { i as resolveChannelEntryMatch, n as buildChannelKeyCandidates } from "../channel-config-FJTDIFx4.js";
import { i as resolveAllowlistMatchByCandidates, n as formatAllowlistMatchMeta, o as resolveCompiledAllowlistMatch, r as resolveAllowlistCandidates, t as compileAllowlist } from "../allowlist-match-2AvB6l5G.js";
import { i as loadBundledPluginPublicSurfaceModuleSync, t as createLazyFacadeArrayValue } from "../facade-loader-BoyVLIwT.js";
import { n as writeJsonFileAtomically, t as readJsonFileWithFallback } from "../json-store-DwYA_55u.js";
import { a as registerSessionBindingAdapter, o as unregisterSessionBindingAdapter, r as getSessionBindingService } from "../session-binding-service-BFKwvZlA.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-CGnRnlqc.js";
import { r as getAgentScopedMediaLocalRoots } from "../local-roots-BKI0KmrY.js";
import { t as resolveAckReaction } from "../identity-D42sHd-V.js";
import { n as formatZonedTimestamp } from "../format-datetime-C4OkcYvZ.js";
import { _ as readStringParam, a as createActionGate, h as readStringArrayParam, l as jsonResult, m as readReactionParams, p as readNumberParam } from "../common-D1R9Gsy-.js";
import { n as normalizePollInput } from "../polls-CAenHR_f.js";
import { n as resolveOutboundSendDep } from "../send-deps-b6OPoyhb.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-Bk8RR-p3.js";
import { n as formatPairingApproveHint } from "../helpers-C_fY8blz.js";
import { t as createAccountListHelpers } from "../account-helpers-DmMyNxOH.js";
import { n as emptyPluginConfigSchema } from "../config-schema-BXlA9hLi.js";
import { c as moveSingleAccountChannelSectionToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-B0_DD2vo.js";
import { r as buildSecretInputSchema } from "../secret-input-f4pVtDM2.js";
import { n as resolveControlCommandGate } from "../command-gating-BurOAZgW.js";
import { a as patchAllowlistUsersInConfigEntries, i as mergeAllowlist, n as buildAllowlistResolutionSummary, o as summarizeMapping, r as canonicalizeAllowlistWithResolvedIds, t as addAllowlistUserEntriesFromConfigEntry } from "../resolve-utils-DVb_v8MT.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy, t as GROUP_POLICY_BLOCKED_LABEL } from "../runtime-group-policy-DgFYGny5.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-C6HWZ6ES.js";
import { n as logInboundDrop, r as logTypingFailure } from "../logging-CIXkgFGk.js";
import { O as promptAccountId, P as promptSingleChannelSecretInput, Z as setTopLevelChannelGroupPolicy, n as buildSingleChannelSecretPromptState, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-DRvZV2lB.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../pairing-message-CU1aIkxt.js";
import { n as createReplyPrefixOptions } from "../reply-prefix-DDAOf2ri.js";
import { t as createTypingCallbacks } from "../typing-BrHsu3wq.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-CR0pMzMv.js";
import { n as createChannelPairingController } from "../channel-pairing-KFP6Mlrw.js";
import { c as collectStatusIssuesFromLastError, i as buildProbeChannelStatusSummary, r as buildComputedAccountStatusSnapshot } from "../status-helpers-BMV2LHcC.js";
import { t as runPluginCommandWithTimeout } from "../run-command-CFySAGs6.js";
import { n as resolveRuntimeEnv, t as createLoggerBackedRuntime } from "../runtime-logger-Gf_roBPb.js";
import "../runtime-C6XMvKiI.js";
import { t as promptChannelAccessConfig } from "../setup-group-access-CvKwgNEY.js";
import { t as formatResolvedUnresolvedNote } from "../setup-DKY15gx0.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-B-EEngUV.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-B5_ejkO_.js";
import { n as resolveThreadBindingFarewellText } from "../thread-bindings-messages-DFXq1ZGx.js";
import { c as resolveThreadBindingMaxAgeMsForChannel, o as resolveThreadBindingIdleTimeoutMsForChannel } from "../thread-bindings-policy-BJtpkwNK.js";
import { t as chunkTextForOutbound } from "../text-chunking-DYoPYUFQ.js";
import "../channel-plugin-common-D0Z-ShOh.js";
import { n as toLocationContext, t as formatLocationText } from "../location-BqOb1fg1.js";
import { n as setMatrixThreadBindingMaxAgeBySessionKey, t as setMatrixThreadBindingIdleTimeoutBySessionKey } from "../matrix-thread-bindings-DdgDWdMI.js";
import { a as resolveMatrixAccountStorageRoot, c as resolveMatrixCredentialsPath, i as resolveConfiguredMatrixAccountIds, l as resolveMatrixDefaultOrOnlyAccountId, n as getMatrixScopedEnvVarNames, o as resolveMatrixChannelConfig, r as requiresExplicitMatrixDefaultAccount, s as resolveMatrixCredentialsDir, t as findMatrixAccountEntry, u as resolveMatrixLegacyFlatStoragePaths } from "../matrix-helper-dhh6MZQx.js";
import { n as setMatrixRuntime, t as resolveMatrixAccountStringValues } from "../matrix-runtime-surface-CA1P_V72.js";
import { r as resetMatrixThreadBindingsForTests, t as createMatrixThreadBindingManager } from "../matrix-surface-BV_Lg1dg.js";
//#region src/plugin-sdk/matrix.ts
function loadMatrixFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "matrix",
		artifactBasename: "contract-api.js"
	});
}
const singleAccountKeysToMove = createLazyFacadeArrayValue(() => loadMatrixFacadeModule().singleAccountKeysToMove);
const namedAccountPromotionKeys = createLazyFacadeArrayValue(() => loadMatrixFacadeModule().namedAccountPromotionKeys);
const resolveSingleAccountPromotionTarget = ((...args) => loadMatrixFacadeModule().resolveSingleAccountPromotionTarget(...args));
const matrixSetup = createOptionalChannelSetupSurface({
	channel: "matrix",
	label: "Matrix",
	npmSpec: "@openclaw/matrix",
	docsPath: "/channels/matrix"
});
const matrixSetupWizard = matrixSetup.setupWizard;
const matrixSetupAdapter = matrixSetup.setupAdapter;
//#endregion
export { DEFAULT_ACCOUNT_ID, GROUP_POLICY_BLOCKED_LABEL, MarkdownConfigSchema, PAIRING_APPROVED_MESSAGE, ToolPolicySchema, addAllowlistUserEntriesFromConfigEntry, addWildcardAllowFrom, applyAccountNameToChannelSection, buildAllowlistResolutionSummary, buildChannelConfigSchema, buildChannelKeyCandidates, buildComputedAccountStatusSnapshot, buildProbeChannelStatusSummary, buildSecretInputSchema, buildSingleChannelSecretPromptState, canonicalizeAllowlistWithResolvedIds, chunkTextForOutbound, collectStatusIssuesFromLastError, compileAllowlist, createAccountListHelpers, createActionGate, createChannelPairingController, createChannelReplyPipeline, createLoggerBackedRuntime, createMatrixThreadBindingManager, createReplyPrefixOptions, createTypingCallbacks, deleteAccountFromConfigSection, emptyPluginConfigSchema, evaluateGroupRouteAccessForPolicy, fetchWithSsrFGuard, findMatrixAccountEntry, formatAllowlistMatchMeta, formatDocsLink, formatLocationText, formatPairingApproveHint, formatResolvedUnresolvedNote, formatZonedTimestamp, getAgentScopedMediaLocalRoots, getChatChannelMeta, getMatrixScopedEnvVarNames, getSessionBindingService, hasConfiguredSecretInput, isPrivateOrLoopbackHost, jsonResult, loadOutboundMediaFromUrl, logInboundDrop, logTypingFailure, matrixSetupAdapter, matrixSetupWizard, mergeAllowFromEntries, mergeAllowlist, moveSingleAccountChannelSectionToDefaultAccount, namedAccountPromotionKeys, normalizeAccountId, normalizeOptionalAccountId, normalizePollInput, normalizeResolvedSecretInputString, normalizeSecretInputString, normalizeStringEntries, patchAllowlistUsersInConfigEntries, promptAccountId, promptChannelAccessConfig, promptSingleChannelSecretInput, readJsonFileWithFallback, readNumberParam, readReactionParams, readStringArrayParam, readStringParam, redactSensitiveText, registerSessionBindingAdapter, requiresExplicitMatrixDefaultAccount, resetMatrixThreadBindingsForTests, resolveAckReaction, resolveAgentIdFromSessionKey, resolveAllowlistCandidates, resolveAllowlistMatchByCandidates, resolveAllowlistProviderRuntimeGroupPolicy, resolveChannelEntryMatch, resolveCompiledAllowlistMatch, resolveConfiguredMatrixAccountIds, resolveControlCommandGate, resolveDefaultGroupPolicy, resolveMatrixAccountStorageRoot, resolveMatrixAccountStringValues, resolveMatrixChannelConfig, resolveMatrixCredentialsDir, resolveMatrixCredentialsPath, resolveMatrixDefaultOrOnlyAccountId, resolveMatrixLegacyFlatStoragePaths, resolveOutboundSendDep, resolveRuntimeEnv, resolveSenderScopedGroupPolicy, resolveSingleAccountPromotionTarget, resolveThreadBindingFarewellText, resolveThreadBindingIdleTimeoutMsForChannel, resolveThreadBindingMaxAgeMsForChannel, runPluginCommandWithTimeout, setAccountEnabledInConfigSection, setMatrixRuntime, setMatrixThreadBindingIdleTimeoutBySessionKey, setMatrixThreadBindingMaxAgeBySessionKey, setTopLevelChannelGroupPolicy, singleAccountKeysToMove, summarizeMapping, toLocationContext, unregisterSessionBindingAdapter, warnMissingProviderGroupPolicyFallbackOnce, writeJsonFileAtomically };
