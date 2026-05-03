import { r as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-Din6EH5G.js";
import "./media-understanding-BH80K4kr.js";
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
