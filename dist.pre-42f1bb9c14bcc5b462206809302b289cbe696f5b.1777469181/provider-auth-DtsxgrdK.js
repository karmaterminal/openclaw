import "./types.secrets-Zn5Zyn7M.js";
import "./ref-contract-BeQ-3fY_.js";
import "./provider-env-vars-DsK9fGJ1.js";
import { n as ensureAuthProfileStore } from "./store-DQMFx95A.js";
import "./agent-paths-Df60yWjf.js";
import "./model-auth-markers-CZrGSAU9.js";
import { t as resolveEnvApiKey } from "./model-auth-env-92yNsofU.js";
import "./models-config.providers.secrets-C1S2G_PF.js";
import { n as listProfilesForProvider } from "./profile-list-D_ujnDed.js";
import "./repair-CGKFjOzI.js";
import "./profiles-B2kNMwPI.js";
import "./provider-auth-input-ZuxhaZOe.js";
import "./provider-auth-helpers-DV0kVsBi.js";
import "./provider-api-key-auth-oL5wP46r.js";
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
