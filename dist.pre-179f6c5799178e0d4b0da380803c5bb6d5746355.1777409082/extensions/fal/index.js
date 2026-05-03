import { t as definePluginEntry } from "../../plugin-entry-Bd-NQPpx.js";
import { n as buildFalImageGenerationProvider } from "../../image-generation-provider-BE_1tXhB.js";
import { t as createFalProvider } from "../../provider-registration-CT81gjK8.js";
import { n as buildFalVideoGenerationProvider } from "../../video-generation-provider-Djr8gEOq.js";
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
