import "./subsystem-CWI_MDy_.js";
import "./provider-env-vars-DsK9fGJ1.js";
import "./failover-error-DLvpkqiP.js";
import "./provider-registry-BFSQb8qK.js";
import "./runtime-shared-CSLpBEhP.js";
import "./provider-model-shared-CIbJhChi.js";
import "./provider-model-defaults-Cm1RVgoj.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-T2j41cMJ.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
