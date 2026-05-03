import { s as normalizeOptionalLowercaseString } from "./string-coerce-Bje8XVt9.js";
import { r as resolveHomeRelativePath } from "./home-dir-g5LU3LmA.js";
import { _ as resolveStateDir } from "./paths-B2cMK-wd.js";
import { t as sanitizeTerminalText } from "./safe-text-BUSNicpZ.js";
import { t as getProcessStartTime } from "./pid-alive-BKAnPLg-.js";
import { n as createSafeNpmInstallEnv, t as createSafeNpmInstallArgs } from "./safe-package-install-DX1S3qJs.js";
import { t as splitTrailingAuthProfile } from "./model-ref-profile-D_maLTMo.js";
import { r as normalizeProviderId } from "./provider-id-X2THsZiv.js";
import { i as normalizePluginsConfigWithResolver } from "./config-normalization-shared-BPlfcB-I.js";
import { Module, createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
//#region src/plugins/bundled-runtime-deps-activity.ts
let nextActivityId = 1;
const activeInstalls = /* @__PURE__ */ new Map();
const idleWaiters = /* @__PURE__ */ new Set();
function notifyIdleWaiters() {
	if (activeInstalls.size > 0) return;
	const waiters = [...idleWaiters];
	idleWaiters.clear();
	for (const waiter of waiters) waiter();
}
function beginBundledRuntimeDepsInstall(params) {
	const id = nextActivityId++;
	activeInstalls.set(id, {
		id,
		installRoot: params.installRoot,
		missingSpecs: [...params.missingSpecs],
		installSpecs: [...params.installSpecs ?? params.missingSpecs],
		...params.pluginId ? { pluginId: params.pluginId } : {},
		startedAtMs: Date.now()
	});
	let ended = false;
	return () => {
		if (ended) return;
		ended = true;
		activeInstalls.delete(id);
		notifyIdleWaiters();
	};
}
function getActiveBundledRuntimeDepsInstallCount() {
	return activeInstalls.size;
}
async function waitForBundledRuntimeDepsInstallIdle(timeoutMs) {
	if (activeInstalls.size === 0) return {
		drained: true,
		active: 0
	};
	return await new Promise((resolve) => {
		let settled = false;
		let timer = null;
		const cleanup = () => {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			idleWaiters.delete(onIdle);
		};
		const settle = (drained) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve({
				drained,
				active: activeInstalls.size
			});
		};
		const onIdle = () => settle(true);
		idleWaiters.add(onIdle);
		if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs >= 0) {
			timer = setTimeout(() => settle(false), Math.floor(timeoutMs));
			timer.unref?.();
		}
	});
}
function finiteNonNegativeNumber(value) {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}
function findExistingDiskSpacePath(targetPath) {
	let current = path.resolve(targetPath);
	while (true) try {
		return fs.statSync(current).isDirectory() ? current : path.dirname(current);
	} catch {
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}
function tryReadDiskSpace(targetPath) {
	if (typeof fs.statfsSync !== "function") return null;
	const checkedPath = findExistingDiskSpacePath(targetPath);
	if (!checkedPath) return null;
	try {
		const stats = fs.statfsSync(checkedPath);
		const blockSize = finiteNonNegativeNumber(stats.bsize);
		const availableBlocks = finiteNonNegativeNumber(stats.bavail);
		if (blockSize === null || availableBlocks === null) return null;
		const totalBlocks = finiteNonNegativeNumber(stats.blocks);
		return {
			targetPath,
			checkedPath,
			availableBytes: blockSize * availableBlocks,
			totalBytes: totalBlocks === null ? null : blockSize * totalBlocks
		};
	} catch {
		return null;
	}
}
function formatDiskSpaceBytes(bytes) {
	const mib = bytes / (1024 * 1024);
	if (mib < 1024) return `${Math.max(0, Math.round(mib))} MiB`;
	const gib = mib / 1024;
	return `${gib.toFixed(gib < 10 ? 1 : 0)} GiB`;
}
function createLowDiskSpaceWarning(params) {
	const thresholdBytes = params.thresholdBytes ?? 1073741824;
	const snapshot = tryReadDiskSpace(params.targetPath);
	if (!snapshot || snapshot.availableBytes >= thresholdBytes) return null;
	return `Low disk space near ${path.resolve(snapshot.targetPath) === path.resolve(snapshot.checkedPath) ? snapshot.checkedPath : `${snapshot.targetPath} (volume checked at ${snapshot.checkedPath})`}: ${formatDiskSpaceBytes(snapshot.availableBytes)} available; ${params.purpose} may fail.`;
}
//#endregion
//#region src/plugins/bundled-runtime-deps-lock.ts
const BUNDLED_RUNTIME_DEPS_LOCK_DIR = ".openclaw-runtime-deps.lock";
const BUNDLED_RUNTIME_DEPS_LOCK_OWNER_FILE = "owner.json";
const BUNDLED_RUNTIME_DEPS_LOCK_WAIT_MS = 100;
const BUNDLED_RUNTIME_DEPS_LOCK_TIMEOUT_MS = 5 * 6e4;
const BUNDLED_RUNTIME_DEPS_LOCK_STALE_MS = 10 * 6e4;
const BUNDLED_RUNTIME_DEPS_OWNERLESS_LOCK_STALE_MS = 3e4;
const CURRENT_PROCESS_STARTTIME = getProcessStartTime(process.pid);
function sleepSync(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
async function sleep(ms) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}
function isProcessAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === "EPERM";
	}
}
function readRuntimeDepsLockOwner(lockDir) {
	const ownerFilePath = path.join(lockDir, BUNDLED_RUNTIME_DEPS_LOCK_OWNER_FILE);
	let owner = null;
	let ownerFileState = "missing";
	let ownerFileMtimeMs;
	let ownerFileIsSymlink;
	try {
		const ownerFileStat = fs.lstatSync(ownerFilePath);
		ownerFileMtimeMs = ownerFileStat.mtimeMs;
		ownerFileIsSymlink = ownerFileStat.isSymbolicLink();
	} catch {}
	try {
		const parsed = JSON.parse(fs.readFileSync(ownerFilePath, "utf8"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			owner = parsed;
			ownerFileState = "ok";
		} else ownerFileState = "invalid";
	} catch (error) {
		ownerFileState = error.code === "ENOENT" && ownerFileMtimeMs === void 0 ? "missing" : "invalid";
	}
	let lockDirMtimeMs;
	try {
		lockDirMtimeMs = fs.statSync(lockDir).mtimeMs;
	} catch {}
	return {
		pid: typeof owner?.pid === "number" ? owner.pid : void 0,
		starttime: typeof owner?.starttime === "number" ? owner.starttime : void 0,
		createdAtMs: typeof owner?.createdAtMs === "number" ? owner.createdAtMs : void 0,
		ownerFileState,
		ownerFilePath,
		ownerFileMtimeMs,
		ownerFileIsSymlink,
		lockDirMtimeMs
	};
}
function latestFiniteMs(values) {
	let latest;
	for (const value of values) {
		if (typeof value !== "number" || !Number.isFinite(value)) continue;
		if (latest === void 0 || value > latest) latest = value;
	}
	return latest;
}
function shouldRemoveRuntimeDepsLock(owner, nowMs, isAlive = isProcessAlive, readStarttime = getProcessStartTime) {
	if (typeof owner.pid === "number") {
		if (!isAlive(owner.pid)) return true;
		if (typeof owner.starttime === "number") {
			const liveStarttime = readStarttime(owner.pid);
			if (liveStarttime !== null && liveStarttime !== owner.starttime) return true;
		}
		return false;
	}
	if (typeof owner.createdAtMs === "number") return nowMs - owner.createdAtMs > BUNDLED_RUNTIME_DEPS_LOCK_STALE_MS;
	const ownerlessObservedAtMs = latestFiniteMs([owner.lockDirMtimeMs, owner.ownerFileMtimeMs]);
	return typeof ownerlessObservedAtMs === "number" && nowMs - ownerlessObservedAtMs > BUNDLED_RUNTIME_DEPS_OWNERLESS_LOCK_STALE_MS;
}
function formatDurationMs(ms) {
	return typeof ms === "number" && Number.isFinite(ms) ? `${Math.max(0, Math.round(ms))}ms` : "n/a";
}
function formatRuntimeDepsLockTimeoutMessage(params) {
	const ownerAgeMs = typeof params.owner.createdAtMs === "number" ? params.nowMs - params.owner.createdAtMs : void 0;
	const lockAgeMs = typeof params.owner.lockDirMtimeMs === "number" ? params.nowMs - params.owner.lockDirMtimeMs : void 0;
	const ownerFileAgeMs = typeof params.owner.ownerFileMtimeMs === "number" ? params.nowMs - params.owner.ownerFileMtimeMs : void 0;
	const pidDetail = typeof params.owner.pid === "number" ? `pid=${params.owner.pid} alive=${isProcessAlive(params.owner.pid)}` : "pid=missing";
	const ownerFileSymlink = typeof params.owner.ownerFileIsSymlink === "boolean" ? params.owner.ownerFileIsSymlink : "n/a";
	return `Timed out waiting for bundled runtime deps lock at ${params.lockDir} (waited=${formatDurationMs(params.waitedMs)}, ownerFile=${params.owner.ownerFileState}, ownerFileSymlink=${ownerFileSymlink}, ${pidDetail}, ownerAge=${formatDurationMs(ownerAgeMs)}, ownerFileAge=${formatDurationMs(ownerFileAgeMs)}, lockAge=${formatDurationMs(lockAgeMs)}, ownerFilePath=${params.owner.ownerFilePath}). If no OpenClaw/npm install is running, remove the lock directory and retry.`;
}
function removeRuntimeDepsLockIfStale(lockDir, nowMs) {
	if (!shouldRemoveRuntimeDepsLock(readRuntimeDepsLockOwner(lockDir), nowMs)) return false;
	try {
		fs.rmSync(lockDir, {
			recursive: true,
			force: true
		});
		return true;
	} catch {
		return false;
	}
}
function writeRuntimeDepsLockOwner(lockDir) {
	try {
		fs.writeFileSync(path.join(lockDir, BUNDLED_RUNTIME_DEPS_LOCK_OWNER_FILE), `${JSON.stringify({
			pid: process.pid,
			...typeof CURRENT_PROCESS_STARTTIME === "number" ? { starttime: CURRENT_PROCESS_STARTTIME } : {},
			createdAtMs: Date.now()
		}, null, 2)}\n`, "utf8");
	} catch (ownerWriteError) {
		fs.rmSync(lockDir, {
			recursive: true,
			force: true
		});
		throw ownerWriteError;
	}
}
function tryAcquireRuntimeDepsLock(lockDir) {
	try {
		fs.mkdirSync(lockDir);
		writeRuntimeDepsLockOwner(lockDir);
		return true;
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
		return false;
	}
}
function createRuntimeDepsLockTimeoutError(params) {
	return new Error(formatRuntimeDepsLockTimeoutMessage({
		lockDir: params.lockDir,
		owner: readRuntimeDepsLockOwner(params.lockDir),
		waitedMs: params.nowMs - params.startedAt,
		nowMs: params.nowMs
	}), { cause: params.cause });
}
function withBundledRuntimeDepsFilesystemLock(installRoot, lockName, run) {
	fs.mkdirSync(installRoot, { recursive: true });
	const lockDir = path.join(installRoot, lockName);
	const startedAt = Date.now();
	let locked = false;
	while (!locked) {
		locked = tryAcquireRuntimeDepsLock(lockDir);
		if (!locked) {
			removeRuntimeDepsLockIfStale(lockDir, Date.now());
			const nowMs = Date.now();
			if (nowMs - startedAt > BUNDLED_RUNTIME_DEPS_LOCK_TIMEOUT_MS) throw createRuntimeDepsLockTimeoutError({
				lockDir,
				startedAt,
				nowMs,
				cause: /* @__PURE__ */ new Error("runtime deps lock already exists")
			});
			sleepSync(BUNDLED_RUNTIME_DEPS_LOCK_WAIT_MS);
		}
	}
	try {
		return run();
	} finally {
		fs.rmSync(lockDir, {
			recursive: true,
			force: true
		});
	}
}
async function withBundledRuntimeDepsFilesystemLockAsync(installRoot, lockName, run) {
	fs.mkdirSync(installRoot, { recursive: true });
	const lockDir = path.join(installRoot, lockName);
	const startedAt = Date.now();
	let locked = false;
	while (!locked) {
		locked = tryAcquireRuntimeDepsLock(lockDir);
		if (!locked) {
			removeRuntimeDepsLockIfStale(lockDir, Date.now());
			const nowMs = Date.now();
			if (nowMs - startedAt > BUNDLED_RUNTIME_DEPS_LOCK_TIMEOUT_MS) throw createRuntimeDepsLockTimeoutError({
				lockDir,
				startedAt,
				nowMs,
				cause: /* @__PURE__ */ new Error("runtime deps lock already exists")
			});
			await sleep(BUNDLED_RUNTIME_DEPS_LOCK_WAIT_MS);
		}
	}
	try {
		return await run();
	} finally {
		fs.rmSync(lockDir, {
			recursive: true,
			force: true
		});
	}
}
//#endregion
//#region src/plugins/bundled-runtime-deps-json.ts
const MAX_RUNTIME_DEPS_FILE_CACHE_ENTRIES = 2048;
const runtimeDepsTextFileCache = /* @__PURE__ */ new Map();
const runtimeDepsJsonObjectCache = /* @__PURE__ */ new Map();
function readRuntimeDepsJsonObject(filePath) {
	const signature = getRuntimeDepsFileSignature(filePath);
	const cached = signature ? runtimeDepsJsonObjectCache.get(filePath) : void 0;
	if (cached?.signature === signature) return cached.value;
	const source = readRuntimeDepsTextFile(filePath, signature);
	if (source === null) {
		cacheRuntimeDepsJsonObject(filePath, signature, null);
		return null;
	}
	try {
		const parsed = JSON.parse(source);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			cacheRuntimeDepsJsonObject(filePath, signature, null);
			return null;
		}
		const value = parsed;
		cacheRuntimeDepsJsonObject(filePath, signature, value);
		return value;
	} catch {
		cacheRuntimeDepsJsonObject(filePath, signature, null);
		return null;
	}
}
function readRuntimeDepsTextFile(filePath, signature) {
	const fileSignature = signature ?? getRuntimeDepsFileSignature(filePath);
	const cached = fileSignature ? runtimeDepsTextFileCache.get(filePath) : void 0;
	if (cached?.signature === fileSignature) return cached.value;
	try {
		const value = fs.readFileSync(filePath, "utf8");
		if (fileSignature) rememberRuntimeDepsCacheEntry(runtimeDepsTextFileCache, filePath, {
			signature: fileSignature,
			value
		});
		return value;
	} catch {
		return null;
	}
}
function getRuntimeDepsFileSignature(filePath) {
	try {
		const stat = fs.statSync(filePath, { bigint: true });
		if (!stat.isFile()) return null;
		return [
			stat.dev.toString(),
			stat.ino.toString(),
			stat.size.toString(),
			stat.mtimeNs.toString()
		].join(":");
	} catch {
		return null;
	}
}
function cacheRuntimeDepsJsonObject(filePath, signature, value) {
	if (!signature) return;
	rememberRuntimeDepsCacheEntry(runtimeDepsJsonObjectCache, filePath, {
		signature,
		value
	});
}
function rememberRuntimeDepsCacheEntry(cache, key, value) {
	if (cache.size >= MAX_RUNTIME_DEPS_FILE_CACHE_ENTRIES && !cache.has(key)) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey !== void 0) cache.delete(oldestKey);
	}
	cache.set(key, value);
}
//#endregion
//#region src/plugins/semver.runtime.ts
const require = createRequire(import.meta.url);
let semver;
function getSemver() {
	semver ??= require("semver");
	return semver;
}
const satisfies = (version, range, options) => getSemver().satisfies(version, range, options);
const validSemver = (version) => getSemver().valid(version);
//#endregion
//#region src/plugins/bundled-runtime-deps-specs.ts
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
function normalizeRuntimeDepSpecs(specs) {
	specs.forEach((spec) => {
		parseInstallableRuntimeDepSpec(spec);
	});
	return [...new Set(specs)].toSorted((left, right) => left.localeCompare(right));
}
function collectPackageRuntimeDeps(packageJson) {
	return {
		...packageJson.dependencies,
		...packageJson.optionalDependencies
	};
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
//#endregion
//#region src/plugins/bundled-runtime-deps-materialization.ts
const LEGACY_RETAINED_RUNTIME_DEPS_MANIFEST = ".openclaw-runtime-deps.json";
function readGeneratedInstallManifestSpecs(installRoot) {
	const parsed = readRuntimeDepsJsonObject(path.join(installRoot, "package.json"));
	if (parsed?.name !== "openclaw-runtime-deps-install") return null;
	const dependencies = parsed.dependencies;
	if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) return [];
	const specs = [];
	for (const [name, version] of Object.entries(dependencies)) {
		const dep = parseInstallableRuntimeDep(name, version);
		if (dep) specs.push(`${dep.name}@${dep.version}`);
	}
	return normalizeRuntimeDepSpecs(specs);
}
function readPackageRuntimeDepSpecs(packageRoot) {
	const parsed = readRuntimeDepsJsonObject(path.join(packageRoot, "package.json"));
	if (!parsed || parsed.name === "openclaw-runtime-deps-install") return null;
	return normalizeRuntimeDepSpecs(Object.entries(collectPackageRuntimeDeps(parsed)).map(([name, rawVersion]) => parseInstallableRuntimeDep(name, rawVersion)).filter((dep) => Boolean(dep)).map((dep) => `${dep.name}@${dep.version}`));
}
function sameRuntimeDepSpecs(left, right) {
	const normalizedLeft = normalizeRuntimeDepSpecs(left);
	const normalizedRight = normalizeRuntimeDepSpecs(right);
	return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((entry, index) => entry === normalizedRight[index]);
}
function readInstalledRuntimeDepPackage(rootDir, depName) {
	try {
		const packageJsonPath = resolveDependencySentinelAbsolutePath(rootDir, depName);
		const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		return {
			packageDir: path.dirname(packageJsonPath),
			packageJson: parsed
		};
	} catch {
		return null;
	}
}
function hasInstalledRuntimeDepEntryFiles(packageDir, packageJson) {
	const main = packageJson.main;
	if (typeof main !== "string" || main.trim() === "") return true;
	const mainPath = path.resolve(packageDir, main);
	if (mainPath !== packageDir && !mainPath.startsWith(`${packageDir}${path.sep}`)) return false;
	if (fs.existsSync(mainPath)) return true;
	return fs.existsSync(`${mainPath}.js`) || fs.existsSync(`${mainPath}.json`) || fs.existsSync(`${mainPath}.node`) || fs.existsSync(path.join(mainPath, "index.js")) || fs.existsSync(path.join(mainPath, "index.json")) || fs.existsSync(path.join(mainPath, "index.node"));
}
function isRuntimeDepSatisfied(rootDir, dep) {
	const installed = readInstalledRuntimeDepPackage(rootDir, dep.name);
	if (!installed) return false;
	const version = installed.packageJson.version;
	return Boolean(typeof version === "string" && version.trim() && satisfies(version.trim(), dep.version) && hasInstalledRuntimeDepEntryFiles(installed.packageDir, installed.packageJson));
}
function isRuntimeDepSatisfiedInAnyRoot(dep, roots) {
	return roots.some((root) => isRuntimeDepSatisfied(root, dep));
}
function hasSatisfiedInstallSpecPackages(rootDir, specs) {
	return specs.map(parseInstallableRuntimeDepSpec).every((dep) => isRuntimeDepSatisfied(rootDir, dep));
}
function isRuntimeDepsPlanMaterialized(installRoot, installSpecs) {
	const generatedManifestSpecs = readGeneratedInstallManifestSpecs(installRoot);
	const packageManifestSpecs = generatedManifestSpecs !== null ? null : readPackageRuntimeDepSpecs(installRoot);
	return (generatedManifestSpecs !== null && sameRuntimeDepSpecs(generatedManifestSpecs, installSpecs) || packageManifestSpecs !== null && sameRuntimeDepSpecs(packageManifestSpecs, installSpecs)) && hasSatisfiedInstallSpecPackages(installRoot, installSpecs);
}
function assertBundledRuntimeDepsInstalled(rootDir, specs) {
	const missingSpecs = specs.filter((spec) => {
		return !isRuntimeDepSatisfied(rootDir, parseInstallableRuntimeDepSpec(spec));
	});
	if (missingSpecs.length === 0) return;
	throw new Error(`package manager install did not place bundled runtime deps in ${rootDir}: ${missingSpecs.join(", ")}`);
}
function removeLegacyRuntimeDepsManifest(installRoot) {
	fs.rmSync(path.join(installRoot, LEGACY_RETAINED_RUNTIME_DEPS_MANIFEST), { force: true });
}
function createNpmInstallExecutionManifest(installSpecs) {
	const dependencies = {};
	for (const spec of installSpecs) {
		const dep = parseInstallableRuntimeDepSpec(spec);
		dependencies[dep.name] = dep.version;
	}
	return {
		name: "openclaw-runtime-deps-install",
		private: true,
		dependencies: Object.fromEntries(Object.entries(dependencies).toSorted(([left], [right]) => left.localeCompare(right)))
	};
}
function ensureNpmInstallExecutionManifest(installExecutionRoot, installSpecs = []) {
	const manifestPath = path.join(installExecutionRoot, "package.json");
	const manifest = createNpmInstallExecutionManifest(installSpecs);
	const nextContents = `${JSON.stringify(manifest, null, 2)}\n`;
	if (fs.existsSync(manifestPath) && fs.readFileSync(manifestPath, "utf8") === nextContents) return;
	fs.writeFileSync(manifestPath, nextContents, "utf8");
}
//#endregion
//#region src/plugins/bundled-runtime-deps-package-manager.ts
const NPM_EXECPATH_ENV_KEY = "npm_execpath";
function createBundledRuntimeDepsInstallEnv(env, options = {}) {
	const nextEnv = {
		...createSafeNpmInstallEnv(env, {
			...options,
			legacyPeerDeps: true,
			packageLock: true
		}),
		npm_config_audit: "false",
		npm_config_fund: "false"
	};
	for (const key of Object.keys(nextEnv)) if (key.toLowerCase() === NPM_EXECPATH_ENV_KEY) delete nextEnv[key];
	return nextEnv;
}
function createBundledRuntimeDepsInstallArgs() {
	return [...createSafeNpmInstallArgs({
		noAudit: true,
		noFund: true
	}), "--omit=dev"];
}
function createBundledRuntimeDepsPnpmInstallArgs(params) {
	return [
		"install",
		"--prod",
		"--ignore-scripts",
		"--ignore-workspace",
		"--config.frozen-lockfile=false",
		"--config.minimum-release-age=0",
		`--config.store-dir=${params.storeDir}`,
		"--config.node-linker=hoisted",
		"--config.virtual-store-dir=.pnpm"
	];
}
function resolveBundledRuntimeDepsNpmRunner(params) {
	const execPath = params.execPath ?? process.execPath;
	const existsSync = params.existsSync ?? fs.existsSync;
	const platform = params.platform ?? process.platform;
	const pathImpl = platform === "win32" ? path.win32 : path.posix;
	const nodeDir = pathImpl.dirname(execPath);
	const npmCliPath = [pathImpl.resolve(nodeDir, "../lib/node_modules/npm/bin/npm-cli.js"), pathImpl.resolve(nodeDir, "node_modules/npm/bin/npm-cli.js")].find((candidate) => pathImpl.isAbsolute(candidate) && existsSync(candidate));
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
	const npmExePath = pathImpl.resolve(nodeDir, "npm");
	if (existsSync(npmExePath)) return {
		command: npmExePath,
		args: params.npmArgs
	};
	throw new Error("Unable to resolve a safe npm executable");
}
function pathEntries(env, platform) {
	return (env[Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH"] ?? "").split(platform === "win32" ? ";" : path.delimiter).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}
function resolveBundledRuntimeDepsPnpmRunner(params) {
	const env = params.env ?? process.env;
	const execPath = params.execPath ?? process.execPath;
	const existsSync = params.existsSync ?? fs.existsSync;
	const platform = params.platform ?? process.platform;
	const pathImpl = platform === "win32" ? path.win32 : path.posix;
	const nodeDir = pathImpl.dirname(execPath);
	const names = platform === "win32" ? ["pnpm.exe"] : ["pnpm"];
	const candidateDirs = [nodeDir, ...pathEntries(env, platform)];
	for (const dir of candidateDirs) for (const name of names) {
		const candidate = pathImpl.resolve(dir, name);
		if (pathImpl.isAbsolute(candidate) && existsSync(candidate)) return {
			packageManager: "pnpm",
			command: candidate,
			args: params.pnpmArgs
		};
	}
	return null;
}
function resolveBundledRuntimeDepsPackageManagerRunner(params) {
	const pnpmRunner = resolveBundledRuntimeDepsPnpmRunner({
		env: params.env,
		pnpmArgs: createBundledRuntimeDepsPnpmInstallArgs({ storeDir: path.join(params.installExecutionRoot, ".openclaw-pnpm-store") })
	});
	if (pnpmRunner) return pnpmRunner;
	return {
		packageManager: "npm",
		...resolveBundledRuntimeDepsNpmRunner({
			env: params.env,
			npmArgs: params.npmArgs
		})
	};
}
//#endregion
//#region src/plugins/bundled-runtime-deps-install.ts
const BUNDLED_RUNTIME_DEPS_INSTALL_PROGRESS_INTERVAL_MS = 5e3;
async function withBundledRuntimeDepsInstallRootLockAsync(installRoot, run) {
	return await withBundledRuntimeDepsFilesystemLockAsync(installRoot, BUNDLED_RUNTIME_DEPS_LOCK_DIR, run);
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
function shouldCleanBundledRuntimeDepsInstallExecutionRoot(params) {
	const installRoot = path.resolve(params.installRoot);
	return path.resolve(params.installExecutionRoot).startsWith(`${installRoot}${path.sep}`);
}
function formatBundledRuntimeDepsInstallError(result) {
	return [
		result.error?.message,
		result.signal ? `terminated by ${result.signal}` : null,
		result.stderr,
		result.stdout
	].filter(Boolean).join("\n").trim() || "npm install failed";
}
function formatBundledRuntimeDepsInstallElapsed(ms) {
	const seconds = Math.max(0, Math.round(ms / 1e3));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
function emitBundledRuntimeDepsOutputProgress(chunk, stream, packageManager, onProgress) {
	if (!onProgress) return;
	const lines = chunk.toString("utf8").split(/\r\n|\n|\r/u).map((line) => sanitizeTerminalText(line).trim()).filter((line) => line.length > 0).slice(-3);
	for (const line of lines) onProgress(`${packageManager} ${stream}: ${line}`);
}
function createBundledRuntimeDepsInstallContext(params) {
	const installExecutionRoot = params.installExecutionRoot ?? params.installRoot;
	const isolatedExecutionRoot = path.resolve(installExecutionRoot) !== path.resolve(params.installRoot);
	const cleanInstallExecutionRoot = isolatedExecutionRoot && shouldCleanBundledRuntimeDepsInstallExecutionRoot({
		installRoot: params.installRoot,
		installExecutionRoot
	});
	fs.mkdirSync(params.installRoot, { recursive: true });
	fs.mkdirSync(installExecutionRoot, { recursive: true });
	const diskWarning = createLowDiskSpaceWarning({
		targetPath: installExecutionRoot,
		purpose: "bundled plugin runtime dependency staging"
	});
	if (diskWarning) params.warn?.(diskWarning);
	ensureNpmInstallExecutionManifest(installExecutionRoot, params.installSpecs);
	const installEnv = createBundledRuntimeDepsInstallEnv(params.env, { cacheDir: path.join(installExecutionRoot, ".openclaw-npm-cache") });
	const runner = resolveBundledRuntimeDepsPackageManagerRunner({
		installExecutionRoot,
		env: installEnv,
		npmArgs: createBundledRuntimeDepsInstallArgs()
	});
	return {
		installExecutionRoot,
		installSpecs: normalizeRuntimeDepSpecs(params.installSpecs),
		installEnv,
		runner,
		isolatedExecutionRoot,
		cleanInstallExecutionRoot
	};
}
function finalizeBundledRuntimeDepsInstall(params) {
	const { context } = params;
	assertBundledRuntimeDepsInstalled(context.installExecutionRoot, context.installSpecs);
	if (context.isolatedExecutionRoot) {
		const stagedNodeModulesDir = path.join(context.installExecutionRoot, "node_modules");
		if (!fs.existsSync(stagedNodeModulesDir)) throw new Error(`${context.runner.packageManager} install did not produce node_modules`);
		replaceNodeModulesDir(path.join(params.installRoot, "node_modules"), stagedNodeModulesDir);
		assertBundledRuntimeDepsInstalled(params.installRoot, context.installSpecs);
	}
	removeLegacyRuntimeDepsManifest(params.installRoot);
}
function cleanupBundledRuntimeDepsInstallContext(context) {
	if (context.cleanInstallExecutionRoot) fs.rmSync(context.installExecutionRoot, {
		recursive: true,
		force: true
	});
}
async function spawnBundledRuntimeDepsInstall(params) {
	await new Promise((resolve, reject) => {
		const startedAtMs = Date.now();
		const heartbeat = params.onProgress && setInterval(() => {
			params.onProgress?.(`${params.packageManager} install still running (${formatBundledRuntimeDepsInstallElapsed(Date.now() - startedAtMs)} elapsed)`);
		}, BUNDLED_RUNTIME_DEPS_INSTALL_PROGRESS_INTERVAL_MS);
		heartbeat?.unref?.();
		const settle = (fn) => {
			if (heartbeat) clearInterval(heartbeat);
			fn();
		};
		const child = spawn(params.command, params.args, {
			cwd: params.cwd,
			env: params.env,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			],
			windowsHide: true
		});
		const stdout = [];
		const stderr = [];
		child.stdout?.on("data", (chunk) => {
			stdout.push(chunk);
			emitBundledRuntimeDepsOutputProgress(chunk, "stdout", params.packageManager, params.onProgress);
		});
		child.stderr?.on("data", (chunk) => {
			stderr.push(chunk);
			emitBundledRuntimeDepsOutputProgress(chunk, "stderr", params.packageManager, params.onProgress);
		});
		child.on("error", (error) => {
			settle(() => reject(new Error(formatBundledRuntimeDepsInstallError({ error }))));
		});
		child.on("close", (status, signal) => {
			if (status === 0 && !signal) {
				settle(resolve);
				return;
			}
			settle(() => reject(new Error(formatBundledRuntimeDepsInstallError({
				status,
				signal,
				stdout: Buffer.concat(stdout).toString("utf8"),
				stderr: Buffer.concat(stderr).toString("utf8")
			}))));
		});
	});
}
function installBundledRuntimeDeps(params) {
	const installSpecs = normalizeRuntimeDepSpecs(params.installSpecs ?? params.missingSpecs);
	if (installSpecs.length === 0) return;
	if (isRuntimeDepsPlanMaterialized(params.installRoot, installSpecs)) {
		removeLegacyRuntimeDepsManifest(params.installRoot);
		return;
	}
	const context = createBundledRuntimeDepsInstallContext({
		installRoot: params.installRoot,
		installExecutionRoot: params.installExecutionRoot,
		installSpecs,
		env: params.env,
		warn: params.warn
	});
	try {
		const result = spawnSync(context.runner.command, context.runner.args, {
			cwd: context.installExecutionRoot,
			encoding: "utf8",
			env: context.runner.env ?? context.installEnv,
			stdio: "pipe",
			windowsHide: true
		});
		if (result.status !== 0 || result.error) throw new Error(formatBundledRuntimeDepsInstallError(result));
		finalizeBundledRuntimeDepsInstall({
			installRoot: params.installRoot,
			context
		});
	} finally {
		cleanupBundledRuntimeDepsInstallContext(context);
	}
}
async function installBundledRuntimeDepsAsync(params) {
	const installSpecs = normalizeRuntimeDepSpecs(params.installSpecs ?? params.missingSpecs);
	if (installSpecs.length === 0) return;
	if (isRuntimeDepsPlanMaterialized(params.installRoot, installSpecs)) {
		removeLegacyRuntimeDepsManifest(params.installRoot);
		return;
	}
	const context = createBundledRuntimeDepsInstallContext({
		installRoot: params.installRoot,
		installExecutionRoot: params.installExecutionRoot,
		installSpecs,
		env: params.env,
		warn: params.warn
	});
	try {
		params.onProgress?.(`Starting ${context.runner.packageManager} install for bundled plugin runtime deps: ${installSpecs.join(", ")}`);
		await spawnBundledRuntimeDepsInstall({
			command: context.runner.command,
			args: context.runner.args,
			cwd: context.installExecutionRoot,
			env: context.runner.env ?? context.installEnv,
			packageManager: context.runner.packageManager,
			onProgress: params.onProgress
		});
		finalizeBundledRuntimeDepsInstall({
			installRoot: params.installRoot,
			context
		});
	} finally {
		cleanupBundledRuntimeDepsInstallContext(context);
	}
}
async function repairBundledRuntimeDepsInstallRootAsync(params) {
	return await withBundledRuntimeDepsInstallRootLockAsync(params.installRoot, async () => {
		const installSpecs = normalizeRuntimeDepSpecs(params.installSpecs);
		const install = params.installDeps ?? ((installParams) => installBundledRuntimeDepsAsync({
			installRoot: installParams.installRoot,
			missingSpecs: installParams.missingSpecs,
			installSpecs: installParams.installSpecs,
			env: params.env,
			warn: params.warn,
			onProgress: params.onProgress
		}));
		const finishActivity = beginBundledRuntimeDepsInstall({
			installRoot: params.installRoot,
			missingSpecs: installSpecs,
			installSpecs
		});
		removeLegacyRuntimeDepsManifest(params.installRoot);
		ensureNpmInstallExecutionManifest(params.installRoot, installSpecs);
		try {
			await install({
				installRoot: params.installRoot,
				missingSpecs: installSpecs,
				installSpecs
			});
		} finally {
			finishActivity();
		}
		removeLegacyRuntimeDepsManifest(params.installRoot);
		return { installSpecs };
	});
}
//#endregion
//#region src/plugins/bundled-runtime-deps-roots.ts
const DEFAULT_UNKNOWN_RUNTIME_DEPS_ROOTS_TO_KEEP = 20;
const DEFAULT_UNKNOWN_RUNTIME_DEPS_MIN_AGE_MS = 10 * 6e4;
function isSourceCheckoutRoot(packageRoot) {
	return (fs.existsSync(path.join(packageRoot, ".git")) || fs.existsSync(path.join(packageRoot, "pnpm-workspace.yaml"))) && fs.existsSync(path.join(packageRoot, "src")) && fs.existsSync(path.join(packageRoot, "extensions"));
}
function resolveBundledPluginPackageRoot(pluginRoot) {
	const extensionsDir = path.dirname(path.resolve(pluginRoot));
	const buildDir = path.dirname(extensionsDir);
	if (path.basename(extensionsDir) !== "extensions" || path.basename(buildDir) !== "dist" && path.basename(buildDir) !== "dist-runtime") return null;
	return path.dirname(buildDir);
}
function resolveBundledRuntimeDependencyPackageRoot(pluginRoot) {
	return resolveBundledPluginPackageRoot(pluginRoot);
}
function isPackagedBundledPluginRoot(pluginRoot) {
	const packageRoot = resolveBundledPluginPackageRoot(pluginRoot);
	return Boolean(packageRoot && !isSourceCheckoutRoot(packageRoot));
}
function createPathHash(value) {
	return createHash("sha256").update(path.resolve(value)).digest("hex").slice(0, 12);
}
function sanitizePathSegment(value) {
	return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}
function readPackageVersion(packageRoot) {
	const parsed = readRuntimeDepsJsonObject(path.join(packageRoot, "package.json"));
	return (parsed && typeof parsed.version === "string" ? parsed.version.trim() : "") || "unknown";
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
function resolveBundledRuntimeDepsExternalBaseDirs(env) {
	const explicit = env.OPENCLAW_PLUGIN_STAGE_DIR?.trim();
	if (explicit) {
		const roots = explicit.split(path.delimiter).map((entry) => entry.trim()).filter((entry) => entry.length > 0).map((entry) => path.resolve(resolveHomeRelativePath(entry, {
			env,
			homedir: os.homedir
		})));
		if (roots.length > 0) {
			const uniqueRoots = [];
			for (const root of roots) {
				const existingIndex = uniqueRoots.findIndex((entry) => path.resolve(entry) === path.resolve(root));
				if (existingIndex >= 0) uniqueRoots.splice(existingIndex, 1);
				uniqueRoots.push(root);
			}
			return uniqueRoots;
		}
	}
	const systemdStateDir = resolveSystemdStateDirectory(env);
	if (systemdStateDir) return [path.join(systemdStateDir, "plugin-runtime-deps")];
	return [path.join(resolveStateDir(env, os.homedir), "plugin-runtime-deps")];
}
function pruneUnknownBundledRuntimeDepsRoots(params = {}) {
	const env = params.env ?? process.env;
	const nowMs = params.nowMs ?? Date.now();
	const maxRootsToKeep = Math.max(0, params.maxRootsToKeep ?? DEFAULT_UNKNOWN_RUNTIME_DEPS_ROOTS_TO_KEEP);
	const minAgeMs = Math.max(0, params.minAgeMs ?? DEFAULT_UNKNOWN_RUNTIME_DEPS_MIN_AGE_MS);
	let scanned = 0;
	let removed = 0;
	let skippedLocked = 0;
	for (const baseDir of resolveBundledRuntimeDepsExternalBaseDirs(env)) {
		let entries;
		try {
			entries = fs.readdirSync(baseDir, { withFileTypes: true });
		} catch {
			continue;
		}
		const unknownRoots = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("openclaw-unknown-")).map((entry) => {
			const root = path.join(baseDir, entry.name);
			try {
				return {
					root,
					mtimeMs: fs.statSync(root).mtimeMs
				};
			} catch {
				return null;
			}
		}).filter((entry) => entry !== null).toSorted((left, right) => right.mtimeMs - left.mtimeMs);
		scanned += unknownRoots.length;
		for (const [index, entry] of unknownRoots.entries()) {
			const ageMs = nowMs - entry.mtimeMs;
			if (index < maxRootsToKeep && ageMs < minAgeMs) continue;
			const lockDir = path.join(entry.root, BUNDLED_RUNTIME_DEPS_LOCK_DIR);
			if (fs.existsSync(lockDir) && !removeRuntimeDepsLockIfStale(lockDir, nowMs)) {
				skippedLocked += 1;
				continue;
			}
			try {
				fs.rmSync(entry.root, {
					recursive: true,
					force: true
				});
				removed += 1;
			} catch (error) {
				params.warn?.(`failed to remove stale bundled runtime deps root ${entry.root}: ${String(error)}`);
			}
		}
	}
	return {
		scanned,
		removed,
		skippedLocked
	};
}
function resolveExternalBundledRuntimeDepsInstallRoot(params) {
	return resolveExternalBundledRuntimeDepsInstallRoots(params).at(-1);
}
function resolveExternalBundledRuntimeDepsInstallRoots(params) {
	const packageRoot = resolveBundledPluginPackageRoot(params.pluginRoot) ?? params.pluginRoot;
	const existingExternalRoots = resolveExistingExternalBundledRuntimeDepsRoots({
		packageRoot,
		env: params.env
	});
	if (existingExternalRoots) return existingExternalRoots;
	const packageKey = `openclaw-${sanitizePathSegment(readPackageVersion(packageRoot))}-${createPathHash(packageRoot)}`;
	return resolveBundledRuntimeDepsExternalBaseDirs(params.env).map((baseDir) => path.join(baseDir, packageKey));
}
function resolveExistingExternalBundledRuntimeDepsRoots(params) {
	const packageRoot = realpathOrResolve(params.packageRoot);
	const externalBaseDirs = resolveBundledRuntimeDepsExternalBaseDirs(params.env);
	for (const externalBaseDir of externalBaseDirs) {
		const relative = path.relative(realpathOrResolve(externalBaseDir), packageRoot);
		if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) continue;
		const packageKey = relative.split(path.sep)[0];
		if (!packageKey || !packageKey.startsWith("openclaw-")) continue;
		return externalBaseDirs.map((baseDir) => path.join(baseDir, packageKey));
	}
	return null;
}
function realpathOrResolve(targetPath) {
	try {
		return fs.realpathSync.native(targetPath);
	} catch {
		return path.resolve(targetPath);
	}
}
function createBundledRuntimeDepsInstallRootPlan(params) {
	const searchRoots = [];
	for (const root of params.searchRoots) {
		const resolved = path.resolve(root);
		if (!searchRoots.some((entry) => path.resolve(entry) === resolved)) searchRoots.push(root);
	}
	if (!searchRoots.some((entry) => path.resolve(entry) === path.resolve(params.installRoot))) searchRoots.push(params.installRoot);
	return {
		installRoot: params.installRoot,
		searchRoots,
		external: params.external
	};
}
function resolveBundledRuntimeDependencyPackageInstallRootPlan(packageRoot, options = {}) {
	const env = options.env ?? process.env;
	const externalRoots = resolveExternalBundledRuntimeDepsInstallRoots({
		pluginRoot: path.join(packageRoot, "dist", "extensions", "__package__"),
		env
	});
	if (options.forceExternal || env.OPENCLAW_PLUGIN_STAGE_DIR?.trim() || env.STATE_DIRECTORY?.trim() || !isSourceCheckoutRoot(packageRoot)) return createBundledRuntimeDepsInstallRootPlan({
		installRoot: externalRoots.at(-1) ?? resolveExternalBundledRuntimeDepsInstallRoot({
			pluginRoot: path.join(packageRoot, "dist", "extensions", "__package__"),
			env
		}),
		searchRoots: externalRoots,
		external: true
	});
	if (isWritableDirectory(packageRoot)) return createBundledRuntimeDepsInstallRootPlan({
		installRoot: packageRoot,
		searchRoots: [packageRoot],
		external: false
	});
	return createBundledRuntimeDepsInstallRootPlan({
		installRoot: externalRoots.at(-1) ?? resolveExternalBundledRuntimeDepsInstallRoot({
			pluginRoot: path.join(packageRoot, "dist", "extensions", "__package__"),
			env
		}),
		searchRoots: externalRoots,
		external: true
	});
}
function resolveBundledRuntimeDependencyPackageInstallRoot(packageRoot, options = {}) {
	return resolveBundledRuntimeDependencyPackageInstallRootPlan(packageRoot, options).installRoot;
}
function resolveBundledRuntimeDependencyInstallRootPlan(pluginRoot, options = {}) {
	const env = options.env ?? process.env;
	const externalRoots = resolveExternalBundledRuntimeDepsInstallRoots({
		pluginRoot,
		env
	});
	if (options.forceExternal || env.OPENCLAW_PLUGIN_STAGE_DIR?.trim() || env.STATE_DIRECTORY?.trim() || isPackagedBundledPluginRoot(pluginRoot)) return createBundledRuntimeDepsInstallRootPlan({
		installRoot: externalRoots.at(-1) ?? resolveExternalBundledRuntimeDepsInstallRoot({
			pluginRoot,
			env
		}),
		searchRoots: externalRoots,
		external: true
	});
	if (isWritableDirectory(pluginRoot)) return createBundledRuntimeDepsInstallRootPlan({
		installRoot: pluginRoot,
		searchRoots: [pluginRoot],
		external: false
	});
	return createBundledRuntimeDepsInstallRootPlan({
		installRoot: externalRoots.at(-1) ?? resolveExternalBundledRuntimeDepsInstallRoot({
			pluginRoot,
			env
		}),
		searchRoots: externalRoots,
		external: true
	});
}
//#endregion
//#region src/plugins/bundled-runtime-deps-selection.ts
const MIRRORED_PACKAGE_RUNTIME_DEP_PLUGIN_ID = "openclaw-core";
function collectDeclaredMirroredRootRuntimeDepNames(packageJson) {
	const openclaw = packageJson.openclaw;
	const bundle = openclaw && typeof openclaw === "object" && !Array.isArray(openclaw) ? openclaw.bundle : void 0;
	const rawNames = bundle && typeof bundle === "object" && !Array.isArray(bundle) ? bundle.mirroredRootRuntimeDependencies : void 0;
	if (rawNames === void 0) return [];
	if (!Array.isArray(rawNames)) throw new Error("openclaw.bundle.mirroredRootRuntimeDependencies must be an array");
	const names = /* @__PURE__ */ new Set();
	for (const rawName of rawNames) {
		if (typeof rawName !== "string") throw new Error("openclaw.bundle.mirroredRootRuntimeDependencies must contain strings");
		const normalizedName = normalizeInstallableRuntimeDepName(rawName);
		if (!normalizedName) throw new Error(`Invalid mirrored bundled runtime dependency name: ${rawName}`);
		names.add(normalizedName);
	}
	return [...names].toSorted((left, right) => left.localeCompare(right));
}
function collectMirroredPackageRuntimeDeps(packageRoot) {
	if (!packageRoot) return [];
	const packageJson = readRuntimeDepsJsonObject(path.join(packageRoot, "package.json"));
	if (!packageJson) return [];
	const runtimeDeps = collectPackageRuntimeDeps(packageJson);
	const deps = [];
	for (const name of collectDeclaredMirroredRootRuntimeDepNames(packageJson)) {
		const dep = parseInstallableRuntimeDep(name, runtimeDeps[name]);
		if (!dep) throw new Error(`Declared mirrored bundled runtime dependency ${name} is missing from package dependencies`);
		deps.push({
			...dep,
			pluginIds: [MIRRORED_PACKAGE_RUNTIME_DEP_PLUGIN_ID]
		});
	}
	return deps.toSorted((left, right) => {
		const nameOrder = left.name.localeCompare(right.name);
		return nameOrder === 0 ? left.version.localeCompare(right.version) : nameOrder;
	});
}
function readBundledPluginRuntimeDepsManifest(pluginDir, cache) {
	const cached = cache?.get(pluginDir);
	if (cached) return cached;
	const manifest = readRuntimeDepsJsonObject(path.join(pluginDir, "openclaw.plugin.json"));
	const channels = manifest?.channels;
	const legacyPluginIds = manifest?.legacyPluginIds;
	const localMemoryEmbeddingRuntimeDeps = readBundledPluginLocalMemoryEmbeddingRuntimeDeps(manifest?.runtimeDependencies);
	const modelSupport = readBundledPluginRuntimeDepsModelSupport(manifest?.modelSupport);
	const providers = manifest?.providers;
	const runtimeDepsManifest = {
		channels: Array.isArray(channels) ? channels.filter((entry) => typeof entry === "string" && entry !== "") : [],
		enabledByDefault: manifest?.enabledByDefault === true,
		...typeof manifest?.id === "string" && manifest.id.trim() ? { id: manifest.id } : {},
		legacyPluginIds: Array.isArray(legacyPluginIds) ? legacyPluginIds.filter((entry) => typeof entry === "string" && entry !== "") : [],
		localMemoryEmbeddingRuntimeDeps,
		...modelSupport ? { modelSupport } : {},
		providers: Array.isArray(providers) ? providers.filter((entry) => typeof entry === "string" && entry !== "") : []
	};
	cache?.set(pluginDir, runtimeDepsManifest);
	return runtimeDepsManifest;
}
function readBundledPluginLocalMemoryEmbeddingRuntimeDeps(value) {
	if (!isRecord(value)) return [];
	const specs = value.localMemoryEmbedding;
	if (!Array.isArray(specs)) return [];
	return specs.map((spec) => {
		if (typeof spec !== "string") throw new Error("openclaw.plugin.json runtimeDependencies.localMemoryEmbedding must contain strings");
		return Object.assign(parseInstallableRuntimeDepSpec(spec), { pluginIds: [] });
	});
}
function readBundledPluginRuntimeDepsModelSupport(value) {
	if (!isRecord(value)) return;
	const modelPatterns = readRuntimeDepsManifestStringList(value.modelPatterns);
	const modelPrefixes = readRuntimeDepsManifestStringList(value.modelPrefixes);
	if (modelPatterns.length === 0 && modelPrefixes.length === 0) return;
	return {
		modelPatterns,
		modelPrefixes
	};
}
function readRuntimeDepsManifestStringList(value) {
	if (!Array.isArray(value)) return [];
	return value.filter((entry) => typeof entry === "string" && entry !== "");
}
const BUILT_IN_RUNTIME_DEPS_PLUGIN_ALIAS_FALLBACKS = [
	["openai-codex", "openai"],
	["google-gemini-cli", "google"],
	["minimax-portal", "minimax"],
	["minimax-portal-auth", "minimax"]
];
function addBundledRuntimeDepsPluginAlias(lookup, alias, pluginId) {
	const normalizedAlias = normalizeOptionalLowercaseString(alias);
	if (normalizedAlias) lookup.set(normalizedAlias, pluginId);
}
function createBundledRuntimeDepsPluginIdNormalizer(params) {
	const lookup = /* @__PURE__ */ new Map();
	for (const [alias, pluginId] of BUILT_IN_RUNTIME_DEPS_PLUGIN_ALIAS_FALLBACKS) {
		lookup.set(alias, pluginId);
		lookup.set(pluginId, pluginId);
	}
	if (!fs.existsSync(params.extensionsDir)) return (id) => {
		const trimmed = id.trim();
		const normalized = normalizeOptionalLowercaseString(trimmed);
		return normalized && lookup.get(normalized) || trimmed;
	};
	for (const entry of fs.readdirSync(params.extensionsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const fallbackPluginId = entry.name;
		const manifest = readBundledPluginRuntimeDepsManifest(path.join(params.extensionsDir, fallbackPluginId), params.manifestCache);
		const pluginId = manifest.id ?? fallbackPluginId;
		addBundledRuntimeDepsPluginAlias(lookup, pluginId, pluginId);
		addBundledRuntimeDepsPluginAlias(lookup, fallbackPluginId, pluginId);
		for (const providerId of manifest.providers) addBundledRuntimeDepsPluginAlias(lookup, providerId, pluginId);
		for (const legacyPluginId of manifest.legacyPluginIds) addBundledRuntimeDepsPluginAlias(lookup, legacyPluginId, pluginId);
	}
	return (id) => {
		const trimmed = id.trim();
		const normalized = normalizeOptionalLowercaseString(trimmed);
		return normalized && lookup.get(normalized) || trimmed;
	};
}
function passesRuntimeDepsPluginPolicy(params) {
	if (!params.plugins.enabled) return false;
	if (params.plugins.deny.includes(params.pluginId)) return false;
	if (params.plugins.entries[params.pluginId]?.enabled === false && params.allowExplicitlyDisabled !== true) return false;
	return params.allowRestrictiveAllowlistBypass === true || params.plugins.allow.length === 0 || params.plugins.allow.includes(params.pluginId);
}
function isRecord(value) {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function createConfiguredRuntimeDepsTargets() {
	return {
		modelRefs: /* @__PURE__ */ new Set(),
		providerIds: /* @__PURE__ */ new Set()
	};
}
function addConfiguredProviderId(targets, value) {
	if (typeof value !== "string") return;
	const normalized = normalizeProviderId(value);
	if (normalized) targets.providerIds.add(normalized);
}
function addConfiguredModelRef(targets, value) {
	if (typeof value !== "string") return;
	const parsed = parseConfiguredModelRef(value);
	if (!parsed) return;
	if (parsed.providerId) targets.providerIds.add(parsed.providerId);
	else targets.modelRefs.add(parsed.modelId);
}
function parseConfiguredModelRef(value) {
	const trimmed = value.trim();
	if (!trimmed) return;
	const slash = trimmed.indexOf("/");
	if (slash < 0) {
		const modelId = splitTrailingAuthProfile(trimmed).model.trim();
		return modelId ? { modelId } : void 0;
	}
	const providerId = normalizeProviderId(trimmed.slice(0, slash));
	const modelId = splitTrailingAuthProfile(trimmed.slice(slash + 1)).model.trim();
	if (!providerId || !modelId) return;
	return {
		providerId,
		modelId
	};
}
function addConfiguredModelsFromModelConfig(targets, value) {
	if (typeof value === "string") {
		addConfiguredModelRef(targets, value);
		return;
	}
	if (!isRecord(value)) return;
	addConfiguredModelRef(targets, value.primary);
	if (Array.isArray(value.fallbacks)) for (const fallback of value.fallbacks) addConfiguredModelRef(targets, fallback);
}
function collectConfiguredRuntimeDepsTargets(config) {
	const targets = createConfiguredRuntimeDepsTargets();
	for (const providerId of Object.keys(config.models?.providers ?? {})) addConfiguredProviderId(targets, providerId);
	for (const profile of Object.values(config.auth?.profiles ?? {})) addConfiguredProviderId(targets, profile.provider);
	for (const providerId of Object.keys(config.auth?.order ?? {})) addConfiguredProviderId(targets, providerId);
	const defaults = config.agents?.defaults;
	addConfiguredModelsFromModelConfig(targets, defaults?.model);
	addConfiguredModelsFromModelConfig(targets, defaults?.imageModel);
	addConfiguredModelsFromModelConfig(targets, defaults?.imageGenerationModel);
	addConfiguredModelsFromModelConfig(targets, defaults?.videoGenerationModel);
	addConfiguredModelsFromModelConfig(targets, defaults?.musicGenerationModel);
	addConfiguredModelsFromModelConfig(targets, defaults?.pdfModel);
	addConfiguredModelsFromModelConfig(targets, defaults?.subagents?.model);
	for (const providerId of Object.keys(defaults?.models ?? {})) addConfiguredModelRef(targets, providerId);
	for (const agent of config.agents?.list ?? []) {
		addConfiguredModelsFromModelConfig(targets, agent.model);
		addConfiguredModelsFromModelConfig(targets, agent.subagents?.model);
	}
	return targets;
}
function collectConfiguredProviderIds(config) {
	return collectConfiguredRuntimeDepsTargets(config).providerIds;
}
function memorySearchConfigUsesProvider(value, providerId) {
	return value?.enabled !== false && normalizeOptionalLowercaseString(value?.provider) === providerId;
}
function isMemoryEmbeddingProviderConfiguredForRuntimeDeps(config, providerId) {
	if (!config) return false;
	if (memorySearchConfigUsesProvider(config.agents?.defaults?.memorySearch, providerId)) return true;
	return (config.agents?.list ?? []).some((agent) => memorySearchConfigUsesProvider(agent.memorySearch, providerId));
}
function matchesBundledRuntimeDepsModelSupport(manifest, modelId, kind) {
	if (kind === "pattern") {
		for (const patternSource of manifest.modelSupport?.modelPatterns ?? []) try {
			if (new RegExp(patternSource, "u").test(modelId)) return true;
		} catch {
			continue;
		}
		return false;
	}
	return (manifest.modelSupport?.modelPrefixes ?? []).some((prefix) => modelId.startsWith(prefix));
}
function resolveBundledRuntimeDepsConfiguredModelOwnerPluginIds(params) {
	const targets = collectConfiguredRuntimeDepsTargets(params.config);
	if (targets.modelRefs.size === 0 || !fs.existsSync(params.extensionsDir)) return /* @__PURE__ */ new Set();
	const plugins = fs.readdirSync(params.extensionsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
		const pluginDir = path.join(params.extensionsDir, entry.name);
		return {
			pluginId: entry.name,
			manifest: readBundledPluginRuntimeDepsManifest(pluginDir, params.manifestCache)
		};
	});
	const pluginIds = /* @__PURE__ */ new Set();
	for (const modelId of targets.modelRefs) {
		const patternMatches = plugins.filter(({ manifest }) => matchesBundledRuntimeDepsModelSupport(manifest, modelId, "pattern"));
		if (patternMatches.length === 1) {
			pluginIds.add(patternMatches[0].pluginId);
			continue;
		}
		if (patternMatches.length > 1) continue;
		const prefixMatches = plugins.filter(({ manifest }) => matchesBundledRuntimeDepsModelSupport(manifest, modelId, "prefix"));
		if (prefixMatches.length === 1) pluginIds.add(prefixMatches[0].pluginId);
	}
	return pluginIds;
}
function isBundledProviderConfiguredForRuntimeDeps(params) {
	if (params.providers.length === 0) return false;
	const configuredProviderIds = collectConfiguredProviderIds(params.config);
	return params.providers.some((provider) => configuredProviderIds.has(normalizeProviderId(provider)));
}
function isBundledPluginConfiguredForRuntimeDeps(params) {
	if (!passesRuntimeDepsPluginPolicy({
		pluginId: params.pluginId,
		plugins: params.plugins,
		allowRestrictiveAllowlistBypass: true
	})) return false;
	const entry = params.plugins.entries[params.pluginId];
	const manifest = readBundledPluginRuntimeDepsManifest(params.pluginDir, params.manifestCache);
	if (params.plugins.slots.memory === params.pluginId || params.plugins.slots.contextEngine === params.pluginId) return true;
	let hasExplicitChannelDisable = false;
	let hasConfiguredChannel = false;
	for (const channelId of manifest.channels) {
		const normalizedChannelId = normalizeOptionalLowercaseString(channelId);
		if (!normalizedChannelId) continue;
		const channelConfig = params.config.channels?.[normalizedChannelId];
		if (channelConfig && typeof channelConfig === "object" && !Array.isArray(channelConfig) && channelConfig.enabled === false) {
			hasExplicitChannelDisable = true;
			continue;
		}
		if (channelConfig && typeof channelConfig === "object" && !Array.isArray(channelConfig) && channelConfig.enabled === true) return true;
		if (channelConfig && typeof channelConfig === "object" && !Array.isArray(channelConfig) && params.includeConfiguredChannels) hasConfiguredChannel = true;
	}
	if (hasExplicitChannelDisable) return false;
	if (params.plugins.allow.length > 0 && !params.plugins.allow.includes(params.pluginId)) return false;
	if (entry?.enabled === true) return true;
	if (hasConfiguredChannel) return true;
	if (params.configuredModelOwnerPluginIds?.has(params.pluginId)) return true;
	if (isBundledProviderConfiguredForRuntimeDeps({
		config: params.config,
		providers: manifest.providers
	})) return true;
	return manifest.enabledByDefault && manifest.providers.length === 0;
}
function isBundledPluginExplicitlyDisabledForRuntimeDeps(params) {
	if (params.plugins.entries[params.pluginId]?.enabled === false) return true;
	return readBundledPluginRuntimeDepsManifest(params.pluginDir, params.manifestCache).channels.some((channelId) => {
		const normalizedChannelId = normalizeOptionalLowercaseString(channelId);
		if (!normalizedChannelId) return false;
		const channelConfig = params.config.channels?.[normalizedChannelId];
		return channelConfig && typeof channelConfig === "object" && !Array.isArray(channelConfig) && channelConfig.enabled === false;
	});
}
function shouldIncludeBundledPluginRuntimeDeps(params) {
	if (params.selectedPluginIds) return params.selectedPluginIds.has(params.pluginId) && !(params.config && params.plugins && isBundledPluginExplicitlyDisabledForRuntimeDeps({
		config: params.config,
		plugins: params.plugins,
		pluginId: params.pluginId,
		pluginDir: params.pluginDir,
		manifestCache: params.manifestCache
	}));
	const scopedToPluginIds = Boolean(params.pluginIds);
	if (params.pluginIds) {
		if (!params.pluginIds.has(params.pluginId)) return false;
		if (!params.config) return true;
	}
	if (!params.config) return true;
	if (scopedToPluginIds) {
		if (!params.plugins) return true;
		return passesRuntimeDepsPluginPolicy({
			pluginId: params.pluginId,
			plugins: params.plugins,
			allowRestrictiveAllowlistBypass: true
		});
	}
	if (!params.plugins) return false;
	return isBundledPluginConfiguredForRuntimeDeps({
		config: params.config,
		plugins: params.plugins,
		pluginId: params.pluginId,
		pluginDir: params.pluginDir,
		configuredModelOwnerPluginIds: params.configuredModelOwnerPluginIds,
		includeConfiguredChannels: params.includeConfiguredChannels,
		manifestCache: params.manifestCache
	});
}
function collectBundledPluginRuntimeDeps(params) {
	const versionMap = /* @__PURE__ */ new Map();
	const manifestCache = params.manifestCache ?? /* @__PURE__ */ new Map();
	const needsPluginIdNormalizer = Boolean(params.config);
	const normalizePluginId = params.normalizePluginId ?? (needsPluginIdNormalizer ? createBundledRuntimeDepsPluginIdNormalizer({
		extensionsDir: params.extensionsDir,
		manifestCache
	}) : void 0);
	const plugins = params.config ? normalizePluginsConfigWithResolver(params.config.plugins, normalizePluginId) : void 0;
	const configuredModelOwnerPluginIds = params.config && plugins ? resolveBundledRuntimeDepsConfiguredModelOwnerPluginIds({
		config: params.config,
		extensionsDir: params.extensionsDir,
		manifestCache
	}) : void 0;
	const includedPluginIds = /* @__PURE__ */ new Set();
	for (const entry of fs.readdirSync(params.extensionsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const pluginId = entry.name;
		const pluginDir = path.join(params.extensionsDir, pluginId);
		if (!shouldIncludeBundledPluginRuntimeDeps({
			config: params.config,
			plugins,
			pluginIds: params.pluginIds,
			selectedPluginIds: params.selectedPluginIds,
			pluginId,
			pluginDir,
			configuredModelOwnerPluginIds,
			includeConfiguredChannels: params.includeConfiguredChannels,
			manifestCache
		})) continue;
		includedPluginIds.add(pluginId);
		const manifest = readBundledPluginRuntimeDepsManifest(pluginDir, manifestCache);
		const packageJson = readRuntimeDepsJsonObject(path.join(pluginDir, "package.json"));
		if (packageJson) for (const [name, rawVersion] of Object.entries(collectPackageRuntimeDeps(packageJson))) {
			const dep = parseInstallableRuntimeDep(name, rawVersion);
			if (!dep) continue;
			const byVersion = versionMap.get(dep.name) ?? /* @__PURE__ */ new Map();
			const pluginIds = byVersion.get(dep.version) ?? /* @__PURE__ */ new Set();
			pluginIds.add(pluginId);
			byVersion.set(dep.version, pluginIds);
			versionMap.set(dep.name, byVersion);
		}
		if (manifest.localMemoryEmbeddingRuntimeDeps.length > 0 && isMemoryEmbeddingProviderConfiguredForRuntimeDeps(params.config, "local")) for (const dep of manifest.localMemoryEmbeddingRuntimeDeps) {
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
		conflicts: conflicts.toSorted((a, b) => a.name.localeCompare(b.name)),
		pluginIds: [...includedPluginIds].toSorted((a, b) => a.localeCompare(b))
	};
}
function normalizePluginIdSet(pluginIds, normalizePluginId = (id) => normalizeOptionalLowercaseString(id) ?? "") {
	if (!pluginIds) return;
	const normalized = pluginIds.map((entry) => normalizePluginId(entry)).filter((entry) => Boolean(entry));
	return new Set(normalized);
}
//#endregion
//#region src/plugins/bundled-runtime-deps.ts
const PLUGIN_ROOT_INSTALL_STAGE_DIR = ".openclaw-install-stage";
const registeredBundledRuntimeDepNodePaths = /* @__PURE__ */ new Set();
function createBundledRuntimeDepsEnsureResult(installedSpecs) {
	return { installedSpecs };
}
function withBundledRuntimeDepsInstallRootLock(installRoot, run) {
	return withBundledRuntimeDepsFilesystemLock(installRoot, BUNDLED_RUNTIME_DEPS_LOCK_DIR, run);
}
function mergeRuntimeDepEntries(deps) {
	const bySpec = /* @__PURE__ */ new Map();
	for (const dep of deps) {
		const spec = `${dep.name}@${dep.version}`;
		const existing = bySpec.get(spec);
		if (!existing) {
			bySpec.set(spec, {
				...dep,
				pluginIds: [...dep.pluginIds]
			});
			continue;
		}
		existing.pluginIds = [...new Set([...existing.pluginIds, ...dep.pluginIds])].toSorted((left, right) => left.localeCompare(right));
	}
	return [...bySpec.values()].toSorted((left, right) => {
		const nameOrder = left.name.localeCompare(right.name);
		return nameOrder === 0 ? left.version.localeCompare(right.version) : nameOrder;
	});
}
function registerBundledRuntimeDependencyNodePath(rootDir) {
	const nodeModulesDir = path.join(rootDir, "node_modules");
	if (registeredBundledRuntimeDepNodePaths.has(nodeModulesDir) || !fs.existsSync(nodeModulesDir)) return;
	const currentPaths = (process.env.NODE_PATH ?? "").split(path.delimiter).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
	process.env.NODE_PATH = [nodeModulesDir, ...currentPaths.filter((entry) => entry !== nodeModulesDir)].join(path.delimiter);
	Module._initPaths?.();
	registeredBundledRuntimeDepNodePaths.add(nodeModulesDir);
}
function clearBundledRuntimeDependencyNodePaths() {
	if (registeredBundledRuntimeDepNodePaths.size === 0) return;
	const retainedPaths = (process.env.NODE_PATH ?? "").split(path.delimiter).filter((entry) => entry.length > 0 && !registeredBundledRuntimeDepNodePaths.has(entry));
	if (retainedPaths.length > 0) process.env.NODE_PATH = retainedPaths.join(path.delimiter);
	else delete process.env.NODE_PATH;
	registeredBundledRuntimeDepNodePaths.clear();
	Module._initPaths?.();
}
function createBundledRuntimeDepsInstallSpecs(params) {
	return params.deps.map((dep) => `${dep.name}@${dep.version}`).toSorted((left, right) => left.localeCompare(right));
}
function createBundledRuntimeDepsPlan(params) {
	const deps = mergeRuntimeDepEntries(params.deps);
	return {
		deps,
		missing: deps.filter((dep) => !isRuntimeDepSatisfiedInAnyRoot(dep, params.installRootPlan.searchRoots)),
		conflicts: [...params.conflicts],
		installSpecs: createBundledRuntimeDepsInstallSpecs({ deps }),
		installRootPlan: params.installRootPlan
	};
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
	const manifestCache = /* @__PURE__ */ new Map();
	const normalizePluginId = params.config || params.pluginIds || params.selectedPluginIds ? createBundledRuntimeDepsPluginIdNormalizer({
		extensionsDir,
		manifestCache
	}) : void 0;
	const { deps, conflicts, pluginIds } = collectBundledPluginRuntimeDeps({
		extensionsDir,
		config: params.config,
		pluginIds: normalizePluginIdSet(params.pluginIds, normalizePluginId),
		selectedPluginIds: normalizePluginIdSet(params.selectedPluginIds, normalizePluginId),
		includeConfiguredChannels: params.includeConfiguredChannels,
		manifestCache,
		...normalizePluginId ? { normalizePluginId } : {}
	});
	const packageRuntimeDeps = pluginIds.length > 0 ? collectMirroredPackageRuntimeDeps(params.packageRoot) : [];
	const installRootPlan = resolveBundledRuntimeDependencyPackageInstallRootPlan(params.packageRoot, { env: params.env });
	const plan = createBundledRuntimeDepsPlan({
		deps: [...deps, ...packageRuntimeDeps],
		conflicts,
		installRootPlan
	});
	return {
		deps: plan.deps,
		missing: plan.missing,
		conflicts: plan.conflicts
	};
}
function ensureBundledPluginRuntimeDeps(params) {
	const extensionsDir = path.dirname(params.pluginRoot);
	const manifestCache = /* @__PURE__ */ new Map();
	const normalizePluginId = params.config ? createBundledRuntimeDepsPluginIdNormalizer({
		extensionsDir,
		manifestCache
	}) : void 0;
	const plugins = params.config ? normalizePluginsConfigWithResolver(params.config.plugins, normalizePluginId) : void 0;
	if (params.config && plugins && !isBundledPluginConfiguredForRuntimeDeps({
		config: params.config,
		plugins,
		pluginId: params.pluginId,
		pluginDir: params.pluginRoot,
		configuredModelOwnerPluginIds: resolveBundledRuntimeDepsConfiguredModelOwnerPluginIds({
			config: params.config,
			extensionsDir,
			manifestCache
		}),
		manifestCache
	})) return createBundledRuntimeDepsEnsureResult([]);
	const packageJson = readRuntimeDepsJsonObject(path.join(params.pluginRoot, "package.json"));
	if (!packageJson) return createBundledRuntimeDepsEnsureResult([]);
	const pluginDepEntries = Object.entries(collectPackageRuntimeDeps(packageJson)).map(([name, rawVersion]) => parseInstallableRuntimeDep(name, rawVersion)).filter((entry) => Boolean(entry)).map((dep) => ({
		name: dep.name,
		version: dep.version,
		pluginIds: [params.pluginId]
	}));
	const installRootPlan = resolveBundledRuntimeDependencyInstallRootPlan(params.pluginRoot, { env: params.env });
	const installRoot = installRootPlan.installRoot;
	const packageRoot = resolveBundledRuntimeDependencyPackageRoot(params.pluginRoot);
	const usePackageLevelPlan = packageRoot && path.resolve(installRoot) !== path.resolve(params.pluginRoot);
	let deps = pluginDepEntries;
	if (usePackageLevelPlan && packageRoot) {
		const packagePlan = collectBundledPluginRuntimeDeps({
			extensionsDir,
			...params.config ? { config: params.config } : {},
			manifestCache,
			...normalizePluginId ? { normalizePluginId } : {}
		});
		if (packagePlan.conflicts.length === 0 && packagePlan.deps.length > 0) deps = mergeRuntimeDepEntries([...packagePlan.deps, ...collectMirroredPackageRuntimeDeps(packageRoot)]);
		else deps = mergeRuntimeDepEntries([...pluginDepEntries, ...collectMirroredPackageRuntimeDeps(packageRoot)]);
	}
	if (deps.length === 0) return createBundledRuntimeDepsEnsureResult([]);
	const plan = createBundledRuntimeDepsPlan({
		deps,
		conflicts: [],
		installRootPlan
	});
	return withBundledRuntimeDepsInstallRootLock(installRoot, () => {
		const installSpecs = plan.installSpecs;
		if (isRuntimeDepsPlanMaterialized(installRoot, installSpecs)) {
			removeLegacyRuntimeDepsManifest(installRoot);
			return createBundledRuntimeDepsEnsureResult([]);
		}
		const installExecutionRoot = path.resolve(installRoot) === path.resolve(params.pluginRoot) ? path.join(installRoot, PLUGIN_ROOT_INSTALL_STAGE_DIR) : void 0;
		removeLegacyRuntimeDepsManifest(installRoot);
		const install = params.installDeps ?? ((installParams) => {
			return installBundledRuntimeDeps({
				installRoot: installParams.installRoot,
				installExecutionRoot: installParams.installExecutionRoot,
				missingSpecs: installParams.installSpecs ?? installParams.missingSpecs,
				installSpecs: installParams.installSpecs,
				env: params.env
			});
		});
		const finishActivity = beginBundledRuntimeDepsInstall({
			installRoot,
			missingSpecs: installSpecs,
			installSpecs,
			pluginId: params.pluginId
		});
		if (!installExecutionRoot) ensureNpmInstallExecutionManifest(installRoot, installSpecs);
		try {
			install({
				installRoot,
				...installExecutionRoot ? { installExecutionRoot } : {},
				missingSpecs: installSpecs,
				installSpecs
			});
		} finally {
			finishActivity();
		}
		removeLegacyRuntimeDepsManifest(installRoot);
		return createBundledRuntimeDepsEnsureResult(installSpecs);
	});
}
//#endregion
export { scanBundledPluginRuntimeDeps as a, resolveBundledRuntimeDependencyPackageInstallRoot as c, installBundledRuntimeDeps as d, repairBundledRuntimeDepsInstallRootAsync as f, waitForBundledRuntimeDepsInstallIdle as g, getActiveBundledRuntimeDepsInstallCount as h, registerBundledRuntimeDependencyNodePath as i, resolveBundledRuntimeDependencyPackageInstallRootPlan as l, createLowDiskSpaceWarning as m, createBundledRuntimeDepsInstallSpecs as n, pruneUnknownBundledRuntimeDepsRoots as o, withBundledRuntimeDepsFilesystemLock as p, ensureBundledPluginRuntimeDeps as r, resolveBundledRuntimeDependencyInstallRootPlan as s, clearBundledRuntimeDependencyNodePaths as t, resolveBundledRuntimeDependencyPackageRoot as u };
