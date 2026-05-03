import { t as formatDocsLink } from "./links-rWevNMpC.js";
import { r as theme } from "./theme-BrRleVfL.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-CT82nfjH.js";
import "./install-c2zn2fjt.js";
import "./lifecycle-CA06MEft.js";
import "./status-J0KnYfeR.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
	addGatewayServiceCommands(program.command("daemon").description("Manage the Gateway service (launchd/systemd/schtasks)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`), { statusDescription: "Show service install status + probe connectivity/capability" });
}
//#endregion
export { registerDaemonCli as t };
