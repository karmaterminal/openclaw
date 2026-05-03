import { t as definePluginEntry } from "../../plugin-entry-DX3V0eaU.js";
import { n as buildFalImageGenerationProvider } from "../../image-generation-provider-9Yvgq7-D.js";
import { t as createFalProvider } from "../../provider-registration-B8FVgivs.js";
import { n as buildFalVideoGenerationProvider } from "../../video-generation-provider-C6NqN9G-.js";
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
