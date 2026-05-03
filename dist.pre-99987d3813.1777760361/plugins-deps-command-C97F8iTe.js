import { n as resolveOpenClawPackageRootSync } from "./openclaw-root-BAiQfngU.js";
import { r as theme } from "./theme-B128avno.js";
import { g as shortenHomePath } from "./utils-DvkbxKCZ.js";
import { a as scanBundledPluginRuntimeDeps, f as repairBundledRuntimeDepsInstallRootAsync, l as resolveBundledRuntimeDependencyPackageInstallRootPlan, n as createBundledRuntimeDepsInstallSpecs, o as pruneUnknownBundledRuntimeDepsRoots } from "./bundled-runtime-deps-Dj2QXhNg.js";
import { n as defaultRuntime } from "./runtime-CChwgwyg.js";
import { n as renderTable, t as getTerminalTableWidth } from "./table-CCPmnA9T.js";
import path from "node:path";
//#region src/cli/plugins-deps-command.ts
function resolvePackageRoot(rawPackageRoot) {
	if (rawPackageRoot?.trim()) return path.resolve(rawPackageRoot.trim());
	return resolveOpenClawPackageRootSync({
		argv1: process.argv[1],
		cwd: process.cwd(),
		moduleUrl: import.meta.url
	});
}
function formatRuntimeDepOwners(pluginIds) {
	return pluginIds.length > 0 ? pluginIds.join(", ") : "-";
}
function formatRuntimeDepConflicts(conflicts) {
	return conflicts.map((conflict) => ({
		name: conflict.name,
		versions: conflict.versions,
		pluginIdsByVersion: Object.fromEntries(conflict.pluginIdsByVersion)
	}));
}
function createWarningSink(params) {
	return (message) => {
		params.warnings.push(message);
		if (!params.json) defaultRuntime.log(theme.warn(message));
	};
}
async function runPluginsDepsCommand(params) {
	const packageRoot = resolvePackageRoot(params.options.packageRoot);
	if (!packageRoot) {
		const message = "Could not resolve the OpenClaw package root for bundled plugin deps.";
		if (params.options.json) {
			defaultRuntime.writeJson({
				ok: false,
				error: message
			});
			return;
		}
		defaultRuntime.error(message);
		return defaultRuntime.exit(1);
	}
	const warnings = [];
	const warn = createWarningSink({
		json: params.options.json,
		warnings
	});
	const pruned = params.options.prune ? pruneUnknownBundledRuntimeDepsRoots({
		env: process.env,
		warn
	}) : void 0;
	const scanRuntimeDeps = () => scanBundledPluginRuntimeDeps({
		packageRoot,
		config: params.config,
		includeConfiguredChannels: true,
		env: process.env
	});
	let scan = scanRuntimeDeps();
	const installRootPlan = resolveBundledRuntimeDependencyPackageInstallRootPlan(packageRoot, { env: process.env });
	let installSpecs = createBundledRuntimeDepsInstallSpecs({ deps: scan.deps });
	let missingSpecs = createBundledRuntimeDepsInstallSpecs({ deps: scan.missing });
	let repairedSpecs = [];
	if (params.options.repair && missingSpecs.length > 0) {
		repairedSpecs = (await repairBundledRuntimeDepsInstallRootAsync({
			installRoot: installRootPlan.installRoot,
			missingSpecs,
			installSpecs,
			env: process.env,
			warn,
			onProgress: (message) => {
				if (!params.options.json) defaultRuntime.log(theme.muted(message));
			}
		})).installSpecs;
		scan = scanRuntimeDeps();
		installSpecs = createBundledRuntimeDepsInstallSpecs({ deps: scan.deps });
		missingSpecs = createBundledRuntimeDepsInstallSpecs({ deps: scan.missing });
	}
	if (params.options.json) {
		defaultRuntime.writeJson({
			packageRoot,
			installRoot: installRootPlan.installRoot,
			installRootExternal: installRootPlan.external,
			searchRoots: installRootPlan.searchRoots,
			deps: scan.deps,
			missing: scan.missing,
			conflicts: formatRuntimeDepConflicts(scan.conflicts),
			installSpecs,
			missingSpecs,
			repairedSpecs,
			warnings,
			...pruned ? { pruned } : {}
		});
		return;
	}
	const lines = [
		theme.heading("Bundled Plugin Runtime Deps"),
		`${theme.muted("Package root:")} ${shortenHomePath(packageRoot)}`,
		`${theme.muted("Install root:")} ${shortenHomePath(installRootPlan.installRoot)}${installRootPlan.external ? theme.muted(" (external)") : ""}`
	];
	if (pruned) lines.push(`${theme.muted("Pruned unknown roots:")} ${pruned.removed}/${pruned.scanned}${pruned.skippedLocked > 0 ? theme.muted(` (${pruned.skippedLocked} locked)`) : ""}`);
	if (scan.conflicts.length > 0) {
		lines.push("");
		lines.push(theme.error("Version conflicts:"));
		for (const conflict of scan.conflicts) {
			const owners = conflict.versions.map((version) => `${version}: ${conflict.pluginIdsByVersion.get(version)?.join(", ")}`).join("; ");
			lines.push(`- ${conflict.name}: ${owners}`);
		}
	}
	if (scan.deps.length === 0) {
		lines.push("");
		lines.push(theme.muted("No packaged bundled runtime deps are required for this checkout."));
		defaultRuntime.log(lines.join("\n"));
		return;
	}
	lines.push("");
	lines.push(`${theme.muted("Status:")} ${scan.missing.length === 0 ? theme.success("materialized") : theme.warn("missing")}`);
	if (repairedSpecs.length > 0) lines.push(`${theme.muted("Repaired:")} ${repairedSpecs.join(", ")}`);
	else if (params.options.repair && scan.conflicts.length > 0) lines.push(theme.warn("Repair skipped because runtime dependency versions conflict."));
	lines.push("");
	lines.push(renderTable({
		width: getTerminalTableWidth(),
		columns: [
			{
				key: "Name",
				header: "Name",
				minWidth: 18,
				flex: true
			},
			{
				key: "Version",
				header: "Version",
				minWidth: 12
			},
			{
				key: "Status",
				header: "Status",
				minWidth: 12
			},
			{
				key: "Plugins",
				header: "Plugins",
				minWidth: 24,
				flex: true
			}
		],
		rows: scan.deps.map((dep) => ({
			Name: dep.name,
			Version: dep.version,
			Status: scan.missing.some((missing) => missing.name === dep.name && missing.version === dep.version) ? theme.warn("missing") : theme.success("ok"),
			Plugins: formatRuntimeDepOwners(dep.pluginIds)
		}))
	}).trimEnd());
	defaultRuntime.log(lines.join("\n"));
}
//#endregion
export { runPluginsDepsCommand };
