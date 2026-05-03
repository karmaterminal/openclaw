import { a as createBrowserTool, i as registerBrowserCli, r as handleBrowserGatewayRequest, t as createBrowserPluginService } from "./plugin-service-dn5T1j-n.js";
import { t as runBrowserProxyCommand } from "./browser-runtime-CIUv2S57.js";
import { t as collectBrowserSecurityAuditFindings } from "./register.runtime-CKvP9dNP.js";
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
	api.registerGatewayMethod("browser.request", handleBrowserGatewayRequest, { scope: "operator.admin" });
	api.registerService(createBrowserPluginService());
}
//#endregion
export { registerBrowserPlugin as i, browserPluginReload as n, browserSecurityAuditCollectors as r, browserPluginNodeHostCommands as t };
