import { AcpRuntimeError } from "./runtime-api.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { ACPX_BACKEND_ID, AcpxRuntime as AcpxRuntime$1, createAcpRuntime, createAgentRegistry, createFileSessionStore, decodeAcpxRuntimeHandleState, encodeAcpxRuntimeHandleState } from "acpx/runtime";
//#region extensions/acpx/src/runtime.ts
function readSessionRecordName(record) {
	if (typeof record !== "object" || record === null) return "";
	const { name } = record;
	return typeof name === "string" ? name.trim() : "";
}
function createResetAwareSessionStore(baseStore) {
	const freshSessionKeys = /* @__PURE__ */ new Set();
	return {
		async load(sessionId) {
			const normalized = sessionId.trim();
			if (normalized && freshSessionKeys.has(normalized)) return;
			return await baseStore.load(sessionId);
		},
		async save(record) {
			await baseStore.save(record);
			const sessionName = readSessionRecordName(record);
			if (sessionName) freshSessionKeys.delete(sessionName);
		},
		markFresh(sessionKey) {
			const normalized = sessionKey.trim();
			if (normalized) freshSessionKeys.add(normalized);
		}
	};
}
const OPENCLAW_BRIDGE_EXECUTABLE = "openclaw";
const OPENCLAW_BRIDGE_SUBCOMMAND = "acp";
const CODEX_ACP_AGENT_ID = "codex";
const CODEX_ACP_OPENCLAW_PREFIX = "openai-codex/";
const CODEX_ACP_REASONING_EFFORTS = new Set([
	"low",
	"medium",
	"high",
	"xhigh"
]);
const CODEX_ACP_THINKING_ALIASES = new Map([
	["off", void 0],
	["minimal", "low"],
	["low", "low"],
	["medium", "medium"],
	["high", "high"],
	["x-high", "xhigh"],
	["x_high", "xhigh"],
	["extra-high", "xhigh"],
	["extra_high", "xhigh"],
	["extra high", "xhigh"],
	["xhigh", "xhigh"]
]);
function normalizeAgentName(value) {
	const normalized = value?.trim().toLowerCase();
	return normalized ? normalized : void 0;
}
function readAgentFromSessionKey(sessionKey) {
	const normalized = sessionKey?.trim();
	if (!normalized) return;
	return normalizeAgentName(/^agent:(?<agent>[^:]+):/i.exec(normalized)?.groups?.agent);
}
function readAgentFromHandle(handle) {
	const decoded = decodeAcpxRuntimeHandleState(handle.runtimeSessionName);
	if (typeof decoded === "object" && decoded !== null) {
		const { agent } = decoded;
		if (typeof agent === "string") return normalizeAgentName(agent) ?? readAgentFromSessionKey(handle.sessionKey);
	}
	return readAgentFromSessionKey(handle.sessionKey);
}
function readAgentCommandFromRecord(record) {
	if (typeof record !== "object" || record === null) return;
	const { agentCommand } = record;
	return typeof agentCommand === "string" ? agentCommand.trim() || void 0 : void 0;
}
function splitCommandParts(value) {
	const parts = [];
	let current = "";
	let quote = null;
	let escaping = false;
	for (const ch of value) {
		if (escaping) {
			current += ch;
			escaping = false;
			continue;
		}
		if (ch === "\\" && quote !== "'") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (ch === quote) quote = null;
			else current += ch;
			continue;
		}
		if (ch === "'" || ch === "\"") {
			quote = ch;
			continue;
		}
		if (/\s/.test(ch)) {
			if (current) {
				parts.push(current);
				current = "";
			}
			continue;
		}
		current += ch;
	}
	if (escaping) current += "\\";
	if (current) parts.push(current);
	return parts;
}
function basename(value) {
	return value.split(/[\\/]/).pop() ?? value;
}
function isEnvAssignment(value) {
	return /^[A-Za-z_][A-Za-z0-9_]*=/.test(value);
}
function unwrapEnvCommand(parts) {
	if (!parts.length || basename(parts[0]) !== "env") return parts;
	let index = 1;
	while (index < parts.length && isEnvAssignment(parts[index])) index += 1;
	return parts.slice(index);
}
function isOpenClawBridgeCommand(command) {
	if (!command) return false;
	const parts = unwrapEnvCommand(splitCommandParts(command.trim()));
	if (basename(parts[0] ?? "") === OPENCLAW_BRIDGE_EXECUTABLE) return parts[1] === OPENCLAW_BRIDGE_SUBCOMMAND;
	if (basename(parts[0] ?? "") !== "node") return false;
	const scriptName = basename(parts[1] ?? "");
	return /^openclaw(?:\.[cm]?js)?$/i.test(scriptName) && parts[2] === OPENCLAW_BRIDGE_SUBCOMMAND;
}
function isCodexAcpPackageSpec(value) {
	return /^@zed-industries\/codex-acp(?:@.+)?$/i.test(value.trim());
}
function isCodexAcpCommand(command) {
	if (!command) return false;
	const parts = unwrapEnvCommand(splitCommandParts(command.trim()));
	if (!parts.length) return false;
	if (parts.some(isCodexAcpPackageSpec)) return true;
	const commandName = basename(parts[0] ?? "");
	if (/^codex-acp(?:\.exe)?$/i.test(commandName)) return true;
	if (commandName !== "node") return false;
	const scriptName = basename(parts[1] ?? "");
	return /^codex-acp(?:-wrapper)?(?:\.[cm]?js)?$/i.test(scriptName);
}
function failUnsupportedCodexAcpModel(rawModel, detail) {
	throw new AcpRuntimeError("ACP_INVALID_RUNTIME_OPTION", detail ?? `Codex ACP model "${rawModel}" is not supported. Use openai-codex/<model> or <model>/<reasoning-effort>.`);
}
const SUPPORTED_RUNTIME_SESSION_MODES = new Set(["persistent", "oneshot"]);
function assertSupportedRuntimeSessionMode(mode) {
	if (typeof mode === "string" && SUPPORTED_RUNTIME_SESSION_MODES.has(mode)) return;
	const supported = Array.from(SUPPORTED_RUNTIME_SESSION_MODES).join(", ");
	throw new AcpRuntimeError("ACP_INVALID_RUNTIME_OPTION", `Unsupported ACP runtime session mode ${JSON.stringify(mode)}. Expected one of: ${supported}.`);
}
function failUnsupportedCodexAcpThinking(rawThinking) {
	throw new AcpRuntimeError("ACP_INVALID_RUNTIME_OPTION", `Codex ACP thinking level "${rawThinking}" is not supported. Use off, minimal, low, medium, high, or xhigh.`);
}
function normalizeCodexAcpReasoningEffort(rawThinking) {
	const normalized = rawThinking?.trim().toLowerCase();
	if (!normalized) return;
	if (!CODEX_ACP_THINKING_ALIASES.has(normalized)) failUnsupportedCodexAcpThinking(rawThinking ?? "");
	return CODEX_ACP_THINKING_ALIASES.get(normalized);
}
function normalizeCodexAcpModelOverride(rawModel, rawThinking) {
	const raw = rawModel?.trim();
	const thinkingReasoningEffort = normalizeCodexAcpReasoningEffort(rawThinking);
	if (!raw) return thinkingReasoningEffort ? { reasoningEffort: thinkingReasoningEffort } : void 0;
	let value = raw;
	if (value.toLowerCase().startsWith(CODEX_ACP_OPENCLAW_PREFIX)) value = value.slice(13);
	const parts = value.split("/");
	if (parts.length > 2) failUnsupportedCodexAcpModel(raw, `Codex ACP model "${raw}" is not supported. Use openai-codex/<model> or <model>/<reasoning-effort>.`);
	const model = (parts[0] ?? "").trim();
	const modelReasoningEffort = normalizeCodexAcpReasoningEffort(parts[1]);
	if (!model) failUnsupportedCodexAcpModel(raw, `Codex ACP model "${raw}" is not supported. Use openai-codex/<model> or <model>/<reasoning-effort>.`);
	const reasoningEffort = thinkingReasoningEffort ?? modelReasoningEffort;
	if (reasoningEffort && !CODEX_ACP_REASONING_EFFORTS.has(reasoningEffort)) failUnsupportedCodexAcpThinking(reasoningEffort);
	return {
		model,
		...reasoningEffort ? { reasoningEffort } : {}
	};
}
function codexAcpSessionModelId(override) {
	if (!override.model) return "";
	return override.reasoningEffort ? `${override.model}/${override.reasoningEffort}` : override.model;
}
function quoteShellArg(value) {
	if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
	return `'${value.replace(/'/g, "'\\''")}'`;
}
function appendCodexAcpConfigOverrides(command, override) {
	const configArgs = override.model ? [`model=${override.model}`] : [];
	if (override.reasoningEffort) configArgs.push(`model_reasoning_effort=${override.reasoningEffort}`);
	if (configArgs.length === 0) return command;
	return `${command} ${configArgs.map((arg) => `-c ${quoteShellArg(arg)}`).join(" ")}`;
}
function createModelScopedAgentRegistry(params) {
	return {
		resolve(agentName) {
			const command = params.agentRegistry.resolve(agentName);
			const override = params.scope.getStore();
			if (!override || normalizeAgentName(agentName) !== CODEX_ACP_AGENT_ID || typeof command !== "string" || !isCodexAcpCommand(command)) return command;
			return appendCodexAcpConfigOverrides(command, override);
		},
		list() {
			return params.agentRegistry.list();
		}
	};
}
function resolveAgentCommand(params) {
	const normalizedAgentName = normalizeAgentName(params.agentName);
	if (!normalizedAgentName) return;
	const resolvedCommand = params.agentRegistry.resolve(normalizedAgentName);
	return typeof resolvedCommand === "string" ? resolvedCommand.trim() || void 0 : void 0;
}
function resolveProbeAgentName(options) {
	const { probeAgent } = options;
	return normalizeAgentName(typeof probeAgent === "string" ? probeAgent : void 0) ?? "codex";
}
function resolveAgentCommandForName(params) {
	return resolveAgentCommand(params);
}
function shouldUseBridgeSafeDelegateForCommand(command) {
	return isOpenClawBridgeCommand(command);
}
function shouldUseDistinctBridgeDelegate(options) {
	const { mcpServers } = options;
	return Array.isArray(mcpServers) && mcpServers.length > 0;
}
var AcpxRuntime = class {
	constructor(options, testOptions) {
		this.codexAcpModelOverrideScope = new AsyncLocalStorage();
		this.sessionStore = createResetAwareSessionStore(options.sessionStore);
		this.agentRegistry = options.agentRegistry;
		this.scopedAgentRegistry = createModelScopedAgentRegistry({
			agentRegistry: this.agentRegistry,
			scope: this.codexAcpModelOverrideScope
		});
		const sharedOptions = {
			...options,
			sessionStore: this.sessionStore,
			agentRegistry: this.scopedAgentRegistry
		};
		this.delegate = new AcpxRuntime$1(sharedOptions, testOptions);
		this.bridgeSafeDelegate = shouldUseDistinctBridgeDelegate(options) ? new AcpxRuntime$1({
			...sharedOptions,
			mcpServers: []
		}, testOptions) : this.delegate;
		this.probeDelegate = this.resolveDelegateForAgent(resolveProbeAgentName(options));
	}
	resolveDelegateForAgent(agentName) {
		const command = resolveAgentCommandForName({
			agentName,
			agentRegistry: this.agentRegistry
		});
		return this.resolveDelegateForCommand(command);
	}
	resolveDelegateForCommand(command) {
		return shouldUseBridgeSafeDelegateForCommand(command) ? this.bridgeSafeDelegate : this.delegate;
	}
	async resolveDelegateForHandle(handle) {
		const recordCommand = readAgentCommandFromRecord(await this.sessionStore.load(handle.acpxRecordId ?? handle.sessionKey));
		if (recordCommand) return this.resolveDelegateForCommand(recordCommand);
		return this.resolveDelegateForAgent(readAgentFromHandle(handle));
	}
	async resolveCommandForHandle(handle) {
		const recordCommand = readAgentCommandFromRecord(await this.sessionStore.load(handle.acpxRecordId ?? handle.sessionKey));
		if (recordCommand) return recordCommand;
		return resolveAgentCommandForName({
			agentName: readAgentFromHandle(handle),
			agentRegistry: this.agentRegistry
		});
	}
	isHealthy() {
		return this.probeDelegate.isHealthy();
	}
	probeAvailability() {
		return this.probeDelegate.probeAvailability();
	}
	doctor() {
		return this.probeDelegate.doctor();
	}
	async ensureSession(input) {
		assertSupportedRuntimeSessionMode(input.mode);
		const command = resolveAgentCommandForName({
			agentName: input.agent,
			agentRegistry: this.agentRegistry
		});
		const delegate = this.resolveDelegateForCommand(command);
		const codexModelOverride = normalizeAgentName(input.agent) === CODEX_ACP_AGENT_ID && isCodexAcpCommand(command) ? normalizeCodexAcpModelOverride(input.model, input.thinking) : void 0;
		if (!codexModelOverride) return delegate.ensureSession(input);
		const normalizedInput = {
			...input,
			...codexAcpSessionModelId(codexModelOverride) ? { model: codexAcpSessionModelId(codexModelOverride) } : {}
		};
		return this.codexAcpModelOverrideScope.run(codexModelOverride, () => delegate.ensureSession(normalizedInput));
	}
	async *runTurn(input) {
		yield* (await this.resolveDelegateForHandle(input.handle)).runTurn(input);
	}
	getCapabilities() {
		return this.delegate.getCapabilities();
	}
	async getStatus(input) {
		return (await this.resolveDelegateForHandle(input.handle)).getStatus(input);
	}
	async setMode(input) {
		await (await this.resolveDelegateForHandle(input.handle)).setMode(input);
	}
	async setConfigOption(input) {
		const delegate = await this.resolveDelegateForHandle(input.handle);
		const command = await this.resolveCommandForHandle(input.handle);
		const key = input.key.trim().toLowerCase();
		if (isCodexAcpCommand(command)) {
			if (key === "timeout" || key === "timeout_seconds") return;
			if (key === "model" || key === "thinking" || key === "thought_level" || key === "reasoning_effort") {
				const override = key === "model" ? normalizeCodexAcpModelOverride(input.value) : normalizeCodexAcpModelOverride(void 0, input.value);
				if (!override && key !== "model") return;
				if (override) {
					if (override.model) await delegate.setConfigOption({
						...input,
						key: "model",
						value: override.model
					});
					if (override.reasoningEffort) await delegate.setConfigOption({
						...input,
						key: "reasoning_effort",
						value: override.reasoningEffort
					});
					return;
				}
			}
		}
		await delegate.setConfigOption(input);
	}
	async cancel(input) {
		await (await this.resolveDelegateForHandle(input.handle)).cancel(input);
	}
	async prepareFreshSession(input) {
		this.sessionStore.markFresh(input.sessionKey);
	}
	async close(input) {
		await (await this.resolveDelegateForHandle(input.handle)).close({
			handle: input.handle,
			reason: input.reason,
			discardPersistentState: input.discardPersistentState
		});
		if (input.discardPersistentState) this.sessionStore.markFresh(input.handle.sessionKey);
	}
};
const __testing = {
	appendCodexAcpConfigOverrides,
	assertSupportedRuntimeSessionMode,
	codexAcpSessionModelId,
	isCodexAcpCommand,
	normalizeCodexAcpModelOverride
};
//#endregion
export { ACPX_BACKEND_ID, AcpxRuntime, __testing, createAcpRuntime, createAgentRegistry, createFileSessionStore, decodeAcpxRuntimeHandleState, encodeAcpxRuntimeHandleState };
