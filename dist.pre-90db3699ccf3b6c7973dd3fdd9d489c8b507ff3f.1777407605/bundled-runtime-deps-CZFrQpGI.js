import { s as normalizeOptionalLowercaseString } from "./string-coerce-CjxCKZ6B.js";
import { r as resolveHomeRelativePath } from "./home-dir-C44RaPME.js";
import { r as normalizeChatChannelId } from "./ids-BPsM98Uu.js";
import { _ as resolveStateDir } from "./paths-D92DjaZ-.js";
import { o as normalizePluginsConfig } from "./config-state-COejNgwx.js";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";
//#region src/plugins/semver.runtime.ts
const semver = createRequire(import.meta.url)("semver");
const satisfies = (version, range, options) => semver.satisfies(version, range, options);
const validSemver = (version) => semver.valid(version);
const validRange = (range) => semver.validRange(range);
//#endregion
//#region src/plugins/bundled-runtime-deps.ts
const RETAINED_RUNTIME_DEPS_MANIFEST = ".openclaw-runtime-deps.json";
const BUNDLED_RUNTIME_DEP_SEGMENT_RE = /^[a-z0-9][a-z0-9._-]*$/;
function normalizeInstallableRuntimeDepName(rawName) {
	const depName = rawName.trim();
	if (depName === "") return null;
	const segments = depName.split("/");
	if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
	if (segments.length === 1) return BUNDLED_RUNTIME_DEP_SEGMENT_RE.test(segments[0] ?? "") ? depName : null;
	if (segments.length !== 2 || !segments[0]?.startsWith("@")) return null;
	const scope = segments[0].slice(1);
	const packageName = segments[1];
	return BUNDLED_RUNTIME_DEP_SEGMENT_RE.test(scope) && BUNDLED_RUNTIME_DEP_SEGMENT_RE.test(packageName ?? "") ? depName : null;
}
function normalizeInstallableRuntimeDepVersion(rawVersion) {
	if (typeof rawVersion !== "string") return null;
	const version = rawVersion.trim();
	if (version === "" || version.toLowerCase().startsWith("workspace:")) return null;
	if (validSemver(version)) return version;
	const rangePrefix = version[0];
	if ((rangePrefix === "^" || rangePrefix === "~") && validSemver(version.slice(1))) return version;
	return null;
}
function parseInstallableRuntimeDep(name, rawVersion) {
	if (typeof rawVersion !== "string") return null;
	const version = rawVersion.trim();
	if (version === "" || version.toLowerCase().startsWith("workspace:")) return null;
	const normalizedName = normalizeInstallableRuntimeDepName(name);
	if (!normalizedName) throw new Error(`Invalid bundled runtime dependency name: ${name}`);
	const normalizedVersion = normalizeInstallableRuntimeDepVersion(version);
	if (!normalizedVersion) throw new Error(`Unsupported bundled runtime dependency spec for ${normalizedName}: ${version}`);
	return {
		name: normalizedName,
		version: normalizedVersion
	};
}
function parseInstallableRuntimeDepSpec(spec) {
	const atIndex = spec.lastIndexOf("@");
	if (atIndex <= 0 || atIndex === spec.length - 1) throw new Error(`Invalid bundled runtime dependency install spec: ${spec}`);
	const parsed = parseInstallableRuntimeDep(spec.slice(0, atIndex), spec.slice(atIndex + 1));
	if (!parsed) throw new Error(`Invalid bundled runtime dependency install spec: ${spec}`);
	return parsed;
}
function dependencySentinelPath(depName) {
	const normalizedDepName = normalizeInstallableRuntimeDepName(depName);
	if (!normalizedDepName) throw new Error(`Invalid bundled runtime dependency name: ${depName}`);
	return path.join("node_modules", ...normalizedDepName.split("/"), "package.json");
}
function resolveDependencySentinelAbsolutePath(rootDir, depName) {
	const nodeModulesDir = path.resolve(rootDir, "node_modules");
	const sentinelPath = path.resolve(rootDir, dependencySentinelPath(depName));
	if (sentinelPath !== nodeModulesDir && !sentinelPath.startsWith(`${nodeModulesDir}${path.sep}`)) throw new Error(`Blocked runtime dependency path escape for ${depName}`);
	return sentinelPath;
}
function readInstalledDependencyVersion(rootDir, depName) {
	const parsed = readJsonObject(resolveDependencySentinelAbsolutePath(rootDir, depName));
	return (parsed && typeof parsed.version === "string" ? parsed.version.trim() : "") || null;
}
function readJsonObject(filePath) {
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		return parsed;
	} catch {
		return null;
	}
}
function collectRuntimeDeps(packageJson) {
	return {
		...packageJson.dependencies,
		...packageJson.optionalDependencies
	};
}
function isSourceCheckoutRoot(packageRoot) {
	return (fs.existsSync(path.join(packageRoot, ".git")) || fs.existsSync(path.join(packageRoot, "pnpm-workspace.yaml"))) && fs.existsSync(path.join(packageRoot, "src")) && fs.existsSync(path.join(packageRoot, "extensions"));
}
function resolveSourceCheckoutBundledPluginPackageRoot(pluginRoot) {
	const extensionsDir = path.dirname(path.resolve(pluginRoot));
	if (path.basename(extensionsDir) !== "extensions") return null;
	const packageRoot = path.dirname(extensionsDir);
	return isSourceCheckoutRoot(packageRoot) ? packageRoot : null;
}
function resolveSourceCheckoutDistPackageRoot(pluginRoot) {
	const extensionsDir = path.dirname(pluginRoot);
	const buildDir = path.dirname(extensionsDir);
	if (path.basename(extensionsDir) !== "extensions" || path.basename(buildDir) !== "dist" && path.basename(buildDir) !== "dist-runtime") return null;
	const packageRoot = path.dirname(buildDir);
	return isSourceCheckoutRoot(packageRoot) ? packageRoot : null;
}
function resolveSourceCheckoutPackageRoot(pluginRoot) {
	return resolveSourceCheckoutBundledPluginPackageRoot(pluginRoot) ?? resolveSourceCheckoutDistPackageRoot(pluginRoot);
}
function resolveBundledPluginPackageRoot(pluginRoot) {
	const extensionsDir = path.dirname(path.resolve(pluginRoot));
	const buildDir = path.dirname(extensionsDir);
	if (path.basename(extensionsDir) !== "extensions" || path.basename(buildDir) !== "dist" && path.basename(buildDir) !== "dist-runtime") return null;
	return path.dirname(buildDir);
}
function createRuntimeDepsCacheKey(pluginId, specs) {
	return createHash("sha256").update(pluginId).update("\0").update(specs.join("\0")).digest("hex").slice(0, 16);
}
function createPathHash(value) {
	return createHash("sha256").update(path.resolve(value)).digest("hex").slice(0, 12);
}
function sanitizePathSegment(value) {
	return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}
function readPackageVersion(packageRoot) {
	const parsed = readJsonObject(path.join(packageRoot, "package.json"));
	return (parsed && typeof parsed.version === "string" ? parsed.version.trim() : "") || "unknown";
}
function readRetainedRuntimeDepsManifest(installRoot) {
	const specs = readJsonObject(path.join(installRoot, RETAINED_RUNTIME_DEPS_MANIFEST))?.specs;
	if (!Array.isArray(specs)) return [];
	return specs.filter((entry) => typeof entry === "string" && entry.trim().length > 0).toSorted((left, right) => left.localeCompare(right));
}
function writeRetainedRuntimeDepsManifest(installRoot, specs) {
	fs.mkdirSync(installRoot, { recursive: true });
	fs.writeFileSync(path.join(installRoot, RETAINED_RUNTIME_DEPS_MANIFEST), `${JSON.stringify({ specs: [...specs].toSorted((left, right) => left.localeCompare(right)) }, null, 2)}\n`, "utf8");
}
function removeRetainedRuntimeDepsManifest(installRoot) {
	fs.rmSync(path.join(installRoot, RETAINED_RUNTIME_DEPS_MANIFEST), { force: true });
}
function shouldPersistRetainedRuntimeDepsManifest(params) {
	if (path.resolve(params.installRoot) !== path.resolve(params.pluginRoot)) return true;
	return !resolveSourceCheckoutPackageRoot(params.pluginRoot);
}
function isWritableDirectory(dir) {
	let probeDir = null;
	try {
		probeDir = fs.mkdtempSync(path.join(dir, ".openclaw-write-probe-"));
		fs.writeFileSync(path.join(probeDir, "probe"), "", "utf8");
		return true;
	} catch {
		return false;
	} finally {
		if (probeDir) try {
			fs.rmSync(probeDir, {
				recursive: true,
				force: true
			});
		} catch {}
	}
}
function resolveSystemdStateDirectory(env) {
	const raw = env.STATE_DIRECTORY?.trim();
	if (!raw) return null;
	const first = raw.split(path.delimiter).find((entry) => entry.trim().length > 0);
	return first ? path.resolve(first) : null;
}
function resolveBundledRuntimeDepsExternalBaseDir(env) {
	const explicit = env.OPENCLAW_PLUGIN_STAGE_DIR?.trim();
	if (explicit) return resolveHomeRelativePath(explicit, {
		env,
		homedir: os.homedir
	});
	const systemdStateDir = resolveSystemdStateDirectory(env);
	if (systemdStateDir) return path.join(systemdStateDir, "plugin-runtime-deps");
	return path.join(resolveStateDir(env, os.homedir), "plugin-runtime-deps");
}
function resolveExternalBundledRuntimeDepsInstallRoot(params) {
	const packageRoot = resolveBundledPluginPackageRoot(params.pluginRoot) ?? params.pluginRoot;
	const packageKey = `openclaw-${sanitizePathSegment(readPackageVersion(packageRoot))}-${createPathHash(packageRoot)}`;
	return path.join(resolveBundledRuntimeDepsExternalBaseDir(params.env), packageKey);
}
function resolveSourceCheckoutRuntimeDepsCacheDir(params) {
	const packageRoot = resolveSourceCheckoutPackageRoot(params.pluginRoot);
	if (!packageRoot) return null;
	return path.join(packageRoot, ".local", "bundled-plugin-runtime-deps", `${params.pluginId}-${createRuntimeDepsCacheKey(params.pluginId, params.installSpecs)}`);
}
function hasAllDependencySentinels(rootDir, deps) {
	return deps.every((dep) => fs.existsSync(path.join(rootDir, dependencySentinelPath(dep.name))));
}
function isInstalledDependencyVersionSatisfied(installedVersion, spec) {
	const normalizedInstalledVersion = validSemver(installedVersion);
	const normalizedRange = validRange(spec);
	if (normalizedInstalledVersion && normalizedRange) return satisfies(normalizedInstalledVersion, normalizedRange, { includePrerelease: true });
	return installedVersion === spec;
}
function hasDependencySentinel(searchRoots, dep) {
	return searchRoots.some((rootDir) => {
		const installedVersion = readInstalledDependencyVersion(rootDir, dep.name);
		return typeof installedVersion === "string" && isInstalledDependencyVersionSatisfied(installedVersion, dep.version);
	});
}
function replaceNodeModulesDir(targetDir, sourceDir) {
	const parentDir = path.dirname(targetDir);
	const tempDir = fs.mkdtempSync(path.join(parentDir, ".openclaw-runtime-deps-copy-"));
	const stagedDir = path.join(tempDir, "node_modules");
	try {
		fs.cpSync(sourceDir, stagedDir, { recursive: true });
		fs.rmSync(targetDir, {
			recursive: true,
			force: true
		});
		fs.renameSync(stagedDir, targetDir);
	} finally {
		try {
			fs.rmSync(tempDir, {
				recursive: true,
				force: true
			});
		} catch {}
	}
}
function restoreSourceCheckoutRuntimeDepsFromCache(params) {
	if (!params.cacheDir) return false;
	const cachedNodeModulesDir = path.join(params.cacheDir, "node_modules");
	if (!hasAllDependencySentinels(params.cacheDir, params.deps)) return false;
	try {
		replaceNodeModulesDir(path.join(params.installRoot, "node_modules"), cachedNodeModulesDir);
		return true;
	} catch {
		return false;
	}
}
function storeSourceCheckoutRuntimeDepsCache(params) {
	if (!params.cacheDir) return;
	const nodeModulesDir = path.join(params.installRoot, "node_modules");
	if (!fs.existsSync(nodeModulesDir)) return;
	let tempDir = null;
	try {
		fs.mkdirSync(path.dirname(params.cacheDir), { recursive: true });
		tempDir = fs.mkdtempSync(path.join(path.dirname(params.cacheDir), ".runtime-deps-cache-"));
		fs.cpSync(nodeModulesDir, path.join(tempDir, "node_modules"), { recursive: true });
		fs.rmSync(params.cacheDir, {
			recursive: true,
			force: true
		});
		fs.renameSync(tempDir, params.cacheDir);
	} catch {
		if (tempDir) fs.rmSync(tempDir, {
			recursive: true,
			force: true
		});
	}
}
function createNestedNpmInstallEnv(env) {
	const nextEnv = { ...env };
	delete nextEnv.npm_config_global;
	delete nextEnv.npm_config_location;
	delete nextEnv.npm_config_prefix;
	return nextEnv;
}
function createBundledRuntimeDepsInstallEnv(env) {
	return {
		...createNestedNpmInstallEnv(env),
		npm_config_legacy_peer_deps: "true",
		npm_config_package_lock: "false",
		npm_config_save: "false"
	};
}
function createBundledRuntimeDepsInstallArgs(missingSpecs) {
	missingSpecs.forEach((spec) => {
		parseInstallableRuntimeDepSpec(spec);
	});
	return [
		"install",
		"--ignore-scripts",
		...missingSpecs
	];
}
function resolvePathEnvKey(env, platform) {
	if (platform !== "win32") return "PATH";
	return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";
}
function isNpmCliPath(candidate) {
	const normalized = candidate.replaceAll("\\", "/").toLowerCase();
	return normalized.endsWith("/npm-cli.js") || normalized.endsWith("/npm/bin/npm-cli.js");
}
function resolveBundledRuntimeDepsNpmRunner(params) {
	const env = params.env ?? process.env;
	const execPath = params.execPath ?? process.execPath;
	const existsSync = params.existsSync ?? fs.existsSync;
	const platform = params.platform ?? process.platform;
	const pathImpl = platform === "win32" ? path.win32 : path.posix;
	const nodeDir = pathImpl.dirname(execPath);
	const rawNpmExecPath = normalizeOptionalLowercaseString(env.npm_execpath) ? env.npm_execpath : void 0;
	const npmCliPath = [
		rawNpmExecPath && isNpmCliPath(rawNpmExecPath) ? rawNpmExecPath : void 0,
		pathImpl.resolve(nodeDir, "../lib/node_modules/npm/bin/npm-cli.js"),
		pathImpl.resolve(nodeDir, "node_modules/npm/bin/npm-cli.js")
	].filter((candidate) => Boolean(candidate)).find((candidate) => pathImpl.isAbsolute(candidate) && existsSync(candidate));
	if (npmCliPath) return {
		command: execPath,
		args: [npmCliPath, ...params.npmArgs]
	};
	if (platform === "win32") {
		const npmExePath = pathImpl.resolve(nodeDir, "npm.exe");
		if (existsSync(npmExePath)) return {
			command: npmExePath,
			args: params.npmArgs
		};
		throw new Error("Unable to resolve a safe npm executable on Windows");
	}
	const pathKey = resolvePathEnvKey(env, platform);
	const currentPath = env[pathKey];
	return {
		command: "npm",
		args: params.npmArgs,
		env: {
			...env,
			[pathKey]: typeof currentPath === "string" && currentPath.length > 0 ? `${nodeDir}${path.delimiter}${currentPath}` : nodeDir
		}
	};
}
function readBundledPluginChannels(pluginDir) {
	const channels = readJsonObject(path.join(pluginDir, "openclaw.plugin.json"))?.channels;
	if (!Array.isArray(channels)) return [];
	return channels.filter((entry) => typeof entry === "string" && entry !== "");
}
function readBundledPluginEnabledByDefault(pluginDir) {
	return readJsonObject(path.join(pluginDir, "openclaw.plugin.json"))?.enabledByDefault === true;
}
function isBundledPluginConfiguredForRuntimeDeps(params) {
	const plugins = normalizePluginsConfig(params.config.plugins);
	if (!plugins.enabled) return false;
	if (plugins.deny.includes(params.pluginId)) return false;
	const entry = plugins.entries[params.pluginId];
	if (entry?.enabled === false) return false;
	if (entry?.enabled === true) return true;
	for (const channelId of readBundledPluginChannels(params.pluginDir)) {
		const normalizedChannelId = normalizeChatChannelId(channelId);
		if (!normalizedChannelId) continue;
		const channelConfig = params.config.channels?.[normalizedChannelId];
		if (channelConfig && typeof channelConfig === "object" && !Array.isArray(channelConfig) && (params.includeConfiguredChannels || channelConfig.enabled === true)) return true;
	}
	return readBundledPluginEnabledByDefault(params.pluginDir);
}
function shouldIncludeBundledPluginRuntimeDeps(params) {
	if (params.pluginIds && !params.pluginIds.has(params.pluginId)) return false;
	if (!params.config) return true;
	return isBundledPluginConfiguredForRuntimeDeps({
		config: params.config,
		pluginId: params.pluginId,
		pluginDir: params.pluginDir,
		includeConfiguredChannels: params.includeConfiguredChannels
	});
}
function collectBundledPluginRuntimeDeps(params) {
	const versionMap = /* @__PURE__ */ new Map();
	for (const entry of fs.readdirSync(params.extensionsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const pluginId = entry.name;
		const pluginDir = path.join(params.extensionsDir, pluginId);
		if (!shouldIncludeBundledPluginRuntimeDeps({
			config: params.config,
			pluginIds: params.pluginIds,
			pluginId,
			pluginDir,
			includeConfiguredChannels: params.includeConfiguredChannels
		})) continue;
		const packageJson = readJsonObject(path.join(pluginDir, "package.json"));
		if (!packageJson) continue;
		for (const [name, rawVersion] of Object.entries(collectRuntimeDeps(packageJson))) {
			const dep = parseInstallableRuntimeDep(name, rawVersion);
			if (!dep) continue;
			const byVersion = versionMap.get(dep.name) ?? /* @__PURE__ */ new Map();
			const pluginIds = byVersion.get(dep.version) ?? /* @__PURE__ */ new Set();
			pluginIds.add(pluginId);
			byVersion.set(dep.version, pluginIds);
			versionMap.set(dep.name, byVersion);
		}
	}
	const deps = [];
	const conflicts = [];
	for (const [name, byVersion] of versionMap.entries()) {
		if (byVersion.size === 1) {
			const [version, pluginIds] = [...byVersion.entries()][0] ?? [];
			if (version) deps.push({
				name,
				version,
				pluginIds: [...pluginIds].toSorted((a, b) => a.localeCompare(b))
			});
			continue;
		}
		const versions = [...byVersion.keys()].toSorted((a, b) => a.localeCompare(b));
		const pluginIdsByVersion = /* @__PURE__ */ new Map();
		for (const [version, pluginIds] of byVersion.entries()) pluginIdsByVersion.set(version, [...pluginIds].toSorted((a, b) => a.localeCompare(b)));
		conflicts.push({
			name,
			versions,
			pluginIdsByVersion
		});
	}
	return {
		deps: deps.toSorted((a, b) => a.name.localeCompare(b.name)),
		conflicts: conflicts.toSorted((a, b) => a.name.localeCompare(b.name))
	};
}
function normalizePluginIdSet(pluginIds) {
	if (!pluginIds) return;
	const normalized = pluginIds.map((entry) => normalizeOptionalLowercaseString(entry)).filter((entry) => Boolean(entry));
	return new Set(normalized);
}
function scanBundledPluginRuntimeDeps(params) {
	if (isSourceCheckoutRoot(params.packageRoot)) return {
		deps: [],
		missing: [],
		conflicts: []
	};
	const extensionsDir = path.join(params.packageRoot, "dist", "extensions");
	if (!fs.existsSync(extensionsDir)) return {
		deps: [],
		missing: [],
		conflicts: []
	};
	const { deps, conflicts } = collectBundledPluginRuntimeDeps({
		extensionsDir,
		config: params.config,
		pluginIds: normalizePluginIdSet(params.pluginIds),
		includeConfiguredChannels: params.includeConfiguredChannels
	});
	const packageSearchRoots = [resolveBundledRuntimeDependencyPackageInstallRoot(params.packageRoot, { env: params.env })];
	return {
		deps,
		missing: deps.filter((dep) => !hasDependencySentinel(packageSearchRoots, dep) && dep.pluginIds.every((pluginId) => {
			return !hasDependencySentinel([resolveBundledRuntimeDependencyInstallRoot(path.join(extensionsDir, pluginId), { env: params.env })], dep);
		})),
		conflicts
	};
}
function resolveBundledRuntimeDependencyPackageInstallRoot(packageRoot, options = {}) {
	const env = options.env ?? process.env;
	if (options.forceExternal || env.OPENCLAW_PLUGIN_STAGE_DIR?.trim() || env.STATE_DIRECTORY?.trim()) return resolveExternalBundledRuntimeDepsInstallRoot({
		pluginRoot: path.join(packageRoot, "dist", "extensions", "__package__"),
		env
	});
	return isWritableDirectory(packageRoot) ? packageRoot : resolveExternalBundledRuntimeDepsInstallRoot({
		pluginRoot: path.join(packageRoot, "dist", "extensions", "__package__"),
		env
	});
}
function resolveBundledRuntimeDependencyInstallRoot(pluginRoot, options = {}) {
	const env = options.env ?? process.env;
	if (options.forceExternal || env.OPENCLAW_PLUGIN_STAGE_DIR?.trim() || env.STATE_DIRECTORY?.trim()) return resolveExternalBundledRuntimeDepsInstallRoot({
		pluginRoot,
		env
	});
	return isWritableDirectory(pluginRoot) ? pluginRoot : resolveExternalBundledRuntimeDepsInstallRoot({
		pluginRoot,
		env
	});
}
function installBundledRuntimeDeps(params) {
	const installExecutionRoot = params.installExecutionRoot ?? params.installRoot;
	fs.mkdirSync(params.installRoot, { recursive: true });
	fs.mkdirSync(installExecutionRoot, { recursive: true });
	if (path.resolve(installExecutionRoot) !== path.resolve(params.installRoot)) fs.writeFileSync(path.join(installExecutionRoot, "package.json"), `${JSON.stringify({
		name: "openclaw-runtime-deps-install",
		private: true
	}, null, 2)}\n`, "utf8");
	const installEnv = createBundledRuntimeDepsInstallEnv(params.env);
	const npmRunner = resolveBundledRuntimeDepsNpmRunner({
		env: installEnv,
		npmArgs: createBundledRuntimeDepsInstallArgs(params.missingSpecs)
	});
	const result = spawnSync(npmRunner.command, npmRunner.args, {
		cwd: installExecutionRoot,
		encoding: "utf8",
		env: npmRunner.env ?? installEnv,
		stdio: "pipe"
	});
	if (result.status !== 0 || result.error) {
		const output = [
			result.error?.message,
			result.stderr,
			result.stdout
		].filter(Boolean).join("\n").trim();
		throw new Error(output || "npm install failed");
	}
	if (path.resolve(installExecutionRoot) !== path.resolve(params.installRoot)) {
		const stagedNodeModulesDir = path.join(installExecutionRoot, "node_modules");
		if (!fs.existsSync(stagedNodeModulesDir)) throw new Error("npm install did not produce node_modules");
		replaceNodeModulesDir(path.join(params.installRoot, "node_modules"), stagedNodeModulesDir);
	}
}
function ensureBundledPluginRuntimeDeps(params) {
	if (params.config && !isBundledPluginConfiguredForRuntimeDeps({
		config: params.config,
		pluginId: params.pluginId,
		pluginDir: params.pluginRoot
	})) return {
		installedSpecs: [],
		retainSpecs: []
	};
	const packageJson = readJsonObject(path.join(params.pluginRoot, "package.json"));
	if (!packageJson) return {
		installedSpecs: [],
		retainSpecs: []
	};
	const deps = Object.entries(collectRuntimeDeps(packageJson)).map(([name, rawVersion]) => parseInstallableRuntimeDep(name, rawVersion)).filter((entry) => Boolean(entry));
	if (deps.length === 0) return {
		installedSpecs: [],
		retainSpecs: []
	};
	const installRoot = resolveBundledRuntimeDependencyInstallRoot(params.pluginRoot, { env: params.env });
	const persistRetainedManifest = shouldPersistRetainedRuntimeDepsManifest({
		pluginRoot: params.pluginRoot,
		installRoot
	});
	if (!persistRetainedManifest) removeRetainedRuntimeDepsManifest(installRoot);
	const dependencySpecs = deps.map((dep) => `${dep.name}@${dep.version}`).toSorted((left, right) => left.localeCompare(right));
	const missingSpecs = deps.filter((dep) => !hasDependencySentinel([installRoot], dep)).map((dep) => `${dep.name}@${dep.version}`).toSorted((left, right) => left.localeCompare(right));
	if (missingSpecs.length === 0) return {
		installedSpecs: [],
		retainSpecs: []
	};
	const retainedManifestSpecs = persistRetainedManifest ? readRetainedRuntimeDepsManifest(installRoot) : [];
	const installSpecs = [...new Set([
		...params.retainSpecs ?? [],
		...retainedManifestSpecs,
		...dependencySpecs
	])].toSorted((left, right) => left.localeCompare(right));
	const cacheDir = resolveSourceCheckoutRuntimeDepsCacheDir({
		pluginId: params.pluginId,
		pluginRoot: params.pluginRoot,
		installSpecs
	});
	const installExecutionRoot = cacheDir && path.resolve(installRoot) === path.resolve(params.pluginRoot) && resolveSourceCheckoutBundledPluginPackageRoot(params.pluginRoot) ? cacheDir : void 0;
	if (restoreSourceCheckoutRuntimeDepsFromCache({
		cacheDir,
		deps,
		installRoot
	})) return {
		installedSpecs: [],
		retainSpecs: []
	};
	(params.installDeps ?? ((installParams) => installBundledRuntimeDeps({
		installRoot: installParams.installRoot,
		installExecutionRoot: installParams.installExecutionRoot,
		missingSpecs: installParams.installSpecs ?? installParams.missingSpecs,
		env: params.env
	})))({
		installRoot,
		installExecutionRoot,
		missingSpecs,
		installSpecs
	});
	if (persistRetainedManifest) writeRetainedRuntimeDepsManifest(installRoot, installSpecs);
	storeSourceCheckoutRuntimeDepsCache({
		cacheDir,
		installRoot
	});
	return {
		installedSpecs: missingSpecs,
		retainSpecs: installSpecs
	};
}
//#endregion
export { scanBundledPluginRuntimeDeps as a, resolveBundledRuntimeDependencyPackageInstallRoot as i, installBundledRuntimeDeps as n, resolveBundledRuntimeDependencyInstallRoot as r, ensureBundledPluginRuntimeDeps as t };
