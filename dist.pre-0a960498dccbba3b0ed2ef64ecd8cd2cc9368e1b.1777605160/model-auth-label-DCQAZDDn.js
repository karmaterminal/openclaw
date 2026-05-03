import { r as normalizeProviderId } from "./provider-id-BLh32HP1.js";
import { O as readCodexCliCredentialsCached, l as loadAuthProfileStoreWithoutExternalProfiles, n as ensureAuthProfileStore } from "./store-DQMFx95A.js";
import "./model-selection-hTT37jzm.js";
import { t as resolveEnvApiKey } from "./model-auth-env-92yNsofU.js";
import { i as resolveAuthProfileDisplayLabel } from "./auth-profiles-BM8r4_je.js";
import { n as resolveAuthProfileOrder } from "./order-BLAjA_37.js";
import { l as resolveUsableCustomProviderApiKey } from "./model-auth-CMq_TSIy.js";
//#region src/agents/model-auth-label.ts
function resolveModelAuthLabel(params) {
	const resolvedProvider = params.provider?.trim();
	if (!resolvedProvider) return;
	const providerKey = normalizeProviderId(resolvedProvider);
	const store = params.includeExternalProfiles === false ? loadAuthProfileStoreWithoutExternalProfiles(params.agentDir) : ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false });
	const profileOverride = params.sessionEntry?.authProfileOverride?.trim();
	const candidates = [profileOverride, ...resolveAuthProfileOrder({
		cfg: params.cfg,
		store,
		provider: providerKey,
		preferredProfile: profileOverride
	})].filter(Boolean);
	for (const profileId of candidates) {
		const profile = store.profiles[profileId];
		if (!profile || normalizeProviderId(profile.provider) !== providerKey) continue;
		const label = resolveAuthProfileDisplayLabel({
			cfg: params.cfg,
			store,
			profileId
		});
		if (profile.type === "oauth") return `oauth${label ? ` (${label})` : ""}`;
		if (profile.type === "token") return `token${label ? ` (${label})` : ""}`;
		return `api-key${label ? ` (${label})` : ""}`;
	}
	const envKey = resolveEnvApiKey(providerKey);
	if (envKey?.apiKey) {
		if (envKey.source.includes("OAUTH_TOKEN")) return `oauth (${envKey.source})`;
		return `api-key (${envKey.source})`;
	}
	if (providerKey === "codex" && readCodexCliCredentialsCached({ ttlMs: 5e3 })) return "oauth (codex-cli)";
	if (resolveUsableCustomProviderApiKey({
		cfg: params.cfg,
		provider: providerKey
	})) return `api-key (models.json)`;
	return "unknown";
}
//#endregion
export { resolveModelAuthLabel as t };
