import { p as readProviderEnvValue } from "../../web-search-provider-common-OmvN0TlB.js";
import "../../provider-web-search-Bf5NP5QY.js";
import { n as resolveFallbackXaiAuth } from "../../tool-auth-shared-z5jVDJtO.js";
//#region extensions/xai/provider-discovery.ts
const PROVIDER_ID = "xai";
function resolveXaiSyntheticAuth(config) {
	const apiKey = resolveFallbackXaiAuth(config)?.apiKey || readProviderEnvValue(["XAI_API_KEY"]);
	return apiKey ? {
		apiKey,
		source: "xAI plugin config",
		mode: "api-key"
	} : void 0;
}
const xaiProviderDiscovery = {
	id: PROVIDER_ID,
	label: "xAI",
	docsPath: "/providers/models",
	auth: [],
	resolveSyntheticAuth: ({ config }) => resolveXaiSyntheticAuth(config)
};
//#endregion
export { xaiProviderDiscovery as default, xaiProviderDiscovery };
