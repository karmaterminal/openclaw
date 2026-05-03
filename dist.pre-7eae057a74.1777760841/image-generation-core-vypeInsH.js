import "./subsystem-CWI_MDy_.js";
import "./provider-env-vars-uH7BbqTU.js";
import "./failover-error--nSN9y3M.js";
import "./provider-model-shared-COpehvpA.js";
import "./provider-registry-usPEwGvX.js";
import "./runtime-shared-DmLL3JxN.js";
import "./provider-model-defaults-DgzAqSOz.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-CkCUWGRh.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
