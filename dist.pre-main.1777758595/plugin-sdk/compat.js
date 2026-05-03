import { I as requireOpenAllowFrom, a as DmConfigSchema, b as ReplyRuntimeConfigSchemaShape, h as MarkdownConfigSchema, i as ContextVisibilityModeSchema, l as GroupPolicySchema, n as BlockStreamingCoalesceSchema, o as DmPolicySchema } from "../zod-schema.core-CDjzQmUR.js";
import { i as buildNestedDmConfigSchema, n as buildCatchallMultiAccountChannelSchema, r as buildChannelConfigSchema, t as AllowFromListSchema } from "../config-schema-TgszMKRa.js";
import { a as onDiagnosticEvent } from "../diagnostic-events-BOjU629z.js";
import { n as resolvePreferredOpenClawTmpDir } from "../tmp-openclaw-dir-BWwlJ5o6.js";
import { n as normalizeAccountId } from "../account-id-N6BXsI_x.js";
import { l as ToolPolicySchema } from "../zod-schema.agent-runtime-C9ocd7Ke.js";
import { n as registerContextEngine } from "../registry-Rm7RI0b2.js";
import { r as loadBundledPluginPublicSurfaceModuleSync } from "../facade-loader-BG_nByyl.js";
import { n as delegateCompactionToRuntime, t as buildMemorySystemPromptAddition } from "../delegate-CTnfogqI.js";
import { i as writeOAuthCredentials, n as buildApiKeyCredential, r as upsertApiKeyProfile, t as applyAuthProfileConfig } from "../provider-auth-helpers-DWKifSeJ.js";
import "../common-Dke0Zlji.js";
import { i as stringEnum, r as optionalStringEnum } from "../typebox-C-xkWt48.js";
import "../temp-path-DORItDY6.js";
import { i as resolveToolsBySender, n as resolveChannelGroupRequireMention, r as resolveChannelGroupToolsPolicy, t as resolveChannelGroupPolicy } from "../group-policy-DA9wWg4s.js";
import { a as createHybridChannelConfigBase, c as createScopedChannelConfigBase, d as createTopLevelChannelConfigBase, i as createHybridChannelConfigAdapter, l as createScopedDmSecurityResolver, m as mapAllowFromEntries, o as createScopedAccountConfigAccessors, s as createScopedChannelConfigAdapter, u as createTopLevelChannelConfigAdapter } from "../channel-config-helpers-Cc367LxV.js";
import { t as buildAccountScopedDmSecurityPolicy } from "../helpers-DVrEb58F.js";
import "../identity-Cojf61YG.js";
import { t as inspectReadOnlyChannelAccount } from "../read-only-account-inspect-YJl_Dtt4.js";
import { t as KeyedAsyncQueue } from "../keyed-async-queue-CvawVSZp.js";
import "../text-runtime-D2WyrYir.js";
import { n as emptyPluginConfigSchema } from "../config-schema-CxwO2vIO.js";
import "../setup-helpers-DB1Y49FN.js";
import { n as resolveControlCommandGate } from "../command-gating-D0bjkO2U.js";
import { a as buildHistoryContextFromMap, c as clearHistoryEntriesIfEnabled, d as recordPendingHistoryEntryIfEnabled, i as buildHistoryContextFromEntries, l as evictOldHistoryKeys, n as HISTORY_CONTEXT_MARKER, o as buildPendingHistoryContextFromMap, r as buildHistoryContext, s as clearHistoryEntries, t as DEFAULT_GROUP_HISTORY_LIMIT, u as recordPendingHistoryEntry } from "../history-fCPUY3ru.js";
import { t as createAccountStatusSink } from "../channel-lifecycle.core-PjGRuGJJ.js";
import { t as createPluginRuntimeStore } from "../runtime-store-CY3SIBqj.js";
import { a as mapAllowlistResolutionInputs, n as formatNormalizedAllowFromEntries, t as formatAllowFromLowercase } from "../allow-from-BDHAYlRb.js";
import "../channel-config-schema-XRy6ySTw.js";
import { C as createOpenProviderGroupPolicyWarningCollector, D as projectConfigWarningCollector, E as projectConfigAccountIdWarningCollector, O as projectWarningCollector, S as createOpenProviderConfiguredRouteWarningCollector, T as projectAccountWarningCollector, _ as createAllowlistProviderOpenWarningCollector, a as buildOpenGroupPolicyConfigureRouteAllowlistWarning, b as createConditionalWarningCollector, c as collectAllowlistProviderGroupPolicyWarnings, d as collectOpenGroupPolicyRestrictSendersWarnings, f as collectOpenGroupPolicyRouteAllowlistWarnings, g as createAllowlistProviderGroupPolicyWarningCollector, h as composeWarningCollectors, i as normalizeAllowFromList, l as collectAllowlistProviderRestrictSendersWarnings, m as composeAccountWarningCollectors, n as createDangerousNameMatchingMutableAllowlistWarningCollector, o as buildOpenGroupPolicyRestrictSendersWarning, p as collectOpenProviderGroupPolicyWarnings, r as createRestrictSendersChannelSecurity, s as buildOpenGroupPolicyWarning, t as coerceNativeSetting, u as collectOpenGroupPolicyConfiguredRouteWarnings, v as createAllowlistProviderRestrictSendersWarningCollector, w as projectAccountConfigWarningCollector, x as createOpenGroupPolicyRestrictSendersWarningCollector, y as createAllowlistProviderRouteAllowlistWarningCollector } from "../channel-policy-D7z0rLhB.js";
import { a as resolveSenderScopedGroupPolicy, i as evaluateSenderGroupAccessForPolicy, t as evaluateGroupRouteAccessForPolicy } from "../group-access-Bc3-LBDq.js";
import { a as resolveDmGroupAccessWithCommandGate, c as resolveOpenDmAllowlistAccess, n as readStoreAllowFromForDmPolicy, o as resolveDmGroupAccessWithLists, s as resolveEffectiveAllowFromLists, t as DM_GROUP_ACCESS_REASON } from "../dm-policy-shared-D7Cgibny.js";
import "../reply-history-CbKB6bgy.js";
import { i as nullChannelDirectorySelf, n as createEmptyChannelDirectoryAdapter, r as emptyChannelDirectoryList, t as createChannelDirectoryAdapter } from "../directory-runtime-B32hBuoV.js";
import { a as listDirectoryEntriesFromSources, c as listDirectoryUserEntriesFromAllowFrom, d as listResolvedDirectoryEntriesFromSources, f as listResolvedDirectoryGroupEntriesFromMapKeys, i as createResolvedDirectoryEntriesLister, l as listDirectoryUserEntriesFromAllowFromAndMapKeys, m as toDirectoryEntries, n as collectNormalizedDirectoryIds, o as listDirectoryGroupEntriesFromMapKeys, p as listResolvedDirectoryUserEntriesFromAllowFrom, r as createInspectedDirectoryEntriesLister, s as listDirectoryGroupEntriesFromMapKeysAndAllowFrom, t as applyDirectoryQueryAndLimit, u as listInspectedDirectoryEntriesFromSources } from "../directory-config-helpers-Dzu63P2T.js";
import { t as createRuntimeDirectoryLiveAdapter } from "../runtime-forwarders-DYq7zQK4.js";
import "../setup-wizard-helpers-DqDljZdJ.js";
import "../channel-reply-pipeline-aTd75Ho1.js";
import "../channel-targets-Do0qPc8p.js";
import "../channel-pairing-BzjX0Owm.js";
import "../status-helpers-xy7hioei.js";
import "../webhook-ingress-mNQs6uhb.js";
//#region src/plugin-sdk/bluebubbles-policy.ts
function loadFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "bluebubbles",
		artifactBasename: "api.js"
	});
}
const resolveBlueBubblesGroupRequireMention = ((...args) => loadFacadeModule()["resolveBlueBubblesGroupRequireMention"](...args));
const resolveBlueBubblesGroupToolPolicy = ((...args) => loadFacadeModule()["resolveBlueBubblesGroupToolPolicy"](...args));
//#endregion
//#region src/channels/plugins/bluebubbles-actions.ts
const BLUEBUBBLES_ACTIONS = {
	react: { gate: "reactions" },
	edit: {
		gate: "edit",
		unsupportedOnMacOS26: true
	},
	unsend: { gate: "unsend" },
	reply: { gate: "reply" },
	sendWithEffect: { gate: "sendWithEffect" },
	renameGroup: {
		gate: "renameGroup",
		groupOnly: true
	},
	setGroupIcon: {
		gate: "setGroupIcon",
		groupOnly: true
	},
	addParticipant: {
		gate: "addParticipant",
		groupOnly: true
	},
	removeParticipant: {
		gate: "removeParticipant",
		groupOnly: true
	},
	leaveGroup: {
		gate: "leaveGroup",
		groupOnly: true
	},
	sendAttachment: { gate: "sendAttachment" }
};
const BLUEBUBBLES_ACTION_SPECS = BLUEBUBBLES_ACTIONS;
new Set(Object.keys(BLUEBUBBLES_ACTIONS).filter((action) => BLUEBUBBLES_ACTION_SPECS[action]?.groupOnly));
//#endregion
//#region src/plugin-sdk/bluebubbles.ts
function loadBlueBubblesFacadeModule() {
	return loadBundledPluginPublicSurfaceModuleSync({
		dirName: "bluebubbles",
		artifactBasename: "api.js"
	});
}
function collectBlueBubblesStatusIssues(accounts) {
	return loadBlueBubblesFacadeModule().collectBlueBubblesStatusIssues(accounts);
}
//#endregion
//#region src/plugin-sdk/compat.ts
if (process.env.VITEST !== "true" && process.env.OPENCLAW_SUPPRESS_PLUGIN_SDK_COMPAT_WARNING !== "1") process.emitWarning("openclaw/plugin-sdk/compat is deprecated for new plugins. Migrate to focused openclaw/plugin-sdk/<subpath> imports. See https://docs.openclaw.ai/plugins/sdk-migration", {
	code: "OPENCLAW_PLUGIN_SDK_COMPAT_DEPRECATED",
	detail: "Bundled plugins must use scoped plugin-sdk subpaths. External plugins may keep compat temporarily while migrating. Migration guide: https://docs.openclaw.ai/plugins/sdk-migration"
});
//#endregion
export { AllowFromListSchema, BlockStreamingCoalesceSchema, ContextVisibilityModeSchema, DEFAULT_GROUP_HISTORY_LIMIT, DM_GROUP_ACCESS_REASON, DmConfigSchema, DmPolicySchema, GroupPolicySchema, HISTORY_CONTEXT_MARKER, KeyedAsyncQueue, MarkdownConfigSchema, ReplyRuntimeConfigSchemaShape, ToolPolicySchema, applyAuthProfileConfig, applyDirectoryQueryAndLimit, buildAccountScopedDmSecurityPolicy, buildApiKeyCredential, buildCatchallMultiAccountChannelSchema, buildChannelConfigSchema, buildHistoryContext, buildHistoryContextFromEntries, buildHistoryContextFromMap, buildMemorySystemPromptAddition, buildNestedDmConfigSchema, buildOpenGroupPolicyConfigureRouteAllowlistWarning, buildOpenGroupPolicyRestrictSendersWarning, buildOpenGroupPolicyWarning, buildPendingHistoryContextFromMap, clearHistoryEntries, clearHistoryEntriesIfEnabled, coerceNativeSetting, collectAllowlistProviderGroupPolicyWarnings, collectAllowlistProviderRestrictSendersWarnings, collectBlueBubblesStatusIssues, collectNormalizedDirectoryIds, collectOpenGroupPolicyConfiguredRouteWarnings, collectOpenGroupPolicyRestrictSendersWarnings, collectOpenGroupPolicyRouteAllowlistWarnings, collectOpenProviderGroupPolicyWarnings, composeAccountWarningCollectors, composeWarningCollectors, createAccountStatusSink, createAllowlistProviderGroupPolicyWarningCollector, createAllowlistProviderOpenWarningCollector, createAllowlistProviderRestrictSendersWarningCollector, createAllowlistProviderRouteAllowlistWarningCollector, createChannelDirectoryAdapter, createConditionalWarningCollector, createDangerousNameMatchingMutableAllowlistWarningCollector, createEmptyChannelDirectoryAdapter, createHybridChannelConfigAdapter, createHybridChannelConfigBase, createInspectedDirectoryEntriesLister, createOpenGroupPolicyRestrictSendersWarningCollector, createOpenProviderConfiguredRouteWarningCollector, createOpenProviderGroupPolicyWarningCollector, createPluginRuntimeStore, createResolvedDirectoryEntriesLister, createRestrictSendersChannelSecurity, createRuntimeDirectoryLiveAdapter, createScopedAccountConfigAccessors, createScopedChannelConfigAdapter, createScopedChannelConfigBase, createScopedDmSecurityResolver, createTopLevelChannelConfigAdapter, createTopLevelChannelConfigBase, delegateCompactionToRuntime, emptyChannelDirectoryList, emptyPluginConfigSchema, evaluateGroupRouteAccessForPolicy, evaluateSenderGroupAccessForPolicy, evictOldHistoryKeys, formatAllowFromLowercase, formatNormalizedAllowFromEntries, inspectReadOnlyChannelAccount, listDirectoryEntriesFromSources, listDirectoryGroupEntriesFromMapKeys, listDirectoryGroupEntriesFromMapKeysAndAllowFrom, listDirectoryUserEntriesFromAllowFrom, listDirectoryUserEntriesFromAllowFromAndMapKeys, listInspectedDirectoryEntriesFromSources, listResolvedDirectoryEntriesFromSources, listResolvedDirectoryGroupEntriesFromMapKeys, listResolvedDirectoryUserEntriesFromAllowFrom, mapAllowFromEntries, mapAllowlistResolutionInputs, normalizeAccountId, normalizeAllowFromList, nullChannelDirectorySelf, onDiagnosticEvent, optionalStringEnum, projectAccountConfigWarningCollector, projectAccountWarningCollector, projectConfigAccountIdWarningCollector, projectConfigWarningCollector, projectWarningCollector, readStoreAllowFromForDmPolicy, recordPendingHistoryEntry, recordPendingHistoryEntryIfEnabled, registerContextEngine, requireOpenAllowFrom, resolveBlueBubblesGroupRequireMention, resolveBlueBubblesGroupToolPolicy, resolveChannelGroupPolicy, resolveChannelGroupRequireMention, resolveChannelGroupToolsPolicy, resolveControlCommandGate, resolveDmGroupAccessWithCommandGate, resolveDmGroupAccessWithLists, resolveEffectiveAllowFromLists, resolveOpenDmAllowlistAccess, resolvePreferredOpenClawTmpDir, resolveSenderScopedGroupPolicy, resolveToolsBySender, stringEnum, toDirectoryEntries, upsertApiKeyProfile, writeOAuthCredentials };
