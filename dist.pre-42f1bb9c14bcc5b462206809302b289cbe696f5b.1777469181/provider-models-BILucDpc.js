import { s as normalizeOptionalLowercaseString } from "./string-coerce-C1IzJjqi.js";
import { a as normalizeModelCompat } from "./provider-model-compat-C_Djlg3U.js";
import { i as applyXaiModelCompat } from "./provider-tools-BodUI8uW.js";
import "./provider-model-shared-CIbJhChi.js";
import "./text-runtime-CuPMqcQ0.js";
import { m as resolveXaiCatalogEntry } from "./model-definitions-IIp7Hluh.js";
//#region extensions/xai/provider-models.ts
const XAI_MODERN_MODEL_PREFIXES = [
	"grok-3",
	"grok-4",
	"grok-code-fast"
];
function isModernXaiModel(modelId) {
	const lower = normalizeOptionalLowercaseString(modelId) ?? "";
	if (!lower || lower.includes("multi-agent")) return false;
	return XAI_MODERN_MODEL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
function resolveXaiForwardCompatModel(params) {
	const definition = resolveXaiCatalogEntry(params.ctx.modelId);
	if (!definition) return;
	return applyXaiModelCompat(normalizeModelCompat({
		id: definition.id,
		name: definition.name,
		api: params.ctx.providerConfig?.api ?? "openai-responses",
		provider: params.providerId,
		baseUrl: params.ctx.providerConfig?.baseUrl ?? "https://api.x.ai/v1",
		reasoning: definition.reasoning,
		input: definition.input,
		cost: definition.cost,
		contextWindow: definition.contextWindow,
		maxTokens: definition.maxTokens
	}));
}
//#endregion
export { resolveXaiForwardCompatModel as n, isModernXaiModel as t };
