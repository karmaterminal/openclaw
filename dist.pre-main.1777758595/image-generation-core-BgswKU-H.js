import "./subsystem-W9_E260X.js";
import "./provider-env-vars-BjQGC0_J.js";
import "./failover-error-CQwRMDjb.js";
import "./provider-model-shared-L7SDd0Sc.js";
import "./provider-registry-B57hvDva.js";
import "./runtime-shared-B02EEvQA.js";
import "./provider-model-defaults-BLwwSnQo.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-C2hae8ev.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
