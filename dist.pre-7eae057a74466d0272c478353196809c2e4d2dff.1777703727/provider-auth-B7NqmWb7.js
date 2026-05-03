import "./types.secrets-D9j6Z-gp.js";
import "./ref-contract-CmDf3_tu.js";
import "./provider-env-vars-uH7BbqTU.js";
import { n as ensureAuthProfileStore } from "./store-DEFH3_of.js";
import "./agent-paths-CACD-vsQ.js";
import { n as listProfilesForProvider } from "./profile-list-Bg_34ywG.js";
import "./repair-QyIPlAvz.js";
import "./profiles-Bb22d7wV.js";
import "./model-auth-markers-bqtxN13W.js";
import { t as resolveEnvApiKey } from "./model-auth-env-CEuHMAX0.js";
import "./models-config.providers.secrets-B7wce6n7.js";
import "./provider-auth-input-DC54N7Ry.js";
import "./provider-auth-helpers-BqOGNOgm.js";
import "./provider-api-key-auth-b4Vuto-0.js";
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
