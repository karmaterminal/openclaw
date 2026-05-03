import { a as createBrowserTool, i as registerBrowserCli, r as handleBrowserGatewayRequest, t as createBrowserPluginService } from "./plugin-service-DnCEtQ0-.js";
import { t as runBrowserProxyCommand } from "./browser-runtime-CgBvVELx.js";
import { t as collectBrowserSecurityAuditFindings } from "./register.runtime-772eBvL0.js";
//#region extensions/browser/plugin-registration.ts
const browserPluginReload = { restartPrefixes: ["browser"] };
const browserPluginNodeHostCommands = [{
	command: "browser.proxy",
	cap: "browser",
	handle: runBrowserProxyCommand
}];
const browserSecurityAuditCollectors = [collectBrowserSecurityAuditFindings];
function registerBrowserPlugin(api) {
	api.registerTool(((ctx) => createBrowserTool({
		sandboxBridgeUrl: ctx.browser?.sandboxBridgeUrl,
		allowHostControl: ctx.browser?.allowHostControl,
		agentSessionKey: ctx.sessionKey
	})));
	api.registerCli(({ program }) => registerBrowserCli(program), { commands: ["browser"] });
	api.registerGatewayMethod("browser.request", handleBrowserGatewayRequest, { scope: "operator.write" });
	api.registerService(createBrowserPluginService());
}
//#endregion
export { registerBrowserPlugin as i, browserPluginReload as n, browserSecurityAuditCollectors as r, browserPluginNodeHostCommands as t };
