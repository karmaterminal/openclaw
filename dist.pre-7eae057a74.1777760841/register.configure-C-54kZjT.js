import { n as defaultRuntime } from "./runtime-Dx7oeLYq.js";
import { t as formatDocsLink } from "./links-BtCHUQX8.js";
import { r as theme } from "./theme-BrQCDDpu.js";
import { n as runCommandWithRuntime } from "./cli-utils-HcutwulW.js";
import { n as configureCommandFromSectionsArg, o as CONFIGURE_WIZARD_SECTIONS } from "./configure-BhE5LvOL.js";
//#region src/cli/program/register.configure.ts
function registerConfigureCommand(program) {
	program.command("configure").description("Interactive configuration for credentials, channels, gateway, and agent defaults").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/configure", "docs.openclaw.ai/cli/configure")}\n`).option("--section <section>", `Configuration sections (repeatable). Options: ${CONFIGURE_WIZARD_SECTIONS.join(", ")}`, (value, previous) => [...previous, value], []).action(async (opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			await configureCommandFromSectionsArg(opts.section, defaultRuntime);
		});
	});
}
//#endregion
export { registerConfigureCommand };
