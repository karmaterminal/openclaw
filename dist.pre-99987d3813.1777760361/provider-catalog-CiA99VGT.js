import { n as buildManifestModelProviderConfig } from "./provider-catalog-shared-6iwyQGK_.js";
import { t as modelCatalog } from "./openclaw.plugin-C0hd6u8X.js";
//#region extensions/together/provider-catalog.ts
function buildTogetherProvider() {
	return buildManifestModelProviderConfig({
		providerId: "together",
		catalog: modelCatalog.providers.together
	});
}
//#endregion
export { buildTogetherProvider as t };
