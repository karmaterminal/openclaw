import { s as normalizeOptionalLowercaseString } from "./string-coerce-Bje8XVt9.js";
import { n as resolveOpenClawPackageRootSync } from "./openclaw-root-BAiQfngU.js";
import { p as resolveUserPath } from "./utils-DvkbxKCZ.js";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
//#region src/plugins/bundled-dir.ts
const DISABLED_BUNDLED_PLUGINS_DIR = path.join(os.tmpdir(), "openclaw-empty-bundled-plugins");
const TEST_TRUST_BUNDLED_PLUGINS_DIR_ENV = "OPENCLAW_TEST_TRUST_BUNDLED_PLUGINS_DIR";
function areBundledPluginsDisabled(env = process.env) {
	const raw = normalizeOptionalLowercaseString(env.OPENCLAW_DISABLE_BUNDLED_PLUGINS);
	return raw === "1" || raw === "true";
}
function resolveDisabledBundledPluginsDir() {
	fs.mkdirSync(DISABLED_BUNDLED_PLUGINS_DIR, { recursive: true });
	return DISABLED_BUNDLED_PLUGINS_DIR;
}
function isSourceCheckoutRoot(packageRoot) {
	return fs.existsSync(path.join(packageRoot, ".git")) && fs.existsSync(path.join(packageRoot, "src")) && fs.existsSync(path.join(packageRoot, "extensions"));
}
function isTruthyEnvValue(value) {
	const normalized = value?.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
function shouldTrustTestBundledPluginsDirOverride(env) {
	return (Boolean(env.VITEST) || Boolean(process.env.VITEST)) && (isTruthyEnvValue(env[TEST_TRUST_BUNDLED_PLUGINS_DIR_ENV]) || isTruthyEnvValue(process.env[TEST_TRUST_BUNDLED_PLUGINS_DIR_ENV]));
}
function hasUsableBundledPluginTree(pluginsDir) {
	if (!fs.existsSync(pluginsDir)) return false;
	try {
		return fs.readdirSync(pluginsDir, { withFileTypes: true }).some((entry) => {
			if (!entry.isDirectory()) return false;
			const pluginDir = path.join(pluginsDir, entry.name);
			return fs.existsSync(path.join(pluginDir, "package.json")) || fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"));
		});
	} catch {
		return false;
	}
}
function safeRealpathSync(targetPath) {
	try {
		return fs.realpathSync.native(targetPath);
	} catch {
		return null;
	}
}
function pathContains(parentDir, childPath) {
	const relative = path.relative(parentDir, childPath);
	return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
}
function trustedBundledPluginRootsForPackageRoot(packageRoot) {
	const roots = [path.join(packageRoot, "dist", "extensions"), path.join(packageRoot, "dist-runtime", "extensions")];
	if (isSourceCheckoutRoot(packageRoot)) roots.push(path.join(packageRoot, "extensions"));
	return roots;
}
function resolveTrustedExistingOverride(resolvedOverride) {
	const realOverride = safeRealpathSync(resolvedOverride);
	if (!realOverride) return null;
	const modulePackageRoot = resolveOpenClawPackageRootSync({ moduleUrl: import.meta.url });
	if (!(modulePackageRoot ? [modulePackageRoot] : []).flatMap((packageRoot) => trustedBundledPluginRootsForPackageRoot(packageRoot)).map((trustedRoot) => safeRealpathSync(trustedRoot)).filter((entry) => Boolean(entry)).some((trustedRoot) => pathContains(trustedRoot, realOverride))) return null;
	if (!hasUsableBundledPluginTree(realOverride)) return null;
	return realOverride;
}
function overrideResolvesUnderPackageBundledRoot(params) {
	const realOverride = safeRealpathSync(params.resolvedOverride);
	if (!realOverride) return false;
	return trustedBundledPluginRootsForPackageRoot(params.packageRoot).map((trustedRoot) => safeRealpathSync(trustedRoot)).filter((entry) => Boolean(entry)).some((trustedRoot) => pathContains(trustedRoot, realOverride));
}
function runningSourceTypeScriptProcess() {
	const argv1 = process.argv[1]?.toLowerCase();
	if (argv1?.endsWith(".ts") || argv1?.endsWith(".tsx") || argv1?.endsWith(".mts") || argv1?.endsWith(".cts")) return true;
	for (let index = 0; index < process.execArgv.length; index += 1) {
		const arg = process.execArgv[index]?.toLowerCase();
		if (!arg) continue;
		if (arg === "tsx" || arg.includes("tsx/register")) return true;
		if ((arg === "--import" || arg === "--loader") && process.execArgv[index + 1]) {
			const next = process.execArgv[index + 1].toLowerCase();
			if (next === "tsx" || next.includes("tsx/")) return true;
		}
	}
	return false;
}
function resolveBundledDirFromPackageRoot(packageRoot, preferSourceCheckout) {
	const sourceExtensionsDir = path.join(packageRoot, "extensions");
	const builtExtensionsDir = path.join(packageRoot, "dist", "extensions");
	const sourceCheckout = isSourceCheckoutRoot(packageRoot);
	const hasUsableSourceTree = sourceCheckout && hasUsableBundledPluginTree(sourceExtensionsDir);
	if (preferSourceCheckout && hasUsableSourceTree) return sourceExtensionsDir;
	const runtimeExtensionsDir = path.join(packageRoot, "dist-runtime", "extensions");
	const hasUsableRuntimeTree = sourceCheckout ? hasUsableBundledPluginTree(runtimeExtensionsDir) : fs.existsSync(runtimeExtensionsDir);
	const hasUsableBuiltTree = sourceCheckout ? hasUsableBundledPluginTree(builtExtensionsDir) : fs.existsSync(builtExtensionsDir);
	if (hasUsableRuntimeTree && hasUsableBuiltTree) return runtimeExtensionsDir;
	if (hasUsableBuiltTree) return builtExtensionsDir;
	if (hasUsableSourceTree) return sourceExtensionsDir;
}
function resolveBundledPluginsDir(env = process.env) {
	if (areBundledPluginsDisabled(env)) return resolveDisabledBundledPluginsDir();
	const override = env.OPENCLAW_BUNDLED_PLUGINS_DIR?.trim();
	let rejectedExistingOverride = null;
	if (override) {
		const resolvedOverride = resolveUserPath(override, env);
		if (fs.existsSync(resolvedOverride)) {
			if (shouldTrustTestBundledPluginsDirOverride(env)) return path.resolve(resolvedOverride);
			const trustedOverride = resolveTrustedExistingOverride(resolvedOverride);
			if (trustedOverride) return trustedOverride;
			rejectedExistingOverride = resolvedOverride;
		}
	}
	const preferSourceCheckout = runningSourceTypeScriptProcess();
	try {
		const argvRoot = resolveOpenClawPackageRootSync({ argv1: process.argv[1] });
		const packageRoots = [Boolean(argvRoot && rejectedExistingOverride && overrideResolvesUnderPackageBundledRoot({
			resolvedOverride: rejectedExistingOverride,
			packageRoot: argvRoot
		})) ? null : argvRoot, resolveOpenClawPackageRootSync({ moduleUrl: import.meta.url })].filter((entry, index, all) => Boolean(entry) && all.indexOf(entry) === index);
		for (const packageRoot of packageRoots) {
			const bundledDir = resolveBundledDirFromPackageRoot(packageRoot, preferSourceCheckout);
			if (bundledDir) return bundledDir;
		}
	} catch {}
	try {
		const execDir = path.dirname(process.execPath);
		const siblingBuilt = path.join(execDir, "dist", "extensions");
		if (fs.existsSync(siblingBuilt)) return siblingBuilt;
		const sibling = path.join(execDir, "extensions");
		if (fs.existsSync(sibling)) return sibling;
	} catch {}
	try {
		let cursor = path.dirname(fileURLToPath(import.meta.url));
		for (let i = 0; i < 6; i += 1) {
			const candidate = path.join(cursor, "extensions");
			if (fs.existsSync(candidate)) return candidate;
			const parent = path.dirname(cursor);
			if (parent === cursor) break;
			cursor = parent;
		}
	} catch {}
}
//#endregion
export { resolveBundledPluginsDir as n, areBundledPluginsDisabled as t };
