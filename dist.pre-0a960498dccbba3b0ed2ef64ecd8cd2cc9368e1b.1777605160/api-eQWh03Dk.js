import { f as readStringValue } from "./string-coerce-C1IzJjqi.js";
import { r as normalizeProviderId } from "./provider-id-BLh32HP1.js";
import "./provider-tools-BodUI8uW.js";
import { o as getModelProviderHint } from "./provider-model-shared-CIbJhChi.js";
import "./text-runtime-xbgfFCOe.js";
import "./model-definitions-BIn329qn.js";
import "./provider-catalog-DI1DZLrv.js";
import "./onboard-CTS_7Wzc.js";
import "./image-generation-provider-Cl3u0I84.js";
import "./provider-models-DU3B7WYx.js";
//#region extensions/xai/api.ts
const XAI_NATIVE_ENDPOINT_HOSTS = new Set(["api.x.ai", "api.grok.x.ai"]);
function resolveHostname(value) {
	try {
		return new URL(value).hostname.toLowerCase();
	} catch {
		return;
	}
}
function isXaiNativeEndpoint(baseUrl) {
	return typeof baseUrl === "string" && XAI_NATIVE_ENDPOINT_HOSTS.has(resolveHostname(baseUrl) ?? "");
}
function isXaiModelHint(modelId) {
	return getModelProviderHint(modelId) === "x-ai";
}
function shouldUseXaiResponsesTransport(params) {
	if (params.api !== "openai-completions") return false;
	if (isXaiNativeEndpoint(params.baseUrl)) return true;
	return normalizeProviderId(params.provider) === "xai" && !params.baseUrl;
}
function shouldContributeXaiCompat(params) {
	if (params.model.api !== "openai-completions") return false;
	return isXaiNativeEndpoint(params.model.baseUrl) || isXaiModelHint(params.modelId);
}
function resolveXaiTransport(params) {
	if (!shouldUseXaiResponsesTransport(params)) return;
	return {
		api: "openai-responses",
		baseUrl: readStringValue(params.baseUrl)
	};
}
function resolveXaiBaseUrl(baseUrlOrConfig) {
	let candidate = baseUrlOrConfig;
	if (baseUrlOrConfig && typeof baseUrlOrConfig === "object" && !Array.isArray(baseUrlOrConfig) && "cfg" in baseUrlOrConfig) candidate = baseUrlOrConfig.cfg?.models?.providers?.xai?.baseUrl ?? baseUrlOrConfig;
	return readStringValue(candidate) || "https://api.x.ai/v1";
}
//#endregion
export { shouldContributeXaiCompat as i, resolveXaiBaseUrl as n, resolveXaiTransport as r, isXaiModelHint as t };
