import { t as formatDocsLink } from "./links-rWevNMpC.js";
import { r as theme } from "./theme-BrRleVfL.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-DESIcslz.js";
import "./install-DJwDgivT.js";
import "./lifecycle-Kk4G7PJQ.js";
import "./status-CJjs4aix.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
	addGatewayServiceCommands(program.command("daemon").description("Manage the Gateway service (launchd/systemd/schtasks)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`), { statusDescription: "Show service install status + probe connectivity/capability" });
}
//#endregion
export { registerDaemonCli as t };
