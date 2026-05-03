import { t as defineSingleProviderPluginEntry } from "../../provider-entry-zRSoZx9h.js";
import { n as PROVIDER_LABELS } from "../../provider-usage.shared-Dpm0QAO_.js";
import "../../provider-usage-BbXwDMQU.js";
import { n as buildXiaomiProvider } from "../../provider-catalog-Dy6QlPur.js";
import { n as applyXiaomiConfig, t as XIAOMI_DEFAULT_MODEL_REF } from "../../onboard-teLJh6-02.js";
var xiaomi_default = defineSingleProviderPluginEntry({
	id: "xiaomi",
	name: "Xiaomi Provider",
	description: "Bundled Xiaomi provider plugin",
	provider: {
		label: "Xiaomi",
		docsPath: "/providers/xiaomi",
		auth: [{
			methodId: "api-key",
			label: "Xiaomi API key",
			hint: "API key",
			optionKey: "xiaomiApiKey",
			flagName: "--xiaomi-api-key",
			envVar: "XIAOMI_API_KEY",
			promptMessage: "Enter Xiaomi API key",
			defaultModel: XIAOMI_DEFAULT_MODEL_REF,
			applyConfig: (cfg) => applyXiaomiConfig(cfg)
		}],
		catalog: { buildProvider: buildXiaomiProvider },
		resolveUsageAuth: async (ctx) => {
			const apiKey = ctx.resolveApiKeyFromConfigAndStore({ envDirect: [ctx.env.XIAOMI_API_KEY] });
			return apiKey ? { token: apiKey } : null;
		},
		fetchUsageSnapshot: async () => ({
			provider: "xiaomi",
			displayName: PROVIDER_LABELS.xiaomi,
			windows: []
		})
	}
});
//#endregion
export { xiaomi_default as default };
