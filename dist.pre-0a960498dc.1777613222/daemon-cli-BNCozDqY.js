import { t as formatDocsLink } from "./links-BtCHUQX8.js";
import { r as theme } from "./theme-BrQCDDpu.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-BG4Ftcpy.js";
import "./install-wx4ug9Ob.js";
import "./lifecycle-BdKfzw7a.js";
import "./status-B-tkEL8B.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
	addGatewayServiceCommands(program.command("daemon").description("Manage the Gateway service (launchd/systemd/schtasks)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`), { statusDescription: "Show service install status + probe connectivity/capability" });
}
//#endregion
export { registerDaemonCli as t };
