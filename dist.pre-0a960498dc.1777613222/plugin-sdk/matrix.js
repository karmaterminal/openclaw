import { r as redactSensitiveText } from "../redact-Bl2deF7j.js";
import { t as formatDocsLink } from "../links-BtCHUQX8.js";
import { l as normalizeResolvedSecretInputString, o as hasConfiguredSecretInput, u as normalizeSecretInputString } from "../types.secrets-D9j6Z-gp.js";
import { s as isPrivateOrLoopbackHost } from "../net-lcLTXl0l.js";
import { s as normalizeStringEntries } from "../string-normalization-CEOVTwLJ.js";
import { h as MarkdownConfigSchema } from "../zod-schema.core-FcJGI_qL.js";
import { r as buildChannelConfigSchema } from "../config-schema-OPypi1r3.js";
import { n as normalizeAccountId, r as normalizeOptionalAccountId, t as DEFAULT_ACCOUNT_ID } from "../account-id-C3j_3_su.js";
import { u as resolveAgentIdFromSessionKey } from "../session-key-EpIbK3Oz.js";
import { s as getChatChannelMeta } from "../registry-B9khhdbq.js";
import { c as ToolPolicySchema } from "../zod-schema.agent-runtime-Da3-jd-w.js";
import { i as resolveChannelEntryMatch, n as buildChannelKeyCandidates } from "../channel-config-FJTDIFx4.js";
import { i as resolveAllowlistMatchByCandidates, n as formatAllowlistMatchMeta, o as resolveCompiledAllowlistMatch, r as resolveAllowlistCandidates, t as compileAllowlist } from "../allowlist-match-2AvB6l5G.js";
import { t as resolveAckReaction } from "../identity-3awe6JYT.js";
import { i as loadBundledPluginPublicSurfaceModuleSync, t as createLazyFacadeArrayValue } from "../facade-loader-CoH-C6gj.js";
import { n as fetchWithSsrFGuard } from "../fetch-guard-5Cmu0jDX.js";
import { a as createActionGate, f as readNumberParam, g as readStringParam, l as jsonResult, m as readStringArrayParam, p as readReactionParams } from "../common-B-ADznUd.js";
import { r as getAgentScopedMediaLocalRoots } from "../local-roots-CRJ68cz-.js";
import { n as normalizePollInput } from "../polls-B45uUoNq.js";
import { n as resolveOutboundSendDep } from "../send-deps-TXsrYoVi.js";
import { n as deleteAccountFromConfigSection, r as setAccountEnabledInConfigSection } from "../config-helpers-xGgW25ph.js";
import { n as formatPairingApproveHint } from "../helpers-B7mjmIZr.js";
import { n as writeJsonFileAtomically, t as readJsonFileWithFallback } from "../json-store-DWWxbjPN.js";
import { a as registerSessionBindingAdapter, o as unregisterSessionBindingAdapter, r as getSessionBindingService } from "../session-binding-service-_uxH6cqw.js";
import { t as createAccountListHelpers } from "../account-helpers-Dc5rCzoi.js";
import { n as emptyPluginConfigSchema } from "../config-schema-Db8uIJi-.js";
import { c as moveSingleAccountChannelSectionToDefaultAccount, t as applyAccountNameToChannelSection } from "../setup-helpers-P3bVHWjM.js";
import { n as formatZonedTimestamp } from "../format-datetime-BvThnfBM.js";
import { r as buildSecretInputSchema } from "../secret-input-9oRxeDJI.js";
import { n as resolveControlCommandGate } from "../command-gating-BnQtRLCi.js";
import { a as patchAllowlistUsersInConfigEntries, i as mergeAllowlist, n as buildAllowlistResolutionSummary, o as summarizeMapping, r as canonicalizeAllowlistWithResolvedIds, t as addAllowlistUserEntriesFromConfigEntry } from "../resolve-utils-D4_YqLEY.js";
import { a as warnMissingProviderGroupPolicyFallbackOnce, n as resolveAllowlistProviderRuntimeGroupPolicy, r as resolveDefaultGroupPolicy, t as GROUP_POLICY_BLOCKED_LABEL } from "../runtime-group-policy-CX-BIMex.js";
import { a as resolveSenderScopedGroupPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-DnyCrhTl.js";
import { n as logInboundDrop, r as logTypingFailure } from "../logging-DgcyiFp-.js";
import { O as promptAccountId, P as promptSingleChannelSecretInput, Z as setTopLevelChannelGroupPolicy, n as buildSingleChannelSecretPromptState, t as addWildcardAllowFrom, v as mergeAllowFromEntries } from "../setup-wizard-helpers-xYUM67Xd.js";
import { t as PAIRING_APPROVED_MESSAGE } from "../pairing-message-BsYveNuW.js";
import { n as createReplyPrefixOptions } from "../reply-prefix-C098ELqO.js";
import { t as createTypingCallbacks } from "../typing-CYmxdHKC.js";
import { t as createChannelReplyPipeline } from "../channel-reply-pipeline-D2KHRdRa.js";
import { n as createChannelPairingController } from "../channel-pairing-_Cp-CTX3.js";
import { c as collectStatusIssuesFromLastError, i as buildProbeChannelStatusSummary, r as buildComputedAccountStatusSnapshot } from "../status-helpers-C2uknUoo.js";
import { t as runPluginCommandWithTimeout } from "../run-command-7MEqvQg6.js";
import { n as resolveRuntimeEnv, t as createLoggerBackedRuntime } from "../runtime-logger-BQpdDyJA.js";
import "../runtime-Ueu3oxzo.js";
import { t as promptChannelAccessConfig } from "../setup-group-access-nfLmkaCj.js";
import { t as formatResolvedUnresolvedNote } from "../setup-CNPAlM7z.js";
import { t as createOptionalChannelSetupSurface } from "../channel-setup-DtlXf9Sc.js";
import { t as loadOutboundMediaFromUrl } from "../outbound-media-CYC6XJ8s.js";
import { n as resolveThreadBindingFarewellText } from "../thread-bindings-messages-B086Rr2X.js";
import { c as resolveThreadBindingMaxAgeMsForChannel, o as resolveThreadBindingIdleTimeoutMsForChannel } from "../thread-bindings-policy-DHnmWaCI.js";
import { t as chunkTextForOutbound } from "../text-chunking-D8yliY5A.js";
import "../channel-plugin-common-ClLFdh1X.js";
import { n as toLocationContext, t as formatLocationText } from "../location-D8U4tvhJ.js";
import { n as setMatrixThreadBindingMaxAgeBySessionKey, t as setMatrixThreadBindingIdleTimeoutBySessionKey } from "../matrix-thread-bindings-COaZJHDa.js";
import { a as resolveMatrixAccountStorageRoot, c as resolveMatrixCredentialsPath, i as resolveConfiguredMatrixAccountIds, l as resolveMatrixDefaultOrOnlyAccountId, n as getMatrixScopedEnvVarNames, o as resolveMatrixChannelConfig, r as requiresExplicitMatrixDefaultAccount, s as resolveMatrixCredentialsDir, t as findMatrixAccountEntry, u as resolveMatrixLegacyFlatStoragePaths } from "../matrix-helper-CluodW9d.js";
import { n as setMatrixRuntime, t as resolveMatrixAccountStringValues } from "../matrix-runtime-surface-B7ZS0Jcz.js";
import { r as resetMatrixThreadBindingsForTests, t as createMatrixThreadBindingManager } from "../matrix-surface-B20SLzx7.js";
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
