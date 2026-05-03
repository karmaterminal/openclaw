import { i as registerBundledRuntimeDependencyNodePath, p as withBundledRuntimeDepsFilesystemLock, r as ensureBundledPluginRuntimeDeps, s as resolveBundledRuntimeDependencyInstallRootPlan, u as resolveBundledRuntimeDependencyPackageRoot } from "./bundled-runtime-deps-Dj2QXhNg.js";
import { t as tracePluginLifecyclePhase } from "./plugin-lifecycle-trace-8GvEu_3k.js";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
//#region src/plugins/bundled-runtime-dist-mirror-cache.ts
const preparedBundledRuntimeDistMirrors = /* @__PURE__ */ new Set();
function clearBundledRuntimeDistMirrorPreparationCache() {
	preparedBundledRuntimeDistMirrors.clear();
}
function shouldReusePreparedBundledRuntimeDistMirror(params) {
	if (isSourceCheckoutDistRoot(params.sourceDistRoot)) return false;
	if (!preparedBundledRuntimeDistMirrors.has(bundledRuntimeDistMirrorCacheKey(params))) return false;
	return fs.existsSync(params.mirrorDistRoot) && fs.existsSync(path.join(params.mirrorDistRoot, "extensions")) && fs.existsSync(path.join(params.mirrorDistRoot, "package.json"));
}
function markBundledRuntimeDistMirrorPrepared(params) {
	if (isSourceCheckoutDistRoot(params.sourceDistRoot)) return;
	preparedBundledRuntimeDistMirrors.add(bundledRuntimeDistMirrorCacheKey(params));
}
function bundledRuntimeDistMirrorCacheKey(params) {
	return `${path.resolve(params.sourceDistRoot)}\0${path.resolve(params.mirrorDistRoot)}`;
}
function isSourceCheckoutDistRoot(sourceDistRoot) {
	const packageRoot = path.dirname(sourceDistRoot);
	return (fs.existsSync(path.join(packageRoot, ".git")) || fs.existsSync(path.join(packageRoot, "pnpm-workspace.yaml"))) && fs.existsSync(path.join(packageRoot, "src")) && fs.existsSync(path.join(packageRoot, "extensions"));
}
//#endregion
//#region src/plugins/bundled-runtime-mirror.ts
const BUNDLED_RUNTIME_MIRROR_METADATA_FILE = ".openclaw-runtime-mirror.json";
const BUNDLED_RUNTIME_MIRROR_METADATA_VERSION = 1;
function refreshBundledPluginRuntimeMirrorRoot(params) {
	return tracePluginLifecyclePhase("runtime mirror refresh", () => {
		if (path.resolve(params.sourceRoot) === path.resolve(params.targetRoot)) return false;
		const metadata = createBundledRuntimeMirrorMetadata(params, params.precomputedSourceMetadata);
		if (isBundledRuntimeMirrorRootFresh(params.targetRoot, metadata)) return false;
		copyBundledPluginRuntimeRoot(params.sourceRoot, params.targetRoot);
		writeBundledRuntimeMirrorMetadata(params.targetRoot, metadata);
		return true;
	}, { pluginId: params.pluginId });
}
function copyBundledPluginRuntimeRoot(sourceRoot, targetRoot) {
	if (path.resolve(sourceRoot) === path.resolve(targetRoot)) return;
	ensureBundledRuntimeMirrorDirectory$1(targetRoot);
	const mirroredNames = /* @__PURE__ */ new Set();
	for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
		if (shouldIgnoreBundledRuntimeMirrorEntry(entry.name)) continue;
		if (!entry.isDirectory() && !entry.isSymbolicLink() && !entry.isFile()) continue;
		mirroredNames.add(entry.name);
		const sourcePath = path.join(sourceRoot, entry.name);
		const targetPath = path.join(targetRoot, entry.name);
		if (entry.isDirectory()) {
			removeBundledRuntimeMirrorPathIfTypeChanged(targetPath, "directory");
			copyBundledPluginRuntimeRoot(sourcePath, targetPath);
			continue;
		}
		if (entry.isSymbolicLink()) {
			removeBundledRuntimeMirrorPathIfTypeChanged(targetPath, "symlink");
			replaceBundledRuntimeMirrorSymlinkAtomic(fs.readlinkSync(sourcePath), targetPath);
			continue;
		}
		removeBundledRuntimeMirrorPathIfTypeChanged(targetPath, "file");
		copyBundledRuntimeMirrorFileAtomic(sourcePath, targetPath);
		chmodBundledRuntimeMirrorFileReadable(sourcePath, targetPath);
	}
	pruneStaleBundledRuntimeMirrorEntries(targetRoot, mirroredNames);
}
function materializeBundledRuntimeMirrorFile(sourcePath, targetPath) {
	if (path.resolve(sourcePath) === path.resolve(targetPath)) return;
	try {
		if (isBundledRuntimeMirrorFileAlreadyMaterialized(sourcePath, targetPath)) return;
	} catch {}
	ensureBundledRuntimeMirrorDirectory$1(path.dirname(targetPath));
	removeBundledRuntimeMirrorPathIfTypeChanged(targetPath, "file");
	const tempPath = createBundledRuntimeMirrorTempPath(targetPath);
	try {
		try {
			fs.linkSync(sourcePath, tempPath);
		} catch {
			fs.copyFileSync(sourcePath, tempPath);
			chmodBundledRuntimeMirrorFileReadable(sourcePath, tempPath);
		}
		fs.renameSync(tempPath, targetPath);
	} catch (error) {
		fs.rmSync(tempPath, { force: true });
		throw error;
	}
}
function isBundledRuntimeMirrorFileAlreadyMaterialized(sourcePath, targetPath) {
	const sourceStat = fs.lstatSync(sourcePath);
	const targetStat = fs.lstatSync(targetPath);
	return sourceStat.isFile() && targetStat.isFile() && sourceStat.dev === targetStat.dev && sourceStat.ino === targetStat.ino;
}
function chmodBundledRuntimeMirrorFileReadable(sourcePath, targetPath) {
	try {
		const sourceMode = fs.statSync(sourcePath).mode;
		fs.chmodSync(targetPath, sourceMode | 384);
	} catch {}
}
function pruneStaleBundledRuntimeMirrorEntries(targetRoot, mirroredNames) {
	for (const entry of fs.readdirSync(targetRoot, { withFileTypes: true })) {
		if (shouldIgnoreBundledRuntimeMirrorEntry(entry.name)) continue;
		if (mirroredNames.has(entry.name)) continue;
		fs.rmSync(path.join(targetRoot, entry.name), {
			recursive: true,
			force: true
		});
	}
}
function ensureBundledRuntimeMirrorDirectory$1(targetRoot) {
	try {
		const stat = fs.lstatSync(targetRoot);
		if (stat.isDirectory() && !stat.isSymbolicLink()) return;
		fs.rmSync(targetRoot, {
			recursive: true,
			force: true
		});
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	fs.mkdirSync(targetRoot, {
		recursive: true,
		mode: 493
	});
}
function removeBundledRuntimeMirrorPathIfTypeChanged(targetPath, expectedType) {
	let stat;
	try {
		stat = fs.lstatSync(targetPath);
	} catch {
		return;
	}
	if (!(expectedType === "directory" ? stat.isDirectory() : expectedType === "symlink" ? stat.isSymbolicLink() : stat.isFile())) fs.rmSync(targetPath, {
		recursive: true,
		force: true
	});
}
function replaceBundledRuntimeMirrorSymlinkAtomic(linkTarget, targetPath) {
	ensureBundledRuntimeMirrorDirectory$1(path.dirname(targetPath));
	const tempPath = createBundledRuntimeMirrorTempPath(targetPath);
	try {
		fs.symlinkSync(linkTarget, tempPath);
		fs.renameSync(tempPath, targetPath);
	} finally {
		fs.rmSync(tempPath, { force: true });
	}
}
function copyBundledRuntimeMirrorFileAtomic(sourcePath, targetPath) {
	ensureBundledRuntimeMirrorDirectory$1(path.dirname(targetPath));
	const tempPath = createBundledRuntimeMirrorTempPath(targetPath);
	try {
		fs.copyFileSync(sourcePath, tempPath);
		fs.renameSync(tempPath, targetPath);
	} finally {
		fs.rmSync(tempPath, { force: true });
	}
}
function createBundledRuntimeMirrorTempPath(targetPath) {
	return path.join(path.dirname(targetPath), `.openclaw-mirror-${process.pid}-${process.hrtime.bigint()}-${path.basename(targetPath)}.tmp`);
}
function precomputeBundledRuntimeMirrorMetadata(params) {
	return {
		sourceRoot: resolveBundledRuntimeMirrorSourceRootId(params.sourceRoot),
		sourceFingerprint: fingerprintBundledRuntimeMirrorSourceRoot(params.sourceRoot)
	};
}
function createBundledRuntimeMirrorMetadata(params, precomputedSourceMetadata) {
	const sourceRoot = resolveBundledRuntimeMirrorSourceRootId(params.sourceRoot);
	return {
		version: BUNDLED_RUNTIME_MIRROR_METADATA_VERSION,
		pluginId: params.pluginId,
		sourceRoot,
		sourceFingerprint: precomputedSourceMetadata?.sourceRoot === sourceRoot ? precomputedSourceMetadata.sourceFingerprint : fingerprintBundledRuntimeMirrorSourceRoot(params.sourceRoot)
	};
}
function isBundledRuntimeMirrorRootFresh(targetRoot, expected) {
	try {
		if (!fs.lstatSync(targetRoot).isDirectory()) return false;
	} catch {
		return false;
	}
	const actual = readBundledRuntimeMirrorMetadata(targetRoot);
	return actual?.version === expected.version && actual.pluginId === expected.pluginId && actual.sourceRoot === expected.sourceRoot && actual.sourceFingerprint === expected.sourceFingerprint;
}
function readBundledRuntimeMirrorMetadata(targetRoot) {
	try {
		const parsed = JSON.parse(fs.readFileSync(path.join(targetRoot, BUNDLED_RUNTIME_MIRROR_METADATA_FILE), "utf8"));
		if (parsed.version !== BUNDLED_RUNTIME_MIRROR_METADATA_VERSION || typeof parsed.pluginId !== "string" || typeof parsed.sourceRoot !== "string" || typeof parsed.sourceFingerprint !== "string") return null;
		return parsed;
	} catch {
		return null;
	}
}
function writeBundledRuntimeMirrorMetadata(targetRoot, metadata) {
	fs.writeFileSync(path.join(targetRoot, BUNDLED_RUNTIME_MIRROR_METADATA_FILE), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}
function fingerprintBundledRuntimeMirrorSourceRoot(sourceRoot) {
	return tracePluginLifecyclePhase("runtime mirror fingerprint", () => {
		const hash = createHash("sha256");
		hashBundledRuntimeMirrorDirectory(hash, sourceRoot, sourceRoot);
		return hash.digest("hex");
	}, { sourceRoot });
}
function hashBundledRuntimeMirrorDirectory(hash, sourceRoot, directory) {
	const entries = fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => !shouldIgnoreBundledRuntimeMirrorEntry(entry.name)).toSorted((left, right) => left.name.localeCompare(right.name));
	for (const entry of entries) {
		const sourcePath = path.join(directory, entry.name);
		const relativePath = path.relative(sourceRoot, sourcePath).replaceAll(path.sep, "/");
		const stat = fs.lstatSync(sourcePath, { bigint: true });
		if (entry.isDirectory()) {
			updateBundledRuntimeMirrorHash(hash, [
				"dir",
				relativePath,
				formatBundledRuntimeMirrorMode(stat.mode)
			]);
			hashBundledRuntimeMirrorDirectory(hash, sourceRoot, sourcePath);
			continue;
		}
		if (entry.isSymbolicLink()) {
			updateBundledRuntimeMirrorHash(hash, [
				"symlink",
				relativePath,
				formatBundledRuntimeMirrorMode(stat.mode),
				stat.ctimeNs.toString(),
				fs.readlinkSync(sourcePath)
			]);
			continue;
		}
		if (!entry.isFile()) continue;
		updateBundledRuntimeMirrorHash(hash, [
			"file",
			relativePath,
			formatBundledRuntimeMirrorMode(stat.mode),
			stat.size.toString(),
			stat.mtimeNs.toString(),
			stat.ctimeNs.toString()
		]);
	}
}
function updateBundledRuntimeMirrorHash(hash, fields) {
	hash.update(JSON.stringify(fields));
	hash.update("\n");
}
function formatBundledRuntimeMirrorMode(mode) {
	return (mode & 4095n).toString(8);
}
function resolveBundledRuntimeMirrorSourceRootId(sourceRoot) {
	try {
		return fs.realpathSync.native(sourceRoot);
	} catch {
		return path.resolve(sourceRoot);
	}
}
function shouldIgnoreBundledRuntimeMirrorEntry(name) {
	return name === "node_modules" || name === BUNDLED_RUNTIME_MIRROR_METADATA_FILE;
}
//#endregion
//#region src/plugins/bundled-runtime-root.ts
const BUNDLED_RUNTIME_MIRROR_LOCK_DIR = ".openclaw-runtime-mirror.lock";
function isBuiltBundledPluginRuntimeRoot(pluginRoot) {
	const extensionsDir = path.dirname(pluginRoot);
	const buildDir = path.dirname(extensionsDir);
	return path.basename(extensionsDir) === "extensions" && (path.basename(buildDir) === "dist" || path.basename(buildDir) === "dist-runtime");
}
function prepareBundledPluginRuntimeRoot(params) {
	return prepareBundledPluginRuntimeLoadRoot(params);
}
function prepareBundledPluginRuntimeLoadRoot(params) {
	const env = params.env ?? process.env;
	const installRootPlan = resolveBundledRuntimeDependencyInstallRootPlan(params.pluginRoot, { env });
	const installRoot = installRootPlan.installRoot;
	const depsInstallResult = ensureBundledPluginRuntimeDeps({
		pluginId: params.pluginId,
		pluginRoot: params.pluginRoot,
		env,
		config: params.config,
		installDeps: params.installDeps
	});
	if (depsInstallResult.installedSpecs.length > 0) params.logInstalled?.(depsInstallResult.installedSpecs);
	if (path.resolve(installRoot) === path.resolve(params.pluginRoot)) {
		ensureOpenClawPluginSdkAlias(path.dirname(path.dirname(params.pluginRoot)));
		return {
			pluginRoot: params.pluginRoot,
			modulePath: params.modulePath,
			...params.setupModulePath ? { setupModulePath: params.setupModulePath } : {}
		};
	}
	const packageRoot = resolveBundledRuntimeDependencyPackageRoot(params.pluginRoot);
	if (packageRoot) {
		registerBundledRuntimeDependencyNodePath(packageRoot);
		params.registerRuntimeAliasRoot?.(packageRoot);
	}
	for (const searchRoot of installRootPlan.searchRoots) {
		registerBundledRuntimeDependencyNodePath(searchRoot);
		params.registerRuntimeAliasRoot?.(searchRoot);
	}
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
		}),
		...params.setupModulePath ? { setupModulePath: remapBundledPluginRuntimePath({
			source: params.setupModulePath,
			pluginRoot: params.pluginRoot,
			mirroredRoot: mirrorRoot
		}) } : {}
	};
}
function remapBundledPluginRuntimePath(params) {
	const relativePath = path.relative(params.pluginRoot, params.source);
	if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return params.source;
	return path.join(params.mirroredRoot, relativePath);
}
function mirrorBundledPluginRuntimeRoot(params) {
	const sourceDistRoot = path.dirname(path.dirname(params.pluginRoot));
	const mirrorParent = path.join(params.installRoot, path.basename(sourceDistRoot), "extensions");
	const mirrorRoot = path.join(mirrorParent, params.pluginId);
	const precomputedPluginRootMetadata = path.resolve(mirrorRoot) === path.resolve(params.pluginRoot) ? void 0 : precomputeBundledRuntimeMirrorMetadata({ sourceRoot: params.pluginRoot });
	const precomputedCanonicalPluginRootMetadata = precomputeCanonicalBundledRuntimeDistPluginMetadata({
		pluginRoot: params.pluginRoot,
		sourceDistRoot
	});
	return withBundledRuntimeDepsFilesystemLock(params.installRoot, BUNDLED_RUNTIME_MIRROR_LOCK_DIR, () => {
		const preparedMirrorParent = prepareBundledPluginRuntimeDistMirror({
			installRoot: params.installRoot,
			pluginRoot: params.pluginRoot,
			precomputedCanonicalPluginRootMetadata
		});
		const preparedMirrorRoot = path.join(preparedMirrorParent, params.pluginId);
		fs.mkdirSync(params.installRoot, { recursive: true });
		try {
			fs.chmodSync(params.installRoot, 493);
		} catch {}
		fs.mkdirSync(preparedMirrorParent, { recursive: true });
		try {
			fs.chmodSync(preparedMirrorParent, 493);
		} catch {}
		fs.accessSync(preparedMirrorParent, fs.constants.W_OK);
		if (path.resolve(preparedMirrorRoot) === path.resolve(params.pluginRoot)) return preparedMirrorRoot;
		refreshBundledPluginRuntimeMirrorRoot({
			pluginId: params.pluginId,
			sourceRoot: params.pluginRoot,
			targetRoot: preparedMirrorRoot,
			tempDirParent: preparedMirrorParent,
			precomputedSourceMetadata: precomputedPluginRootMetadata
		});
		return preparedMirrorRoot;
	});
}
function prepareBundledPluginRuntimeDistMirror(params) {
	const sourceExtensionsRoot = path.dirname(params.pluginRoot);
	const sourceDistRoot = path.dirname(sourceExtensionsRoot);
	const sourceDistRootName = path.basename(sourceDistRoot);
	const mirrorDistRoot = path.join(params.installRoot, sourceDistRootName);
	const mirrorExtensionsRoot = path.join(mirrorDistRoot, "extensions");
	ensureBundledRuntimeMirrorDirectory(mirrorDistRoot);
	fs.mkdirSync(mirrorExtensionsRoot, {
		recursive: true,
		mode: 493
	});
	ensureBundledRuntimeDistPackageJson(mirrorDistRoot);
	if (!shouldReusePreparedBundledRuntimeDistMirror({
		sourceDistRoot,
		mirrorDistRoot
	})) {
		mirrorBundledRuntimeDistRootEntries({
			sourceDistRoot,
			mirrorDistRoot
		});
		markBundledRuntimeDistMirrorPrepared({
			sourceDistRoot,
			mirrorDistRoot
		});
	}
	if (sourceDistRootName === "dist-runtime") mirrorCanonicalBundledRuntimeDistRoot({
		installRoot: params.installRoot,
		pluginRoot: params.pluginRoot,
		sourceRuntimeDistRoot: sourceDistRoot,
		precomputedSourceMetadata: params.precomputedCanonicalPluginRootMetadata
	});
	ensureOpenClawPluginSdkAlias(mirrorDistRoot);
	return mirrorExtensionsRoot;
}
function ensureBundledRuntimeMirrorDirectory(targetRoot) {
	try {
		const stat = fs.lstatSync(targetRoot);
		if (stat.isDirectory() && !stat.isSymbolicLink()) return;
		fs.rmSync(targetRoot, {
			recursive: true,
			force: true
		});
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	fs.mkdirSync(targetRoot, {
		recursive: true,
		mode: 493
	});
}
function isPathInsideDirectory(childPath, parentPath) {
	const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
function mirrorBundledRuntimeDistRootEntries(params) {
	const mirrorRootDirectories = path.basename(params.sourceDistRoot) === "dist" || path.basename(params.sourceDistRoot) === "dist-runtime";
	for (const entry of fs.readdirSync(params.sourceDistRoot, { withFileTypes: true })) {
		if (entry.name === "extensions") continue;
		const sourcePath = path.join(params.sourceDistRoot, entry.name);
		const targetPath = path.join(params.mirrorDistRoot, entry.name);
		if (path.resolve(sourcePath) === path.resolve(targetPath)) continue;
		if (entry.isDirectory() && isPathInsideDirectory(targetPath, sourcePath)) continue;
		const sourceStat = fs.statSync(sourcePath);
		if (sourceStat.isDirectory()) {
			if (!mirrorRootDirectories) continue;
			refreshBundledPluginRuntimeMirrorRoot({
				pluginId: `openclaw-dist:${entry.name}`,
				sourceRoot: sourcePath,
				targetRoot: targetPath,
				tempDirParent: params.mirrorDistRoot
			});
			continue;
		}
		if (sourceStat.isFile()) {
			materializeBundledRuntimeMirrorFile(sourcePath, targetPath);
			continue;
		}
	}
}
function mirrorCanonicalBundledRuntimeDistRoot(params) {
	const sourceCanonicalDistRoot = path.join(path.dirname(params.sourceRuntimeDistRoot), "dist");
	if (!fs.existsSync(sourceCanonicalDistRoot)) return;
	const targetCanonicalDistRoot = path.join(params.installRoot, "dist");
	ensureBundledRuntimeMirrorDirectory(targetCanonicalDistRoot);
	fs.mkdirSync(path.join(targetCanonicalDistRoot, "extensions"), {
		recursive: true,
		mode: 493
	});
	ensureBundledRuntimeDistPackageJson(targetCanonicalDistRoot);
	if (!shouldReusePreparedBundledRuntimeDistMirror({
		sourceDistRoot: sourceCanonicalDistRoot,
		mirrorDistRoot: targetCanonicalDistRoot
	})) {
		mirrorBundledRuntimeDistRootEntries({
			sourceDistRoot: sourceCanonicalDistRoot,
			mirrorDistRoot: targetCanonicalDistRoot
		});
		markBundledRuntimeDistMirrorPrepared({
			sourceDistRoot: sourceCanonicalDistRoot,
			mirrorDistRoot: targetCanonicalDistRoot
		});
	}
	ensureOpenClawPluginSdkAlias(targetCanonicalDistRoot);
	const pluginId = path.basename(params.pluginRoot);
	const sourceCanonicalPluginRoot = path.join(sourceCanonicalDistRoot, "extensions", pluginId);
	if (!fs.existsSync(sourceCanonicalPluginRoot)) return;
	const targetCanonicalPluginRoot = path.join(targetCanonicalDistRoot, "extensions", pluginId);
	refreshBundledPluginRuntimeMirrorRoot({
		pluginId,
		sourceRoot: sourceCanonicalPluginRoot,
		targetRoot: targetCanonicalPluginRoot,
		tempDirParent: path.dirname(targetCanonicalPluginRoot),
		precomputedSourceMetadata: params.precomputedSourceMetadata
	});
}
function precomputeCanonicalBundledRuntimeDistPluginMetadata(params) {
	if (path.basename(params.sourceDistRoot) !== "dist-runtime") return;
	const pluginId = path.basename(params.pluginRoot);
	const sourceCanonicalPluginRoot = path.join(path.dirname(params.sourceDistRoot), "dist", "extensions", pluginId);
	if (!fs.existsSync(sourceCanonicalPluginRoot)) return;
	return precomputeBundledRuntimeMirrorMetadata({ sourceRoot: sourceCanonicalPluginRoot });
}
function ensureBundledRuntimeDistPackageJson(mirrorDistRoot) {
	const packageJsonPath = path.join(mirrorDistRoot, "package.json");
	if (fs.existsSync(packageJsonPath)) return;
	writeRuntimeJsonFile(packageJsonPath, { type: "module" });
}
function writeRuntimeJsonFile(targetPath, value) {
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function hasRuntimeDefaultExport(sourcePath) {
	const text = fs.readFileSync(sourcePath, "utf8");
	return /\bexport\s+default\b/u.test(text) || /\bas\s+default\b/u.test(text);
}
function writeRuntimeModuleWrapper(sourcePath, targetPath) {
	const specifier = path.relative(path.dirname(targetPath), sourcePath).replaceAll(path.sep, "/");
	const normalizedSpecifier = specifier.startsWith(".") ? specifier : `./${specifier}`;
	const defaultForwarder = hasRuntimeDefaultExport(sourcePath) ? [
		`import defaultModule from ${JSON.stringify(normalizedSpecifier)};`,
		`let defaultExport = defaultModule;`,
		`for (let index = 0; index < 4 && defaultExport && typeof defaultExport === "object" && "default" in defaultExport; index += 1) {`,
		`  defaultExport = defaultExport.default;`,
		`}`
	] : [
		`import * as module from ${JSON.stringify(normalizedSpecifier)};`,
		`let defaultExport = "default" in module ? module.default : module;`,
		`for (let index = 0; index < 4 && defaultExport && typeof defaultExport === "object" && "default" in defaultExport; index += 1) {`,
		`  defaultExport = defaultExport.default;`,
		`}`
	];
	const content = [
		`export * from ${JSON.stringify(normalizedSpecifier)};`,
		...defaultForwarder,
		"export { defaultExport as default };",
		""
	].join("\n");
	try {
		if (fs.readFileSync(targetPath, "utf8") === content) return;
	} catch {}
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	fs.writeFileSync(targetPath, content, "utf8");
}
function ensureOpenClawPluginSdkAlias(distRoot) {
	const pluginSdkDir = path.join(distRoot, "plugin-sdk");
	if (!fs.existsSync(pluginSdkDir)) return;
	const aliasDir = path.join(distRoot, "extensions", "node_modules", "openclaw");
	const pluginSdkAliasDir = path.join(aliasDir, "plugin-sdk");
	writeRuntimeJsonFile(path.join(aliasDir, "package.json"), {
		name: "openclaw",
		type: "module",
		exports: {
			"./plugin-sdk": "./plugin-sdk/index.js",
			"./plugin-sdk/*": "./plugin-sdk/*.js"
		}
	});
	try {
		if (fs.existsSync(pluginSdkAliasDir) && !fs.lstatSync(pluginSdkAliasDir).isDirectory()) fs.rmSync(pluginSdkAliasDir, {
			recursive: true,
			force: true
		});
	} catch {}
	fs.mkdirSync(pluginSdkAliasDir, { recursive: true });
	for (const entry of fs.readdirSync(pluginSdkDir, { withFileTypes: true })) {
		if (!entry.isFile() || path.extname(entry.name) !== ".js") continue;
		writeRuntimeModuleWrapper(path.join(pluginSdkDir, entry.name), path.join(pluginSdkAliasDir, entry.name));
	}
}
//#endregion
export { clearBundledRuntimeDistMirrorPreparationCache as a, prepareBundledPluginRuntimeRoot as i, isBuiltBundledPluginRuntimeRoot as n, prepareBundledPluginRuntimeLoadRoot as r, ensureOpenClawPluginSdkAlias as t };
