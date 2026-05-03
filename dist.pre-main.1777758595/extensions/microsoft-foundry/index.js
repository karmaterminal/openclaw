import { t as definePluginEntry } from "../../plugin-entry-DX3V0eaU.js";
import { t as buildMicrosoftFoundryProvider } from "../../provider-DS5tBV5h.js";
//#region extensions/microsoft-foundry/index.ts
var microsoft_foundry_default = definePluginEntry({
	id: "microsoft-foundry",
	name: "Microsoft Foundry Provider",
	description: "Microsoft Foundry provider with Entra ID and API key auth",
	register(api) {
		api.registerProvider(buildMicrosoftFoundryProvider());
	}
});
//#endregion
export { microsoft_foundry_default as default };
