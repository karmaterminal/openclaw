import { createCodexAppServerAgentHarness } from "./harness.js";
import { buildCodexProvider } from "./provider.js";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
//#region extensions/codex/src/commands.ts
function createCodexCommand(options) {
	return {
		name: "codex",
		description: "Inspect and control the Codex app-server harness",
		acceptsArgs: true,
		requireAuth: true,
		handler: (ctx) => handleCodexCommand(ctx, options)
	};
}
async function handleCodexCommand(ctx, options = {}) {
	const { handleCodexSubcommand } = await import("./command-handlers-BkBzgByp.js");
	return await handleCodexSubcommand(ctx, options);
}
//#endregion
//#region extensions/codex/index.ts
var codex_default = definePluginEntry({
	id: "codex",
	name: "Codex",
	description: "Codex app-server harness and Codex-managed GPT model catalog.",
	register(api) {
		api.registerAgentHarness(createCodexAppServerAgentHarness({ pluginConfig: api.pluginConfig }));
		api.registerProvider(buildCodexProvider({ pluginConfig: api.pluginConfig }));
		api.registerCommand(createCodexCommand({ pluginConfig: api.pluginConfig }));
	}
});
//#endregion
export { codex_default as default };
