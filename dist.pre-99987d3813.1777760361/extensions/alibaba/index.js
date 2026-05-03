import { t as definePluginEntry } from "../../plugin-entry-DX3V0eaU.js";
import { t as buildAlibabaVideoGenerationProvider } from "../../video-generation-provider-D3FEe4XD.js";
//#region extensions/alibaba/index.ts
var alibaba_default = definePluginEntry({
	id: "alibaba",
	name: "Alibaba Model Studio Plugin",
	description: "Bundled Alibaba Model Studio video provider plugin",
	register(api) {
		api.registerVideoGenerationProvider(buildAlibabaVideoGenerationProvider());
	}
});
//#endregion
export { alibaba_default as default };
