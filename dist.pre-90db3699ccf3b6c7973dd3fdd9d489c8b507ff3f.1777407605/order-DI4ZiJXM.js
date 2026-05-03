import { n as findNormalizedProviderValue, r as normalizeProviderId } from "./provider-id-ZTkpwCTd.js";
import { n as resolveProviderIdForAuth } from "./provider-auth-aliases-DC9TFBv2.js";
import { w as evaluateStoredCredentialEligibility } from "./store-De_brRTx.js";
import "./model-selection-B7RNWcLj.js";
import { n as listProfilesForProvider, t as dedupeProfileIds } from "./profiles-DQiFenPb.js";
import { a as isProfileInCooldown, l as resolveProfileUnusableUntil, r as clearExpiredCooldowns } from "./usage-CjcxlRTg.js";
//#region src/agents/auth-profiles/order.ts
function resolveAuthProfileEligibility(params) {
	const providerAuthKey = resolveProviderIdForAuth(params.provider, { config: params.cfg });
	const cred = params.store.profiles[params.profileId];
	if (!cred) return {
		eligible: false,
		reasonCode: "profile_missing"
	};
	if (resolveProviderIdForAuth(cred.provider, { config: params.cfg }) !== providerAuthKey) return {
		eligible: false,
		reasonCode: "provider_mismatch"
	};
	const profileConfig = params.cfg?.auth?.profiles?.[params.profileId];
	if (profileConfig) {
		if (resolveProviderIdForAuth(profileConfig.provider, { config: params.cfg }) !== providerAuthKey) return {
			eligible: false,
			reasonCode: "provider_mismatch"
		};
		if (profileConfig.mode !== cred.type) {
			if (!(profileConfig.mode === "oauth" && cred.type === "token")) return {
				eligible: false,
				reasonCode: "mode_mismatch"
			};
		}
	}
	const credentialEligibility = evaluateStoredCredentialEligibility({
		credential: cred,
		now: params.now
	});
	return {
		eligible: credentialEligibility.eligible,
		reasonCode: credentialEligibility.reasonCode
	};
}
function resolveAuthProfileOrder(params) {
	const { cfg, store, provider, preferredProfile } = params;
	const providerKey = normalizeProviderId(provider);
	const providerAuthKey = resolveProviderIdForAuth(provider, { config: cfg });
	const now = Date.now();
	clearExpiredCooldowns(store, now);
	const storedOrder = findNormalizedProviderValue(store.order, providerKey);
	const configuredOrder = findNormalizedProviderValue(cfg?.auth?.order, providerKey);
	const explicitOrder = storedOrder ?? configuredOrder;
	const explicitProfiles = cfg?.auth?.profiles ? Object.entries(cfg.auth.profiles).filter(([, profile]) => resolveProviderIdForAuth(profile.provider, { config: cfg }) === providerAuthKey).map(([profileId]) => profileId) : [];
	const baseOrder = explicitOrder ?? (explicitProfiles.length > 0 ? explicitProfiles : listProfilesForProvider(store, provider));
	if (baseOrder.length === 0) return [];
	const isValidProfile = (profileId) => resolveAuthProfileEligibility({
		cfg,
		store,
		provider,
		profileId,
		now
	}).eligible;
	let filtered = baseOrder.filter(isValidProfile);
	const allBaseProfilesMissing = baseOrder.every((profileId) => !store.profiles[profileId]);
	if (filtered.length === 0 && explicitProfiles.length > 0 && allBaseProfilesMissing) filtered = listProfilesForProvider(store, provider).filter(isValidProfile);
	const deduped = dedupeProfileIds(filtered);
	if (explicitOrder && explicitOrder.length > 0) {
		const available = [];
		const inCooldown = [];
		for (const profileId of deduped) if (isProfileInCooldown(store, profileId)) {
			const cooldownUntil = resolveProfileUnusableUntil(store.usageStats?.[profileId] ?? {}) ?? now;
			inCooldown.push({
				profileId,
				cooldownUntil
			});
		} else available.push(profileId);
		const cooldownSorted = inCooldown.toSorted((a, b) => a.cooldownUntil - b.cooldownUntil).map((entry) => entry.profileId);
		const ordered = [...available, ...cooldownSorted];
		if (preferredProfile && ordered.includes(preferredProfile)) return [preferredProfile, ...ordered.filter((e) => e !== preferredProfile)];
		return ordered;
	}
	const sorted = orderProfilesByMode(deduped, store);
	if (preferredProfile && sorted.includes(preferredProfile)) return [preferredProfile, ...sorted.filter((e) => e !== preferredProfile)];
	return sorted;
}
function orderProfilesByMode(order, store) {
	const now = Date.now();
	const available = [];
	const inCooldown = [];
	for (const profileId of order) if (isProfileInCooldown(store, profileId)) inCooldown.push(profileId);
	else available.push(profileId);
	const sorted = available.map((profileId) => {
		const type = store.profiles[profileId]?.type;
		return {
			profileId,
			typeScore: type === "oauth" ? 0 : type === "token" ? 1 : type === "api_key" ? 2 : 3,
			lastUsed: store.usageStats?.[profileId]?.lastUsed ?? 0
		};
	}).toSorted((a, b) => {
		if (a.typeScore !== b.typeScore) return a.typeScore - b.typeScore;
		return a.lastUsed - b.lastUsed;
	}).map((entry) => entry.profileId);
	const cooldownSorted = inCooldown.map((profileId) => ({
		profileId,
		cooldownUntil: resolveProfileUnusableUntil(store.usageStats?.[profileId] ?? {}) ?? now
	})).toSorted((a, b) => a.cooldownUntil - b.cooldownUntil).map((entry) => entry.profileId);
	return [...sorted, ...cooldownSorted];
}
//#endregion
export { resolveAuthProfileOrder as n, resolveAuthProfileEligibility as t };
