import { G_ as registerBrowserCli, K_ as createBrowserTool, U_ as handleBrowserGatewayRequest, W_ as createBrowserPluginService } from "../../auth-profiles-D5vQ2NEm.js";
import { t as definePluginEntry } from "../../plugin-entry-BFhzQSoP.js";
//#region extensions/browser/index.ts
var browser_default = definePluginEntry({
	id: "browser",
	name: "Browser",
	description: "Default browser tool plugin",
	register(api) {
		api.registerTool(((ctx) => createBrowserTool({
			sandboxBridgeUrl: ctx.browser?.sandboxBridgeUrl,
			allowHostControl: ctx.browser?.allowHostControl,
			agentSessionKey: ctx.sessionKey
		})));
		api.registerCli(({ program }) => registerBrowserCli(program), { commands: ["browser"] });
		api.registerGatewayMethod("browser.request", handleBrowserGatewayRequest, { scope: "operator.write" });
		api.registerService(createBrowserPluginService());
	}
});
//#endregion
export { browser_default as default };
