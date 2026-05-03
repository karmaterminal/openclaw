import { a as normalizeLowercaseStringOrEmpty } from "./string-coerce-CjxCKZ6B.js";
import { r as normalizeProviderId } from "./provider-id-ZTkpwCTd.js";
import { E as resolveProviderBuiltInModelSuppression } from "./provider-runtime-C-l-2kdJ.js";
//#region src/agents/model-suppression.ts
function resolveBuiltInModelSuppression(params) {
	const provider = normalizeProviderId(params.provider ?? "");
	const modelId = normalizeLowercaseStringOrEmpty(params.id);
	if (!provider || !modelId) return;
	return resolveProviderBuiltInModelSuppression({
		...params.config ? { config: params.config } : {},
		env: process.env,
		context: {
			...params.config ? { config: params.config } : {},
			env: process.env,
			provider,
			modelId,
			...params.baseUrl ? { baseUrl: params.baseUrl } : {}
		}
	});
}
function shouldSuppressBuiltInModel(params) {
	return resolveBuiltInModelSuppression(params)?.suppress ?? false;
}
function buildSuppressedBuiltInModelError(params) {
	return resolveBuiltInModelSuppression(params)?.errorMessage;
}
//#endregion
export { shouldSuppressBuiltInModel as n, buildSuppressedBuiltInModelError as t };
