import { t as defineSingleProviderPluginEntry } from "../../provider-entry-N4hgdfdo.js";
import { i as SYNTHETIC_DEFAULT_MODEL_REF } from "../../models-g2XfKO4N.js";
import { t as applySyntheticConfig } from "../../onboard-g2GxXqxe.js";
import { t as buildSyntheticProvider } from "../../provider-catalog-Bu-rCRFk.js";
var synthetic_default = defineSingleProviderPluginEntry({
	id: "synthetic",
	name: "Synthetic Provider",
	description: "Bundled Synthetic provider plugin",
	provider: {
		label: "Synthetic",
		docsPath: "/providers/synthetic",
		auth: [{
			methodId: "api-key",
			label: "Synthetic API key",
			hint: "Anthropic-compatible (multi-model)",
			optionKey: "syntheticApiKey",
			flagName: "--synthetic-api-key",
			envVar: "SYNTHETIC_API_KEY",
			promptMessage: "Enter Synthetic API key",
			defaultModel: SYNTHETIC_DEFAULT_MODEL_REF,
			applyConfig: (cfg) => applySyntheticConfig(cfg)
		}],
		catalog: { buildProvider: buildSyntheticProvider }
	}
});
//#endregion
export { synthetic_default as default };
