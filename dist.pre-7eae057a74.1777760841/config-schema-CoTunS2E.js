import { r as buildChannelConfigSchema } from "./config-schema-DiJ8qU0S.js";
import { i as MSTeamsConfigSchema } from "./zod-schema.providers-core-Bp3vv_ly.js";
import "./channel-config-schema-Bi9Anb8N.js";
//#endregion
//#region extensions/msteams/src/config-schema.ts
const MSTeamsChannelConfigSchema = buildChannelConfigSchema(MSTeamsConfigSchema, { uiHints: {
	"": {
		label: "MS Teams",
		help: "Microsoft Teams channel provider configuration and provider-specific policy toggles. Use this section to isolate Teams behavior from other enterprise chat providers."
	},
	configWrites: {
		label: "MS Teams Config Writes",
		help: "Allow Microsoft Teams to write config in response to channel events/commands (default: true)."
	}
} });
//#endregion
export { MSTeamsChannelConfigSchema as t };
