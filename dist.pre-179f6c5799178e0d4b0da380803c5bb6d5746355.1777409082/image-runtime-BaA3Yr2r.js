import { n as createLazyRuntimeMethodBinder, r as createLazyRuntimeModule } from "./lazy-runtime-B8SUpYTe.js";
//#region src/media-understanding/image-runtime.ts
const bindImageRuntime = createLazyRuntimeMethodBinder(createLazyRuntimeModule(() => import("./image-D-HV0AwQ.js")));
const describeImageWithModel = bindImageRuntime((runtime) => runtime.describeImageWithModel);
const describeImagesWithModel = bindImageRuntime((runtime) => runtime.describeImagesWithModel);
//#endregion
export { describeImagesWithModel as n, describeImageWithModel as t };
