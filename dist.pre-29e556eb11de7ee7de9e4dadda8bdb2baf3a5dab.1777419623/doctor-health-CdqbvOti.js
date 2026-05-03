import { r as stylePromptTitle } from "./prompt-style-CCSFhHbg.js";
import { intro, outro } from "@clack/prompts";
//#region src/flows/doctor-health.ts
const intro$1 = (message) => intro(stylePromptTitle(message) ?? message);
const outro$1 = (message) => outro(stylePromptTitle(message) ?? message);
async function doctorCommand(runtime, options = {}) {
	const effectiveRuntime = runtime ?? (await import("./runtime-BBNGn4rb.js")).defaultRuntime;
	const { createDoctorPrompter } = await import("./doctor-prompter-BI9QKlo-.js");
	const { printWizardHeader } = await import("./onboard-helpers-QxQI9x1l.js");
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
	const { maybeOfferUpdateBeforeDoctor } = await import("./doctor-update-A4QmqT-R.js");
	if ((await maybeOfferUpdateBeforeDoctor({
		runtime: effectiveRuntime,
		options,
		root,
		confirm: (p) => prompter.confirm(p),
		outro: outro$1
	})).handled) return;
	const { maybeRepairUiProtocolFreshness } = await import("./doctor-ui-CkF_5hWe.js");
	const { noteSourceInstallIssues } = await import("./doctor-install-u2m4_swT.js");
	const { noteStartupOptimizationHints } = await import("./doctor-platform-notes-CgHc2JYo.js");
	await maybeRepairUiProtocolFreshness(effectiveRuntime, prompter);
	noteSourceInstallIssues(root);
	noteStartupOptimizationHints();
	const { loadAndMaybeMigrateDoctorConfig } = await import("./doctor-config-flow-BpC7NfZu.js");
	const configResult = await loadAndMaybeMigrateDoctorConfig({
		options,
		confirm: (p) => prompter.confirm(p),
		runtime: effectiveRuntime,
		prompter
	});
	const { CONFIG_PATH } = await import("./config-FF751HCT.js");
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
	const { runDoctorHealthContributions } = await import("./doctor-health-contributions-DpRJrqbe.js");
	await runDoctorHealthContributions(ctx);
	outro$1("Doctor complete.");
}
//#endregion
export { doctorCommand };
