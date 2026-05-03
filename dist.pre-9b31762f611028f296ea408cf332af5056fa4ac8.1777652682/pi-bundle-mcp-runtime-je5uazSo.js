import { a as normalizeLowercaseStringOrEmpty, c as normalizeOptionalString, s as normalizeOptionalLowercaseString } from "./string-coerce-C1IzJjqi.js";
import { t as sanitizeForLog } from "./ansi-CTONNaNi.js";
import { n as resolveGlobalSingleton } from "./global-singleton-BvJ0xECh.js";
import { r as isDangerousHostEnvVarName } from "./host-env-security-BS88dAsz.js";
import { a as logWarn, t as logDebug } from "./logger-3yj7caI3.js";
import { t as killProcessTree } from "./kill-tree-Bh962Spm.js";
import { r as loadEnabledBundleMcpConfig } from "./bundle-mcp-C7WjX_Iv.js";
import { a as redactSensitiveUrl, o as redactSensitiveUrlLikeString } from "./redact-sensitive-url-B6iXpimP.js";
import { i as loadUndiciRuntimeDeps } from "./undici-runtime-B2NrLZxe.js";
import { n as normalizeConfiguredMcpServers } from "./mcp-config-CajS3Zv7.js";
import { t as prepareOomScoreAdjustedSpawn } from "./linux-oom-score-LS6n6hry.js";
import process from "node:process";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { PassThrough } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
//#region src/agents/mcp-config-shared.ts
function isMcpConfigRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function toMcpFilteredStringRecord(value, options) {
	if (!isMcpConfigRecord(value)) return;
	let droppedByKey = false;
	const entries = Object.entries(value).map(([key, entry]) => {
		if (options?.shouldDropKey?.(key)) {
			droppedByKey = true;
			options?.onDroppedEntry?.(key, entry);
			return null;
		}
		if (typeof entry === "string") return [key, entry];
		if (typeof entry === "number" || typeof entry === "boolean") return [key, String(entry)];
		options?.onDroppedEntry?.(key, entry);
		return null;
	}).filter((entry) => entry !== null);
	if (entries.length === 0 && droppedByKey && options?.preserveEmptyWhenKeysDropped) return {};
	return entries.length > 0 ? Object.fromEntries(entries) : void 0;
}
function toMcpStringRecord(value, options) {
	return toMcpFilteredStringRecord(value, options);
}
function toMcpEnvRecord(value, options) {
	return toMcpFilteredStringRecord(value, {
		...options,
		preserveEmptyWhenKeysDropped: true,
		shouldDropKey: (key) => isDangerousHostEnvVarName(key)
	});
}
function toMcpStringArray(value) {
	if (!Array.isArray(value)) return;
	const entries = value.filter((entry) => typeof entry === "string");
	return entries.length > 0 ? entries : [];
}
//#endregion
//#region src/agents/mcp-stdio.ts
function resolveStdioMcpServerLaunchConfig(raw, options) {
	if (!isMcpConfigRecord(raw)) return {
		ok: false,
		reason: "server config must be an object"
	};
	if (typeof raw.command !== "string" || raw.command.trim().length === 0) {
		if (typeof raw.url === "string" && raw.url.trim().length > 0) return {
			ok: false,
			reason: "not a stdio server (has url)"
		};
		return {
			ok: false,
			reason: "its command is missing"
		};
	}
	const cwd = typeof raw.cwd === "string" && raw.cwd.trim().length > 0 ? raw.cwd : typeof raw.workingDirectory === "string" && raw.workingDirectory.trim().length > 0 ? raw.workingDirectory : void 0;
	return {
		ok: true,
		config: {
			command: raw.command,
			args: toMcpStringArray(raw.args),
			env: toMcpEnvRecord(raw.env, { onDroppedEntry: options?.onDroppedEnv }),
			cwd
		}
	};
}
function describeStdioMcpServerLaunchConfig(config) {
	const args = Array.isArray(config.args) && config.args.length > 0 ? ` ${config.args.join(" ")}` : "";
	const cwd = config.cwd ? ` (cwd=${config.cwd})` : "";
	return `${config.command}${args}${cwd}`;
}
//#endregion
//#region src/agents/pi-bundle-mcp-names.ts
const TOOL_NAME_SAFE_RE = /[^A-Za-z0-9_-]/g;
const TOOL_NAME_MAX_PREFIX = 30;
const TOOL_NAME_MAX_TOTAL = 64;
function sanitizeToolFragment(raw, fallback, maxChars) {
	const normalized = raw.trim().replace(TOOL_NAME_SAFE_RE, "-") || fallback;
	if (!maxChars) return normalized;
	return normalized.length > maxChars ? normalized.slice(0, maxChars) : normalized;
}
function sanitizeServerName(raw, usedNames) {
	const base = sanitizeToolFragment(raw, "mcp", TOOL_NAME_MAX_PREFIX);
	let candidate = base;
	let n = 2;
	while (usedNames.has(normalizeLowercaseStringOrEmpty(candidate))) {
		const suffix = `-${n}`;
		candidate = `${base.slice(0, Math.max(1, TOOL_NAME_MAX_PREFIX - suffix.length))}${suffix}`;
		n += 1;
	}
	usedNames.add(normalizeLowercaseStringOrEmpty(candidate));
	return candidate;
}
function sanitizeToolName(raw) {
	return sanitizeToolFragment(raw, "tool");
}
function normalizeReservedToolNames(names) {
	return new Set(Array.from(names ?? [], (name) => normalizeOptionalLowercaseString(name)).filter((name) => Boolean(name)));
}
function buildSafeToolName(params) {
	const cleanedToolName = sanitizeToolName(params.toolName);
	const maxToolChars = Math.max(1, TOOL_NAME_MAX_TOTAL - params.serverName.length - 2);
	const truncatedToolName = cleanedToolName.slice(0, maxToolChars);
	let candidateToolName = truncatedToolName || "tool";
	let candidate = `${params.serverName}__${candidateToolName}`;
	let n = 2;
	while (params.reservedNames.has(normalizeLowercaseStringOrEmpty(candidate))) {
		const suffix = `-${n}`;
		candidateToolName = `${(truncatedToolName || "tool").slice(0, Math.max(1, maxToolChars - suffix.length))}${suffix}`;
		candidate = `${params.serverName}__${candidateToolName}`;
		n += 1;
	}
	return candidate;
}
//#endregion
//#region src/agents/embedded-pi-mcp.ts
function loadEmbeddedPiMcpConfig(params) {
	const bundleMcp = loadEnabledBundleMcpConfig({
		workspaceDir: params.workspaceDir,
		cfg: params.cfg
	});
	const configuredMcp = normalizeConfiguredMcpServers(params.cfg?.mcp?.servers);
	return {
		mcpServers: {
			...bundleMcp.config.mcpServers,
			...configuredMcp
		},
		diagnostics: bundleMcp.diagnostics
	};
}
//#endregion
//#region src/agents/mcp-stdio-transport.ts
const CLOSE_TIMEOUT_MS = 2e3;
function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms).unref();
	});
}
var OpenClawStdioClientTransport = class {
	constructor(serverParams) {
		this.serverParams = serverParams;
		this.readBuffer = new ReadBuffer();
		this.stderrStream = null;
		if (serverParams.stderr === "pipe" || serverParams.stderr === "overlapped") this.stderrStream = new PassThrough();
	}
	async start() {
		if (this.process) throw new Error("OpenClawStdioClientTransport already started; Client.connect() starts transports automatically.");
		await new Promise((resolve, reject) => {
			const baseEnv = {
				...getDefaultEnvironment(),
				...this.serverParams.env
			};
			const preparedSpawn = prepareOomScoreAdjustedSpawn(this.serverParams.command, this.serverParams.args ?? [], { env: baseEnv });
			const child = spawn(preparedSpawn.command, preparedSpawn.args, {
				cwd: this.serverParams.cwd,
				detached: process.platform !== "win32",
				env: preparedSpawn.env,
				shell: false,
				stdio: [
					"pipe",
					"pipe",
					this.serverParams.stderr ?? "inherit"
				],
				windowsHide: process.platform === "win32"
			});
			this.process = child;
			child.on("error", (error) => {
				reject(error);
				this.onerror?.(error);
			});
			child.on("spawn", () => resolve());
			child.on("close", () => {
				this.process = void 0;
				this.onclose?.();
			});
			child.stdin?.on("error", (error) => this.onerror?.(error));
			child.stdout?.on("data", (chunk) => {
				this.readBuffer.append(chunk);
				this.processReadBuffer();
			});
			child.stdout?.on("error", (error) => this.onerror?.(error));
			if (this.stderrStream && child.stderr) child.stderr.pipe(this.stderrStream);
		});
	}
	get stderr() {
		return this.stderrStream ?? this.process?.stderr ?? null;
	}
	get pid() {
		return this.process?.pid ?? null;
	}
	processReadBuffer() {
		while (true) try {
			const message = this.readBuffer.readMessage();
			if (message === null) break;
			this.onmessage?.(message);
		} catch (error) {
			this.onerror?.(error instanceof Error ? error : new Error(String(error)));
		}
	}
	async close() {
		const processToClose = this.process;
		this.process = void 0;
		if (processToClose) {
			const closePromise = new Promise((resolve) => {
				processToClose.once("close", () => resolve());
			});
			try {
				processToClose.stdin?.end();
			} catch {}
			await Promise.race([closePromise, delay(CLOSE_TIMEOUT_MS)]);
			if (processToClose.exitCode === null && processToClose.pid) {
				killProcessTree(processToClose.pid);
				await Promise.race([closePromise, delay(CLOSE_TIMEOUT_MS)]);
			}
		}
		this.readBuffer.clear();
	}
	send(message) {
		return new Promise((resolve) => {
			const stdin = this.process?.stdin;
			if (!stdin) throw new Error("Not connected");
			const json = serializeMessage(message);
			if (stdin.write(json)) resolve();
			else stdin.once("drain", resolve);
		});
	}
};
//#endregion
//#region src/agents/mcp-http.ts
function resolveHttpMcpServerLaunchConfig(raw, options) {
	if (!isMcpConfigRecord(raw)) return {
		ok: false,
		reason: "server config must be an object"
	};
	if (typeof raw.url !== "string" || raw.url.trim().length === 0) return {
		ok: false,
		reason: "its url is missing"
	};
	const url = raw.url.trim();
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return {
			ok: false,
			reason: `its url is not a valid URL: ${redactSensitiveUrlLikeString(url)}`
		};
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return {
		ok: false,
		reason: `only http and https URLs are supported, got ${parsed.protocol}`
	};
	let headers;
	if (raw.headers !== void 0 && raw.headers !== null) if (!isMcpConfigRecord(raw.headers)) options?.onMalformedHeaders?.(raw.headers);
	else headers = toMcpStringRecord(raw.headers, { onDroppedEntry: options?.onDroppedHeader });
	return {
		ok: true,
		config: {
			transportType: options?.transportType ?? "sse",
			url,
			headers
		}
	};
}
function describeHttpMcpServerLaunchConfig(config) {
	return redactSensitiveUrl(config.url);
}
//#endregion
//#region src/agents/mcp-transport-config.ts
const DEFAULT_CONNECTION_TIMEOUT_MS = 3e4;
function getConnectionTimeoutMs(rawServer) {
	if (rawServer && typeof rawServer === "object" && typeof rawServer.connectionTimeoutMs === "number" && rawServer.connectionTimeoutMs > 0) return rawServer.connectionTimeoutMs;
	return DEFAULT_CONNECTION_TIMEOUT_MS;
}
function getRequestedTransport(rawServer) {
	if (!rawServer || typeof rawServer !== "object" || typeof rawServer.transport !== "string") return "";
	return normalizeLowercaseStringOrEmpty(rawServer.transport);
}
function resolveHttpTransportConfig(serverName, rawServer, transportType) {
	const launch = resolveHttpMcpServerLaunchConfig(rawServer, {
		transportType,
		onDroppedHeader: (key) => {
			logWarn(`bundle-mcp: server "${serverName}": header "${key}" has an unsupported value type and was ignored.`);
		},
		onMalformedHeaders: () => {
			logWarn(`bundle-mcp: server "${serverName}": "headers" must be a JSON object; the value was ignored.`);
		}
	});
	if (!launch.ok) return null;
	return {
		kind: "http",
		transportType: launch.config.transportType,
		url: launch.config.url,
		headers: launch.config.headers,
		description: describeHttpMcpServerLaunchConfig(launch.config),
		connectionTimeoutMs: getConnectionTimeoutMs(rawServer)
	};
}
function resolveMcpTransportConfig(serverName, rawServer) {
	const logServerName = sanitizeForLog(serverName);
	const requestedTransport = getRequestedTransport(rawServer);
	const stdioLaunch = resolveStdioMcpServerLaunchConfig(rawServer, { onDroppedEnv: (key) => {
		logWarn(`bundle-mcp: server "${logServerName}": env "${sanitizeForLog(key)}" is blocked for stdio startup safety and was ignored.`);
	} });
	if (stdioLaunch.ok) return {
		kind: "stdio",
		transportType: "stdio",
		command: stdioLaunch.config.command,
		args: stdioLaunch.config.args,
		env: stdioLaunch.config.env,
		cwd: stdioLaunch.config.cwd,
		description: describeStdioMcpServerLaunchConfig(stdioLaunch.config),
		connectionTimeoutMs: getConnectionTimeoutMs(rawServer)
	};
	if (requestedTransport && requestedTransport !== "sse" && requestedTransport !== "streamable-http") {
		logWarn(`bundle-mcp: skipped server "${logServerName}" because transport "${sanitizeForLog(requestedTransport)}" is not supported.`);
		return null;
	}
	if (requestedTransport === "streamable-http") {
		const httpTransport = resolveHttpTransportConfig(serverName, rawServer, "streamable-http");
		if (httpTransport) return httpTransport;
	}
	const sseTransport = resolveHttpTransportConfig(serverName, rawServer, "sse");
	if (sseTransport) return sseTransport;
	const httpLaunch = resolveHttpMcpServerLaunchConfig(rawServer);
	const httpReason = httpLaunch.ok ? "not an HTTP MCP server" : httpLaunch.reason;
	logWarn(`bundle-mcp: skipped server "${logServerName}" because ${stdioLaunch.reason} and ${httpReason}.`);
	return null;
}
//#endregion
//#region src/agents/mcp-transport.ts
function attachStderrLogging(serverName, transport) {
	const stderr = transport.stderr;
	if (!stderr || typeof stderr.on !== "function") return;
	const onData = (chunk) => {
		const message = normalizeOptionalString(typeof chunk === "string" ? chunk : String(chunk)) ?? "";
		if (!message) return;
		for (const line of message.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (trimmed) logDebug(`bundle-mcp:${serverName}: ${trimmed}`);
		}
	};
	stderr.on("data", onData);
	return () => {
		if (typeof stderr.off === "function") stderr.off("data", onData);
		else if (typeof stderr.removeListener === "function") stderr.removeListener("data", onData);
	};
}
const fetchWithUndici = async (url, init) => await loadUndiciRuntimeDeps().fetch(url, init);
function buildSseEventSourceFetch(headers) {
	return (url, init) => {
		const sdkHeaders = {};
		if (init?.headers) if (init.headers instanceof Headers) init.headers.forEach((value, key) => {
			sdkHeaders[key] = value;
		});
		else Object.assign(sdkHeaders, init.headers);
		return fetchWithUndici(url, {
			...init,
			headers: {
				...sdkHeaders,
				...headers
			}
		});
	};
}
function resolveMcpTransport(serverName, rawServer) {
	const resolved = resolveMcpTransportConfig(serverName, rawServer);
	if (!resolved) return null;
	if (resolved.kind === "stdio") {
		const transport = new OpenClawStdioClientTransport({
			command: resolved.command,
			args: resolved.args,
			env: resolved.env,
			cwd: resolved.cwd,
			stderr: "pipe"
		});
		return {
			transport,
			description: resolved.description,
			transportType: "stdio",
			connectionTimeoutMs: resolved.connectionTimeoutMs,
			detachStderr: attachStderrLogging(serverName, transport)
		};
	}
	if (resolved.transportType === "streamable-http") return {
		transport: new StreamableHTTPClientTransport(new URL(resolved.url), { requestInit: resolved.headers ? { headers: resolved.headers } : void 0 }),
		description: resolved.description,
		transportType: "streamable-http",
		connectionTimeoutMs: resolved.connectionTimeoutMs
	};
	const headers = { ...resolved.headers };
	const hasHeaders = Object.keys(headers).length > 0;
	return {
		transport: new SSEClientTransport(new URL(resolved.url), {
			requestInit: hasHeaders ? { headers } : void 0,
			fetch: fetchWithUndici,
			eventSourceInit: { fetch: buildSseEventSourceFetch(headers) }
		}),
		description: resolved.description,
		transportType: "sse",
		connectionTimeoutMs: resolved.connectionTimeoutMs
	};
}
//#endregion
//#region src/agents/pi-bundle-mcp-runtime.ts
const SESSION_MCP_RUNTIME_MANAGER_KEY = Symbol.for("openclaw.sessionMcpRuntimeManager");
function connectWithTimeout(client, transport, timeoutMs) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`MCP server connection timed out after ${timeoutMs}ms`)), timeoutMs);
		client.connect(transport).then((value) => {
			clearTimeout(timer);
			resolve(value);
		}, (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}
function redactErrorUrls(error) {
	return redactSensitiveUrlLikeString(String(error));
}
async function listAllTools(client) {
	const tools = [];
	let cursor;
	do {
		const page = await client.listTools(cursor ? { cursor } : void 0);
		tools.push(...page.tools);
		cursor = page.nextCursor;
	} while (cursor);
	return tools;
}
async function disposeSession(session) {
	session.detachStderr?.();
	if (session.transportType === "streamable-http") await session.transport.terminateSession().catch(() => {});
	await session.transport.close().catch(() => {});
	await session.client.close().catch(() => {});
}
function createCatalogFingerprint(servers) {
	return crypto.createHash("sha1").update(JSON.stringify(servers)).digest("hex");
}
function loadSessionMcpConfig(params) {
	const loaded = loadEmbeddedPiMcpConfig({
		workspaceDir: params.workspaceDir,
		cfg: params.cfg
	});
	if (params.logDiagnostics !== false) for (const diagnostic of loaded.diagnostics) logWarn(`bundle-mcp: ${diagnostic.pluginId}: ${diagnostic.message}`);
	return {
		loaded,
		fingerprint: createCatalogFingerprint(loaded.mcpServers)
	};
}
function createDisposedError(sessionId) {
	return /* @__PURE__ */ new Error(`bundle-mcp runtime disposed for session ${sessionId}`);
}
function createSessionMcpRuntime(params) {
	const { loaded, fingerprint: configFingerprint } = loadSessionMcpConfig({
		workspaceDir: params.workspaceDir,
		cfg: params.cfg,
		logDiagnostics: true
	});
	const createdAt = Date.now();
	let lastUsedAt = createdAt;
	let disposed = false;
	let catalog = null;
	let catalogInFlight;
	const sessions = /* @__PURE__ */ new Map();
	const failIfDisposed = () => {
		if (disposed) throw createDisposedError(params.sessionId);
	};
	const getCatalog = async () => {
		failIfDisposed();
		if (catalog) return catalog;
		if (catalogInFlight) return catalogInFlight;
		catalogInFlight = (async () => {
			if (Object.keys(loaded.mcpServers).length === 0) return {
				version: 1,
				generatedAt: Date.now(),
				servers: {},
				tools: []
			};
			const servers = {};
			const tools = [];
			const usedServerNames = /* @__PURE__ */ new Set();
			try {
				for (const [serverName, rawServer] of Object.entries(loaded.mcpServers)) {
					failIfDisposed();
					const resolved = resolveMcpTransport(serverName, rawServer);
					if (!resolved) continue;
					const safeServerName = sanitizeServerName(serverName, usedServerNames);
					if (safeServerName !== serverName) logWarn(`bundle-mcp: server key "${serverName}" registered as "${safeServerName}" for provider-safe tool names.`);
					const client = new Client({
						name: "openclaw-bundle-mcp",
						version: "0.0.0"
					}, {});
					const session = {
						serverName,
						client,
						transport: resolved.transport,
						transportType: resolved.transportType,
						detachStderr: resolved.detachStderr
					};
					sessions.set(serverName, session);
					try {
						failIfDisposed();
						await connectWithTimeout(client, resolved.transport, resolved.connectionTimeoutMs);
						failIfDisposed();
						const listedTools = await listAllTools(client);
						failIfDisposed();
						servers[serverName] = {
							serverName,
							launchSummary: resolved.description,
							toolCount: listedTools.length
						};
						for (const tool of listedTools) {
							const toolName = tool.name.trim();
							if (!toolName) continue;
							tools.push({
								serverName,
								safeServerName,
								toolName,
								title: tool.title,
								description: normalizeOptionalString(tool.description),
								inputSchema: tool.inputSchema,
								fallbackDescription: `Provided by bundle MCP server "${serverName}" (${resolved.description}).`
							});
						}
					} catch (error) {
						if (!disposed) logWarn(`bundle-mcp: failed to start server "${serverName}" (${resolved.description}): ${redactErrorUrls(error)}`);
						await disposeSession(session);
						sessions.delete(serverName);
						failIfDisposed();
					}
				}
				failIfDisposed();
				return {
					version: 1,
					generatedAt: Date.now(),
					servers,
					tools
				};
			} catch (error) {
				await Promise.allSettled(Array.from(sessions.values(), (session) => disposeSession(session)));
				sessions.clear();
				throw error;
			}
		})();
		try {
			const nextCatalog = await catalogInFlight;
			failIfDisposed();
			catalog = nextCatalog;
			return nextCatalog;
		} finally {
			catalogInFlight = void 0;
		}
	};
	return {
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		workspaceDir: params.workspaceDir,
		configFingerprint,
		createdAt,
		get lastUsedAt() {
			return lastUsedAt;
		},
		getCatalog,
		markUsed() {
			lastUsedAt = Date.now();
		},
		async callTool(serverName, toolName, input) {
			failIfDisposed();
			await getCatalog();
			const session = sessions.get(serverName);
			if (!session) throw new Error(`bundle-mcp server "${serverName}" is not connected`);
			return await session.client.callTool({
				name: toolName,
				arguments: isMcpConfigRecord(input) ? input : {}
			});
		},
		async dispose() {
			if (disposed) return;
			disposed = true;
			catalog = null;
			catalogInFlight = void 0;
			const sessionsToClose = Array.from(sessions.values());
			sessions.clear();
			await Promise.allSettled(sessionsToClose.map((session) => disposeSession(session)));
		}
	};
}
function createSessionMcpRuntimeManager(opts = {}) {
	const runtimesBySessionId = /* @__PURE__ */ new Map();
	const sessionIdBySessionKey = /* @__PURE__ */ new Map();
	const createRuntime = opts.createRuntime ?? createSessionMcpRuntime;
	const createInFlight = /* @__PURE__ */ new Map();
	return {
		async getOrCreate(params) {
			if (params.sessionKey) sessionIdBySessionKey.set(params.sessionKey, params.sessionId);
			const { fingerprint: nextFingerprint } = loadSessionMcpConfig({
				workspaceDir: params.workspaceDir,
				cfg: params.cfg,
				logDiagnostics: false
			});
			const existing = runtimesBySessionId.get(params.sessionId);
			if (existing) if (existing.workspaceDir !== params.workspaceDir || existing.configFingerprint !== nextFingerprint) {
				runtimesBySessionId.delete(params.sessionId);
				await existing.dispose();
			} else {
				existing.markUsed();
				return existing;
			}
			const inFlight = createInFlight.get(params.sessionId);
			if (inFlight) {
				if (inFlight.workspaceDir === params.workspaceDir && inFlight.configFingerprint === nextFingerprint) return inFlight.promise;
				createInFlight.delete(params.sessionId);
				const staleRuntime = await inFlight.promise.catch(() => void 0);
				runtimesBySessionId.delete(params.sessionId);
				await staleRuntime?.dispose();
			}
			const created = Promise.resolve(createRuntime({
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
				workspaceDir: params.workspaceDir,
				cfg: params.cfg,
				configFingerprint: nextFingerprint
			})).then((runtime) => {
				runtime.markUsed();
				runtimesBySessionId.set(params.sessionId, runtime);
				return runtime;
			});
			createInFlight.set(params.sessionId, {
				promise: created,
				workspaceDir: params.workspaceDir,
				configFingerprint: nextFingerprint
			});
			try {
				return await created;
			} finally {
				createInFlight.delete(params.sessionId);
			}
		},
		bindSessionKey(sessionKey, sessionId) {
			sessionIdBySessionKey.set(sessionKey, sessionId);
		},
		resolveSessionId(sessionKey) {
			return sessionIdBySessionKey.get(sessionKey);
		},
		async disposeSession(sessionId) {
			const inFlight = createInFlight.get(sessionId);
			createInFlight.delete(sessionId);
			let runtime = runtimesBySessionId.get(sessionId);
			if (!runtime && inFlight) runtime = await inFlight.promise.catch(() => void 0);
			runtimesBySessionId.delete(sessionId);
			if (!runtime) {
				for (const [sessionKey, mappedSessionId] of sessionIdBySessionKey.entries()) if (mappedSessionId === sessionId) sessionIdBySessionKey.delete(sessionKey);
				return;
			}
			for (const [sessionKey, mappedSessionId] of sessionIdBySessionKey.entries()) if (mappedSessionId === sessionId) sessionIdBySessionKey.delete(sessionKey);
			await runtime.dispose();
		},
		async disposeAll() {
			const inFlightRuntimes = Array.from(createInFlight.values());
			createInFlight.clear();
			const runtimes = Array.from(runtimesBySessionId.values());
			runtimesBySessionId.clear();
			sessionIdBySessionKey.clear();
			const lateRuntimes = await Promise.all(inFlightRuntimes.map(async ({ promise }) => await promise.catch(() => void 0)));
			const allRuntimes = new Set(runtimes);
			for (const runtime of lateRuntimes) if (runtime) allRuntimes.add(runtime);
			await Promise.allSettled(Array.from(allRuntimes, (runtime) => runtime.dispose()));
		},
		listSessionIds() {
			return Array.from(runtimesBySessionId.keys());
		}
	};
}
function getSessionMcpRuntimeManager() {
	return resolveGlobalSingleton(SESSION_MCP_RUNTIME_MANAGER_KEY, createSessionMcpRuntimeManager);
}
async function getOrCreateSessionMcpRuntime(params) {
	return await getSessionMcpRuntimeManager().getOrCreate(params);
}
async function disposeSessionMcpRuntime(sessionId) {
	await getSessionMcpRuntimeManager().disposeSession(sessionId);
}
async function retireSessionMcpRuntime(params) {
	const sessionId = normalizeOptionalString(params.sessionId);
	if (!sessionId) return false;
	try {
		await disposeSessionMcpRuntime(sessionId);
		return true;
	} catch (error) {
		params.onError?.(error, sessionId, params.reason);
		return false;
	}
}
async function retireSessionMcpRuntimeForSessionKey(params) {
	const sessionKey = normalizeOptionalString(params.sessionKey);
	if (!sessionKey) return false;
	return await retireSessionMcpRuntime({
		sessionId: getSessionMcpRuntimeManager().resolveSessionId(sessionKey),
		reason: params.reason,
		onError: params.onError
	});
}
//#endregion
export { retireSessionMcpRuntime as a, buildSafeToolName as c, resolveStdioMcpServerLaunchConfig as d, getSessionMcpRuntimeManager as i, normalizeReservedToolNames as l, disposeSessionMcpRuntime as n, retireSessionMcpRuntimeForSessionKey as o, getOrCreateSessionMcpRuntime as r, loadEmbeddedPiMcpConfig as s, createSessionMcpRuntime as t, describeStdioMcpServerLaunchConfig as u };
