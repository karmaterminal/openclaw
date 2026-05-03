import "./store-D-PUpS_m.js";
import { n as resolveAuthProfileMetadata } from "./identity-Bzf5mTjW.js";
import "./oauth-DWpW7WaS.js";
import "./repair-C8tgA3f1.js";
import "./order-ehN5Yd_1.js";
import "./profiles-xFFkxGDS.js";
import "./usage-CD9yZJ44.js";
//#region src/agents/auth-profiles/display.ts
function resolveAuthProfileDisplayLabel(params) {
	const { displayName, email } = resolveAuthProfileMetadata(params);
	if (displayName) return `${params.profileId} (${displayName})`;
	if (email) return `${params.profileId} (${email})`;
	return params.profileId;
}
//#endregion
//#region src/agents/auth-profiles/portability.ts
function hasAgentCopyOverride(credential) {
	return typeof credential.copyToAgents === "boolean" ? credential.copyToAgents : void 0;
}
function resolveAuthProfilePortability(credential) {
	const override = hasAgentCopyOverride(credential);
	if (override === false) return {
		portable: false,
		reason: "credential-opted-out"
	};
	if (credential.type === "oauth") return override === true ? {
		portable: true,
		reason: "oauth-provider-opted-in"
	} : {
		portable: false,
		reason: "non-portable-oauth-refresh-token"
	};
	return {
		portable: true,
		reason: "portable-static-credential"
	};
}
function isAuthProfileCredentialPortableForAgentCopy(credential) {
	return resolveAuthProfilePortability(credential).portable;
}
function buildPortableAuthProfileSecretsStoreForAgentCopy(store) {
	const copiedProfileIds = [];
	const skippedProfileIds = [];
	return {
		store: {
			version: 1,
			profiles: Object.fromEntries(Object.entries(store.profiles).flatMap(([profileId, credential]) => {
				if (!isAuthProfileCredentialPortableForAgentCopy(credential)) {
					skippedProfileIds.push(profileId);
					return [];
				}
				copiedProfileIds.push(profileId);
				return [[profileId, credential]];
			}))
		},
		copiedProfileIds,
		skippedProfileIds
	};
}
//#endregion
export { resolveAuthProfileDisplayLabel as n, buildPortableAuthProfileSecretsStoreForAgentCopy as t };
