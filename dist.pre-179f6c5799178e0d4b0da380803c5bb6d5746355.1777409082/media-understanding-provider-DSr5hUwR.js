import { n as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-BaA3Yr2r.js";
import "./media-understanding-DSHC_2_v.js";
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
