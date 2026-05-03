import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-6iwyQGK_.js";
import { t as modelCatalog } from "./openclaw.plugin-D5XXa56P.js";
//#region extensions/volcengine/models.ts
const DOUBAO_MANIFEST_PROVIDER = buildManifestModelProviderConfig({
	providerId: "volcengine",
	catalog: modelCatalog.providers.volcengine
});
const DOUBAO_CODING_MANIFEST_PROVIDER = buildManifestModelProviderConfig({
	providerId: "volcengine-plan",
	catalog: modelCatalog.providers["volcengine-plan"]
});
const DOUBAO_BASE_URL = DOUBAO_MANIFEST_PROVIDER.baseUrl;
const DOUBAO_CODING_BASE_URL = DOUBAO_CODING_MANIFEST_PROVIDER.baseUrl;
const DOUBAO_DEFAULT_MODEL_ID = "doubao-seed-1-8-251228";
const DOUBAO_CODING_DEFAULT_MODEL_ID = "ark-code-latest";
const DOUBAO_DEFAULT_MODEL_REF = `volcengine/${DOUBAO_DEFAULT_MODEL_ID}`;
const DOUBAO_DEFAULT_COST = {
	input: 1e-4,
	output: 2e-4,
	cacheRead: 0,
	cacheWrite: 0
};
const DOUBAO_MODEL_CATALOG = DOUBAO_MANIFEST_PROVIDER.models;
const DOUBAO_CODING_MODEL_CATALOG = DOUBAO_CODING_MANIFEST_PROVIDER.models;
function buildDoubaoModelDefinition(entry) {
	return {
		...entry,
		input: [...entry.input],
		cost: { ...entry.cost }
	};
}
//#endregion
export { DOUBAO_DEFAULT_COST as a, DOUBAO_MODEL_CATALOG as c, DOUBAO_CODING_MODEL_CATALOG as i, buildDoubaoModelDefinition as l, DOUBAO_CODING_BASE_URL as n, DOUBAO_DEFAULT_MODEL_ID as o, DOUBAO_CODING_DEFAULT_MODEL_ID as r, DOUBAO_DEFAULT_MODEL_REF as s, DOUBAO_BASE_URL as t };
