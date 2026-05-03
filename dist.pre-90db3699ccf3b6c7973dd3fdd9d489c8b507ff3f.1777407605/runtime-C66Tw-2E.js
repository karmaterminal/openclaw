import { a as normalizeLowercaseStringOrEmpty } from "./string-coerce-CjxCKZ6B.js";
import { m as resolveUserPath } from "./utils-CB8xp0O4.js";
import { n as estimateBase64DecodedBytes } from "./base64-DF-pGpEb.js";
import { t as parseBooleanValue } from "./boolean-DpHj__Gl.js";
import fs from "node:fs";
import path from "node:path";
import fs$1 from "node:fs/promises";
import crypto from "node:crypto";
//#region src/agents/payload-redaction.ts
const REDACTED_IMAGE_DATA = "<redacted>";
const NON_CREDENTIAL_FIELD_NAMES = new Set([
	"passwordfile",
	"tokenbudget",
	"tokencount",
	"tokenfield",
	"tokenlimit",
	"tokens"
]);
const AUTHORIZATION_VALUE_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9+/._~=-]{8,}/giu;
const JWT_VALUE_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu;
const COOKIE_PAIR_RE = /\b([A-Za-z][A-Za-z0-9_.-]{1,64})=([A-Za-z0-9+/._~%=-]{16,})(?=;|\s|$)/gu;
function normalizeFieldName(value) {
	return normalizeLowercaseStringOrEmpty(value.replaceAll(/[^a-z0-9]/gi, ""));
}
function isCredentialFieldName(key) {
	const normalized = normalizeFieldName(key);
	if (!normalized || NON_CREDENTIAL_FIELD_NAMES.has(normalized)) return false;
	if (normalized === "authorization" || normalized === "proxyauthorization") return true;
	return normalized.endsWith("apikey") || normalized.endsWith("password") || normalized.endsWith("passwd") || normalized.endsWith("passphrase") || normalized.endsWith("secret") || normalized.endsWith("secretkey") || normalized.endsWith("token");
}
function redactSensitivePayloadString(value) {
	return value.replace(AUTHORIZATION_VALUE_RE, "$1 <redacted>").replace(JWT_VALUE_RE, "<redacted-jwt>").replace(COOKIE_PAIR_RE, "$1=<redacted>");
}
function hasSensitiveNameValuePair(record) {
	const rawName = typeof record.name === "string" ? record.name : record.key;
	return typeof rawName === "string" && isCredentialFieldName(rawName);
}
function hasImageMime(record) {
	return [
		normalizeLowercaseStringOrEmpty(record.mimeType),
		normalizeLowercaseStringOrEmpty(record.media_type),
		normalizeLowercaseStringOrEmpty(record.mime_type)
	].some((value) => value.startsWith("image/"));
}
function shouldRedactImageData(record) {
	if (typeof record.data !== "string") return false;
	return normalizeLowercaseStringOrEmpty(record.type) === "image" || hasImageMime(record);
}
function digestBase64Payload(data) {
	return crypto.createHash("sha256").update(data).digest("hex");
}
function visitDiagnosticPayload(value, opts) {
	const seen = /* @__PURE__ */ new WeakSet();
	const visit = (input) => {
		if (Array.isArray(input)) return input.map((entry) => visit(entry));
		if (typeof input === "string") return redactSensitivePayloadString(input);
		if (!input || typeof input !== "object") return input;
		if (seen.has(input)) return "[Circular]";
		seen.add(input);
		const record = input;
		const out = {};
		const redactValueField = hasSensitiveNameValuePair(record);
		for (const [key, val] of Object.entries(record)) {
			if (opts?.omitField?.(key)) continue;
			out[key] = redactValueField && key === "value" ? "<redacted>" : visit(val);
		}
		if (shouldRedactImageData(record)) {
			out.data = REDACTED_IMAGE_DATA;
			out.bytes = estimateBase64DecodedBytes(record.data);
			out.sha256 = digestBase64Payload(record.data);
		}
		return out;
	};
	return visit(value);
}
/**
* Removes credential-like fields and image/base64 payload data from diagnostic
* objects before persistence.
*/
function sanitizeDiagnosticPayload(value) {
	return visitDiagnosticPayload(value, { omitField: isCredentialFieldName });
}
//#endregion
//#region src/agents/queued-file-writer.ts
function resolveQueuedFileAppendFlags(constants = fs.constants) {
	const noFollow = constants.O_NOFOLLOW;
	return constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | (typeof noFollow === "number" ? noFollow : 0);
}
async function assertNoSymlinkParents(filePath) {
	const resolvedDir = path.resolve(path.dirname(filePath));
	const parsed = path.parse(resolvedDir);
	const relativeParts = path.relative(parsed.root, resolvedDir).split(path.sep).filter(Boolean);
	let current = parsed.root;
	for (const part of relativeParts) {
		current = path.join(current, part);
		const stat = await fs$1.lstat(current);
		if (stat.isSymbolicLink()) {
			if (path.dirname(current) === parsed.root) continue;
			throw new Error(`Refusing to write queued log under symlinked directory: ${current}`);
		}
		if (!stat.isDirectory()) throw new Error(`Refusing to write queued log under non-directory: ${current}`);
	}
}
function verifyStableOpenedFile(params) {
	if (!params.postOpenStat.isFile()) throw new Error(`Refusing to write queued log to non-file: ${params.filePath}`);
	if (params.postOpenStat.nlink > 1) throw new Error(`Refusing to write queued log to hardlinked file: ${params.filePath}`);
	const pre = params.preOpenStat;
	if (pre && (pre.dev !== params.postOpenStat.dev || pre.ino !== params.postOpenStat.ino)) throw new Error(`Refusing to write queued log after file changed: ${params.filePath}`);
}
async function safeAppendFile(filePath, line, options) {
	await assertNoSymlinkParents(filePath);
	let preOpenStat;
	try {
		const stat = await fs$1.lstat(filePath);
		if (stat.isSymbolicLink()) throw new Error(`Refusing to write queued log through symlink: ${filePath}`);
		if (!stat.isFile()) throw new Error(`Refusing to write queued log to non-file: ${filePath}`);
		preOpenStat = stat;
	} catch (err) {
		if (err.code !== "ENOENT") throw err;
	}
	const lineBytes = Buffer.byteLength(line, "utf8");
	if (options.maxFileBytes !== void 0 && (preOpenStat?.size ?? 0) + lineBytes > options.maxFileBytes) return;
	const handle = await fs$1.open(filePath, resolveQueuedFileAppendFlags(), 384);
	try {
		const stat = await handle.stat();
		verifyStableOpenedFile({
			preOpenStat,
			postOpenStat: stat,
			filePath
		});
		if (options.maxFileBytes !== void 0 && stat.size + lineBytes > options.maxFileBytes) return;
		await handle.chmod(384);
		await handle.appendFile(line, "utf8");
	} finally {
		await handle.close();
	}
}
function getQueuedFileWriter(writers, filePath, options = {}) {
	const existing = writers.get(filePath);
	if (existing) return existing;
	const dir = path.dirname(filePath);
	const ready = fs$1.mkdir(dir, {
		recursive: true,
		mode: 448
	}).catch(() => void 0);
	let queue = Promise.resolve();
	const writer = {
		filePath,
		write: (line) => {
			queue = queue.then(() => ready).then(() => safeAppendFile(filePath, line, options)).catch(() => void 0);
		},
		flush: async () => {
			await queue;
		}
	};
	writers.set(filePath, writer);
	return writer;
}
//#endregion
//#region src/utils/safe-json.ts
function safeJsonStringify(value) {
	try {
		return JSON.stringify(value, (_key, val) => {
			if (typeof val === "bigint") return val.toString();
			if (typeof val === "function") return "[Function]";
			if (val instanceof Error) return {
				name: val.name,
				message: val.message,
				stack: val.stack
			};
			if (val instanceof Uint8Array) return {
				type: "Uint8Array",
				data: Buffer.from(val).toString("base64")
			};
			return val;
		});
	} catch {
		return null;
	}
}
//#endregion
//#region src/trajectory/runtime.ts
const writers = /* @__PURE__ */ new Map();
const TRAJECTORY_RUNTIME_FILE_MAX_BYTES = 50 * 1024 * 1024;
const TRAJECTORY_RUNTIME_EVENT_MAX_BYTES = 256 * 1024;
const MAX_TRAJECTORY_WRITERS = 100;
function safeTrajectorySessionFileName(sessionId) {
	const safe = sessionId.replaceAll(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
	return /[A-Za-z0-9]/u.test(safe) ? safe : "session";
}
function resolveTrajectoryPointerOpenFlags(constants = fs.constants) {
	const noFollow = constants.O_NOFOLLOW;
	return constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY | (typeof noFollow === "number" ? noFollow : 0);
}
function resolveContainedPath(baseDir, fileName) {
	const resolvedBase = path.resolve(baseDir);
	const resolvedFile = path.resolve(resolvedBase, fileName);
	const relative = path.relative(resolvedBase, resolvedFile);
	if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Trajectory file path escaped its configured directory");
	return resolvedFile;
}
function resolveTrajectoryFilePath(params) {
	const dirOverride = (params.env ?? process.env).OPENCLAW_TRAJECTORY_DIR?.trim();
	if (dirOverride) return resolveContainedPath(resolveUserPath(dirOverride), `${safeTrajectorySessionFileName(params.sessionId)}.jsonl`);
	if (!params.sessionFile) return path.join(process.cwd(), `${safeTrajectorySessionFileName(params.sessionId)}.trajectory.jsonl`);
	return params.sessionFile.endsWith(".jsonl") ? `${params.sessionFile.slice(0, -6)}.trajectory.jsonl` : `${params.sessionFile}.trajectory.jsonl`;
}
function resolveTrajectoryPointerFilePath(sessionFile) {
	return sessionFile.endsWith(".jsonl") ? `${sessionFile.slice(0, -6)}.trajectory-path.json` : `${sessionFile}.trajectory-path.json`;
}
function writeTrajectoryPointerBestEffort(params) {
	if (!params.sessionFile) return;
	const pointerPath = resolveTrajectoryPointerFilePath(params.sessionFile);
	try {
		const pointerDir = path.resolve(path.dirname(pointerPath));
		if (fs.lstatSync(pointerDir).isSymbolicLink()) return;
		try {
			if (fs.lstatSync(pointerPath).isSymbolicLink()) return;
		} catch (error) {
			if (error.code !== "ENOENT") return;
		}
		const fd = fs.openSync(pointerPath, resolveTrajectoryPointerOpenFlags(), 384);
		try {
			fs.writeFileSync(fd, `${JSON.stringify({
				traceSchema: "openclaw-trajectory-pointer",
				schemaVersion: 1,
				sessionId: params.sessionId,
				runtimeFile: params.filePath
			}, null, 2)}\n`, "utf8");
			fs.fchmodSync(fd, 384);
		} finally {
			fs.closeSync(fd);
		}
	} catch {}
}
function trimTrajectoryWriterCache() {
	while (writers.size >= MAX_TRAJECTORY_WRITERS) {
		const oldestKey = writers.keys().next().value;
		if (!oldestKey) return;
		writers.delete(oldestKey);
	}
}
function truncateOversizedTrajectoryEvent(event, line) {
	const bytes = Buffer.byteLength(line, "utf8");
	if (bytes <= 262144) return line;
	const truncated = safeJsonStringify({
		...event,
		data: {
			truncated: true,
			originalBytes: bytes,
			limitBytes: TRAJECTORY_RUNTIME_EVENT_MAX_BYTES,
			reason: "trajectory-event-size-limit"
		}
	});
	if (truncated && Buffer.byteLength(truncated, "utf8") <= 262144) return truncated;
}
function toTrajectoryToolDefinitions(tools) {
	return tools.flatMap((tool) => {
		const name = tool.name?.trim();
		if (!name) return [];
		return [{
			name,
			description: tool.description,
			parameters: sanitizeDiagnosticPayload(tool.parameters)
		}];
	}).toSorted((left, right) => left.name.localeCompare(right.name));
}
function createTrajectoryRuntimeRecorder(params) {
	const env = params.env ?? process.env;
	if (!(parseBooleanValue(env.OPENCLAW_TRAJECTORY) ?? true)) return null;
	const filePath = resolveTrajectoryFilePath({
		env,
		sessionFile: params.sessionFile,
		sessionId: params.sessionId
	});
	if (!params.writer) trimTrajectoryWriterCache();
	const writer = params.writer ?? getQueuedFileWriter(writers, filePath, { maxFileBytes: 52428800 });
	writeTrajectoryPointerBestEffort({
		filePath,
		sessionFile: params.sessionFile,
		sessionId: params.sessionId
	});
	let seq = 0;
	const traceId = params.sessionId;
	return {
		enabled: true,
		filePath,
		recordEvent: (type, data) => {
			const event = {
				traceSchema: "openclaw-trajectory",
				schemaVersion: 1,
				traceId,
				source: "runtime",
				type,
				ts: (/* @__PURE__ */ new Date()).toISOString(),
				seq: seq += 1,
				sourceSeq: seq,
				sessionId: params.sessionId,
				sessionKey: params.sessionKey,
				runId: params.runId,
				workspaceDir: params.workspaceDir,
				provider: params.provider,
				modelId: params.modelId,
				modelApi: params.modelApi,
				data: data ? sanitizeDiagnosticPayload(data) : void 0
			};
			const line = safeJsonStringify(event);
			if (!line) return;
			const boundedLine = truncateOversizedTrajectoryEvent(event, line);
			if (!boundedLine) return;
			writer.write(`${boundedLine}\n`);
		},
		flush: async () => {
			await writer.flush();
			if (!params.writer) writers.delete(filePath);
		}
	};
}
//#endregion
export { safeTrajectorySessionFileName as a, getQueuedFileWriter as c, resolveTrajectoryPointerFilePath as i, sanitizeDiagnosticPayload as l, createTrajectoryRuntimeRecorder as n, toTrajectoryToolDefinitions as o, resolveTrajectoryFilePath as r, safeJsonStringify as s, TRAJECTORY_RUNTIME_FILE_MAX_BYTES as t };
