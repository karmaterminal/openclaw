import { s as normalizeOptionalLowercaseString } from "./string-coerce-C1IzJjqi.js";
import { a as isSubagentSessionKey, n as isAcpSessionKey, o as parseAgentSessionKey } from "./session-key-utils-BT0y7mVK.js";
import "./sessions-CQdlpJUR.js";
import { u as resolveStorePath } from "./paths-DOSS0HMP.js";
import { t as loadSessionStore } from "./store-load-BLzdjzCX.js";
import { n as normalizeSubagentSessionKey, t as getSubagentDepthFromSessionStore } from "./subagent-depth-D5Jjo3hX.js";
//#region src/agents/subagent-capabilities.ts
const SUBAGENT_SESSION_ROLES = [
	"main",
	"orchestrator",
	"leaf"
];
const SUBAGENT_CONTROL_SCOPES = ["children", "none"];
function normalizeSubagentRole(value) {
	const trimmed = normalizeOptionalLowercaseString(value);
	return SUBAGENT_SESSION_ROLES.find((entry) => entry === trimmed);
}
function normalizeSubagentControlScope(value) {
	const trimmed = normalizeOptionalLowercaseString(value);
	return SUBAGENT_CONTROL_SCOPES.find((entry) => entry === trimmed);
}
function shouldInspectStoredSubagentEnvelope(sessionKey) {
	return isSubagentSessionKey(sessionKey) || isAcpSessionKey(sessionKey);
}
function isSameAgentSessionStore(leftSessionKey, rightSessionKey) {
	const leftAgentId = normalizeOptionalLowercaseString(parseAgentSessionKey(leftSessionKey)?.agentId);
	const rightAgentId = normalizeOptionalLowercaseString(parseAgentSessionKey(rightSessionKey)?.agentId);
	return Boolean(leftAgentId) && leftAgentId === rightAgentId;
}
function readSessionStore(storePath) {
	try {
		return loadSessionStore(storePath);
	} catch {
		return {};
	}
}
function findEntryBySessionId(store, sessionId) {
	const normalizedSessionId = normalizeSubagentSessionKey(sessionId);
	if (!normalizedSessionId) return;
	for (const entry of Object.values(store)) if (normalizeSubagentSessionKey(entry?.sessionId) === normalizedSessionId) return entry;
}
function resolveSessionCapabilityEntry(params) {
	if (params.store) return params.store[params.sessionKey] ?? findEntryBySessionId(params.store, params.sessionKey);
	if (!params.cfg) return;
	const parsed = parseAgentSessionKey(params.sessionKey);
	if (!parsed?.agentId) return;
	const store = readSessionStore(resolveStorePath(params.cfg.session?.store, { agentId: parsed.agentId }));
	return store[params.sessionKey] ?? findEntryBySessionId(store, params.sessionKey);
}
function resolveSubagentCapabilityStore(sessionKey, opts) {
	const normalizedSessionKey = normalizeSubagentSessionKey(sessionKey);
	if (!normalizedSessionKey) return opts?.store;
	if (opts?.store) return opts.store;
	if (!opts?.cfg || !shouldInspectStoredSubagentEnvelope(normalizedSessionKey)) return;
	const parsed = parseAgentSessionKey(normalizedSessionKey);
	if (!parsed?.agentId) return;
	return readSessionStore(resolveStorePath(opts.cfg.session?.store, { agentId: parsed.agentId }));
}
function resolveSubagentRoleForDepth(params) {
	const depth = Number.isInteger(params.depth) ? Math.max(0, params.depth) : 0;
	const maxSpawnDepth = typeof params.maxSpawnDepth === "number" && Number.isFinite(params.maxSpawnDepth) ? Math.max(1, Math.floor(params.maxSpawnDepth)) : 1;
	if (depth <= 0) return "main";
	return depth < maxSpawnDepth ? "orchestrator" : "leaf";
}
function resolveSubagentControlScopeForRole(role) {
	return role === "leaf" ? "none" : "children";
}
function resolveSubagentCapabilities(params) {
	const role = resolveSubagentRoleForDepth(params);
	const controlScope = resolveSubagentControlScopeForRole(role);
	return {
		depth: Math.max(0, Math.floor(params.depth)),
		role,
		controlScope,
		canSpawn: role === "main" || role === "orchestrator",
		canControlChildren: controlScope === "children"
	};
}
function isStoredSubagentEnvelopeSession(params, visited = /* @__PURE__ */ new Set()) {
	const normalizedSessionKey = normalizeSubagentSessionKey(params.sessionKey);
	if (!normalizedSessionKey || visited.has(normalizedSessionKey)) return false;
	visited.add(normalizedSessionKey);
	if (isSubagentSessionKey(normalizedSessionKey)) return true;
	if (!isAcpSessionKey(normalizedSessionKey)) return false;
	const entry = params.entry ?? resolveSessionCapabilityEntry({
		sessionKey: normalizedSessionKey,
		cfg: params.cfg,
		store: params.store
	});
	if (normalizeSubagentRole(entry?.subagentRole) || normalizeSubagentControlScope(entry?.subagentControlScope)) return true;
	const spawnedBy = normalizeSubagentSessionKey(entry?.spawnedBy);
	if (!spawnedBy) return false;
	const parentStore = isSameAgentSessionStore(normalizedSessionKey, spawnedBy) ? params.store : void 0;
	return isStoredSubagentEnvelopeSession({
		sessionKey: spawnedBy,
		cfg: params.cfg,
		store: parentStore
	}, visited);
}
function isSubagentEnvelopeSession(sessionKey, opts) {
	const normalizedSessionKey = normalizeSubagentSessionKey(sessionKey);
	if (!normalizedSessionKey) return false;
	if (isSubagentSessionKey(normalizedSessionKey)) return true;
	if (!isAcpSessionKey(normalizedSessionKey)) return false;
	const store = resolveSubagentCapabilityStore(normalizedSessionKey, opts);
	return isStoredSubagentEnvelopeSession({
		sessionKey: normalizedSessionKey,
		cfg: opts?.cfg,
		store,
		entry: opts?.entry
	});
}
function resolveStoredSubagentCapabilities(sessionKey, opts) {
	const normalizedSessionKey = normalizeSubagentSessionKey(sessionKey);
	const maxSpawnDepth = opts?.cfg?.agents?.defaults?.subagents?.maxSpawnDepth ?? 1;
	if (!normalizedSessionKey) return resolveSubagentCapabilities({
		depth: 0,
		maxSpawnDepth
	});
	if (!shouldInspectStoredSubagentEnvelope(normalizedSessionKey)) return resolveSubagentCapabilities({
		depth: getSubagentDepthFromSessionStore(normalizedSessionKey, {
			cfg: opts?.cfg,
			store: opts?.store
		}),
		maxSpawnDepth
	});
	const store = resolveSubagentCapabilityStore(normalizedSessionKey, opts);
	const entry = normalizedSessionKey ? resolveSessionCapabilityEntry({
		sessionKey: normalizedSessionKey,
		cfg: opts?.cfg,
		store
	}) : void 0;
	const depthStore = opts?.cfg && typeof entry?.spawnDepth !== "number" ? void 0 : store;
	const depth = getSubagentDepthFromSessionStore(normalizedSessionKey, {
		cfg: opts?.cfg,
		store: depthStore
	});
	if (!isSubagentEnvelopeSession(normalizedSessionKey, {
		...opts,
		store,
		entry
	})) return resolveSubagentCapabilities({
		depth,
		maxSpawnDepth
	});
	const storedRole = normalizeSubagentRole(entry?.subagentRole);
	const storedControlScope = normalizeSubagentControlScope(entry?.subagentControlScope);
	const fallback = resolveSubagentCapabilities({
		depth,
		maxSpawnDepth
	});
	const role = storedRole ?? fallback.role;
	const controlScope = storedControlScope ?? resolveSubagentControlScopeForRole(role);
	return {
		depth,
		role,
		controlScope,
		canSpawn: role === "main" || role === "orchestrator",
		canControlChildren: controlScope === "children"
	};
}
//#endregion
export { resolveSubagentCapabilityStore as i, resolveStoredSubagentCapabilities as n, resolveSubagentCapabilities as r, isSubagentEnvelopeSession as t };
