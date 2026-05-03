import { t as formatDocsLink } from "./links-rWevNMpC.js";
import { r as theme } from "./theme-BrRleVfL.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-B2B2qz09.js";
import "./install-Chi7_UyZ.js";
import "./lifecycle-1PD9bJTK.js";
import "./status-DJd4_X0A.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
	addGatewayServiceCommands(program.command("daemon").description("Manage the Gateway service (launchd/systemd/schtasks)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`), { statusDescription: "Show service install status + probe connectivity/capability" });
}
//#endregion
export { registerDaemonCli as t };
