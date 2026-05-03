import { r as redactSensitiveText } from "../redact-Bl2deF7j.js";
import { t as formatDocsLink } from "../links-rWevNMpC.js";
import { a as hasConfiguredSecretInput, c as normalizeResolvedSecretInputString, l as normalizeSecretInputString } from "../types.secrets-v6szeegc.js";
import { s as isPrivateOrLoopbackHost } from "../net-AycWGi8-.js";
import { s as normalizeStringEntries } from "../string-normalization-ColQTP6c.js";
import { h as MarkdownConfigSchema } from "../zod-schema.core-Bi0Ke4ns.js";
import { r as buildChannelConfigSchema } from "../config-schema-CNOE4EfY.js";
import { n as normalizeAccountId, r as normalizeOptionalAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-DWChvwa8.js";
import { u as resolveAgentIdFromSessionKey } from "../session-key-05a3Ypk7.js";
import { s as getChatChannelMeta } from "../registry-CW3lfH7N.js";
import { c as ToolPolicySchema } from "../zod-schema.agent-runtime-BDlEXxX3.js";
import { i as resolveChannelEntryMatch, n as buildChannelKeyCandidates } from "../channel-config-C6-r_t_f.js";
import { i as resolveAllowlistMatchByCandidates, n as formatAllowlistMatchMeta, o as resolveCompiledAllowlistMatch, r as resolveAllowlistCandidates, t as compileAllowlist } from "../allowlist-match-CR4EIknA.js";
import { t as resolveAckReaction } from "../identity-Dok0oB-y.js";
import { i as loadBundledPluginPublicSurfaceModuleSync, t as createLazyFacadeArrayValue } from "../facade-loader-CSyHK1XM.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-LAmyTYUM.js";
import { a as createActionGate, f as readNumberParam, g as readStringParam, l as jsonResult, m as readStringArrayParam, p as readReactionParams } from "../common-CiiKqT5H.js";
import { r as getAgentScopedMediaLocalRoots } from "../local-roots-DmwJPWVR.js";
import { n as normalizePollInput } from "../polls-B45uUoNq.js";
import { n as resolveOutboundSendDep } from "../send-deps-BwjFuOUC.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-C4ORopgz.js";
import { n as formatPairingApproveHint } from "../helpers-CdDG09w4.js";
import { n as writeJsonFileAtomically, t as readJsonFileWithFallback } from "../json-store-Bv5f7usa.js";
import { a as registerSessionBindingAdapter, o as unregisterSessionBindingAdapter, r as getSessionBindingService } from "../session-binding-service-DskOwwNl.js";
import { t as createAccountListHelpers } from "../account-helpers-DIhdXOQH.js";
import { n as emptyPluginConfigSchema } from "../config-schema-2J3lBwCn.js";
import { c as moveSingleAccountChannelSectionToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-D2FCSunP.js";
import { n as formatZonedTimestamp } from "../format-datetime-Dm58eEtO.js";
import { r as buildSecretInputSchema } from "../secret-input-DZvmavMm.js";
import { n as resolveControlCommandGate } from "../command-gating-C6ON9GtF.js";
import { a as patchAllowlistUsersInConfigEntries, i as mergeAllowlist, n as buildAllowlistResolutionSummary, o as summarizeMapping, r as canonicalizeAllowlistWithResolvedIds, t as addAllowlistUserEntriesFromConfigEntry } from "../resolve-utils-DD3ZksVU.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy, t as GROUP_POLICY_BLOCKED_LABEL } from "../runtime-group-policy-C6LDEhXP.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-CAKBAsAc.js";
import { n as logInboundDrop, r as logTypingFailure } from "../logging-DmXwpYuL.js";
import { O as promptAccountId, P as promptSingleChannelSecretInput, Z as setTopLevelChannelGroupPolicy, n as buildSingleChannelSecretPromptState, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-hupe-kT7.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../pairing-message-Bv-ba-Xw.js";
import { n as createReplyPrefixOptions } from "../reply-prefix-DLC0kPx2.js";
import { t as createTypingCallbacks } from "../typing-CSXxA5uY.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-BS4-Z0kM.js";
import { n as createChannelPairingController } from "../channel-pairing-J21HARkM.js";
import { c as collectStatusIssuesFromLastError, i as buildProbeChannelStatusSummary, r as buildComputedAccountStatusSnapshot } from "../status-helpers-BJQYcoys.js";
import { t as runPluginCommandWithTimeout } from "../run-command-D1w836Ox.js";
import { n as resolveRuntimeEnv, t as createLoggerBackedRuntime } from "../runtime-logger-CS8OcSPR.js";
import "../runtime-HQtVK2Zf.js";
import { t as promptChannelAccessConfig } from "../setup-group-access-DV-OwGs-.js";
import { t as formatResolvedUnresolvedNote } from "../setup-CYjzKSDC.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-CiBZcClL.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-fw18dk38.js";
import { n as resolveThreadBindingFarewellText } from "../thread-bindings-messages-BfJXOU7O.js";
import { c as resolveThreadBindingMaxAgeMsForChannel, o as resolveThreadBindingIdleTimeoutMsForChannel } from "../thread-bindings-policy-BJD35wze.js";
import { t as chunkTextForOutbound } from "../text-chunking-Do7UsKJv.js";
import "../channel-plugin-common-2bR6xNHx.js";
import { n as toLocationContext, t as formatLocationText } from "../location-BYGGpDzs.js";
import { n as setMatrixThreadBindingMaxAgeBySessionKey, t as setMatrixThreadBindingIdleTimeoutBySessionKey } from "../matrix-thread-bindings-LpvOL28S.js";
import { a as resolveMatrixAccountStorageRoot, c as resolveMatrixCredentialsPath, i as resolveConfiguredMatrixAccountIds, l as resolveMatrixDefaultOrOnlyAccountId, n as getMatrixScopedEnvVarNames, o as resolveMatrixChannelConfig, r as requiresExplicitMatrixDefaultAccount, s as resolveMatrixCredentialsDir, t as findMatrixAccountEntry, u as resolveMatrixLegacyFlatStoragePaths } from "../matrix-helper-1B_6cX3M.js";
import { n as setMatrixRuntime, t as resolveMatrixAccountStringValues } from "../matrix-runtime-surface-DsyscGgy.js";
import { r as resetMatrixThreadBindingsForTests, t as createMatrixThreadBindingManager } from "../matrix-surface-eJcyTrTi.js";
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
