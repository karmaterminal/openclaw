import { r as stylePromptTitle } from "./prompt-style-M7caE4BS.js";
import { intro, outro } from "@clack/prompts";
//#region src/flows/doctor-health.ts
const intro$1 = (message) => intro(stylePromptTitle(message) ?? message);
const outro$1 = (message) => outro(stylePromptTitle(message) ?? message);
async function doctorCommand(runtime, options = {}) {
	const effectiveRuntime = runtime ?? (await import("./runtime-BzKCE3f8.js")).defaultRuntime;
	const { createDoctorPrompter } = await import("./doctor-prompter-wzvKuh5-.js");
	const { printWizardHeader } = await import("./onboard-helpers-jgWjf1UF.js");
	const prompter = createDoctorPrompter({
		runtime: effectiveRuntime,
		options
	});
	printWizardHeader(effectiveRuntime);
	intro$1("OpenClaw doctor");
	const { resolveOpenClawPackageRoot } = await import("./openclaw-root--zVSMnXo.js");
	const root = await resolveOpenClawPackageRoot({
		moduleUrl: import.meta.url,
		argv1: process.argv[1],
		cwd: process.cwd()
	});
	const { maybeOfferUpdateBeforeDoctor } = await import("./doctor-update-DdA6gv3x.js");
	if ((await maybeOfferUpdateBeforeDoctor({
		runtime: effectiveRuntime,
		options,
		root,
		confirm: (p) => prompter.confirm(p),
		outro: outro$1
	})).handled) return;
	const { maybeRepairUiProtocolFreshness } = await import("./doctor-ui-lpWOne3q.js");
	const { noteSourceInstallIssues } = await import("./doctor-install-B0z5WfYl.js");
	const { noteStartupOptimizationHints } = await import("./doctor-platform-notes-BGWKpR4D.js");
	await maybeRepairUiProtocolFreshness(effectiveRuntime, prompter);
	noteSourceInstallIssues(root);
	noteStartupOptimizationHints();
	const { loadAndMaybeMigrateDoctorConfig } = await import("./doctor-config-flow-BadWi29L.js");
	const configResult = await loadAndMaybeMigrateDoctorConfig({
		options,
		confirm: (p) => prompter.confirm(p),
		runtime: effectiveRuntime,
		prompter
	});
	const { CONFIG_PATH } = await import("./config-D_gwExo-.js");
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
	const { runDoctorHealthContributions } = await import("./doctor-health-contributions-RKn_JPPU.js");
	await runDoctorHealthContributions(ctx);
	outro$1("Doctor complete.");
}
//#endregion
export { doctorCommand };
