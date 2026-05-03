import { t as definePluginEntry } from "../../plugin-entry-C5CNAgRN.js";
import { t as buildComfyImageGenerationProvider } from "../../image-generation-provider-CZYXkx30.js";
import { t as buildComfyMusicGenerationProvider } from "../../music-generation-provider-gkqIVvAM.js";
import { t as buildComfyVideoGenerationProvider } from "../../video-generation-provider-DVb96d_1.js";
//#region extensions/comfy/index.ts
const PROVIDER_ID = "comfy";
var comfy_default = definePluginEntry({
	id: PROVIDER_ID,
	name: "ComfyUI Provider",
	description: "Bundled ComfyUI workflow media generation provider",
	register(api) {
		api.registerProvider({
			id: PROVIDER_ID,
			label: "ComfyUI",
			docsPath: "/providers/comfy",
			envVars: ["COMFY_API_KEY", "COMFY_CLOUD_API_KEY"],
			auth: []
		});
		api.registerImageGenerationProvider(buildComfyImageGenerationProvider());
		api.registerMusicGenerationProvider(buildComfyMusicGenerationProvider());
		api.registerVideoGenerationProvider(buildComfyVideoGenerationProvider());
	}
});
//#endregion
export { comfy_default as default };
