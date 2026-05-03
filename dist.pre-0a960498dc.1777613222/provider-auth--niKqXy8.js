import "./types.secrets-D9j6Z-gp.js";
import "./ref-contract-CmDf3_tu.js";
import "./provider-env-vars-Cva53EUa.js";
import { n as ensureAuthProfileStore } from "./store-B63eWvc7.js";
import "./agent-paths-DHYXEmd4.js";
import "./model-auth-markers-9f2IFvuI.js";
import { t as resolveEnvApiKey } from "./model-auth-env-BsMQtO3H.js";
import "./models-config.providers.secrets-Ca6Fs1Et.js";
import { n as listProfilesForProvider } from "./profile-list-CT3GwYKf.js";
import "./repair-Dz-bQ24r.js";
import "./profiles-DjXPV26S.js";
import "./provider-auth-input-Le2omKFf.js";
import "./provider-auth-helpers-D4xTC7qE.js";
import "./provider-api-key-auth-CCxyCMer.js";
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
