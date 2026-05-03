import { t as formatDocsLink } from "./links-BszRQhGa.js";
import { r as theme } from "./theme-B128avno.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-Cun-QgqH.js";
import "./install-C5s_2nvc.js";
import "./lifecycle-C9c3uic4.js";
import "./status-3mmU5c0h.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
	addGatewayServiceCommands(program.command("daemon").description("Manage the Gateway service (launchd/systemd/schtasks)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`), { statusDescription: "Show service install status + probe connectivity/capability" });
}
//#endregion
export { registerDaemonCli as t };
