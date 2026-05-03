import { r as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-Din6EH5G.js";
import "./media-understanding-BH80K4kr.js";
//#region extensions/minimax/media-understanding-provider.ts
const minimaxMediaUnderstandingProvider = {
	id: "minimax",
	capabilities: ["image"],
	defaultModels: { image: "MiniMax-VL-01" },
	autoPriority: { image: 40 },
	describeImage: describeImageWithModel,
	describeImages: describeImagesWithModel
};
const minimaxPortalMediaUnderstandingProvider = {
	id: "minimax-portal",
	capabilities: ["image"],
	defaultModels: { image: "MiniMax-VL-01" },
	autoPriority: { image: 50 },
	describeImage: describeImageWithModel,
	describeImages: describeImagesWithModel
};
//#endregion
export { minimaxPortalMediaUnderstandingProvider as n, minimaxMediaUnderstandingProvider as t };
