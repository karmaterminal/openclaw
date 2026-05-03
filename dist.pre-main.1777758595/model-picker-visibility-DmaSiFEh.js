import { r as normalizeProviderId } from "./provider-id-X2THsZiv.js";
import { ot as isLegacyRuntimeModelProvider } from "./io-DTtpq82f.js";
//#region src/agents/model-picker-visibility.ts
function isModelPickerVisibleProvider(provider) {
	return !isLegacyRuntimeModelProvider(normalizeProviderId(provider));
}
function isModelPickerVisibleModelRef(ref) {
	const separatorIndex = ref.indexOf("/");
	if (separatorIndex <= 0) return true;
	return isModelPickerVisibleProvider(ref.slice(0, separatorIndex));
}
//#endregion
export { isModelPickerVisibleProvider as n, isModelPickerVisibleModelRef as t };
