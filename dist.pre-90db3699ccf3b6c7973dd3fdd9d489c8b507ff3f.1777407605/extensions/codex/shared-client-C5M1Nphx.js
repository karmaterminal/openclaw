import { r as resolveCodexAppServerRuntimeOptions, t as codexAppServerStartOptionsKey } from "./config-C9_NiPaE.js";
import { OPENCLAW_VERSION, embeddedAgentLog } from "openclaw/plugin-sdk/agent-harness-runtime";
import { resolveOpenClawAgentDir as resolveOpenClawAgentDir$1 } from "openclaw/plugin-sdk/provider-auth";
import { prepareCodexAuthBridge } from "openclaw/plugin-sdk/provider-auth-runtime";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import WebSocket from "ws";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region extensions/codex/src/app-server/auth-bridge.ts
const DEFAULT_CODEX_AUTH_PROFILE_ID = "openai-codex:default";
async function bridgeCodexAppServerStartOptions(params) {
	const profileId = params.authProfileId?.trim() || DEFAULT_CODEX_AUTH_PROFILE_ID;
	const bridge = await prepareCodexAuthBridge({
		agentDir: params.agentDir,
		bridgeDir: "harness-auth",
		profileId,
		sourceCodexHome: params.startOptions.env?.CODEX_HOME
	});
	if (!bridge) return params.startOptions;
	return {
		...params.startOptions,
		env: {
			...params.startOptions.env,
			CODEX_HOME: bridge.codexHome
		},
		clearEnv: Array.from(new Set([...params.startOptions.clearEnv ?? [], ...bridge.clearEnv]))
	};
}
//#endregion
//#region extensions/codex/src/app-server/protocol.ts
function isJsonObject(value) {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function isRpcResponse(message) {
	return "id" in message && !("method" in message);
}
//#endregion
//#region extensions/codex/src/app-server/transport-stdio.ts
function createStdioTransport(options) {
	const env = {
		...process.env,
		...options.env
	};
	for (const key of options.clearEnv ?? []) delete env[key];
	return spawn(options.command, options.args, {
		env,
		detached: process.platform !== "win32",
		stdio: [
			"pipe",
			"pipe",
			"pipe"
		]
	});
}
//#endregion
//#region extensions/codex/src/app-server/transport-websocket.ts
function createWebSocketTransport(options) {
	if (!options.url) throw new Error("codex app-server websocket transport requires plugins.entries.codex.config.appServer.url");
	const events = new EventEmitter();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const headers = {
		...options.headers,
		...options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}
	};
	const socket = new WebSocket(options.url, { headers });
	const pendingFrames = [];
	let killed = false;
	const sendFrame = (frame) => {
		const trimmed = frame.trim();
		if (!trimmed) return;
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(trimmed);
			return;
		}
		pendingFrames.push(trimmed);
	};
	socket.once("open", () => {
		for (const frame of pendingFrames.splice(0)) socket.send(frame);
	});
	socket.once("error", (error) => events.emit("error", error));
	socket.once("close", (code, reason) => {
		killed = true;
		events.emit("exit", code, reason.toString("utf8"));
	});
	socket.on("message", (data) => {
		const text = websocketFrameToText(data);
		stdout.write(text.endsWith("\n") ? text : `${text}\n`);
	});
	return {
		stdin: new Writable({ write(chunk, _encoding, callback) {
			for (const frame of chunk.toString("utf8").split("\n")) sendFrame(frame);
			callback();
		} }),
		stdout,
		stderr,
		get killed() {
			return killed;
		},
		kill: () => {
			killed = true;
			socket.close();
		},
		once: (event, listener) => events.once(event, listener)
	};
}
function websocketFrameToText(data) {
	if (typeof data === "string") return data;
	if (Buffer.isBuffer(data)) return data.toString("utf8");
	if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
	return Buffer.from(data).toString("utf8");
}
//#endregion
//#region extensions/codex/src/app-server/transport.ts
function closeCodexAppServerTransport(child, options = {}) {
	child.stdout.destroy?.();
	child.stderr.destroy?.();
	child.stdin.end?.();
	child.stdin.destroy?.();
	signalCodexAppServerTransport(child, "SIGTERM");
	const forceKillDelayMs = options.forceKillDelayMs ?? 1e3;
	const forceKill = setTimeout(() => {
		if (hasCodexAppServerTransportExited(child)) return;
		signalCodexAppServerTransport(child, "SIGKILL");
	}, Math.max(1, forceKillDelayMs));
	forceKill.unref?.();
	child.once("exit", () => clearTimeout(forceKill));
	child.unref?.();
	child.stdout.unref?.();
	child.stderr.unref?.();
	child.stdin.unref?.();
}
function hasCodexAppServerTransportExited(child) {
	return child.exitCode !== null && child.exitCode !== void 0 ? true : child.signalCode !== null && child.signalCode !== void 0;
}
function signalCodexAppServerTransport(child, signal) {
	if (child.pid && process.platform !== "win32") try {
		process.kill(-child.pid, signal);
		return;
	} catch {}
	child.kill?.(signal);
}
//#endregion
//#region extensions/codex/src/app-server/client.ts
const MIN_CODEX_APP_SERVER_VERSION = "0.118.0";
var CodexAppServerRpcError = class extends Error {
	constructor(error, method) {
		super(error.message || `${method} failed`);
		this.name = "CodexAppServerRpcError";
		this.code = error.code;
		this.data = error.data;
	}
};
var CodexAppServerClient = class CodexAppServerClient {
	constructor(child) {
		this.pending = /* @__PURE__ */ new Map();
		this.requestHandlers = /* @__PURE__ */ new Set();
		this.notificationHandlers = /* @__PURE__ */ new Set();
		this.closeHandlers = /* @__PURE__ */ new Set();
		this.nextId = 1;
		this.initialized = false;
		this.closed = false;
		this.child = child;
		this.lines = createInterface({ input: child.stdout });
		this.lines.on("line", (line) => this.handleLine(line));
		child.stderr.on("data", (chunk) => {
			const text = chunk.toString("utf8").trim();
			if (text) embeddedAgentLog.debug(`codex app-server stderr: ${text}`);
		});
		child.once("error", (error) => this.closeWithError(error instanceof Error ? error : new Error(String(error))));
		child.once("exit", (code, signal) => {
			this.closeWithError(/* @__PURE__ */ new Error(`codex app-server exited: code=${formatExitValue(code)} signal=${formatExitValue(signal)}`));
		});
		child.stdin.on?.("error", (error) => this.closeWithError(error instanceof Error ? error : new Error(String(error))));
	}
	static start(options) {
		const defaults = resolveCodexAppServerRuntimeOptions().start;
		const startOptions = {
			...defaults,
			...options,
			headers: options?.headers ?? defaults.headers
		};
		if (startOptions.transport === "websocket") return new CodexAppServerClient(createWebSocketTransport(startOptions));
		return new CodexAppServerClient(createStdioTransport(startOptions));
	}
	static fromTransportForTests(child) {
		return new CodexAppServerClient(child);
	}
	async initialize() {
		if (this.initialized) return;
		assertSupportedCodexAppServerVersion(await this.request("initialize", {
			clientInfo: {
				name: "openclaw",
				title: "OpenClaw",
				version: OPENCLAW_VERSION
			},
			capabilities: { experimentalApi: true }
		}));
		this.notify("initialized");
		this.initialized = true;
	}
	request(method, params, options = {}) {
		if (this.closed) return Promise.reject(/* @__PURE__ */ new Error("codex app-server client is closed"));
		if (options.signal?.aborted) return Promise.reject(/* @__PURE__ */ new Error(`${method} aborted`));
		const id = this.nextId++;
		const message = {
			id,
			method,
			params
		};
		return new Promise((resolve, reject) => {
			let timeout;
			let cleanupAbort;
			const cleanup = () => {
				if (timeout) {
					clearTimeout(timeout);
					timeout = void 0;
				}
				cleanupAbort?.();
				cleanupAbort = void 0;
			};
			const rejectPending = (error) => {
				if (!this.pending.has(id)) return;
				this.pending.delete(id);
				cleanup();
				reject(error);
			};
			if (options.timeoutMs && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
				timeout = setTimeout(() => rejectPending(/* @__PURE__ */ new Error(`${method} timed out`)), Math.max(100, options.timeoutMs));
				timeout.unref?.();
			}
			if (options.signal) {
				const abortListener = () => rejectPending(/* @__PURE__ */ new Error(`${method} aborted`));
				options.signal.addEventListener("abort", abortListener, { once: true });
				cleanupAbort = () => options.signal?.removeEventListener("abort", abortListener);
			}
			this.pending.set(id, {
				method,
				resolve: (value) => {
					cleanup();
					resolve(value);
				},
				reject: (error) => {
					cleanup();
					reject(error);
				},
				cleanup
			});
			if (options.signal?.aborted) {
				rejectPending(/* @__PURE__ */ new Error(`${method} aborted`));
				return;
			}
			try {
				this.writeMessage(message);
			} catch (error) {
				rejectPending(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}
	notify(method, params) {
		this.writeMessage({
			method,
			params
		});
	}
	addRequestHandler(handler) {
		this.requestHandlers.add(handler);
		return () => this.requestHandlers.delete(handler);
	}
	addNotificationHandler(handler) {
		this.notificationHandlers.add(handler);
		return () => this.notificationHandlers.delete(handler);
	}
	addCloseHandler(handler) {
		this.closeHandlers.add(handler);
		return () => this.closeHandlers.delete(handler);
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.lines.close();
		this.rejectPendingRequests(/* @__PURE__ */ new Error("codex app-server client is closed"));
		closeCodexAppServerTransport(this.child);
	}
	writeMessage(message) {
		if (this.closed) return;
		this.child.stdin.write(`${JSON.stringify(message)}\n`);
	}
	handleLine(line) {
		const trimmed = line.trim();
		if (!trimmed) return;
		let parsed;
		try {
			parsed = JSON.parse(trimmed);
		} catch (error) {
			embeddedAgentLog.warn("failed to parse codex app-server message", { error });
			return;
		}
		if (!parsed || typeof parsed !== "object") return;
		const message = parsed;
		if (isRpcResponse(message)) {
			this.handleResponse(message);
			return;
		}
		if (!("method" in message)) return;
		if ("id" in message && message.id !== void 0) {
			this.handleServerRequest({
				id: message.id,
				method: message.method,
				params: message.params
			});
			return;
		}
		this.handleNotification({
			method: message.method,
			params: message.params
		});
	}
	handleResponse(response) {
		const pending = this.pending.get(response.id);
		if (!pending) return;
		this.pending.delete(response.id);
		if (response.error) {
			pending.reject(new CodexAppServerRpcError(response.error, pending.method));
			return;
		}
		pending.resolve(response.result);
	}
	async handleServerRequest(request) {
		try {
			for (const handler of this.requestHandlers) {
				const result = await handler(request);
				if (result !== void 0) {
					this.writeMessage({
						id: request.id,
						result
					});
					return;
				}
			}
			this.writeMessage({
				id: request.id,
				result: defaultServerRequestResponse(request)
			});
		} catch (error) {
			this.writeMessage({
				id: request.id,
				error: { message: error instanceof Error ? error.message : String(error) }
			});
		}
	}
	handleNotification(notification) {
		for (const handler of this.notificationHandlers) Promise.resolve(handler(notification)).catch((error) => {
			embeddedAgentLog.warn("codex app-server notification handler failed", { error });
		});
	}
	closeWithError(error) {
		if (this.closed) return;
		this.closed = true;
		this.lines.close();
		this.rejectPendingRequests(error);
		closeCodexAppServerTransport(this.child);
	}
	rejectPendingRequests(error) {
		for (const pending of this.pending.values()) {
			pending.cleanup();
			pending.reject(error);
		}
		this.pending.clear();
		for (const handler of this.closeHandlers) handler(this);
	}
};
function defaultServerRequestResponse(request) {
	if (request.method === "item/tool/call") return {
		contentItems: [{
			type: "inputText",
			text: "OpenClaw did not register a handler for this app-server tool call."
		}],
		success: false
	};
	if (request.method === "item/commandExecution/requestApproval" || request.method === "item/fileChange/requestApproval") return { decision: "decline" };
	if (request.method === "item/permissions/requestApproval") return {
		permissions: {},
		scope: "turn"
	};
	if (isCodexAppServerApprovalRequest(request.method)) return {
		decision: "decline",
		reason: "OpenClaw codex app-server bridge does not grant native approvals yet."
	};
	if (request.method === "item/tool/requestUserInput") return { answers: {} };
	if (request.method === "mcpServer/elicitation/request") return { action: "decline" };
	return {};
}
function assertSupportedCodexAppServerVersion(response) {
	const detectedVersion = readCodexVersionFromUserAgent(response.userAgent);
	if (!detectedVersion) throw new Error(`Codex app-server ${MIN_CODEX_APP_SERVER_VERSION} or newer is required, but OpenClaw could not determine the running Codex version. Upgrade Codex CLI and retry.`);
	if (compareVersions(detectedVersion, "0.118.0") < 0) throw new Error(`Codex app-server ${MIN_CODEX_APP_SERVER_VERSION} or newer is required, but detected ${detectedVersion}. Upgrade Codex CLI and retry.`);
}
function readCodexVersionFromUserAgent(userAgent) {
	return (userAgent?.match(/^[^/]+\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?:[\s(]|$)/))?.[1];
}
function compareVersions(left, right) {
	const leftParts = numericVersionParts(left);
	const rightParts = numericVersionParts(right);
	for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
		const leftPart = leftParts[index] ?? 0;
		const rightPart = rightParts[index] ?? 0;
		if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
	}
	return 0;
}
function numericVersionParts(version) {
	return version.split(/[+-]/, 1)[0].split(".").map((part) => Number.parseInt(part, 10)).map((part) => Number.isFinite(part) ? part : 0);
}
const CODEX_APP_SERVER_APPROVAL_REQUEST_METHODS = new Set([
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
	"item/permissions/requestApproval"
]);
function isCodexAppServerApprovalRequest(method) {
	return CODEX_APP_SERVER_APPROVAL_REQUEST_METHODS.has(method);
}
function formatExitValue(value) {
	if (value === null || value === void 0) return "null";
	if (typeof value === "string" || typeof value === "number") return String(value);
	return "unknown";
}
//#endregion
//#region extensions/codex/src/app-server/timeout.ts
async function withTimeout(promise, timeoutMs, timeoutMessage) {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return await promise;
	let timeout;
	try {
		return await Promise.race([promise, new Promise((_, reject) => {
			timeout = setTimeout(() => reject(new Error(timeoutMessage)), Math.max(1, timeoutMs));
		})]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
//#endregion
//#region extensions/codex/src/app-server/shared-client.ts
var shared_client_exports = /* @__PURE__ */ __exportAll({
	clearSharedCodexAppServerClient: () => clearSharedCodexAppServerClient,
	createIsolatedCodexAppServerClient: () => createIsolatedCodexAppServerClient,
	getSharedCodexAppServerClient: () => getSharedCodexAppServerClient
});
const SHARED_CODEX_APP_SERVER_CLIENT_STATE = Symbol.for("openclaw.codexAppServerClientState");
function getSharedCodexAppServerClientState() {
	const globalState = globalThis;
	globalState[SHARED_CODEX_APP_SERVER_CLIENT_STATE] ??= {};
	return globalState[SHARED_CODEX_APP_SERVER_CLIENT_STATE];
}
async function getSharedCodexAppServerClient(options) {
	const state = getSharedCodexAppServerClientState();
	const startOptions = await bridgeCodexAppServerStartOptions({
		startOptions: options?.startOptions ?? resolveCodexAppServerRuntimeOptions().start,
		agentDir: resolveOpenClawAgentDir$1(),
		authProfileId: options?.authProfileId
	});
	const key = codexAppServerStartOptionsKey(startOptions);
	if (state.key && state.key !== key) clearSharedCodexAppServerClient();
	state.key = key;
	const sharedPromise = state.promise ?? (state.promise = (async () => {
		const client = CodexAppServerClient.start(startOptions);
		state.client = client;
		client.addCloseHandler(clearSharedClientIfCurrent);
		try {
			await client.initialize();
			return client;
		} catch (error) {
			client.close();
			throw error;
		}
	})());
	try {
		return await withTimeout(sharedPromise, options?.timeoutMs ?? 0, "codex app-server initialize timed out");
	} catch (error) {
		if (state.promise === sharedPromise && state.key === key) clearSharedCodexAppServerClient();
		throw error;
	}
}
async function createIsolatedCodexAppServerClient(options) {
	const startOptions = await bridgeCodexAppServerStartOptions({
		startOptions: options?.startOptions ?? resolveCodexAppServerRuntimeOptions().start,
		agentDir: resolveOpenClawAgentDir$1(),
		authProfileId: options?.authProfileId
	});
	const client = CodexAppServerClient.start(startOptions);
	const initialize = client.initialize();
	try {
		await withTimeout(initialize, options?.timeoutMs ?? 0, "codex app-server initialize timed out");
		return client;
	} catch (error) {
		client.close();
		initialize.catch(() => void 0);
		throw error;
	}
}
function clearSharedCodexAppServerClient() {
	const state = getSharedCodexAppServerClientState();
	const client = state.client;
	state.client = void 0;
	state.promise = void 0;
	state.key = void 0;
	client?.close();
}
function clearSharedClientIfCurrent(client) {
	const state = getSharedCodexAppServerClientState();
	if (state.client !== client) return;
	state.client = void 0;
	state.promise = void 0;
	state.key = void 0;
}
//#endregion
export { withTimeout as a, isJsonObject as c, shared_client_exports as i, createIsolatedCodexAppServerClient as n, CodexAppServerRpcError as o, getSharedCodexAppServerClient as r, isCodexAppServerApprovalRequest as s, clearSharedCodexAppServerClient as t };
