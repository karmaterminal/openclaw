import { c as normalizeOptionalString } from "./string-coerce-CjxCKZ6B.js";
import { o as normalizePluginsConfig, s as resolveEffectiveEnableState } from "./config-state-COejNgwx.js";
import { n as resolvePluginProviders } from "./providers.runtime-CeArq6YC.js";
import { r as resolveProviderWizardOptions, t as resolveProviderModelPickerEntries } from "./provider-wizard-CQTgMEkj.js";
import { t as resolveProviderInstallCatalogEntries } from "./provider-install-catalog-CDTJPWoY.js";
import { t as sortFlowContributionsByLabel } from "./types-JJeqfaRg.js";
//#region src/flows/provider-flow.ts
const DEFAULT_PROVIDER_FLOW_SCOPE = "text-inference";
function includesProviderFlowScope(scopes, scope) {
	return scopes ? scopes.includes(scope) : scope === DEFAULT_PROVIDER_FLOW_SCOPE;
}
function resolveProviderDocsById(params) {
	return new Map(resolvePluginProviders({
		config: params?.config,
		workspaceDir: params?.workspaceDir,
		env: params?.env,
		mode: "setup"
	}).filter((provider) => Boolean(normalizeOptionalString(provider.docsPath))).map((provider) => [provider.id, normalizeOptionalString(provider.docsPath)]));
}
function resolveInstallCatalogProviderSetupFlowContributions(params) {
	const scope = params?.scope ?? DEFAULT_PROVIDER_FLOW_SCOPE;
	const normalizedPluginsConfig = normalizePluginsConfig(params?.config?.plugins);
	return resolveProviderInstallCatalogEntries({
		...params,
		includeUntrustedWorkspacePlugins: false
	}).filter((entry) => includesProviderFlowScope(entry.onboardingScopes, scope) && resolveEffectiveEnableState({
		id: entry.pluginId,
		origin: entry.origin,
		config: normalizedPluginsConfig,
		rootConfig: params?.config,
		enabledByDefault: true
	}).enabled).map((entry) => {
		const groupId = entry.groupId ?? entry.providerId;
		const groupLabel = entry.groupLabel ?? entry.label;
		return Object.assign({
			id: `provider:setup:${entry.choiceId}`,
			kind: `provider`,
			surface: `setup`,
			providerId: entry.providerId,
			pluginId: entry.pluginId,
			option: {
				value: entry.choiceId,
				label: entry.choiceLabel,
				...entry.choiceHint ? { hint: entry.choiceHint } : {},
				...entry.assistantPriority !== void 0 ? { assistantPriority: entry.assistantPriority } : {},
				...entry.assistantVisibility ? { assistantVisibility: entry.assistantVisibility } : {},
				group: {
					id: groupId,
					label: groupLabel,
					...entry.groupHint ? { hint: entry.groupHint } : {}
				}
			}
		}, entry.onboardingScopes ? { onboardingScopes: [...entry.onboardingScopes] } : {}, { source: `install-catalog` });
	});
}
function resolveProviderSetupFlowContributions(params) {
	const scope = params?.scope ?? DEFAULT_PROVIDER_FLOW_SCOPE;
	const docsByProvider = resolveProviderDocsById(params ?? {});
	const runtimeContributions = resolveProviderWizardOptions(params ?? {}).filter((option) => includesProviderFlowScope(option.onboardingScopes, scope)).map((option) => Object.assign({
		id: `provider:setup:${option.value}`,
		kind: `provider`,
		surface: `setup`,
		providerId: option.groupId,
		option: {
			value: option.value,
			label: option.label,
			...option.hint ? { hint: option.hint } : {},
			...option.assistantPriority !== void 0 ? { assistantPriority: option.assistantPriority } : {},
			...option.assistantVisibility ? { assistantVisibility: option.assistantVisibility } : {},
			group: {
				id: option.groupId,
				label: option.groupLabel,
				...option.groupHint ? { hint: option.groupHint } : {}
			},
			...docsByProvider.get(option.groupId) ? { docs: { path: docsByProvider.get(option.groupId) } } : {}
		}
	}, option.onboardingScopes ? { onboardingScopes: [...option.onboardingScopes] } : {}, { source: `runtime` }));
	const seenOptionValues = new Set(runtimeContributions.map((contribution) => contribution.option.value));
	const installCatalogContributions = resolveInstallCatalogProviderSetupFlowContributions({
		...params,
		scope
	}).filter((contribution) => !seenOptionValues.has(contribution.option.value));
	return sortFlowContributionsByLabel([...runtimeContributions, ...installCatalogContributions]);
}
function resolveProviderModelPickerFlowEntries(params) {
	return resolveProviderModelPickerFlowContributions(params).map((contribution) => contribution.option);
}
function resolveProviderModelPickerFlowContributions(params) {
	const docsByProvider = resolveProviderDocsById(params ?? {});
	return sortFlowContributionsByLabel(resolveProviderModelPickerEntries(params ?? {}).map((entry) => {
		const providerId = entry.value.startsWith("provider-plugin:") ? entry.value.slice(16).split(":")[0] : entry.value;
		return {
			id: `provider:model-picker:${entry.value}`,
			kind: "provider",
			surface: "model-picker",
			providerId,
			option: {
				value: entry.value,
				label: entry.label,
				...entry.hint ? { hint: entry.hint } : {},
				...docsByProvider.get(providerId) ? { docs: { path: docsByProvider.get(providerId) } } : {}
			},
			source: "runtime"
		};
	}));
}
//#endregion
export { resolveProviderModelPickerFlowEntries as n, resolveProviderSetupFlowContributions as r, resolveProviderModelPickerFlowContributions as t };
