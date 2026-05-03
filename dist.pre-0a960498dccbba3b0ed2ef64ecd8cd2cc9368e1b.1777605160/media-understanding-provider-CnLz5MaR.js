import { r as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-CoR4UWjz.js";
import "./media-understanding-kSoNnKVt.js";
//#region extensions/openrouter/media-understanding-provider.ts
const openrouterMediaUnderstandingProvider = {
	id: "openrouter",
	capabilities: ["image"],
	defaultModels: { image: "auto" },
	describeImage: describeImageWithModel,
	describeImages: describeImagesWithModel
};
//#endregion
export { openrouterMediaUnderstandingProvider as t };
