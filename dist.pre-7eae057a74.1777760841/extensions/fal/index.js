import { t as definePluginEntry } from "../../plugin-entry-55f8k4W7.js";
import { n as buildFalImageGenerationProvider } from "../../image-generation-provider-CJ_c4bVa.js";
import { t as createFalProvider } from "../../provider-registration-VxXjS_e9.js";
import { n as buildFalVideoGenerationProvider } from "../../video-generation-provider-1T5ip1wZ.js";
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
