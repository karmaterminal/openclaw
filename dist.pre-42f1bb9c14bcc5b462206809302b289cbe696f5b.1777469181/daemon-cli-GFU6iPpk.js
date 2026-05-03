import { t as formatDocsLink } from "./links-rWevNMpC.js";
import { r as theme } from "./theme-BrRleVfL.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-B5YI8Ip_.js";
import "./install-DJwDgivT.js";
import "./lifecycle-DM5PHO7j.js";
import "./status-B8nLY9Sf.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
	addGatewayServiceCommands(program.command("daemon").description("Manage the Gateway service (launchd/systemd/schtasks)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`), { statusDescription: "Show service install status + probe connectivity/capability" });
}
//#endregion
export { registerDaemonCli as t };
