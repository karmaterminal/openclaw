import { r as redactSensitiveText } from "../redact-Bl2deF7j.js";
import { t as formatDocsLink } from "../links-rWevNMpC.js";
import { l as normalizeResolvedSecretInputString, o as hasConfiguredSecretInput, u as normalizeSecretInputString } from "../types.secrets-Zn5Zyn7M.js";
import { s as isPrivateOrLoopbackHost } from "../net-AycWGi8-.js";
import { s as normalizeStringEntries } from "../string-normalization-Bvcn03I9.js";
import { h as MarkdownConfigSchema } from "../zod-schema.core-BR1v7ukx.js";
import { r as buildChannelConfigSchema } from "../config-schema-BEuj464I.js";
import { n as normalizeAccountId, r as normalizeOptionalAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-C3j_3_su.js";
import { u as resolveAgentIdFromSessionKey } from "../session-key-EpIbK3Oz.js";
import { s as getChatChannelMeta } from "../registry-B9khhdbq.js";
import { c as ToolPolicySchema } from "../zod-schema.agent-runtime-C-c82OTL.js";
import { i as resolveChannelEntryMatch, n as buildChannelKeyCandidates } from "../channel-config-Cch7J7Wc.js";
import { i as resolveAllowlistMatchByCandidates, n as formatAllowlistMatchMeta, o as resolveCompiledAllowlistMatch, r as resolveAllowlistCandidates, t as compileAllowlist } from "../allowlist-match-CVN8Gyua.js";
import { t as resolveAckReaction } from "../identity-lSr9N8UI.js";
import { i as loadBundledPluginPublicSurfaceModuleSync, t as createLazyFacadeArrayValue } from "../facade-loader-2P4UQTnv.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-CXs9BnMd.js";
import { a as createActionGate, f as readNumberParam, g as readStringParam, l as jsonResult, m as readStringArrayParam, p as readReactionParams } from "../common-CKql4nPs.js";
import { r as getAgentScopedMediaLocalRoots } from "../local-roots-Bfu5kCgH.js";
import { n as normalizePollInput } from "../polls-DelONDPY.js";
import { n as resolveOutboundSendDep } from "../send-deps-BJgjNbrY.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-BUwww05E.js";
import { n as formatPairingApproveHint } from "../helpers-CKc1HMZb.js";
import { n as writeJsonFileAtomically, t as readJsonFileWithFallback } from "../json-store-2Iu09A5k.js";
import { a as registerSessionBindingAdapter, o as unregisterSessionBindingAdapter, r as getSessionBindingService } from "../session-binding-service-DFVUkX4d.js";
import { t as createAccountListHelpers } from "../account-helpers-BvmdSMp6.js";
import { n as emptyPluginConfigSchema } from "../config-schema-7b31iocI.js";
import { c as moveSingleAccountChannelSectionToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-Tkd91h7K.js";
import { n as formatZonedTimestamp } from "../format-datetime-CBGDbjG1.js";
import { r as buildSecretInputSchema } from "../secret-input-CfcNyqj3.js";
import { n as resolveControlCommandGate } from "../command-gating-DK3daq-x.js";
import { a as patchAllowlistUsersInConfigEntries, i as mergeAllowlist, n as buildAllowlistResolutionSummary, o as summarizeMapping, r as canonicalizeAllowlistWithResolvedIds, t as addAllowlistUserEntriesFromConfigEntry } from "../resolve-utils-BJKbGwAn.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy, t as GROUP_POLICY_BLOCKED_LABEL } from "../runtime-group-policy-xUD2PMwD.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-Z-HJEE4g.js";
import { n as logInboundDrop, r as logTypingFailure } from "../logging-BxvkluBF.js";
import { O as promptAccountId, P as promptSingleChannelSecretInput, Z as setTopLevelChannelGroupPolicy, n as buildSingleChannelSecretPromptState, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-SGW0PZbn.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../pairing-message-z4cKRnDu.js";
import { n as createReplyPrefixOptions } from "../reply-prefix-nW7avO4F.js";
import { t as createTypingCallbacks } from "../typing-e4-8WYOr.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-C1Sr6WWN.js";
import { n as createChannelPairingController } from "../channel-pairing-DUoJRg5g.js";
import { c as collectStatusIssuesFromLastError, i as buildProbeChannelStatusSummary, r as buildComputedAccountStatusSnapshot } from "../status-helpers-Bzp8yHOi.js";
import { t as runPluginCommandWithTimeout } from "../run-command-B591ra_1.js";
import { n as resolveRuntimeEnv, t as createLoggerBackedRuntime } from "../runtime-logger-CQdLrD-f.js";
import "../runtime-DIqNnahC.js";
import { t as promptChannelAccessConfig } from "../setup-group-access-BlhTMZEa.js";
import { t as formatResolvedUnresolvedNote } from "../setup-CorfuImM.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-DMV0ajOs.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-Cc-64GEa.js";
import { n as resolveThreadBindingFarewellText } from "../thread-bindings-messages-C_9e7BBu.js";
import { c as resolveThreadBindingMaxAgeMsForChannel, o as resolveThreadBindingIdleTimeoutMsForChannel } from "../thread-bindings-policy-_uwXx0Qf.js";
import { t as chunkTextForOutbound } from "../text-chunking-CVRBM2pd.js";
import "../channel-plugin-common-DFroRbED.js";
import { n as toLocationContext, t as formatLocationText } from "../location-6pun7Nub.js";
import { n as setMatrixThreadBindingMaxAgeBySessionKey, t as setMatrixThreadBindingIdleTimeoutBySessionKey } from "../matrix-thread-bindings-DB63popu.js";
import { a as resolveMatrixAccountStorageRoot, c as resolveMatrixCredentialsPath, i as resolveConfiguredMatrixAccountIds, l as resolveMatrixDefaultOrOnlyAccountId, n as getMatrixScopedEnvVarNames, o as resolveMatrixChannelConfig, r as requiresExplicitMatrixDefaultAccount, s as resolveMatrixCredentialsDir, t as findMatrixAccountEntry, u as resolveMatrixLegacyFlatStoragePaths } from "../matrix-helper-BchwUZ-L.js";
import { n as setMatrixRuntime, t as resolveMatrixAccountStringValues } from "../matrix-runtime-surface-_xrwi1sG.js";
import { r as resetMatrixThreadBindingsForTests, t as createMatrixThreadBindingManager } from "../matrix-surface-Bn9jxTQs.js";
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
