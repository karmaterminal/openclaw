import { r as stylePromptTitle } from "./prompt-style-Dlnkjxdz.js";
import { intro, outro } from "@clack/prompts";
//#region src/flows/doctor-health.ts
const intro$1 = (message) => intro(stylePromptTitle(message) ?? message);
const outro$1 = (message) => outro(stylePromptTitle(message) ?? message);
async function doctorCommand(runtime, options = {}) {
	const effectiveRuntime = runtime ?? (await import("./runtime-BBNGn4rb.js")).defaultRuntime;
	const { createDoctorPrompter } = await import("./doctor-prompter-CO0Dz_u3.js");
	const { printWizardHeader } = await import("./onboard-helpers-BWguXipr.js");
	const prompter = createDoctorPrompter({
		runtime: effectiveRuntime,
		options
	});
	printWizardHeader(effectiveRuntime);
	intro$1("OpenClaw doctor");
	const { resolveOpenClawPackageRoot } = await import("./openclaw-root-CMQsW9oD.js");
	const root = await resolveOpenClawPackageRoot({
		moduleUrl: import.meta.url,
		argv1: process.argv[1],
		cwd: process.cwd()
	});
	const { maybeOfferUpdateBeforeDoctor } = await import("./doctor-update-DFiWVjhf.js");
	if ((await maybeOfferUpdateBeforeDoctor({
		runtime: effectiveRuntime,
		options,
		root,
		confirm: (p) => prompter.confirm(p),
		outro: outro$1
	})).handled) return;
	const { maybeRepairUiProtocolFreshness } = await import("./doctor-ui-DyREEgT7.js");
	const { noteSourceInstallIssues } = await import("./doctor-install-CABbMZec.js");
	const { noteStartupOptimizationHints } = await import("./doctor-platform-notes-DIbZojff.js");
	await maybeRepairUiProtocolFreshness(effectiveRuntime, prompter);
	noteSourceInstallIssues(root);
	noteStartupOptimizationHints();
	const { loadAndMaybeMigrateDoctorConfig } = await import("./doctor-config-flow-DkAZV5ac.js");
	const configResult = await loadAndMaybeMigrateDoctorConfig({
		options,
		confirm: (p) => prompter.confirm(p),
		runtime: effectiveRuntime,
		prompter
	});
	const { CONFIG_PATH } = await import("./config-Bj8Cp5-n.js");
	const ctx = {
		runtime: effectiveRuntime,
		options,
		prompter,
		configResult,
		cfg: configResult.cfg,
		cfgForPersistence: structuredClone(configResult.cfg),
		sourceConfigValid: configResult.sourceConfigValid ?? true,
		configPath: configResult.path ?? CONFIG_PATH
	};
	const { runDoctorHealthContributions } = await import("./doctor-health-contributions-CYlF49gi.js");
	await runDoctorHealthContributions(ctx);
	outro$1("Doctor complete.");
}
//#endregion
export { doctorCommand };
