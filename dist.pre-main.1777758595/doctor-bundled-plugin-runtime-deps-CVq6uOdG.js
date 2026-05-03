import { n as resolveOpenClawPackageRootSync } from "./openclaw-root-BAiQfngU.js";
import { t as formatCliCommand } from "./command-format-BORwwHyH.js";
import { a as scanBundledPluginRuntimeDeps, f as repairBundledRuntimeDepsInstallRootAsync, l as resolveBundledRuntimeDependencyPackageInstallRootPlan, n as createBundledRuntimeDepsInstallSpecs } from "./bundled-runtime-deps-Dj2QXhNg.js";
import { t as note } from "./note-Deih_6FT.js";
//#region src/commands/doctor-bundled-plugin-runtime-deps.ts
const RUNTIME_DEPS_INSTALL_HEARTBEAT_MS = 15e3;
function formatElapsedMs(elapsedMs) {
	if (elapsedMs < 1e3) return `${elapsedMs}ms`;
	const seconds = Math.round(elapsedMs / 1e3);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
function logRuntimeDepsInstallProgress(runtime, message) {
	runtime.log(message);
}
async function maybeRepairBundledPluginRuntimeDeps(params) {
	const packageRoot = params.packageRoot ?? resolveOpenClawPackageRootSync({
		argv1: process.argv[1],
		cwd: process.cwd(),
		moduleUrl: import.meta.url
	});
	if (!packageRoot) return;
	const env = params.env ?? process.env;
	const { deps, missing, conflicts } = scanBundledPluginRuntimeDeps({
		packageRoot,
		config: params.config,
		includeConfiguredChannels: params.includeConfiguredChannels,
		env
	});
	if (conflicts.length > 0) note([
		"Bundled plugin runtime deps use conflicting versions.",
		...conflicts.flatMap((conflict) => [`- ${conflict.name}: ${conflict.versions.join(", ")}`].concat(conflict.versions.flatMap((version) => {
			const pluginIds = conflict.pluginIdsByVersion.get(version) ?? [];
			return pluginIds.length > 0 ? [`  - ${version}: ${pluginIds.join(", ")}`] : [];
		}))),
		`Update bundled plugins and rerun ${formatCliCommand("openclaw doctor")}.`
	].join("\n"), "Bundled plugins");
	if (missing.length === 0) return;
	const installRootPlan = resolveBundledRuntimeDependencyPackageInstallRootPlan(packageRoot, { env });
	const installSpecs = createBundledRuntimeDepsInstallSpecs({ deps });
	note([
		"Bundled plugin runtime deps need staging.",
		...missing.map((dep) => `- ${dep.name}@${dep.version} (used by ${dep.pluginIds.join(", ")})`),
		`Fix: run ${formatCliCommand("openclaw doctor --fix")} to install them.`
	].join("\n"), "Bundled plugins");
	if (!(params.prompter.shouldRepair || params.prompter.repairMode.nonInteractive || await params.prompter.confirmAutoFix({
		message: "Install missing bundled plugin runtime deps now?",
		initialValue: true
	}))) return;
	let heartbeat;
	let progress;
	try {
		const { createCliProgress } = await import("./progress-C_yzjQiK.js");
		progress = createCliProgress({
			label: `Installing bundled plugin runtime deps (${installSpecs.length})`,
			indeterminate: true,
			enabled: process.env.VITEST !== "true" || process.env.OPENCLAW_TEST_RUNTIME_LOG === "1"
		});
		const installStartedAt = Date.now();
		logRuntimeDepsInstallProgress(params.runtime, `Installing bundled plugin runtime deps (${installSpecs.length} specs): ${installSpecs.join(", ")}`);
		heartbeat = setInterval(() => {
			logRuntimeDepsInstallProgress(params.runtime, `Still installing bundled plugin runtime deps after ${formatElapsedMs(Date.now() - installStartedAt)}...`);
		}, RUNTIME_DEPS_INSTALL_HEARTBEAT_MS);
		heartbeat.unref?.();
		const result = await repairBundledRuntimeDepsInstallRootAsync({
			installRoot: installRootPlan.installRoot,
			missingSpecs: installSpecs,
			installSpecs,
			env: params.env ?? process.env,
			installDeps: params.installDeps ? async (installParams) => {
				await params.installDeps?.(installParams);
			} : void 0,
			warn: (message) => logRuntimeDepsInstallProgress(params.runtime, message),
			onProgress: (message) => progress?.setLabel(message)
		});
		logRuntimeDepsInstallProgress(params.runtime, `Installed bundled plugin runtime deps in ${formatElapsedMs(Date.now() - installStartedAt)}: ${result.installSpecs.join(", ")}`);
		note(`Installed bundled plugin deps: ${result.installSpecs.join(", ")}`, "Bundled plugins");
	} catch (error) {
		params.runtime.error(`Failed to install bundled plugin runtime deps: ${String(error)}`);
		throw error instanceof Error ? error : new Error(String(error));
	} finally {
		if (heartbeat) clearInterval(heartbeat);
		progress?.done();
	}
}
//#endregion
export { maybeRepairBundledPluginRuntimeDeps };
