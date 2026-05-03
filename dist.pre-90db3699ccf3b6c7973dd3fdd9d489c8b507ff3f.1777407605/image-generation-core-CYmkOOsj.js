import "./subsystem-CJBoMDt5.js";
import "./provider-env-vars-D-KHlttz.js";
import "./failover-error-Bly4bj4L.js";
import "./provider-registry-CKY2FCLl.js";
import "./runtime-shared-BqOYKf4Q.js";
import "./provider-model-shared-BPfrxqlL.js";
import "./provider-model-defaults-DpXrEA7y.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-DnnmtskD.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
