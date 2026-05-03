import { r as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-B9feYjvS.js";
import "./media-understanding-DPmchXrY.js";
//#region extensions/opencode-go/media-understanding-provider.ts
const opencodeGoMediaUnderstandingProvider = {
	id: "opencode-go",
	capabilities: ["image"],
	defaultModels: { image: "kimi-k2.6" },
	describeImage: describeImageWithModel,
	describeImages: describeImagesWithModel
};
//#endregion
export { opencodeGoMediaUnderstandingProvider as t };
