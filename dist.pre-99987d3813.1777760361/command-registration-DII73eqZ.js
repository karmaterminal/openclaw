import { a as normalizeLowercaseStringOrEmpty, s as normalizeOptionalLowercaseString } from "./string-coerce-Bje8XVt9.js";
import { n as resolveGlobalSingleton } from "./global-singleton-COlWgaGc.js";
import { r as logVerbose } from "./globals-DMzUDF8N.js";
import { s as isOperatorScope } from "./operator-scopes-CCNu0CLn.js";
//#region src/plugins/command-registry-state.ts
const PLUGIN_COMMAND_STATE_KEY = Symbol.for("openclaw.pluginCommandsState");
const getState = () => resolveGlobalSingleton(PLUGIN_COMMAND_STATE_KEY, () => ({
	pluginCommands: /* @__PURE__ */ new Map(),
	registryLocked: false
}));
const getPluginCommandMap = () => getState().pluginCommands;
const pluginCommands = new Proxy(/* @__PURE__ */ new Map(), { get(_target, property) {
	const value = Reflect.get(getPluginCommandMap(), property, getPluginCommandMap());
	return typeof value === "function" ? value.bind(getPluginCommandMap()) : value;
} });
function isPluginCommandRegistryLocked() {
	return getState().registryLocked;
}
function setPluginCommandRegistryLocked(locked) {
	getState().registryLocked = locked;
}
function clearPluginCommands() {
	pluginCommands.clear();
}
function clearPluginCommandsForPlugin(pluginId) {
	for (const [key, cmd] of pluginCommands.entries()) if (cmd.pluginId === pluginId) pluginCommands.delete(key);
}
function isTrustedReservedCommandOwner(command) {
	return command.ownership === "reserved";
}
function listRegisteredPluginCommands() {
	return Array.from(pluginCommands.values());
}
function listRegisteredPluginAgentPromptGuidance() {
	const lines = [];
	const seen = /* @__PURE__ */ new Set();
	for (const command of pluginCommands.values()) for (const line of command.agentPromptGuidance ?? []) {
		const trimmed = line.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		lines.push(trimmed);
	}
	return lines;
}
function restorePluginCommands(commands) {
	pluginCommands.clear();
	for (const command of commands) {
		const name = normalizeOptionalLowercaseString(command.name);
		if (!name) continue;
		pluginCommands.set(`/${name}`, command);
	}
}
//#endregion
//#region src/plugins/command-registration.ts
/**
* Reserved command names that plugins cannot override (built-in commands).
*
* Constructed lazily inside validateCommandName to avoid TDZ errors: the
* bundler can place this module's body after call sites within the same
* output chunk, so any module-level const/let would be uninitialized when
* first accessed during plugin registration.
*/
let reservedCommands;
function getReservedCommands() {
	reservedCommands ??= new Set([
		"help",
		"commands",
		"status",
		"diagnostics",
		"codex",
		"whoami",
		"context",
		"btw",
		"stop",
		"restart",
		"reset",
		"new",
		"compact",
		"config",
		"debug",
		"allowlist",
		"activation",
		"skill",
		"subagents",
		"kill",
		"steer",
		"tell",
		"model",
		"models",
		"queue",
		"send",
		"bash",
		"exec",
		"think",
		"verbose",
		"reasoning",
		"elevated",
		"usage"
	]);
	return reservedCommands;
}
function isReservedCommandName(name) {
	const trimmed = normalizeOptionalLowercaseString(name) ?? "";
	return Boolean(trimmed && getReservedCommands().has(trimmed));
}
function validateCommandName(name, opts) {
	const trimmed = normalizeOptionalLowercaseString(name) ?? "";
	if (!trimmed) return "Command name cannot be empty";
	if (!/^[a-z][a-z0-9_-]*$/.test(trimmed)) return "Command name must start with a letter and contain only letters, numbers, hyphens, and underscores";
	if (!opts?.allowReservedCommandNames && getReservedCommands().has(trimmed)) return `Command name "${trimmed}" is reserved by a built-in command`;
	return null;
}
/**
* Validate a plugin command definition without registering it.
* Returns an error message if invalid, or null if valid.
* Shared by both the global registration path and snapshot (non-activating) loads.
*/
function validatePluginCommandDefinition(command, opts) {
	if (typeof command.handler !== "function") return "Command handler must be a function";
	if (typeof command.name !== "string") return "Command name must be a string";
	if (typeof command.description !== "string") return "Command description must be a string";
	if (!command.description.trim()) return "Command description cannot be empty";
	if (command.ownership === "reserved") {
		if (!opts?.allowReservedCommandNames) return "Reserved command ownership is only available to bundled reserved commands";
		if (!isReservedCommandName(command.name)) return `Reserved command ownership requires a reserved command name: ${normalizeOptionalLowercaseString(command.name) ?? ""}`;
	}
	if (command.agentPromptGuidance !== void 0 && !Array.isArray(command.agentPromptGuidance)) return "Agent prompt guidance must be an array of strings";
	for (const [index, guidance] of (command.agentPromptGuidance ?? []).entries()) {
		if (typeof guidance !== "string") return `Agent prompt guidance ${index + 1} must be a string`;
		if (!guidance.trim()) return `Agent prompt guidance ${index + 1} cannot be empty`;
	}
	if (command.requiredScopes !== void 0) {
		if (!Array.isArray(command.requiredScopes)) return "Command requiredScopes must be an array of operator scopes";
		const unknownScope = command.requiredScopes.find((scope) => !isOperatorScope(scope));
		if (unknownScope) return typeof unknownScope === "string" ? `Command requiredScopes contains unknown operator scope: ${unknownScope}` : "Command requiredScopes contains unknown operator scope";
	}
	const nameError = validateCommandName(command.name.trim(), opts);
	if (nameError) return nameError;
	for (const [label, alias] of Object.entries(command.nativeNames ?? {})) {
		if (typeof alias !== "string") continue;
		const aliasError = validateCommandName(alias.trim());
		if (aliasError) return `Native command alias "${label}" invalid: ${aliasError}`;
	}
	for (const [label, message] of Object.entries(command.nativeProgressMessages ?? {})) {
		if (typeof message !== "string") return `Native progress message "${label}" must be a string`;
		if (!message.trim()) return `Native progress message "${label}" cannot be empty`;
	}
	return null;
}
function listPluginInvocationKeys(command) {
	const keys = /* @__PURE__ */ new Set();
	const push = (value) => {
		const normalized = normalizeOptionalLowercaseString(value);
		if (!normalized) return;
		keys.add(`/${normalized}`);
	};
	push(command.name);
	for (const alias of Object.values(command.nativeNames ?? {})) if (typeof alias === "string") push(alias);
	return [...keys];
}
function registerPluginCommand(pluginId, command, opts) {
	if (isPluginCommandRegistryLocked()) return {
		ok: false,
		error: "Cannot register commands while processing is in progress"
	};
	if (command.ownership === "reserved") return {
		ok: false,
		error: "Reserved command ownership is only available to bundled reserved commands"
	};
	const definitionError = validatePluginCommandDefinition(command, opts);
	if (definitionError) return {
		ok: false,
		error: definitionError
	};
	const name = command.name.trim();
	const normalizedName = normalizeLowercaseStringOrEmpty(name);
	const description = command.description.trim();
	const normalizedCommand = {
		...command,
		name,
		description,
		...command.agentPromptGuidance ? { agentPromptGuidance: command.agentPromptGuidance.map((line) => line.trim()) } : {}
	};
	const invocationKeys = listPluginInvocationKeys(normalizedCommand);
	const key = `/${normalizedName}`;
	for (const invocationKey of invocationKeys) {
		const existing = pluginCommands.get(invocationKey) ?? Array.from(pluginCommands.values()).find((candidate) => listPluginInvocationKeys(candidate).includes(invocationKey));
		if (existing) return {
			ok: false,
			error: `Command "${invocationKey.slice(1)}" already registered by plugin "${existing.pluginId}"`
		};
	}
	pluginCommands.set(key, {
		...normalizedCommand,
		pluginId,
		pluginName: opts?.pluginName,
		pluginRoot: opts?.pluginRoot
	});
	logVerbose(`Registered plugin command: ${key} (plugin: ${pluginId})`);
	return { ok: true };
}
//#endregion
export { validatePluginCommandDefinition as a, isTrustedReservedCommandOwner as c, pluginCommands as d, restorePluginCommands as f, validateCommandName as i, listRegisteredPluginAgentPromptGuidance as l, listPluginInvocationKeys as n, clearPluginCommands as o, setPluginCommandRegistryLocked as p, registerPluginCommand as r, clearPluginCommandsForPlugin as s, isReservedCommandName as t, listRegisteredPluginCommands as u };
