import "./subsystem-DRUx3zf3.js";
import "./provider-env-vars-Cva53EUa.js";
import "./failover-error-Buq9wg2B.js";
import "./provider-registry-DRcmI3by.js";
import "./runtime-shared-BZ_pX8EW.js";
import "./provider-model-shared-DvpYy-ov.js";
import "./provider-model-defaults-B-KrEkTr.js";
//#region src/plugin-sdk/image-generation-core.ts
let imageGenerationCoreAuthRuntimePromise;
async function loadImageGenerationCoreAuthRuntime() {
	imageGenerationCoreAuthRuntimePromise ??= import("./image-generation-core.auth.runtime-CvEcrTA5.js");
	return imageGenerationCoreAuthRuntimePromise;
}
async function resolveApiKeyForProvider(...args) {
	return (await loadImageGenerationCoreAuthRuntime()).resolveApiKeyForProvider(...args);
}
//#endregion
export { resolveApiKeyForProvider as t };
