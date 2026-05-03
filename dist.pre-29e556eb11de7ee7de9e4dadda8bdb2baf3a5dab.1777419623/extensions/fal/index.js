import { t as definePluginEntry } from "../../plugin-entry-BDOZ5Arw.js";
import { n as buildFalImageGenerationProvider } from "../../image-generation-provider-37VOYFBW.js";
import { t as createFalProvider } from "../../provider-registration-Dh2qe7qh.js";
import { n as buildFalVideoGenerationProvider } from "../../video-generation-provider-BsE6tzM1.js";
var fal_default = definePluginEntry({
	id: "fal",
	name: "fal Provider",
	description: "Bundled fal image and video generation provider",
	register(api) {
		api.registerProvider(createFalProvider());
		api.registerImageGenerationProvider(buildFalImageGenerationProvider());
		api.registerVideoGenerationProvider(buildFalVideoGenerationProvider());
	}
});
//#endregion
export { fal_default as default };
