import { t as definePluginEntry } from "../../plugin-entry-DX3V0eaU.js";
import { t as voyageMemoryEmbeddingProviderAdapter } from "../../memory-embedding-adapter-Dsy2JvzN.js";
//#region extensions/voyage/index.ts
var voyage_default = definePluginEntry({
	id: "voyage",
	name: "Voyage Embeddings",
	description: "Bundled Voyage memory embedding provider plugin",
	register(api) {
		api.registerMemoryEmbeddingProvider(voyageMemoryEmbeddingProviderAdapter);
	}
});
//#endregion
export { voyage_default as default };
