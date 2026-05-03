import { t as definePluginEntry } from "../../plugin-entry-C5CNAgRN.js";
import { i as registerBrowserPlugin, n as browserPluginReload, r as browserSecurityAuditCollectors, t as browserPluginNodeHostCommands } from "../../plugin-registration-dGwO_GJV.js";
//#region extensions/browser/index.ts
var browser_default = definePluginEntry({
	id: "browser",
	name: "Browser",
	description: "Default browser tool plugin",
	reload: browserPluginReload,
	nodeHostCommands: browserPluginNodeHostCommands,
	securityAuditCollectors: [...browserSecurityAuditCollectors],
	register: registerBrowserPlugin
});
//#endregion
export { browser_default as default };
