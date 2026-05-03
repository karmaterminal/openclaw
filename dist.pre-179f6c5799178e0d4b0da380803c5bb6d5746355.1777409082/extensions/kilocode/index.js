import { i as PASSTHROUGH_GEMINI_REPLAY_HOOKS } from "../../provider-model-shared-BupW1wb7.js";
import { n as readConfiguredProviderCatalogEntries } from "../../provider-catalog-shared-CuIp615S.js";
import { t as defineSingleProviderPluginEntry } from "../../provider-entry-N4hgdfdo.js";
import { n as KILOCODE_THINKING_STREAM_HOOKS } from "../../provider-stream-7r7lsYUh.js";
import "../../provider-stream-family-QY18RRj8.js";
import { s as KILOCODE_DEFAULT_MODEL_REF } from "../../provider-models-3e44kVcX.js";
import { n as buildKilocodeProviderWithDiscovery, t as buildKilocodeProvider } from "../../provider-catalog-B_-QyrP_.js";
import { t as applyKilocodeConfig } from "../../onboard-CIx2iQM1.js";
//#region extensions/kilocode/index.ts
const PROVIDER_ID = "kilocode";
var kilocode_default = defineSingleProviderPluginEntry({
	id: PROVIDER_ID,
	name: "Kilo Gateway Provider",
	description: "Bundled Kilo Gateway provider plugin",
	provider: {
		label: "Kilo Gateway",
		docsPath: "/providers/kilocode",
		auth: [{
			methodId: "api-key",
			label: "Kilo Gateway API key",
			hint: "API key (OpenRouter-compatible)",
			optionKey: "kilocodeApiKey",
			flagName: "--kilocode-api-key",
			envVar: "KILOCODE_API_KEY",
			promptMessage: "Enter Kilo Gateway API key",
			defaultModel: KILOCODE_DEFAULT_MODEL_REF,
			applyConfig: (cfg) => applyKilocodeConfig(cfg)
		}],
		catalog: {
			buildProvider: buildKilocodeProviderWithDiscovery,
			buildStaticProvider: buildKilocodeProvider
		},
		augmentModelCatalog: ({ config }) => readConfiguredProviderCatalogEntries({
			config,
			providerId: PROVIDER_ID
		}),
		...PASSTHROUGH_GEMINI_REPLAY_HOOKS,
		...KILOCODE_THINKING_STREAM_HOOKS,
		isCacheTtlEligible: (ctx) => ctx.modelId.startsWith("anthropic/")
	}
});
//#endregion
export { kilocode_default as default };
