import "./types.secrets-BZ6RGKR0.js";
import "./ref-contract-CsOjNPCR.js";
import "./provider-env-vars-D-KHlttz.js";
import { n as ensureAuthProfileStore } from "./store-De_brRTx.js";
import "./agent-paths-yYk0N-bh.js";
import "./model-auth-markers-U2294Wcj.js";
import { t as resolveEnvApiKey } from "./model-auth-env-BPk5alE5.js";
import "./models-config.providers.secrets-Ct7ZKt47.js";
import { n as listProfilesForProvider } from "./profiles-DQiFenPb.js";
import "./repair-DTHk4iey.js";
import "./provider-auth-input-HohW9v1U.js";
import "./provider-auth-helpers-DDc3aiuG.js";
import "./provider-api-key-auth-D7SXhgzu.js";
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
