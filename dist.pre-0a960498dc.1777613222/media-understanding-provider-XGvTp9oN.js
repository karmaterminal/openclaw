import { n as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-Ce5F0IOS.js";
import "./media-understanding-Bs05_f-d.js";
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
