import "./subsystem-DRUx3zf3.js";
import "./provider-env-vars-b8Gq5FEE.js";
import "./failover-error-VOS38tD8.js";
import "./provider-registry-C-vWym1B.js";
import "./runtime-shared-CwBp22My.js";
import "./provider-model-shared-BupW1wb7.js";
import "./provider-model-defaults-Bi0Uo1o0.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-Dd6mbAwj.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
