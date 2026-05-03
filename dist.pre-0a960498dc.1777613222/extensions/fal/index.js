import { t as definePluginEntry } from "../../plugin-entry-BMrQ8lmP.js";
import { n as buildFalImageGenerationProvider } from "../../image-generation-provider-DezN3tFc.js";
import { t as createFalProvider } from "../../provider-registration-KtGYiQ-j.js";
import { n as buildFalVideoGenerationProvider } from "../../video-generation-provider-Bd1Pj1kZ.js";
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
