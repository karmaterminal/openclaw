import { t as definePluginEntry } from "../../plugin-entry-BDOZ5Arw.js";
import { t as buildAlibabaVideoGenerationProvider } from "../../video-generation-provider-n0qhBv3L.js";
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
