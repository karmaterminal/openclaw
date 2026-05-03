import { r as discoverOpenAICompatibleLocalModels } from "./provider-self-hosted-setup-BZ2GTnBb.js";
import "./provider-setup-P_2XKIoW.js";
import { i as SGLANG_PROVIDER_LABEL } from "./defaults-CwUlNZyB.js";
//#region extensions/sglang/models.ts
async function buildSglangProvider(params) {
	const baseUrl = (params?.baseUrl?.trim() || "http://127.0.0.1:30000/v1").replace(/\/+$/, "");
	return {
		baseUrl,
		api: "openai-completions",
		models: await discoverOpenAICompatibleLocalModels({
			baseUrl,
			apiKey: params?.apiKey,
			label: SGLANG_PROVIDER_LABEL
		})
	};
}
//#endregion
export { buildSglangProvider as t };
