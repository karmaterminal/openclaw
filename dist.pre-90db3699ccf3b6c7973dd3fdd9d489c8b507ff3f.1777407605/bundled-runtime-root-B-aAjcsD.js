import { r as resolveBundledRuntimeDependencyInstallRoot, t as ensureBundledPluginRuntimeDeps } from "./bundled-runtime-deps-CZFrQpGI.js";
import fs from "node:fs";
import path from "node:path";
//#region src/plugins/bundled-runtime-root.ts
const bundledRuntimeDepsRetainSpecsByInstallRoot = /* @__PURE__ */ new Map();
function isBuiltBundledPluginRuntimeRoot(pluginRoot) {
	const extensionsDir = path.dirname(pluginRoot);
	const buildDir = path.dirname(extensionsDir);
	return path.basename(extensionsDir) === "extensions" && (path.basename(buildDir) === "dist" || path.basename(buildDir) === "dist-runtime");
}
function prepareBundledPluginRuntimeRoot(params) {
	const env = params.env ?? process.env;
	const installRoot = resolveBundledRuntimeDependencyInstallRoot(params.pluginRoot, { env });
	const retainSpecs = bundledRuntimeDepsRetainSpecsByInstallRoot.get(installRoot) ?? [];
	const depsInstallResult = ensureBundledPluginRuntimeDeps({
		pluginId: params.pluginId,
		pluginRoot: params.pluginRoot,
		env,
		retainSpecs
	});
	if (depsInstallResult.installedSpecs.length > 0) {
		bundledRuntimeDepsRetainSpecsByInstallRoot.set(installRoot, [...new Set([...retainSpecs, ...depsInstallResult.retainSpecs])].toSorted((left, right) => left.localeCompare(right)));
		params.logInstalled?.(depsInstallResult.installedSpecs);
	}
	if (path.resolve(installRoot) === path.resolve(params.pluginRoot)) return {
		pluginRoot: params.pluginRoot,
		modulePath: params.modulePath
	};
	const mirrorRoot = mirrorBundledPluginRuntimeRoot({
		pluginId: params.pluginId,
		pluginRoot: params.pluginRoot,
		installRoot
	});
	return {
		pluginRoot: mirrorRoot,
		modulePath: remapBundledPluginRuntimePath({
			source: params.modulePath,
			pluginRoot: params.pluginRoot,
			mirroredRoot: mirrorRoot
		})
	};
}
function remapBundledPluginRuntimePath(params) {
	const relativePath = path.relative(params.pluginRoot, params.source);
	if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return params.source;
	return path.join(params.mirroredRoot, relativePath);
}
function mirrorBundledPluginRuntimeRoot(params) {
	const mirrorParent = prepareBundledPluginRuntimeDistMirror({
		installRoot: params.installRoot,
		pluginRoot: params.pluginRoot
	});
	const mirrorRoot = path.join(mirrorParent, params.pluginId);
	fs.mkdirSync(params.installRoot, { recursive: true });
	try {
		fs.chmodSync(params.installRoot, 493);
	} catch {}
	fs.mkdirSync(mirrorParent, { recursive: true });
	try {
		fs.chmodSync(mirrorParent, 493);
	} catch {}
	fs.accessSync(mirrorParent, fs.constants.W_OK);
	const tempDir = fs.mkdtempSync(path.join(mirrorParent, `.plugin-${params.pluginId}-`));
	const stagedRoot = path.join(tempDir, "plugin");
	try {
		copyBundledPluginRuntimeRoot(params.pluginRoot, stagedRoot);
		fs.rmSync(mirrorRoot, {
			recursive: true,
			force: true
		});
		fs.renameSync(stagedRoot, mirrorRoot);
	} finally {
		fs.rmSync(tempDir, {
			recursive: true,
			force: true
		});
	}
	return mirrorRoot;
}
function prepareBundledPluginRuntimeDistMirror(params) {
	const sourceExtensionsRoot = path.dirname(params.pluginRoot);
	const sourceDistRoot = path.dirname(sourceExtensionsRoot);
	const mirrorDistRoot = path.join(params.installRoot, "dist");
	const mirrorExtensionsRoot = path.join(mirrorDistRoot, "extensions");
	fs.mkdirSync(mirrorExtensionsRoot, {
		recursive: true,
		mode: 493
	});
	for (const entry of fs.readdirSync(sourceDistRoot, { withFileTypes: true })) {
		if (entry.name === "extensions") continue;
		const sourcePath = path.join(sourceDistRoot, entry.name);
		const targetPath = path.join(mirrorDistRoot, entry.name);
		if (fs.existsSync(targetPath)) continue;
		try {
			fs.symlinkSync(sourcePath, targetPath, entry.isDirectory() ? "junction" : "file");
		} catch {
			if (entry.isDirectory()) copyBundledPluginRuntimeRoot(sourcePath, targetPath);
			else if (entry.isFile()) fs.copyFileSync(sourcePath, targetPath);
		}
	}
	return mirrorExtensionsRoot;
}
function copyBundledPluginRuntimeRoot(sourceRoot, targetRoot) {
	fs.mkdirSync(targetRoot, {
		recursive: true,
		mode: 493
	});
	for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
		if (entry.name === "node_modules") continue;
		const sourcePath = path.join(sourceRoot, entry.name);
		const targetPath = path.join(targetRoot, entry.name);
		if (entry.isDirectory()) {
			copyBundledPluginRuntimeRoot(sourcePath, targetPath);
			continue;
		}
		if (entry.isSymbolicLink()) {
			fs.symlinkSync(fs.readlinkSync(sourcePath), targetPath);
			continue;
		}
		if (!entry.isFile()) continue;
		fs.copyFileSync(sourcePath, targetPath);
		try {
			const sourceMode = fs.statSync(sourcePath).mode;
			fs.chmodSync(targetPath, sourceMode | 384);
		} catch {}
	}
}
//#endregion
export { prepareBundledPluginRuntimeRoot as n, isBuiltBundledPluginRuntimeRoot as t };
