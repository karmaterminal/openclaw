import "./types.secrets-v6szeegc.js";
import "./ref-contract-cHj1Typp.js";
import "./provider-env-vars-b8Gq5FEE.js";
import { n as ensureAuthProfileStore } from "./store-DlTWjzi2.js";
import "./agent-paths-DGDPUqkd.js";
import "./model-auth-markers-OFrmb6OJ.js";
import { t as resolveEnvApiKey } from "./model-auth-env-M4IsLhMq.js";
import "./models-config.providers.secrets-ehy8roEZ.js";
import { n as listProfilesForProvider } from "./profile-list-CrmV9iII.js";
import "./repair-D2iCJ4o9.js";
import "./profiles-ByOh6QBz.js";
import "./provider-auth-input-_FirplOd.js";
import "./provider-auth-helpers-EeCBEk18.js";
import "./provider-api-key-auth-Bbu5LfOo.js";
import { createHash, randomBytes } from "node:crypto";
//#region src/plugin-sdk/oauth-utils.ts
/** Encode a flat object as application/x-www-form-urlencoded form data. */
function toFormUrlEncoded(data) {
	return Object.entries(data).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
}
/** Generate a PKCE verifier/challenge pair suitable for OAuth authorization flows. */
function generatePkceVerifierChallenge() {
	const verifier = randomBytes(32).toString("base64url");
	return {
		verifier,
		challenge: createHash("sha256").update(verifier).digest("base64url")
	};
}
/** Generate a PKCE verifier/challenge pair with a 64-character hex verifier. */
function generateHexPkceVerifierChallenge() {
	const verifier = randomBytes(32).toString("hex");
	return {
		verifier,
		challenge: createHash("sha256").update(verifier).digest("base64url")
	};
}
//#endregion
//#region src/plugin-sdk/provider-auth.ts
function isProviderApiKeyConfigured(params) {
	if (resolveEnvApiKey(params.provider)?.apiKey) return true;
	const agentDir = params.agentDir?.trim();
	if (!agentDir) return false;
	return listProfilesForProvider(ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false }), params.provider).length > 0;
}
//#endregion
export { toFormUrlEncoded as i, generateHexPkceVerifierChallenge as n, generatePkceVerifierChallenge as r, isProviderApiKeyConfigured as t };
