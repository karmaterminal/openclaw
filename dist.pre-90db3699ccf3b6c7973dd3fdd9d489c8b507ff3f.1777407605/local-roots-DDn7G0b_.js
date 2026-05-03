import { c as normalizeOptionalString } from "./string-coerce-CjxCKZ6B.js";
import { f as resolveConfigDir, m as resolveUserPath } from "./utils-CB8xp0O4.js";
import { n as resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir-CWQcmOLf.js";
import { _ as resolveStateDir } from "./paths-D92DjaZ-.js";
import { _ as resolveAgentConfig, b as resolveAgentWorkspaceDir } from "./agent-scope-D-T17Rdc.js";
import { c as mergeAlsoAllowPolicy, m as resolveToolProfilePolicy } from "./tool-policy-4C90huEY.js";
import { a as safeFileURLToPath } from "./local-file-access-BpdUv1jJ.js";
import { t as isPassThroughRemoteMediaSource } from "./media-source-url-DLCfXDgg.js";
import { t as pickSandboxToolPolicy } from "./sandbox-tool-policy-CQSRiUbA.js";
import { t as isToolAllowedByPolicies } from "./tool-policy-match-D4iC3S5M.js";
import path from "node:path";
//#region src/agents/tool-fs-policy.ts
function createToolFsPolicy(params) {
	return { workspaceOnly: params.workspaceOnly === true };
}
function resolveToolFsConfig(params) {
	const cfg = params.cfg;
	const globalFs = cfg?.tools?.fs;
	return { workspaceOnly: (cfg && params.agentId ? resolveAgentConfig(cfg, params.agentId)?.tools?.fs : void 0)?.workspaceOnly ?? globalFs?.workspaceOnly };
}
function resolveEffectiveToolFsWorkspaceOnly(params) {
	return resolveToolFsConfig(params).workspaceOnly === true;
}
function resolveEffectiveToolFsRootExpansionAllowed(params) {
	const cfg = params.cfg;
	if (!cfg) return true;
	const agentTools = params.agentId ? resolveAgentConfig(cfg, params.agentId)?.tools : void 0;
	const globalTools = cfg.tools;
	const profile = agentTools?.profile ?? globalTools?.profile;
	const profileAlsoAllow = new Set(agentTools?.alsoAllow ?? globalTools?.alsoAllow ?? []);
	const fsConfig = resolveToolFsConfig(params);
	const hasExplicitFsConfig = agentTools?.fs !== void 0 || globalTools?.fs !== void 0;
	if (fsConfig.workspaceOnly === true) return false;
	if (hasExplicitFsConfig) {
		profileAlsoAllow.add("read");
		profileAlsoAllow.add("write");
		profileAlsoAllow.add("edit");
	}
	return isToolAllowedByPolicies("read", [
		mergeAlsoAllowPolicy(resolveToolProfilePolicy(profile), profileAlsoAllow.size > 0 ? Array.from(profileAlsoAllow) : void 0),
		pickSandboxToolPolicy(globalTools),
		pickSandboxToolPolicy(agentTools)
	]);
}
//#endregion
//#region src/media/local-roots.ts
let cachedPreferredTmpDir;
const DATA_URL_RE = /^data:/i;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
function resolveCachedPreferredTmpDir() {
	if (!cachedPreferredTmpDir) cachedPreferredTmpDir = resolvePreferredOpenClawTmpDir();
	return cachedPreferredTmpDir;
}
function buildMediaLocalRoots(stateDir, configDir, options = {}) {
	const resolvedStateDir = path.resolve(stateDir);
	const resolvedConfigDir = path.resolve(configDir);
	const preferredTmpDir = options.preferredTmpDir ?? resolveCachedPreferredTmpDir();
	return Array.from(new Set([
		preferredTmpDir,
		path.join(resolvedConfigDir, "media"),
		path.join(resolvedStateDir, "media"),
		path.join(resolvedStateDir, "canvas"),
		path.join(resolvedStateDir, "workspace"),
		path.join(resolvedStateDir, "sandboxes")
	]));
}
function getDefaultMediaLocalRoots() {
	return buildMediaLocalRoots(resolveStateDir(), resolveConfigDir());
}
function getAgentScopedMediaLocalRoots(cfg, agentId) {
	const roots = buildMediaLocalRoots(resolveStateDir(), resolveConfigDir());
	const normalizedAgentId = normalizeOptionalString(agentId);
	if (!normalizedAgentId) return roots;
	const workspaceDir = resolveAgentWorkspaceDir(cfg, normalizedAgentId);
	if (!workspaceDir) return roots;
	const normalizedWorkspaceDir = path.resolve(workspaceDir);
	if (!roots.includes(normalizedWorkspaceDir)) roots.push(normalizedWorkspaceDir);
	return roots;
}
function resolveLocalMediaPath(source) {
	const trimmed = source.trim();
	if (!trimmed || isPassThroughRemoteMediaSource(trimmed) || DATA_URL_RE.test(trimmed)) return;
	if (trimmed.startsWith("file://")) try {
		return safeFileURLToPath(trimmed);
	} catch {
		return;
	}
	if (trimmed.startsWith("~")) return resolveUserPath(trimmed);
	if (path.isAbsolute(trimmed) || WINDOWS_DRIVE_RE.test(trimmed)) return path.resolve(trimmed);
}
function appendLocalMediaParentRoots(roots, mediaSources) {
	const appended = Array.from(new Set(roots.map((root) => path.resolve(root))));
	for (const source of mediaSources ?? []) {
		const localPath = resolveLocalMediaPath(source);
		if (!localPath) continue;
		const parentDir = path.dirname(localPath);
		if (parentDir === path.parse(parentDir).root) continue;
		const normalizedParent = path.resolve(parentDir);
		if (!appended.includes(normalizedParent)) appended.push(normalizedParent);
	}
	return appended;
}
function getAgentScopedMediaLocalRootsForSources(params) {
	const roots = getAgentScopedMediaLocalRoots(params.cfg, params.agentId);
	if (resolveEffectiveToolFsWorkspaceOnly({
		cfg: params.cfg,
		agentId: params.agentId
	})) return roots;
	if (!resolveEffectiveToolFsRootExpansionAllowed({
		cfg: params.cfg,
		agentId: params.agentId
	})) return roots;
	return appendLocalMediaParentRoots(roots, params.mediaSources);
}
//#endregion
export { getDefaultMediaLocalRoots as a, resolveEffectiveToolFsWorkspaceOnly as c, getAgentScopedMediaLocalRootsForSources as i, resolveToolFsConfig as l, buildMediaLocalRoots as n, createToolFsPolicy as o, getAgentScopedMediaLocalRoots as r, resolveEffectiveToolFsRootExpansionAllowed as s, appendLocalMediaParentRoots as t };
