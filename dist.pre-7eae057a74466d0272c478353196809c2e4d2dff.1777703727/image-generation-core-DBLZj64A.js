import "./subsystem-CWI_MDy_.js";
import "./provider-env-vars-uH7BbqTU.js";
import "./failover-error-CHWaro0P.js";
import "./provider-model-shared-Y7Lo2Cbo.js";
import "./provider-registry-_6-uFcUc.js";
import "./runtime-shared-Dn2s_pdu.js";
import "./provider-model-defaults-rn3L-WGB.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-CZJigLje.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
