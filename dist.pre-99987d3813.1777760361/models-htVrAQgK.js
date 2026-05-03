import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-6iwyQGK_.js";
import { t as modelCatalog } from "./openclaw.plugin-Da_b0d18.js";
//#region extensions/byteplus/models.ts
const BYTEPLUS_MANIFEST_PROVIDER = buildManifestModelProviderConfig({
	providerId: "byteplus",
	catalog: modelCatalog.providers.byteplus
});
const BYTEPLUS_CODING_MANIFEST_PROVIDER = buildManifestModelProviderConfig({
	providerId: "byteplus-plan",
	catalog: modelCatalog.providers["byteplus-plan"]
});
const BYTEPLUS_BASE_URL = BYTEPLUS_MANIFEST_PROVIDER.baseUrl;
const BYTEPLUS_CODING_BASE_URL = BYTEPLUS_CODING_MANIFEST_PROVIDER.baseUrl;
const BYTEPLUS_DEFAULT_MODEL_ID = "seed-1-8-251228";
const BYTEPLUS_CODING_DEFAULT_MODEL_ID = "ark-code-latest";
const BYTEPLUS_DEFAULT_MODEL_REF = `byteplus/${BYTEPLUS_DEFAULT_MODEL_ID}`;
const BYTEPLUS_DEFAULT_COST = {
	input: 1e-4,
	output: 2e-4,
	cacheRead: 0,
	cacheWrite: 0
};
const BYTEPLUS_MODEL_CATALOG = BYTEPLUS_MANIFEST_PROVIDER.models;
const BYTEPLUS_CODING_MODEL_CATALOG = BYTEPLUS_CODING_MANIFEST_PROVIDER.models;
function buildBytePlusModelDefinition(entry) {
	return {
		...entry,
		input: [...entry.input],
		cost: { ...entry.cost }
	};
}
//#endregion
export { BYTEPLUS_DEFAULT_COST as a, BYTEPLUS_MODEL_CATALOG as c, BYTEPLUS_CODING_MODEL_CATALOG as i, buildBytePlusModelDefinition as l, BYTEPLUS_CODING_BASE_URL as n, BYTEPLUS_DEFAULT_MODEL_ID as o, BYTEPLUS_CODING_DEFAULT_MODEL_ID as r, BYTEPLUS_DEFAULT_MODEL_REF as s, BYTEPLUS_BASE_URL as t };
