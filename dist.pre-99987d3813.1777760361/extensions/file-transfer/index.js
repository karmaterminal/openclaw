import { i as getRuntimeConfig } from "../../io-DTtpq82f.js";
import { n as mutateConfigFile } from "../../mutate--W6Y6erO.js";
import { t as callGatewayTool } from "../../gateway-BEIr03vt.js";
import { i as resolveNodeIdFromList, t as listNodes } from "../../nodes-utils-vEQB9GPP.js";
import { c as resolveMediaBufferPath, l as saveMediaBuffer } from "../../store-Bfd4_fWY.js";
import { t as definePluginEntry } from "../../plugin-entry-DX3V0eaU.js";
import "../../config-mutation-UFUF35ZF.js";
import "../../runtime-config-snapshot-VCNoiJ6g.js";
import "../../media-store-CyhIe_n-.js";
import "../../agent-harness-runtime-BmiZQa4H.js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { Type } from "typebox";
//#region extensions/file-transfer/src/node-host/dir-fetch.ts
const DIR_FETCH_HARD_MAX_BYTES$2 = 16 * 1024 * 1024;
const DIR_FETCH_DEFAULT_MAX_BYTES$2 = 8 * 1024 * 1024;
function clampMaxBytes$1(input) {
	if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) return DIR_FETCH_DEFAULT_MAX_BYTES$2;
	return Math.min(Math.floor(input), DIR_FETCH_HARD_MAX_BYTES$2);
}
function classifyFsError$2(err) {
	if (err?.code === "ENOENT") return "NOT_FOUND";
	return "READ_ERROR";
}
async function preflightDu(dirPath, maxBytes) {
	const heuristicKb = Math.ceil(maxBytes * 4 / 1024);
	return new Promise((resolve) => {
		const du = spawn("du", ["-sk", dirPath], { stdio: [
			"ignore",
			"pipe",
			"ignore"
		] });
		let output = "";
		du.stdout.on("data", (chunk) => {
			output += chunk.toString();
		});
		du.on("close", (code) => {
			if (code !== 0) {
				resolve(true);
				return;
			}
			const match = /^(\d+)/.exec(output.trim());
			if (!match) {
				resolve(true);
				return;
			}
			resolve(Number.parseInt(match[1], 10) <= heuristicKb);
		});
		du.on("error", () => {
			resolve(true);
		});
	});
}
async function listTarEntries(tarBuffer) {
	return new Promise((resolve) => {
		const child = spawn("tar", ["-tzf", "-"], { stdio: [
			"pipe",
			"pipe",
			"ignore"
		] });
		let stdoutBuf = "";
		let aborted = false;
		const watchdog = setTimeout(() => {
			aborted = true;
			try {
				child.kill("SIGKILL");
			} catch {}
			resolve([]);
		}, 1e4);
		child.stdout.on("data", (chunk) => {
			stdoutBuf += chunk.toString();
			if (stdoutBuf.length > 32 * 1024 * 1024) {
				aborted = true;
				try {
					child.kill("SIGKILL");
				} catch {}
				clearTimeout(watchdog);
				resolve([]);
			}
		});
		child.on("close", (code) => {
			clearTimeout(watchdog);
			if (aborted) return;
			if (code !== 0) {
				resolve([]);
				return;
			}
			resolve(stdoutBuf.split("\n").map((line) => line.replace(/\\/gu, "/").replace(/^\.\//u, "").replace(/\/$/u, "")).filter((line) => line.length > 0));
		});
		child.on("error", () => {
			clearTimeout(watchdog);
			if (!aborted) resolve([]);
		});
		child.stdin.end(tarBuffer);
	});
}
async function listTreeEntries(root, maxEntries) {
	const results = [];
	async function visit(dir) {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		entries.sort((left, right) => left.name.localeCompare(right.name));
		for (const entry of entries) {
			const abs = path.join(dir, entry.name);
			const rel = path.relative(root, abs).replace(/\\/gu, "/");
			results.push(rel);
			if (results.length > maxEntries) return false;
			if (entry.isDirectory()) {
				if (!await visit(abs)) return false;
			}
		}
		return true;
	}
	return await visit(root) ? results : "TOO_MANY";
}
async function handleDirFetch(params) {
	const requestedPath = params.path;
	if (typeof requestedPath !== "string" || requestedPath.length === 0) return {
		ok: false,
		code: "INVALID_PATH",
		message: "path required"
	};
	if (requestedPath.includes("\0")) return {
		ok: false,
		code: "INVALID_PATH",
		message: "path contains NUL byte"
	};
	if (!path.isAbsolute(requestedPath)) return {
		ok: false,
		code: "INVALID_PATH",
		message: "path must be absolute"
	};
	const maxBytes = clampMaxBytes$1(params.maxBytes);
	params.includeDotfiles;
	const followSymlinks = params.followSymlinks === true;
	const preflightOnly = params.preflightOnly === true;
	let canonical;
	try {
		canonical = await fs.realpath(requestedPath);
	} catch (err) {
		const code = classifyFsError$2(err);
		return {
			ok: false,
			code,
			message: code === "NOT_FOUND" ? "directory not found" : `realpath failed: ${String(err)}`
		};
	}
	if (!followSymlinks && canonical !== requestedPath) return {
		ok: false,
		code: "SYMLINK_REDIRECT",
		message: `path traverses a symlink; refusing because followSymlinks=false (set plugins.entries.file-transfer.config.nodes.<node>.followSymlinks=true to allow, or update allowReadPaths to the canonical path)`,
		canonicalPath: canonical
	};
	let stats;
	try {
		stats = await fs.stat(canonical);
	} catch (err) {
		return {
			ok: false,
			code: classifyFsError$2(err),
			message: `stat failed: ${String(err)}`,
			canonicalPath: canonical
		};
	}
	if (!stats.isDirectory()) return {
		ok: false,
		code: "IS_FILE",
		message: "path is not a directory",
		canonicalPath: canonical
	};
	if (preflightOnly) try {
		const entries = await listTreeEntries(canonical, 5e3);
		if (entries === "TOO_MANY") return {
			ok: false,
			code: "TREE_TOO_LARGE",
			message: "directory tree exceeds 5000 entries during preflight",
			canonicalPath: canonical
		};
		return {
			ok: true,
			path: canonical,
			tarBase64: "",
			tarBytes: 0,
			sha256: "",
			fileCount: entries.length,
			entries,
			preflightOnly: true
		};
	} catch (err) {
		return {
			ok: false,
			code: classifyFsError$2(err),
			message: `preflight readdir failed: ${String(err)}`,
			canonicalPath: canonical
		};
	}
	if (!await preflightDu(canonical, maxBytes)) return {
		ok: false,
		code: "TREE_TOO_LARGE",
		message: `directory tree exceeds estimated size limit (${maxBytes} bytes raw)`,
		canonicalPath: canonical
	};
	const tarArgs = [
		"-czf",
		"-",
		"-C",
		canonical,
		"."
	];
	const TAR_HARD_TIMEOUT_MS = 6e4;
	const tarBuffer = await new Promise((resolve) => {
		const child = spawn(process.platform !== "win32" ? "/usr/bin/tar" : "tar", tarArgs, { stdio: [
			"ignore",
			"pipe",
			"pipe"
		] });
		const chunks = [];
		let totalBytes = 0;
		let aborted = false;
		const watchdog = setTimeout(() => {
			if (aborted) return;
			aborted = true;
			try {
				child.kill("SIGKILL");
			} catch {}
			resolve("TIMEOUT");
		}, TAR_HARD_TIMEOUT_MS);
		child.stdout.on("data", (chunk) => {
			if (aborted) return;
			totalBytes += chunk.byteLength;
			if (totalBytes > maxBytes) {
				aborted = true;
				clearTimeout(watchdog);
				child.kill("SIGTERM");
				resolve("TOO_LARGE");
				return;
			}
			chunks.push(chunk);
		});
		child.on("close", (code) => {
			clearTimeout(watchdog);
			if (aborted) return;
			if (code !== 0) {
				resolve("ERROR");
				return;
			}
			resolve(Buffer.concat(chunks));
		});
		child.on("error", () => {
			clearTimeout(watchdog);
			if (!aborted) resolve("ERROR");
		});
	});
	if (tarBuffer === "TOO_LARGE") return {
		ok: false,
		code: "TREE_TOO_LARGE",
		message: `tarball exceeded ${maxBytes} byte limit mid-stream`,
		canonicalPath: canonical
	};
	if (tarBuffer === "TIMEOUT") return {
		ok: false,
		code: "READ_ERROR",
		message: "tar command exceeded 60s wall-clock timeout (slow filesystem or symlink loop?)",
		canonicalPath: canonical
	};
	if (tarBuffer === "ERROR") return {
		ok: false,
		code: "READ_ERROR",
		message: "tar command failed",
		canonicalPath: canonical
	};
	const sha256 = crypto.createHash("sha256").update(tarBuffer).digest("hex");
	const tarBase64 = tarBuffer.toString("base64");
	const tarBytes = tarBuffer.byteLength;
	const entries = await listTarEntries(tarBuffer);
	return {
		ok: true,
		path: canonical,
		tarBase64,
		tarBytes,
		sha256,
		fileCount: entries.length,
		entries
	};
}
//#endregion
//#region extensions/file-transfer/src/shared/mime.ts
const EXTENSION_MIME = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".bmp": "image/bmp",
	".heic": "image/heic",
	".heif": "image/heif",
	".pdf": "application/pdf",
	".txt": "text/plain",
	".log": "text/plain",
	".md": "text/markdown",
	".json": "application/json",
	".csv": "text/csv",
	".html": "text/html",
	".xml": "application/xml",
	".zip": "application/zip",
	".tar": "application/x-tar",
	".gz": "application/gzip"
};
const IMAGE_MIME_INLINE_SET = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif"
]);
const TEXT_INLINE_MIME_SET = new Set([
	"text/plain",
	"text/markdown",
	"text/csv",
	"text/html",
	"application/json",
	"application/xml"
]);
function mimeFromExtension(filePath) {
	return EXTENSION_MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
const DIR_LIST_HARD_MAX_ENTRIES$1 = 5e3;
function clampMaxEntries(input) {
	if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) return 200;
	return Math.min(Math.floor(input), DIR_LIST_HARD_MAX_ENTRIES$1);
}
function classifyFsError$1(err) {
	const code = err?.code;
	if (code === "ENOENT") return "NOT_FOUND";
	if (code === "EACCES" || code === "EPERM") return "PERMISSION_DENIED";
	return "READ_ERROR";
}
async function handleDirList(params) {
	const requestedPath = params.path;
	if (typeof requestedPath !== "string" || requestedPath.length === 0) return {
		ok: false,
		code: "INVALID_PATH",
		message: "path required"
	};
	if (requestedPath.includes("\0")) return {
		ok: false,
		code: "INVALID_PATH",
		message: "path contains NUL byte"
	};
	if (!path.isAbsolute(requestedPath)) return {
		ok: false,
		code: "INVALID_PATH",
		message: "path must be absolute"
	};
	const maxEntries = clampMaxEntries(params.maxEntries);
	const offset = typeof params.pageToken === "string" && params.pageToken.length > 0 ? Math.max(0, Number.parseInt(params.pageToken, 10) || 0) : 0;
	const followSymlinks = params.followSymlinks === true;
	let canonical;
	try {
		canonical = await fs.realpath(requestedPath);
	} catch (err) {
		const code = classifyFsError$1(err);
		return {
			ok: false,
			code,
			message: code === "NOT_FOUND" ? "path not found" : `realpath failed: ${String(err)}`
		};
	}
	if (!followSymlinks && canonical !== requestedPath) return {
		ok: false,
		code: "SYMLINK_REDIRECT",
		message: `path traverses a symlink; refusing because followSymlinks=false (set plugins.entries.file-transfer.config.nodes.<node>.followSymlinks=true to allow, or update allowReadPaths to the canonical path)`,
		canonicalPath: canonical
	};
	let stats;
	try {
		stats = await fs.stat(canonical);
	} catch (err) {
		return {
			ok: false,
			code: classifyFsError$1(err),
			message: `stat failed: ${String(err)}`,
			canonicalPath: canonical
		};
	}
	if (!stats.isDirectory()) return {
		ok: false,
		code: "IS_FILE",
		message: "path is not a directory",
		canonicalPath: canonical
	};
	let names;
	try {
		names = await fs.readdir(canonical, { encoding: "utf8" });
	} catch (err) {
		return {
			ok: false,
			code: classifyFsError$1(err),
			message: `readdir failed: ${String(err)}`,
			canonicalPath: canonical
		};
	}
	names.sort((a, b) => a.localeCompare(b));
	const total = names.length;
	const page = names.slice(offset, offset + maxEntries);
	const truncated = offset + maxEntries < total;
	const nextPageToken = truncated ? String(offset + maxEntries) : void 0;
	const entries = [];
	for (const name of page) {
		const entryPath = path.join(canonical, name);
		let isDir = false;
		let size = 0;
		let mtime = 0;
		try {
			const s = await fs.stat(entryPath);
			isDir = s.isDirectory();
			size = isDir ? 0 : s.size;
			mtime = s.mtimeMs;
		} catch {}
		entries.push({
			name,
			path: entryPath,
			size,
			mimeType: isDir ? "inode/directory" : mimeFromExtension(name),
			isDir,
			mtime
		});
	}
	return {
		ok: true,
		path: canonical,
		entries,
		nextPageToken,
		truncated
	};
}
//#endregion
//#region extensions/file-transfer/src/node-host/file-fetch.ts
const FILE_FETCH_HARD_MAX_BYTES$2 = 16 * 1024 * 1024;
const FILE_FETCH_DEFAULT_MAX_BYTES$2 = 8 * 1024 * 1024;
function detectMimeType(filePath) {
	if (process.platform !== "win32") try {
		const result = spawnSync("file", [
			"-b",
			"--mime-type",
			filePath
		], {
			encoding: "utf-8",
			timeout: 2e3
		});
		const stdout = result.stdout?.trim();
		if (result.status === 0 && stdout) return stdout;
	} catch {}
	return EXTENSION_MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
function clampMaxBytes(input) {
	if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) return FILE_FETCH_DEFAULT_MAX_BYTES$2;
	return Math.min(Math.floor(input), FILE_FETCH_HARD_MAX_BYTES$2);
}
function classifyFsError(err) {
	const code = err?.code;
	if (code === "ENOENT") return "NOT_FOUND";
	if (code === "EACCES" || code === "EPERM") return "PERMISSION_DENIED";
	if (code === "EISDIR") return "IS_DIRECTORY";
	return "READ_ERROR";
}
async function handleFileFetch(params) {
	const requestedPath = params.path;
	if (typeof requestedPath !== "string" || requestedPath.length === 0) return {
		ok: false,
		code: "INVALID_PATH",
		message: "path required"
	};
	if (requestedPath.includes("\0")) return {
		ok: false,
		code: "INVALID_PATH",
		message: "path contains NUL byte"
	};
	if (!path.isAbsolute(requestedPath)) return {
		ok: false,
		code: "INVALID_PATH",
		message: "path must be absolute"
	};
	const maxBytes = clampMaxBytes(params.maxBytes);
	const followSymlinks = params.followSymlinks === true;
	const preflightOnly = params.preflightOnly === true;
	let canonical;
	try {
		canonical = await fs.realpath(requestedPath);
	} catch (err) {
		const code = classifyFsError(err);
		return {
			ok: false,
			code,
			message: code === "NOT_FOUND" ? "file not found" : `realpath failed: ${String(err)}`
		};
	}
	if (!followSymlinks && canonical !== requestedPath) return {
		ok: false,
		code: "SYMLINK_REDIRECT",
		message: `path traverses a symlink; refusing because followSymlinks=false (set plugins.entries.file-transfer.config.nodes.<node>.followSymlinks=true to allow, or update allowReadPaths to the canonical path)`,
		canonicalPath: canonical
	};
	let stats;
	try {
		stats = await fs.stat(canonical);
	} catch (err) {
		return {
			ok: false,
			code: classifyFsError(err),
			message: `stat failed: ${String(err)}`,
			canonicalPath: canonical
		};
	}
	if (stats.isDirectory()) return {
		ok: false,
		code: "IS_DIRECTORY",
		message: "path is a directory",
		canonicalPath: canonical
	};
	if (!stats.isFile()) return {
		ok: false,
		code: "READ_ERROR",
		message: "path is not a regular file",
		canonicalPath: canonical
	};
	if (stats.size > maxBytes) return {
		ok: false,
		code: "FILE_TOO_LARGE",
		message: `file size ${stats.size} exceeds limit ${maxBytes}`,
		canonicalPath: canonical
	};
	if (preflightOnly) return {
		ok: true,
		path: canonical,
		size: stats.size,
		mimeType: "",
		base64: "",
		sha256: "",
		preflightOnly: true
	};
	let buffer;
	try {
		buffer = await fs.readFile(canonical);
	} catch (err) {
		return {
			ok: false,
			code: classifyFsError(err),
			message: `read failed: ${String(err)}`,
			canonicalPath: canonical
		};
	}
	if (buffer.byteLength > maxBytes) return {
		ok: false,
		code: "FILE_TOO_LARGE",
		message: `read ${buffer.byteLength} bytes exceeds limit ${maxBytes}`,
		canonicalPath: canonical
	};
	const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
	const base64 = buffer.toString("base64");
	const mimeType = detectMimeType(canonical);
	return {
		ok: true,
		path: canonical,
		size: buffer.byteLength,
		mimeType,
		base64,
		sha256
	};
}
//#endregion
//#region extensions/file-transfer/src/node-host/file-write.ts
const MAX_CONTENT_BYTES = 16 * 1024 * 1024;
function sha256Hex(buf) {
	return crypto.createHash("sha256").update(buf).digest("hex");
}
function err(code, message, canonicalPath) {
	return {
		ok: false,
		code,
		message,
		...canonicalPath ? { canonicalPath } : {}
	};
}
async function pathExists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}
async function findExistingAncestor(p) {
	let current = p;
	while (true) {
		try {
			await fs.lstat(current);
			return current;
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}
async function canonicalTargetFromExistingAncestor(targetPath) {
	const ancestor = await findExistingAncestor(targetPath);
	if (!ancestor) return targetPath;
	let canonicalAncestor;
	try {
		canonicalAncestor = await fs.realpath(ancestor);
	} catch {
		canonicalAncestor = ancestor;
	}
	const relative = path.relative(ancestor, targetPath);
	return relative ? path.join(canonicalAncestor, relative) : canonicalAncestor;
}
async function rejectParentSymlinkRedirect(targetPath, parentDir) {
	const ancestor = await findExistingAncestor(parentDir);
	if (!ancestor) return null;
	let canonicalAncestor;
	try {
		canonicalAncestor = await fs.realpath(ancestor);
	} catch {
		return null;
	}
	if (canonicalAncestor === ancestor) return null;
	const canonicalTarget = path.join(canonicalAncestor, path.relative(ancestor, targetPath));
	return err("SYMLINK_REDIRECT", `parent ${ancestor} resolves through a symlink to ${canonicalAncestor}; refusing because followSymlinks=false (set plugins.entries.file-transfer.config.nodes.<node>.followSymlinks=true to allow, or update allowWritePaths to the canonical path)`, canonicalTarget);
}
async function handleFileWrite(params) {
	const rawPath = typeof params?.path === "string" ? params.path : "";
	const hasContentBase64 = typeof params?.contentBase64 === "string";
	const contentBase64 = hasContentBase64 ? params.contentBase64 : "";
	const overwrite = params?.overwrite === true;
	const createParents = params?.createParents === true;
	const expectedSha256 = typeof params?.expectedSha256 === "string" ? params.expectedSha256 : void 0;
	const followSymlinks = params?.followSymlinks === true;
	const preflightOnly = params?.preflightOnly === true;
	if (!rawPath) return err("INVALID_PATH", "path is required");
	if (rawPath.includes("\0")) return err("INVALID_PATH", "path must not contain NUL bytes");
	if (!path.isAbsolute(rawPath)) return err("INVALID_PATH", "path must be absolute");
	if (!hasContentBase64) return err("INVALID_BASE64", "contentBase64 is required");
	const buf = Buffer.from(contentBase64, "base64");
	const reEncoded = buf.toString("base64");
	const normalize = (s) => s.replace(/=+$/u, "").replace(/-/gu, "+").replace(/_/gu, "/");
	if (normalize(reEncoded) !== normalize(contentBase64)) return err("INVALID_BASE64", "contentBase64 is not valid base64");
	if (buf.length > MAX_CONTENT_BYTES) return err("FILE_TOO_LARGE", `decoded content is ${buf.length} bytes; maximum is ${MAX_CONTENT_BYTES} bytes (16 MB)`);
	const targetPath = path.normalize(rawPath);
	const parentDir = path.dirname(targetPath);
	const parentExists = await pathExists(parentDir);
	if (!followSymlinks) {
		const redirect = await rejectParentSymlinkRedirect(targetPath, parentDir);
		if (redirect) return redirect;
	}
	if (!parentExists) {
		if (!createParents) return err("PARENT_NOT_FOUND", `parent directory does not exist: ${parentDir}`);
		if (preflightOnly) {
			const computedSha256 = sha256Hex(buf);
			if (expectedSha256 && expectedSha256.toLowerCase() !== computedSha256) return err("INTEGRITY_FAILURE", `sha256 mismatch: expected ${expectedSha256.toLowerCase()}, got ${computedSha256}`, targetPath);
			return {
				ok: true,
				path: await canonicalTargetFromExistingAncestor(targetPath),
				size: buf.length,
				sha256: computedSha256,
				overwritten: false
			};
		}
		try {
			await fs.mkdir(parentDir, { recursive: true });
		} catch (mkdirErr) {
			return err("WRITE_ERROR", `failed to create parent directories: ${mkdirErr instanceof Error ? mkdirErr.message : String(mkdirErr)}`);
		}
	}
	if (!followSymlinks) {
		const redirect = await rejectParentSymlinkRedirect(targetPath, parentDir);
		if (redirect) return redirect;
	}
	let overwritten = false;
	try {
		const existingLStat = await fs.lstat(targetPath);
		if (existingLStat.isSymbolicLink()) return err("SYMLINK_TARGET_DENIED", `path is a symlink; refusing to write through it: ${targetPath}`);
		if (existingLStat.isDirectory()) return err("IS_DIRECTORY", `path resolves to a directory: ${targetPath}`);
		if (!overwrite) return err("EXISTS_NO_OVERWRITE", `file already exists and overwrite is false: ${targetPath}`);
		overwritten = true;
	} catch (statErr) {
		if (statErr.code !== "ENOENT") {
			const message = statErr instanceof Error ? statErr.message : String(statErr);
			if (message.toLowerCase().includes("permission")) return err("PERMISSION_DENIED", `permission denied: ${targetPath}`);
			return err("WRITE_ERROR", `unexpected stat error: ${message}`);
		}
	}
	const computedSha256 = sha256Hex(buf);
	if (expectedSha256 && expectedSha256.toLowerCase() !== computedSha256) return err("INTEGRITY_FAILURE", `sha256 mismatch: expected ${expectedSha256.toLowerCase()}, got ${computedSha256}`, targetPath);
	if (preflightOnly) return {
		ok: true,
		path: await canonicalTargetFromExistingAncestor(targetPath),
		size: buf.length,
		sha256: computedSha256,
		overwritten
	};
	const tmpPath = `${targetPath}.${crypto.randomBytes(8).toString("hex")}.tmp`;
	try {
		await fs.writeFile(tmpPath, buf);
	} catch (writeErr) {
		const message = writeErr instanceof Error ? writeErr.message : String(writeErr);
		await fs.unlink(tmpPath).catch(() => {});
		if (message.toLowerCase().includes("permission") || message.toLowerCase().includes("access")) return err("PERMISSION_DENIED", `permission denied writing to: ${parentDir}`);
		return err("WRITE_ERROR", `failed to write file: ${message}`);
	}
	try {
		await fs.rename(tmpPath, targetPath);
	} catch (renameErr) {
		const message = renameErr instanceof Error ? renameErr.message : String(renameErr);
		await fs.unlink(tmpPath).catch(() => {});
		if (message.toLowerCase().includes("permission") || message.toLowerCase().includes("access")) return err("PERMISSION_DENIED", `permission denied renaming to: ${targetPath}`);
		return err("WRITE_ERROR", `failed to rename tmp to target: ${message}`);
	}
	const writtenBuf = buf;
	let canonicalPath = targetPath;
	try {
		canonicalPath = await fs.realpath(targetPath);
	} catch {
		canonicalPath = targetPath;
	}
	return {
		ok: true,
		path: canonicalPath,
		size: writtenBuf.length,
		sha256: computedSha256,
		overwritten
	};
}
//#endregion
//#region extensions/file-transfer/src/shared/audit.ts
let auditDirPromise = null;
async function ensureAuditDir() {
	if (auditDirPromise) return auditDirPromise;
	const promise = (async () => {
		const dir = path.join(os.homedir(), ".openclaw", "audit");
		await fs.mkdir(dir, {
			recursive: true,
			mode: 448
		});
		return dir;
	})();
	promise.catch(() => {
		if (auditDirPromise === promise) auditDirPromise = null;
	});
	auditDirPromise = promise;
	return promise;
}
function auditFilePath(dir) {
	return path.join(dir, "file-transfer.jsonl");
}
/**
* Append an audit record. Best-effort — failures are logged to stderr and
* never propagated to the caller (the caller's operation is the source of
* truth, not the audit write).
*/
async function appendFileTransferAudit(record) {
	try {
		const dir = await ensureAuditDir();
		const line = `${JSON.stringify({
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			...record
		})}\n`;
		await fs.appendFile(auditFilePath(dir), line, { mode: 384 });
	} catch (e) {
		process.stderr.write(`[file-transfer:audit] append failed: ${String(e)}\n`);
	}
}
//#endregion
//#region node_modules/balanced-match/dist/esm/index.js
const balanced = (a, b, str) => {
	const ma = a instanceof RegExp ? maybeMatch(a, str) : a;
	const mb = b instanceof RegExp ? maybeMatch(b, str) : b;
	const r = ma !== null && mb != null && range(ma, mb, str);
	return r && {
		start: r[0],
		end: r[1],
		pre: str.slice(0, r[0]),
		body: str.slice(r[0] + ma.length, r[1]),
		post: str.slice(r[1] + mb.length)
	};
};
const maybeMatch = (reg, str) => {
	const m = str.match(reg);
	return m ? m[0] : null;
};
const range = (a, b, str) => {
	let begs, beg, left, right = void 0, result;
	let ai = str.indexOf(a);
	let bi = str.indexOf(b, ai + 1);
	let i = ai;
	if (ai >= 0 && bi > 0) {
		if (a === b) return [ai, bi];
		begs = [];
		left = str.length;
		while (i >= 0 && !result) {
			if (i === ai) {
				begs.push(i);
				ai = str.indexOf(a, i + 1);
			} else if (begs.length === 1) {
				const r = begs.pop();
				if (r !== void 0) result = [r, bi];
			} else {
				beg = begs.pop();
				if (beg !== void 0 && beg < left) {
					left = beg;
					right = bi;
				}
				bi = str.indexOf(b, i + 1);
			}
			i = ai < bi && ai >= 0 ? ai : bi;
		}
		if (begs.length && right !== void 0) result = [left, right];
	}
	return result;
};
//#endregion
//#region node_modules/brace-expansion/dist/esm/index.js
const escSlash = "\0SLASH" + Math.random() + "\0";
const escOpen = "\0OPEN" + Math.random() + "\0";
const escClose = "\0CLOSE" + Math.random() + "\0";
const escComma = "\0COMMA" + Math.random() + "\0";
const escPeriod = "\0PERIOD" + Math.random() + "\0";
const escSlashPattern = new RegExp(escSlash, "g");
const escOpenPattern = new RegExp(escOpen, "g");
const escClosePattern = new RegExp(escClose, "g");
const escCommaPattern = new RegExp(escComma, "g");
const escPeriodPattern = new RegExp(escPeriod, "g");
const slashPattern = /\\\\/g;
const openPattern = /\\{/g;
const closePattern = /\\}/g;
const commaPattern = /\\,/g;
const periodPattern = /\\\./g;
const EXPANSION_MAX = 1e5;
function numeric(str) {
	return !isNaN(str) ? parseInt(str, 10) : str.charCodeAt(0);
}
function escapeBraces(str) {
	return str.replace(slashPattern, escSlash).replace(openPattern, escOpen).replace(closePattern, escClose).replace(commaPattern, escComma).replace(periodPattern, escPeriod);
}
function unescapeBraces(str) {
	return str.replace(escSlashPattern, "\\").replace(escOpenPattern, "{").replace(escClosePattern, "}").replace(escCommaPattern, ",").replace(escPeriodPattern, ".");
}
/**
* Basically just str.split(","), but handling cases
* where we have nested braced sections, which should be
* treated as individual members, like {a,{b,c},d}
*/
function parseCommaParts(str) {
	if (!str) return [""];
	const parts = [];
	const m = balanced("{", "}", str);
	if (!m) return str.split(",");
	const { pre, body, post } = m;
	const p = pre.split(",");
	p[p.length - 1] += "{" + body + "}";
	const postParts = parseCommaParts(post);
	if (post.length) {
		p[p.length - 1] += postParts.shift();
		p.push.apply(p, postParts);
	}
	parts.push.apply(parts, p);
	return parts;
}
function expand(str, options = {}) {
	if (!str) return [];
	const { max = EXPANSION_MAX } = options;
	if (str.slice(0, 2) === "{}") str = "\\{\\}" + str.slice(2);
	return expand_(escapeBraces(str), max, true).map(unescapeBraces);
}
function embrace(str) {
	return "{" + str + "}";
}
function isPadded(el) {
	return /^-?0\d/.test(el);
}
function lte(i, y) {
	return i <= y;
}
function gte(i, y) {
	return i >= y;
}
function expand_(str, max, isTop) {
	/** @type {string[]} */
	const expansions = [];
	const m = balanced("{", "}", str);
	if (!m) return [str];
	const pre = m.pre;
	const post = m.post.length ? expand_(m.post, max, false) : [""];
	if (/\$$/.test(m.pre)) for (let k = 0; k < post.length && k < max; k++) {
		const expansion = pre + "{" + m.body + "}" + post[k];
		expansions.push(expansion);
	}
	else {
		const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
		const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
		const isSequence = isNumericSequence || isAlphaSequence;
		const isOptions = m.body.indexOf(",") >= 0;
		if (!isSequence && !isOptions) {
			if (m.post.match(/,(?!,).*\}/)) {
				str = m.pre + "{" + m.body + escClose + m.post;
				return expand_(str, max, true);
			}
			return [str];
		}
		let n;
		if (isSequence) n = m.body.split(/\.\./);
		else {
			n = parseCommaParts(m.body);
			if (n.length === 1 && n[0] !== void 0) {
				n = expand_(n[0], max, false).map(embrace);
				/* c8 ignore start */
				if (n.length === 1) return post.map((p) => m.pre + n[0] + p);
			}
		}
		let N;
		if (isSequence && n[0] !== void 0 && n[1] !== void 0) {
			const x = numeric(n[0]);
			const y = numeric(n[1]);
			const width = Math.max(n[0].length, n[1].length);
			let incr = n.length === 3 && n[2] !== void 0 ? Math.max(Math.abs(numeric(n[2])), 1) : 1;
			let test = lte;
			if (y < x) {
				incr *= -1;
				test = gte;
			}
			const pad = n.some(isPadded);
			N = [];
			for (let i = x; test(i, y); i += incr) {
				let c;
				if (isAlphaSequence) {
					c = String.fromCharCode(i);
					if (c === "\\") c = "";
				} else {
					c = String(i);
					if (pad) {
						const need = width - c.length;
						if (need > 0) {
							const z = new Array(need + 1).join("0");
							if (i < 0) c = "-" + z + c.slice(1);
							else c = z + c;
						}
					}
				}
				N.push(c);
			}
		} else {
			N = [];
			for (let j = 0; j < n.length; j++) N.push.apply(N, expand_(n[j], max, false));
		}
		for (let j = 0; j < N.length; j++) for (let k = 0; k < post.length && expansions.length < max; k++) {
			const expansion = pre + N[j] + post[k];
			if (!isTop || isSequence || expansion) expansions.push(expansion);
		}
	}
	return expansions;
}
//#endregion
//#region node_modules/minimatch/dist/esm/assert-valid-pattern.js
const MAX_PATTERN_LENGTH = 1024 * 64;
const assertValidPattern = (pattern) => {
	if (typeof pattern !== "string") throw new TypeError("invalid pattern");
	if (pattern.length > MAX_PATTERN_LENGTH) throw new TypeError("pattern is too long");
};
//#endregion
//#region node_modules/minimatch/dist/esm/brace-expressions.js
const posixClasses = {
	"[:alnum:]": ["\\p{L}\\p{Nl}\\p{Nd}", true],
	"[:alpha:]": ["\\p{L}\\p{Nl}", true],
	"[:ascii:]": ["\\x00-\\x7f", false],
	"[:blank:]": ["\\p{Zs}\\t", true],
	"[:cntrl:]": ["\\p{Cc}", true],
	"[:digit:]": ["\\p{Nd}", true],
	"[:graph:]": [
		"\\p{Z}\\p{C}",
		true,
		true
	],
	"[:lower:]": ["\\p{Ll}", true],
	"[:print:]": ["\\p{C}", true],
	"[:punct:]": ["\\p{P}", true],
	"[:space:]": ["\\p{Z}\\t\\r\\n\\v\\f", true],
	"[:upper:]": ["\\p{Lu}", true],
	"[:word:]": ["\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}", true],
	"[:xdigit:]": ["A-Fa-f0-9", false]
};
const braceEscape = (s) => s.replace(/[[\]\\-]/g, "\\$&");
const regexpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
const rangesToString = (ranges) => ranges.join("");
const parseClass = (glob, position) => {
	const pos = position;
	/* c8 ignore start */
	if (glob.charAt(pos) !== "[") throw new Error("not in a brace expression");
	/* c8 ignore stop */
	const ranges = [];
	const negs = [];
	let i = pos + 1;
	let sawStart = false;
	let uflag = false;
	let escaping = false;
	let negate = false;
	let endPos = pos;
	let rangeStart = "";
	WHILE: while (i < glob.length) {
		const c = glob.charAt(i);
		if ((c === "!" || c === "^") && i === pos + 1) {
			negate = true;
			i++;
			continue;
		}
		if (c === "]" && sawStart && !escaping) {
			endPos = i + 1;
			break;
		}
		sawStart = true;
		if (c === "\\") {
			if (!escaping) {
				escaping = true;
				i++;
				continue;
			}
		}
		if (c === "[" && !escaping) {
			for (const [cls, [unip, u, neg]] of Object.entries(posixClasses)) if (glob.startsWith(cls, i)) {
				if (rangeStart) return [
					"$.",
					false,
					glob.length - pos,
					true
				];
				i += cls.length;
				if (neg) negs.push(unip);
				else ranges.push(unip);
				uflag = uflag || u;
				continue WHILE;
			}
		}
		escaping = false;
		if (rangeStart) {
			if (c > rangeStart) ranges.push(braceEscape(rangeStart) + "-" + braceEscape(c));
			else if (c === rangeStart) ranges.push(braceEscape(c));
			rangeStart = "";
			i++;
			continue;
		}
		if (glob.startsWith("-]", i + 1)) {
			ranges.push(braceEscape(c + "-"));
			i += 2;
			continue;
		}
		if (glob.startsWith("-", i + 1)) {
			rangeStart = c;
			i += 2;
			continue;
		}
		ranges.push(braceEscape(c));
		i++;
	}
	if (endPos < i) return [
		"",
		false,
		0,
		false
	];
	if (!ranges.length && !negs.length) return [
		"$.",
		false,
		glob.length - pos,
		true
	];
	if (negs.length === 0 && ranges.length === 1 && /^\\?.$/.test(ranges[0]) && !negate) return [
		regexpEscape(ranges[0].length === 2 ? ranges[0].slice(-1) : ranges[0]),
		false,
		endPos - pos,
		false
	];
	const sranges = "[" + (negate ? "^" : "") + rangesToString(ranges) + "]";
	const snegs = "[" + (negate ? "" : "^") + rangesToString(negs) + "]";
	return [
		ranges.length && negs.length ? "(" + sranges + "|" + snegs + ")" : ranges.length ? sranges : snegs,
		uflag,
		endPos - pos,
		true
	];
};
//#endregion
//#region node_modules/minimatch/dist/esm/unescape.js
/**
* Un-escape a string that has been escaped with {@link escape}.
*
* If the {@link MinimatchOptions.windowsPathsNoEscape} option is used, then
* square-bracket escapes are removed, but not backslash escapes.
*
* For example, it will turn the string `'[*]'` into `*`, but it will not
* turn `'\\*'` into `'*'`, because `\` is a path separator in
* `windowsPathsNoEscape` mode.
*
* When `windowsPathsNoEscape` is not set, then both square-bracket escapes and
* backslash escapes are removed.
*
* Slashes (and backslashes in `windowsPathsNoEscape` mode) cannot be escaped
* or unescaped.
*
* When `magicalBraces` is not set, escapes of braces (`{` and `}`) will not be
* unescaped.
*/
const unescape = (s, { windowsPathsNoEscape = false, magicalBraces = true } = {}) => {
	if (magicalBraces) return windowsPathsNoEscape ? s.replace(/\[([^\/\\])\]/g, "$1") : s.replace(/((?!\\).|^)\[([^\/\\])\]/g, "$1$2").replace(/\\([^\/])/g, "$1");
	return windowsPathsNoEscape ? s.replace(/\[([^\/\\{}])\]/g, "$1") : s.replace(/((?!\\).|^)\[([^\/\\{}])\]/g, "$1$2").replace(/\\([^\/{}])/g, "$1");
};
//#endregion
//#region node_modules/minimatch/dist/esm/ast.js
var _a;
const types = new Set([
	"!",
	"?",
	"+",
	"*",
	"@"
]);
const isExtglobType = (c) => types.has(c);
const isExtglobAST = (c) => isExtglobType(c.type);
const adoptionMap = new Map([
	["!", ["@"]],
	["?", ["?", "@"]],
	["@", ["@"]],
	["*", [
		"*",
		"+",
		"?",
		"@"
	]],
	["+", ["+", "@"]]
]);
const adoptionWithSpaceMap = new Map([
	["!", ["?"]],
	["@", ["?"]],
	["+", ["?", "*"]]
]);
const adoptionAnyMap = new Map([
	["!", ["?", "@"]],
	["?", ["?", "@"]],
	["@", ["?", "@"]],
	["*", [
		"*",
		"+",
		"?",
		"@"
	]],
	["+", [
		"+",
		"@",
		"?",
		"*"
	]]
]);
const usurpMap = new Map([
	["!", new Map([["!", "@"]])],
	["?", new Map([["*", "*"], ["+", "*"]])],
	["@", new Map([
		["!", "!"],
		["?", "?"],
		["@", "@"],
		["*", "*"],
		["+", "+"]
	])],
	["+", new Map([["?", "*"], ["*", "*"]])]
]);
const startNoTraversal = "(?!(?:^|/)\\.\\.?(?:$|/))";
const startNoDot = "(?!\\.)";
const addPatternStart = new Set(["[", "."]);
const justDots = new Set(["..", "."]);
const reSpecials = /* @__PURE__ */ new Set("().*{}+?[]^$\\!");
const regExpEscape$1 = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
const qmark = "[^/]";
const star$1 = qmark + "*?";
const starNoEmpty = qmark + "+?";
let ID = 0;
var AST = class {
	type;
	#root;
	#hasMagic;
	#uflag = false;
	#parts = [];
	#parent;
	#parentIndex;
	#negs;
	#filledNegs = false;
	#options;
	#toString;
	#emptyExt = false;
	id = ++ID;
	get depth() {
		return (this.#parent?.depth ?? -1) + 1;
	}
	[Symbol.for("nodejs.util.inspect.custom")]() {
		return {
			"@@type": "AST",
			id: this.id,
			type: this.type,
			root: this.#root.id,
			parent: this.#parent?.id,
			depth: this.depth,
			partsLength: this.#parts.length,
			parts: this.#parts
		};
	}
	constructor(type, parent, options = {}) {
		this.type = type;
		if (type) this.#hasMagic = true;
		this.#parent = parent;
		this.#root = this.#parent ? this.#parent.#root : this;
		this.#options = this.#root === this ? options : this.#root.#options;
		this.#negs = this.#root === this ? [] : this.#root.#negs;
		if (type === "!" && !this.#root.#filledNegs) this.#negs.push(this);
		this.#parentIndex = this.#parent ? this.#parent.#parts.length : 0;
	}
	get hasMagic() {
		/* c8 ignore start */
		if (this.#hasMagic !== void 0) return this.#hasMagic;
		/* c8 ignore stop */
		for (const p of this.#parts) {
			if (typeof p === "string") continue;
			if (p.type || p.hasMagic) return this.#hasMagic = true;
		}
		return this.#hasMagic;
	}
	toString() {
		if (this.#toString !== void 0) return this.#toString;
		if (!this.type) return this.#toString = this.#parts.map((p) => String(p)).join("");
		else return this.#toString = this.type + "(" + this.#parts.map((p) => String(p)).join("|") + ")";
	}
	#fillNegs() {
		/* c8 ignore start */
		if (this !== this.#root) throw new Error("should only call on root");
		if (this.#filledNegs) return this;
		/* c8 ignore stop */
		this.toString();
		this.#filledNegs = true;
		let n;
		while (n = this.#negs.pop()) {
			if (n.type !== "!") continue;
			let p = n;
			let pp = p.#parent;
			while (pp) {
				for (let i = p.#parentIndex + 1; !pp.type && i < pp.#parts.length; i++) for (const part of n.#parts) {
					/* c8 ignore start */
					if (typeof part === "string") throw new Error("string part in extglob AST??");
					/* c8 ignore stop */
					part.copyIn(pp.#parts[i]);
				}
				p = pp;
				pp = p.#parent;
			}
		}
		return this;
	}
	push(...parts) {
		for (const p of parts) {
			if (p === "") continue;
			/* c8 ignore start */
			if (typeof p !== "string" && !(p instanceof _a && p.#parent === this)) throw new Error("invalid part: " + p);
			/* c8 ignore stop */
			this.#parts.push(p);
		}
	}
	toJSON() {
		const ret = this.type === null ? this.#parts.slice().map((p) => typeof p === "string" ? p : p.toJSON()) : [this.type, ...this.#parts.map((p) => p.toJSON())];
		if (this.isStart() && !this.type) ret.unshift([]);
		if (this.isEnd() && (this === this.#root || this.#root.#filledNegs && this.#parent?.type === "!")) ret.push({});
		return ret;
	}
	isStart() {
		if (this.#root === this) return true;
		if (!this.#parent?.isStart()) return false;
		if (this.#parentIndex === 0) return true;
		const p = this.#parent;
		for (let i = 0; i < this.#parentIndex; i++) {
			const pp = p.#parts[i];
			if (!(pp instanceof _a && pp.type === "!")) return false;
		}
		return true;
	}
	isEnd() {
		if (this.#root === this) return true;
		if (this.#parent?.type === "!") return true;
		if (!this.#parent?.isEnd()) return false;
		if (!this.type) return this.#parent?.isEnd();
		/* c8 ignore start */
		const pl = this.#parent ? this.#parent.#parts.length : 0;
		/* c8 ignore stop */
		return this.#parentIndex === pl - 1;
	}
	copyIn(part) {
		if (typeof part === "string") this.push(part);
		else this.push(part.clone(this));
	}
	clone(parent) {
		const c = new _a(this.type, parent);
		for (const p of this.#parts) c.copyIn(p);
		return c;
	}
	static #parseAST(str, ast, pos, opt, extDepth) {
		const maxDepth = opt.maxExtglobRecursion ?? 2;
		let escaping = false;
		let inBrace = false;
		let braceStart = -1;
		let braceNeg = false;
		if (ast.type === null) {
			let i = pos;
			let acc = "";
			while (i < str.length) {
				const c = str.charAt(i++);
				if (escaping || c === "\\") {
					escaping = !escaping;
					acc += c;
					continue;
				}
				if (inBrace) {
					if (i === braceStart + 1) {
						if (c === "^" || c === "!") braceNeg = true;
					} else if (c === "]" && !(i === braceStart + 2 && braceNeg)) inBrace = false;
					acc += c;
					continue;
				} else if (c === "[") {
					inBrace = true;
					braceStart = i;
					braceNeg = false;
					acc += c;
					continue;
				}
				if (!opt.noext && isExtglobType(c) && str.charAt(i) === "(" && extDepth <= maxDepth) {
					ast.push(acc);
					acc = "";
					const ext = new _a(c, ast);
					i = _a.#parseAST(str, ext, i, opt, extDepth + 1);
					ast.push(ext);
					continue;
				}
				acc += c;
			}
			ast.push(acc);
			return i;
		}
		let i = pos + 1;
		let part = new _a(null, ast);
		const parts = [];
		let acc = "";
		while (i < str.length) {
			const c = str.charAt(i++);
			if (escaping || c === "\\") {
				escaping = !escaping;
				acc += c;
				continue;
			}
			if (inBrace) {
				if (i === braceStart + 1) {
					if (c === "^" || c === "!") braceNeg = true;
				} else if (c === "]" && !(i === braceStart + 2 && braceNeg)) inBrace = false;
				acc += c;
				continue;
			} else if (c === "[") {
				inBrace = true;
				braceStart = i;
				braceNeg = false;
				acc += c;
				continue;
			}
			/* c8 ignore stop */
			if (!opt.noext && isExtglobType(c) && str.charAt(i) === "(" && (extDepth <= maxDepth || ast && ast.#canAdoptType(c))) {
				const depthAdd = ast && ast.#canAdoptType(c) ? 0 : 1;
				part.push(acc);
				acc = "";
				const ext = new _a(c, part);
				part.push(ext);
				i = _a.#parseAST(str, ext, i, opt, extDepth + depthAdd);
				continue;
			}
			if (c === "|") {
				part.push(acc);
				acc = "";
				parts.push(part);
				part = new _a(null, ast);
				continue;
			}
			if (c === ")") {
				if (acc === "" && ast.#parts.length === 0) ast.#emptyExt = true;
				part.push(acc);
				acc = "";
				ast.push(...parts, part);
				return i;
			}
			acc += c;
		}
		ast.type = null;
		ast.#hasMagic = void 0;
		ast.#parts = [str.substring(pos - 1)];
		return i;
	}
	#canAdoptWithSpace(child) {
		return this.#canAdopt(child, adoptionWithSpaceMap);
	}
	#canAdopt(child, map = adoptionMap) {
		if (!child || typeof child !== "object" || child.type !== null || child.#parts.length !== 1 || this.type === null) return false;
		const gc = child.#parts[0];
		if (!gc || typeof gc !== "object" || gc.type === null) return false;
		return this.#canAdoptType(gc.type, map);
	}
	#canAdoptType(c, map = adoptionAnyMap) {
		return !!map.get(this.type)?.includes(c);
	}
	#adoptWithSpace(child, index) {
		const gc = child.#parts[0];
		const blank = new _a(null, gc, this.options);
		blank.#parts.push("");
		gc.push(blank);
		this.#adopt(child, index);
	}
	#adopt(child, index) {
		const gc = child.#parts[0];
		this.#parts.splice(index, 1, ...gc.#parts);
		for (const p of gc.#parts) if (typeof p === "object") p.#parent = this;
		this.#toString = void 0;
	}
	#canUsurpType(c) {
		return !!usurpMap.get(this.type)?.has(c);
	}
	#canUsurp(child) {
		if (!child || typeof child !== "object" || child.type !== null || child.#parts.length !== 1 || this.type === null || this.#parts.length !== 1) return false;
		const gc = child.#parts[0];
		if (!gc || typeof gc !== "object" || gc.type === null) return false;
		return this.#canUsurpType(gc.type);
	}
	#usurp(child) {
		const m = usurpMap.get(this.type);
		const gc = child.#parts[0];
		const nt = m?.get(gc.type);
		/* c8 ignore start - impossible */
		if (!nt) return false;
		/* c8 ignore stop */
		this.#parts = gc.#parts;
		for (const p of this.#parts) if (typeof p === "object") p.#parent = this;
		this.type = nt;
		this.#toString = void 0;
		this.#emptyExt = false;
	}
	static fromGlob(pattern, options = {}) {
		const ast = new _a(null, void 0, options);
		_a.#parseAST(pattern, ast, 0, options, 0);
		return ast;
	}
	toMMPattern() {
		/* c8 ignore start */
		if (this !== this.#root) return this.#root.toMMPattern();
		/* c8 ignore stop */
		const glob = this.toString();
		const [re, body, hasMagic, uflag] = this.toRegExpSource();
		if (!(hasMagic || this.#hasMagic || this.#options.nocase && !this.#options.nocaseMagicOnly && glob.toUpperCase() !== glob.toLowerCase())) return body;
		const flags = (this.#options.nocase ? "i" : "") + (uflag ? "u" : "");
		return Object.assign(new RegExp(`^${re}$`, flags), {
			_src: re,
			_glob: glob
		});
	}
	get options() {
		return this.#options;
	}
	toRegExpSource(allowDot) {
		const dot = allowDot ?? !!this.#options.dot;
		if (this.#root === this) {
			this.#flatten();
			this.#fillNegs();
		}
		if (!isExtglobAST(this)) {
			const noEmpty = this.isStart() && this.isEnd() && !this.#parts.some((s) => typeof s !== "string");
			const src = this.#parts.map((p) => {
				const [re, _, hasMagic, uflag] = typeof p === "string" ? _a.#parseGlob(p, this.#hasMagic, noEmpty) : p.toRegExpSource(allowDot);
				this.#hasMagic = this.#hasMagic || hasMagic;
				this.#uflag = this.#uflag || uflag;
				return re;
			}).join("");
			let start = "";
			if (this.isStart()) {
				if (typeof this.#parts[0] === "string") {
					if (!(this.#parts.length === 1 && justDots.has(this.#parts[0]))) {
						const aps = addPatternStart;
						const needNoTrav = dot && aps.has(src.charAt(0)) || src.startsWith("\\.") && aps.has(src.charAt(2)) || src.startsWith("\\.\\.") && aps.has(src.charAt(4));
						const needNoDot = !dot && !allowDot && aps.has(src.charAt(0));
						start = needNoTrav ? startNoTraversal : needNoDot ? startNoDot : "";
					}
				}
			}
			let end = "";
			if (this.isEnd() && this.#root.#filledNegs && this.#parent?.type === "!") end = "(?:$|\\/)";
			return [
				start + src + end,
				unescape(src),
				this.#hasMagic = !!this.#hasMagic,
				this.#uflag
			];
		}
		const repeated = this.type === "*" || this.type === "+";
		const start = this.type === "!" ? "(?:(?!(?:" : "(?:";
		let body = this.#partsToRegExp(dot);
		if (this.isStart() && this.isEnd() && !body && this.type !== "!") {
			const s = this.toString();
			const me = this;
			me.#parts = [s];
			me.type = null;
			me.#hasMagic = void 0;
			return [
				s,
				unescape(this.toString()),
				false,
				false
			];
		}
		let bodyDotAllowed = !repeated || allowDot || dot || false ? "" : this.#partsToRegExp(true);
		if (bodyDotAllowed === body) bodyDotAllowed = "";
		if (bodyDotAllowed) body = `(?:${body})(?:${bodyDotAllowed})*?`;
		let final = "";
		if (this.type === "!" && this.#emptyExt) final = (this.isStart() && !dot ? startNoDot : "") + starNoEmpty;
		else {
			const close = this.type === "!" ? "))" + (this.isStart() && !dot && !allowDot ? startNoDot : "") + star$1 + ")" : this.type === "@" ? ")" : this.type === "?" ? ")?" : this.type === "+" && bodyDotAllowed ? ")" : this.type === "*" && bodyDotAllowed ? `)?` : `)${this.type}`;
			final = start + body + close;
		}
		return [
			final,
			unescape(body),
			this.#hasMagic = !!this.#hasMagic,
			this.#uflag
		];
	}
	#flatten() {
		if (!isExtglobAST(this)) {
			for (const p of this.#parts) if (typeof p === "object") p.#flatten();
		} else {
			let iterations = 0;
			let done = false;
			do {
				done = true;
				for (let i = 0; i < this.#parts.length; i++) {
					const c = this.#parts[i];
					if (typeof c === "object") {
						c.#flatten();
						if (this.#canAdopt(c)) {
							done = false;
							this.#adopt(c, i);
						} else if (this.#canAdoptWithSpace(c)) {
							done = false;
							this.#adoptWithSpace(c, i);
						} else if (this.#canUsurp(c)) {
							done = false;
							this.#usurp(c);
						}
					}
				}
			} while (!done && ++iterations < 10);
		}
		this.#toString = void 0;
	}
	#partsToRegExp(dot) {
		return this.#parts.map((p) => {
			/* c8 ignore start */
			if (typeof p === "string") throw new Error("string type in extglob ast??");
			/* c8 ignore stop */
			const [re, _, _hasMagic, uflag] = p.toRegExpSource(dot);
			this.#uflag = this.#uflag || uflag;
			return re;
		}).filter((p) => !(this.isStart() && this.isEnd()) || !!p).join("|");
	}
	static #parseGlob(glob, hasMagic, noEmpty = false) {
		let escaping = false;
		let re = "";
		let uflag = false;
		let inStar = false;
		for (let i = 0; i < glob.length; i++) {
			const c = glob.charAt(i);
			if (escaping) {
				escaping = false;
				re += (reSpecials.has(c) ? "\\" : "") + c;
				continue;
			}
			if (c === "*") {
				if (inStar) continue;
				inStar = true;
				re += noEmpty && /^[*]+$/.test(glob) ? starNoEmpty : star$1;
				hasMagic = true;
				continue;
			} else inStar = false;
			if (c === "\\") {
				if (i === glob.length - 1) re += "\\\\";
				else escaping = true;
				continue;
			}
			if (c === "[") {
				const [src, needUflag, consumed, magic] = parseClass(glob, i);
				if (consumed) {
					re += src;
					uflag = uflag || needUflag;
					i += consumed - 1;
					hasMagic = hasMagic || magic;
					continue;
				}
			}
			if (c === "?") {
				re += qmark;
				hasMagic = true;
				continue;
			}
			re += regExpEscape$1(c);
		}
		return [
			re,
			unescape(glob),
			!!hasMagic,
			uflag
		];
	}
};
_a = AST;
//#endregion
//#region node_modules/minimatch/dist/esm/escape.js
/**
* Escape all magic characters in a glob pattern.
*
* If the {@link MinimatchOptions.windowsPathsNoEscape}
* option is used, then characters are escaped by wrapping in `[]`, because
* a magic character wrapped in a character class can only be satisfied by
* that exact character.  In this mode, `\` is _not_ escaped, because it is
* not interpreted as a magic character, but instead as a path separator.
*
* If the {@link MinimatchOptions.magicalBraces} option is used,
* then braces (`{` and `}`) will be escaped.
*/
const escape = (s, { windowsPathsNoEscape = false, magicalBraces = false } = {}) => {
	if (magicalBraces) return windowsPathsNoEscape ? s.replace(/[?*()[\]{}]/g, "[$&]") : s.replace(/[?*()[\]\\{}]/g, "\\$&");
	return windowsPathsNoEscape ? s.replace(/[?*()[\]]/g, "[$&]") : s.replace(/[?*()[\]\\]/g, "\\$&");
};
//#endregion
//#region node_modules/minimatch/dist/esm/index.js
const minimatch = (p, pattern, options = {}) => {
	assertValidPattern(pattern);
	if (!options.nocomment && pattern.charAt(0) === "#") return false;
	return new Minimatch(pattern, options).match(p);
};
const starDotExtRE = /^\*+([^+@!?\*\[\(]*)$/;
const starDotExtTest = (ext) => (f) => !f.startsWith(".") && f.endsWith(ext);
const starDotExtTestDot = (ext) => (f) => f.endsWith(ext);
const starDotExtTestNocase = (ext) => {
	ext = ext.toLowerCase();
	return (f) => !f.startsWith(".") && f.toLowerCase().endsWith(ext);
};
const starDotExtTestNocaseDot = (ext) => {
	ext = ext.toLowerCase();
	return (f) => f.toLowerCase().endsWith(ext);
};
const starDotStarRE = /^\*+\.\*+$/;
const starDotStarTest = (f) => !f.startsWith(".") && f.includes(".");
const starDotStarTestDot = (f) => f !== "." && f !== ".." && f.includes(".");
const dotStarRE = /^\.\*+$/;
const dotStarTest = (f) => f !== "." && f !== ".." && f.startsWith(".");
const starRE = /^\*+$/;
const starTest = (f) => f.length !== 0 && !f.startsWith(".");
const starTestDot = (f) => f.length !== 0 && f !== "." && f !== "..";
const qmarksRE = /^\?+([^+@!?\*\[\(]*)?$/;
const qmarksTestNocase = ([$0, ext = ""]) => {
	const noext = qmarksTestNoExt([$0]);
	if (!ext) return noext;
	ext = ext.toLowerCase();
	return (f) => noext(f) && f.toLowerCase().endsWith(ext);
};
const qmarksTestNocaseDot = ([$0, ext = ""]) => {
	const noext = qmarksTestNoExtDot([$0]);
	if (!ext) return noext;
	ext = ext.toLowerCase();
	return (f) => noext(f) && f.toLowerCase().endsWith(ext);
};
const qmarksTestDot = ([$0, ext = ""]) => {
	const noext = qmarksTestNoExtDot([$0]);
	return !ext ? noext : (f) => noext(f) && f.endsWith(ext);
};
const qmarksTest = ([$0, ext = ""]) => {
	const noext = qmarksTestNoExt([$0]);
	return !ext ? noext : (f) => noext(f) && f.endsWith(ext);
};
const qmarksTestNoExt = ([$0]) => {
	const len = $0.length;
	return (f) => f.length === len && !f.startsWith(".");
};
const qmarksTestNoExtDot = ([$0]) => {
	const len = $0.length;
	return (f) => f.length === len && f !== "." && f !== "..";
};
/* c8 ignore start */
const defaultPlatform = typeof process === "object" && process ? typeof process.env === "object" && process.env && process.env.__MINIMATCH_TESTING_PLATFORM__ || process.platform : "posix";
const path$1 = {
	win32: { sep: "\\" },
	posix: { sep: "/" }
};
minimatch.sep = defaultPlatform === "win32" ? path$1.win32.sep : path$1.posix.sep;
const GLOBSTAR = Symbol("globstar **");
minimatch.GLOBSTAR = GLOBSTAR;
const star = "[^/]*?";
const twoStarDot = "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?";
const twoStarNoDot = "(?:(?!(?:\\/|^)\\.).)*?";
const filter = (pattern, options = {}) => (p) => minimatch(p, pattern, options);
minimatch.filter = filter;
const ext = (a, b = {}) => Object.assign({}, a, b);
const defaults = (def) => {
	if (!def || typeof def !== "object" || !Object.keys(def).length) return minimatch;
	const orig = minimatch;
	const m = (p, pattern, options = {}) => orig(p, pattern, ext(def, options));
	return Object.assign(m, {
		Minimatch: class Minimatch extends orig.Minimatch {
			constructor(pattern, options = {}) {
				super(pattern, ext(def, options));
			}
			static defaults(options) {
				return orig.defaults(ext(def, options)).Minimatch;
			}
		},
		AST: class AST extends orig.AST {
			/* c8 ignore start */
			constructor(type, parent, options = {}) {
				super(type, parent, ext(def, options));
			}
			/* c8 ignore stop */
			static fromGlob(pattern, options = {}) {
				return orig.AST.fromGlob(pattern, ext(def, options));
			}
		},
		unescape: (s, options = {}) => orig.unescape(s, ext(def, options)),
		escape: (s, options = {}) => orig.escape(s, ext(def, options)),
		filter: (pattern, options = {}) => orig.filter(pattern, ext(def, options)),
		defaults: (options) => orig.defaults(ext(def, options)),
		makeRe: (pattern, options = {}) => orig.makeRe(pattern, ext(def, options)),
		braceExpand: (pattern, options = {}) => orig.braceExpand(pattern, ext(def, options)),
		match: (list, pattern, options = {}) => orig.match(list, pattern, ext(def, options)),
		sep: orig.sep,
		GLOBSTAR
	});
};
minimatch.defaults = defaults;
const braceExpand = (pattern, options = {}) => {
	assertValidPattern(pattern);
	if (options.nobrace || !/\{(?:(?!\{).)*\}/.test(pattern)) return [pattern];
	return expand(pattern, { max: options.braceExpandMax });
};
minimatch.braceExpand = braceExpand;
const makeRe = (pattern, options = {}) => new Minimatch(pattern, options).makeRe();
minimatch.makeRe = makeRe;
const match = (list, pattern, options = {}) => {
	const mm = new Minimatch(pattern, options);
	list = list.filter((f) => mm.match(f));
	if (mm.options.nonull && !list.length) list.push(pattern);
	return list;
};
minimatch.match = match;
const globMagic = /[?*]|[+@!]\(.*?\)|\[|\]/;
const regExpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var Minimatch = class {
	options;
	set;
	pattern;
	windowsPathsNoEscape;
	nonegate;
	negate;
	comment;
	empty;
	preserveMultipleSlashes;
	partial;
	globSet;
	globParts;
	nocase;
	isWindows;
	platform;
	windowsNoMagicRoot;
	maxGlobstarRecursion;
	regexp;
	constructor(pattern, options = {}) {
		assertValidPattern(pattern);
		options = options || {};
		this.options = options;
		this.maxGlobstarRecursion = options.maxGlobstarRecursion ?? 200;
		this.pattern = pattern;
		this.platform = options.platform || defaultPlatform;
		this.isWindows = this.platform === "win32";
		const awe = "allowWindowsEscape";
		this.windowsPathsNoEscape = !!options.windowsPathsNoEscape || options[awe] === false;
		if (this.windowsPathsNoEscape) this.pattern = this.pattern.replace(/\\/g, "/");
		this.preserveMultipleSlashes = !!options.preserveMultipleSlashes;
		this.regexp = null;
		this.negate = false;
		this.nonegate = !!options.nonegate;
		this.comment = false;
		this.empty = false;
		this.partial = !!options.partial;
		this.nocase = !!this.options.nocase;
		this.windowsNoMagicRoot = options.windowsNoMagicRoot !== void 0 ? options.windowsNoMagicRoot : !!(this.isWindows && this.nocase);
		this.globSet = [];
		this.globParts = [];
		this.set = [];
		this.make();
	}
	hasMagic() {
		if (this.options.magicalBraces && this.set.length > 1) return true;
		for (const pattern of this.set) for (const part of pattern) if (typeof part !== "string") return true;
		return false;
	}
	debug(..._) {}
	make() {
		const pattern = this.pattern;
		const options = this.options;
		if (!options.nocomment && pattern.charAt(0) === "#") {
			this.comment = true;
			return;
		}
		if (!pattern) {
			this.empty = true;
			return;
		}
		this.parseNegate();
		this.globSet = [...new Set(this.braceExpand())];
		if (options.debug) this.debug = (...args) => console.error(...args);
		this.debug(this.pattern, this.globSet);
		const rawGlobParts = this.globSet.map((s) => this.slashSplit(s));
		this.globParts = this.preprocess(rawGlobParts);
		this.debug(this.pattern, this.globParts);
		let set = this.globParts.map((s, _, __) => {
			if (this.isWindows && this.windowsNoMagicRoot) {
				const isUNC = s[0] === "" && s[1] === "" && (s[2] === "?" || !globMagic.test(s[2])) && !globMagic.test(s[3]);
				const isDrive = /^[a-z]:/i.test(s[0]);
				if (isUNC) return [...s.slice(0, 4), ...s.slice(4).map((ss) => this.parse(ss))];
				else if (isDrive) return [s[0], ...s.slice(1).map((ss) => this.parse(ss))];
			}
			return s.map((ss) => this.parse(ss));
		});
		this.debug(this.pattern, set);
		this.set = set.filter((s) => s.indexOf(false) === -1);
		if (this.isWindows) for (let i = 0; i < this.set.length; i++) {
			const p = this.set[i];
			if (p[0] === "" && p[1] === "" && this.globParts[i][2] === "?" && typeof p[3] === "string" && /^[a-z]:$/i.test(p[3])) p[2] = "?";
		}
		this.debug(this.pattern, this.set);
	}
	preprocess(globParts) {
		if (this.options.noglobstar) {
			for (let i = 0; i < globParts.length; i++) for (let j = 0; j < globParts[i].length; j++) if (globParts[i][j] === "**") globParts[i][j] = "*";
		}
		const { optimizationLevel = 1 } = this.options;
		if (optimizationLevel >= 2) {
			globParts = this.firstPhasePreProcess(globParts);
			globParts = this.secondPhasePreProcess(globParts);
		} else if (optimizationLevel >= 1) globParts = this.levelOneOptimize(globParts);
		else globParts = this.adjascentGlobstarOptimize(globParts);
		return globParts;
	}
	adjascentGlobstarOptimize(globParts) {
		return globParts.map((parts) => {
			let gs = -1;
			while (-1 !== (gs = parts.indexOf("**", gs + 1))) {
				let i = gs;
				while (parts[i + 1] === "**") i++;
				if (i !== gs) parts.splice(gs, i - gs);
			}
			return parts;
		});
	}
	levelOneOptimize(globParts) {
		return globParts.map((parts) => {
			parts = parts.reduce((set, part) => {
				const prev = set[set.length - 1];
				if (part === "**" && prev === "**") return set;
				if (part === "..") {
					if (prev && prev !== ".." && prev !== "." && prev !== "**") {
						set.pop();
						return set;
					}
				}
				set.push(part);
				return set;
			}, []);
			return parts.length === 0 ? [""] : parts;
		});
	}
	levelTwoFileOptimize(parts) {
		if (!Array.isArray(parts)) parts = this.slashSplit(parts);
		let didSomething = false;
		do {
			didSomething = false;
			if (!this.preserveMultipleSlashes) {
				for (let i = 1; i < parts.length - 1; i++) {
					const p = parts[i];
					if (i === 1 && p === "" && parts[0] === "") continue;
					if (p === "." || p === "") {
						didSomething = true;
						parts.splice(i, 1);
						i--;
					}
				}
				if (parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "")) {
					didSomething = true;
					parts.pop();
				}
			}
			let dd = 0;
			while (-1 !== (dd = parts.indexOf("..", dd + 1))) {
				const p = parts[dd - 1];
				if (p && p !== "." && p !== ".." && p !== "**") {
					didSomething = true;
					parts.splice(dd - 1, 2);
					dd -= 2;
				}
			}
		} while (didSomething);
		return parts.length === 0 ? [""] : parts;
	}
	firstPhasePreProcess(globParts) {
		let didSomething = false;
		do {
			didSomething = false;
			for (let parts of globParts) {
				let gs = -1;
				while (-1 !== (gs = parts.indexOf("**", gs + 1))) {
					let gss = gs;
					while (parts[gss + 1] === "**") gss++;
					if (gss > gs) parts.splice(gs + 1, gss - gs);
					let next = parts[gs + 1];
					const p = parts[gs + 2];
					const p2 = parts[gs + 3];
					if (next !== "..") continue;
					if (!p || p === "." || p === ".." || !p2 || p2 === "." || p2 === "..") continue;
					didSomething = true;
					parts.splice(gs, 1);
					const other = parts.slice(0);
					other[gs] = "**";
					globParts.push(other);
					gs--;
				}
				if (!this.preserveMultipleSlashes) {
					for (let i = 1; i < parts.length - 1; i++) {
						const p = parts[i];
						if (i === 1 && p === "" && parts[0] === "") continue;
						if (p === "." || p === "") {
							didSomething = true;
							parts.splice(i, 1);
							i--;
						}
					}
					if (parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "")) {
						didSomething = true;
						parts.pop();
					}
				}
				let dd = 0;
				while (-1 !== (dd = parts.indexOf("..", dd + 1))) {
					const p = parts[dd - 1];
					if (p && p !== "." && p !== ".." && p !== "**") {
						didSomething = true;
						const splin = dd === 1 && parts[dd + 1] === "**" ? ["."] : [];
						parts.splice(dd - 1, 2, ...splin);
						if (parts.length === 0) parts.push("");
						dd -= 2;
					}
				}
			}
		} while (didSomething);
		return globParts;
	}
	secondPhasePreProcess(globParts) {
		for (let i = 0; i < globParts.length - 1; i++) for (let j = i + 1; j < globParts.length; j++) {
			const matched = this.partsMatch(globParts[i], globParts[j], !this.preserveMultipleSlashes);
			if (matched) {
				globParts[i] = [];
				globParts[j] = matched;
				break;
			}
		}
		return globParts.filter((gs) => gs.length);
	}
	partsMatch(a, b, emptyGSMatch = false) {
		let ai = 0;
		let bi = 0;
		let result = [];
		let which = "";
		while (ai < a.length && bi < b.length) if (a[ai] === b[bi]) {
			result.push(which === "b" ? b[bi] : a[ai]);
			ai++;
			bi++;
		} else if (emptyGSMatch && a[ai] === "**" && b[bi] === a[ai + 1]) {
			result.push(a[ai]);
			ai++;
		} else if (emptyGSMatch && b[bi] === "**" && a[ai] === b[bi + 1]) {
			result.push(b[bi]);
			bi++;
		} else if (a[ai] === "*" && b[bi] && (this.options.dot || !b[bi].startsWith(".")) && b[bi] !== "**") {
			if (which === "b") return false;
			which = "a";
			result.push(a[ai]);
			ai++;
			bi++;
		} else if (b[bi] === "*" && a[ai] && (this.options.dot || !a[ai].startsWith(".")) && a[ai] !== "**") {
			if (which === "a") return false;
			which = "b";
			result.push(b[bi]);
			ai++;
			bi++;
		} else return false;
		return a.length === b.length && result;
	}
	parseNegate() {
		if (this.nonegate) return;
		const pattern = this.pattern;
		let negate = false;
		let negateOffset = 0;
		for (let i = 0; i < pattern.length && pattern.charAt(i) === "!"; i++) {
			negate = !negate;
			negateOffset++;
		}
		if (negateOffset) this.pattern = pattern.slice(negateOffset);
		this.negate = negate;
	}
	matchOne(file, pattern, partial = false) {
		let fileStartIndex = 0;
		let patternStartIndex = 0;
		if (this.isWindows) {
			const fileDrive = typeof file[0] === "string" && /^[a-z]:$/i.test(file[0]);
			const fileUNC = !fileDrive && file[0] === "" && file[1] === "" && file[2] === "?" && /^[a-z]:$/i.test(file[3]);
			const patternDrive = typeof pattern[0] === "string" && /^[a-z]:$/i.test(pattern[0]);
			const patternUNC = !patternDrive && pattern[0] === "" && pattern[1] === "" && pattern[2] === "?" && typeof pattern[3] === "string" && /^[a-z]:$/i.test(pattern[3]);
			const fdi = fileUNC ? 3 : fileDrive ? 0 : void 0;
			const pdi = patternUNC ? 3 : patternDrive ? 0 : void 0;
			if (typeof fdi === "number" && typeof pdi === "number") {
				const [fd, pd] = [file[fdi], pattern[pdi]];
				if (fd.toLowerCase() === pd.toLowerCase()) {
					pattern[pdi] = fd;
					patternStartIndex = pdi;
					fileStartIndex = fdi;
				}
			}
		}
		const { optimizationLevel = 1 } = this.options;
		if (optimizationLevel >= 2) file = this.levelTwoFileOptimize(file);
		if (pattern.includes(GLOBSTAR)) return this.#matchGlobstar(file, pattern, partial, fileStartIndex, patternStartIndex);
		return this.#matchOne(file, pattern, partial, fileStartIndex, patternStartIndex);
	}
	#matchGlobstar(file, pattern, partial, fileIndex, patternIndex) {
		const firstgs = pattern.indexOf(GLOBSTAR, patternIndex);
		const lastgs = pattern.lastIndexOf(GLOBSTAR);
		const [head, body, tail] = partial ? [
			pattern.slice(patternIndex, firstgs),
			pattern.slice(firstgs + 1),
			[]
		] : [
			pattern.slice(patternIndex, firstgs),
			pattern.slice(firstgs + 1, lastgs),
			pattern.slice(lastgs + 1)
		];
		if (head.length) {
			const fileHead = file.slice(fileIndex, fileIndex + head.length);
			if (!this.#matchOne(fileHead, head, partial, 0, 0)) return false;
			fileIndex += head.length;
			patternIndex += head.length;
		}
		let fileTailMatch = 0;
		if (tail.length) {
			if (tail.length + fileIndex > file.length) return false;
			let tailStart = file.length - tail.length;
			if (this.#matchOne(file, tail, partial, tailStart, 0)) fileTailMatch = tail.length;
			else {
				if (file[file.length - 1] !== "" || fileIndex + tail.length === file.length) return false;
				tailStart--;
				if (!this.#matchOne(file, tail, partial, tailStart, 0)) return false;
				fileTailMatch = tail.length + 1;
			}
		}
		if (!body.length) {
			let sawSome = !!fileTailMatch;
			for (let i = fileIndex; i < file.length - fileTailMatch; i++) {
				const f = String(file[i]);
				sawSome = true;
				if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) return false;
			}
			return partial || sawSome;
		}
		const bodySegments = [[[], 0]];
		let currentBody = bodySegments[0];
		let nonGsParts = 0;
		const nonGsPartsSums = [0];
		for (const b of body) if (b === GLOBSTAR) {
			nonGsPartsSums.push(nonGsParts);
			currentBody = [[], 0];
			bodySegments.push(currentBody);
		} else {
			currentBody[0].push(b);
			nonGsParts++;
		}
		let i = bodySegments.length - 1;
		const fileLength = file.length - fileTailMatch;
		for (const b of bodySegments) b[1] = fileLength - (nonGsPartsSums[i--] + b[0].length);
		return !!this.#matchGlobStarBodySections(file, bodySegments, fileIndex, 0, partial, 0, !!fileTailMatch);
	}
	#matchGlobStarBodySections(file, bodySegments, fileIndex, bodyIndex, partial, globStarDepth, sawTail) {
		const bs = bodySegments[bodyIndex];
		if (!bs) {
			for (let i = fileIndex; i < file.length; i++) {
				sawTail = true;
				const f = file[i];
				if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) return false;
			}
			return sawTail;
		}
		const [body, after] = bs;
		while (fileIndex <= after) {
			if (this.#matchOne(file.slice(0, fileIndex + body.length), body, partial, fileIndex, 0) && globStarDepth < this.maxGlobstarRecursion) {
				const sub = this.#matchGlobStarBodySections(file, bodySegments, fileIndex + body.length, bodyIndex + 1, partial, globStarDepth + 1, sawTail);
				if (sub !== false) return sub;
			}
			const f = file[fileIndex];
			if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) return false;
			fileIndex++;
		}
		return partial || null;
	}
	#matchOne(file, pattern, partial, fileIndex, patternIndex) {
		let fi;
		let pi;
		let pl;
		let fl;
		for (fi = fileIndex, pi = patternIndex, fl = file.length, pl = pattern.length; fi < fl && pi < pl; fi++, pi++) {
			this.debug("matchOne loop");
			let p = pattern[pi];
			let f = file[fi];
			this.debug(pattern, p, f);
			/* c8 ignore start */
			if (p === false || p === GLOBSTAR) return false;
			/* c8 ignore stop */
			let hit;
			if (typeof p === "string") {
				hit = f === p;
				this.debug("string match", p, f, hit);
			} else {
				hit = p.test(f);
				this.debug("pattern match", p, f, hit);
			}
			if (!hit) return false;
		}
		if (fi === fl && pi === pl) return true;
		else if (fi === fl) return partial;
		else if (pi === pl) return fi === fl - 1 && file[fi] === "";
		else throw new Error("wtf?");
		/* c8 ignore stop */
	}
	braceExpand() {
		return braceExpand(this.pattern, this.options);
	}
	parse(pattern) {
		assertValidPattern(pattern);
		const options = this.options;
		if (pattern === "**") return GLOBSTAR;
		if (pattern === "") return "";
		let m;
		let fastTest = null;
		if (m = pattern.match(starRE)) fastTest = options.dot ? starTestDot : starTest;
		else if (m = pattern.match(starDotExtRE)) fastTest = (options.nocase ? options.dot ? starDotExtTestNocaseDot : starDotExtTestNocase : options.dot ? starDotExtTestDot : starDotExtTest)(m[1]);
		else if (m = pattern.match(qmarksRE)) fastTest = (options.nocase ? options.dot ? qmarksTestNocaseDot : qmarksTestNocase : options.dot ? qmarksTestDot : qmarksTest)(m);
		else if (m = pattern.match(starDotStarRE)) fastTest = options.dot ? starDotStarTestDot : starDotStarTest;
		else if (m = pattern.match(dotStarRE)) fastTest = dotStarTest;
		const re = AST.fromGlob(pattern, this.options).toMMPattern();
		if (fastTest && typeof re === "object") Reflect.defineProperty(re, "test", { value: fastTest });
		return re;
	}
	makeRe() {
		if (this.regexp || this.regexp === false) return this.regexp;
		const set = this.set;
		if (!set.length) {
			this.regexp = false;
			return this.regexp;
		}
		const options = this.options;
		const twoStar = options.noglobstar ? star : options.dot ? twoStarDot : twoStarNoDot;
		const flags = new Set(options.nocase ? ["i"] : []);
		let re = set.map((pattern) => {
			const pp = pattern.map((p) => {
				if (p instanceof RegExp) for (const f of p.flags.split("")) flags.add(f);
				return typeof p === "string" ? regExpEscape(p) : p === GLOBSTAR ? GLOBSTAR : p._src;
			});
			pp.forEach((p, i) => {
				const next = pp[i + 1];
				const prev = pp[i - 1];
				if (p !== GLOBSTAR || prev === GLOBSTAR) return;
				if (prev === void 0) if (next !== void 0 && next !== GLOBSTAR) pp[i + 1] = "(?:\\/|" + twoStar + "\\/)?" + next;
				else pp[i] = twoStar;
				else if (next === void 0) pp[i - 1] = prev + "(?:\\/|\\/" + twoStar + ")?";
				else if (next !== GLOBSTAR) {
					pp[i - 1] = prev + "(?:\\/|\\/" + twoStar + "\\/)" + next;
					pp[i + 1] = GLOBSTAR;
				}
			});
			const filtered = pp.filter((p) => p !== GLOBSTAR);
			if (this.partial && filtered.length >= 1) {
				const prefixes = [];
				for (let i = 1; i <= filtered.length; i++) prefixes.push(filtered.slice(0, i).join("/"));
				return "(?:" + prefixes.join("|") + ")";
			}
			return filtered.join("/");
		}).join("|");
		const [open, close] = set.length > 1 ? ["(?:", ")"] : ["", ""];
		re = "^" + open + re + close + "$";
		if (this.partial) re = "^(?:\\/|" + open + re.slice(1, -1) + close + ")$";
		if (this.negate) re = "^(?!" + re + ").+$";
		try {
			this.regexp = new RegExp(re, [...flags].join(""));
		} catch (ex) {
			this.regexp = false;
		}
		/* c8 ignore stop */
		return this.regexp;
	}
	slashSplit(p) {
		if (this.preserveMultipleSlashes) return p.split("/");
		else if (this.isWindows && /^\/\/[^\/]+/.test(p)) return ["", ...p.split(/\/+/)];
		else return p.split(/\/+/);
	}
	match(f, partial = this.partial) {
		this.debug("match", f, this.pattern);
		if (this.comment) return false;
		if (this.empty) return f === "";
		if (f === "/" && partial) return true;
		const options = this.options;
		if (this.isWindows) f = f.split("\\").join("/");
		const ff = this.slashSplit(f);
		this.debug(this.pattern, "split", ff);
		const set = this.set;
		this.debug(this.pattern, "set", set);
		let filename = ff[ff.length - 1];
		if (!filename) for (let i = ff.length - 2; !filename && i >= 0; i--) filename = ff[i];
		for (let i = 0; i < set.length; i++) {
			const pattern = set[i];
			let file = ff;
			if (options.matchBase && pattern.length === 1) file = [filename];
			if (this.matchOne(file, pattern, partial)) {
				if (options.flipNegate) return true;
				return !this.negate;
			}
		}
		if (options.flipNegate) return false;
		return this.negate;
	}
	static defaults(def) {
		return minimatch.defaults(def).Minimatch;
	}
};
/* c8 ignore stop */
minimatch.AST = AST;
minimatch.Minimatch = Minimatch;
minimatch.escape = escape;
minimatch.unescape = unescape;
//#endregion
//#region extensions/file-transfer/src/shared/policy.ts
function asFilePolicyConfig(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value;
}
function readFilePolicyConfigFromPluginConfig(pluginConfig) {
	if (!pluginConfig || typeof pluginConfig !== "object" || Array.isArray(pluginConfig)) return null;
	const nodes = pluginConfig.nodes;
	return asFilePolicyConfig(nodes);
}
function readPluginConfigFromRuntimeConfig() {
	const plugins = getRuntimeConfig().plugins;
	if (!plugins || typeof plugins !== "object") return null;
	const entries = plugins.entries;
	if (!entries || typeof entries !== "object") return null;
	const entry = entries["file-transfer"];
	if (!entry || typeof entry !== "object") return null;
	const pluginConfig = entry.config;
	return pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig) ? pluginConfig : null;
}
function readFilePolicyConfig(pluginConfig) {
	return readFilePolicyConfigFromPluginConfig(readPluginConfigFromRuntimeConfig()) ?? readFilePolicyConfigFromPluginConfig(pluginConfig);
}
function expandTilde(p) {
	if (p.startsWith("~/") || p === "~") return path.join(os.homedir(), p.slice(p === "~" ? 1 : 2));
	return p;
}
function normalizeGlobs(patterns) {
	if (!Array.isArray(patterns)) return [];
	return patterns.filter((p) => typeof p === "string" && p.trim().length > 0).map((p) => expandTilde(p.trim()));
}
function matchesAny(target, patterns) {
	const normalizedTarget = target.replace(/\\/gu, "/");
	for (const pattern of patterns) {
		const normalizedPattern = pattern.replace(/\\/gu, "/");
		if (minimatch(target, pattern, { dot: true }) || minimatch(normalizedTarget, normalizedPattern, { dot: true })) return true;
	}
	return false;
}
function resolveNodePolicy(config, nodeId, nodeDisplayName) {
	const candidates = [nodeId, nodeDisplayName].filter((k) => typeof k === "string" && k.length > 0);
	for (const key of candidates) if (config[key]) return {
		key,
		entry: config[key]
	};
	if (config["*"]) return {
		key: "*",
		entry: config["*"]
	};
	return null;
}
function normalizeAskMode(value) {
	if (value === "on-miss" || value === "always" || value === "off") return value;
	return "off";
}
/**
* Evaluate whether (nodeId, kind, path) is permitted.
*
* Resolution order:
*   1. No file-transfer config or no entry for this node → NO_POLICY (deny,
*      not askable — operator hasn't opted in at all).
*   2. denyPaths matches → POLICY_DENIED, not askable (hard deny).
*   3. ask=always → ask-always (prompt every time).
*   4. allowPaths matches → matched-allow (silent allow).
*   5. ask=on-miss → POLICY_DENIED with askable=true.
*   6. ask=off (or unset) → POLICY_DENIED, not askable.
*/
/**
* Reject any path whose RAW string contains a ".." segment. Checking the
* raw string (not the normalized form) is the point — `posix.normalize`
* collapses "/allowed/../etc/passwd" to "/etc/passwd", which would defeat
* the check. We want to flag the literal traversal sequence the agent
* passed in, before any glob match runs.
*
* Without this, "/allowed/../etc/passwd" matches the glob "/allowed/**"
* pre-realpath, so the node fetches the bytes before the post-flight
* canonical-path check denies — too late, the bytes already crossed the
* node→gateway boundary.
*
* Treats backslash and forward slash as equivalent separators so a Windows
* node can't be hit with "C:\\allowed\\..\\Windows\\system.ini".
*/
function containsParentRefSegment(p) {
	return p.replace(/\\/gu, "/").split("/").includes("..");
}
function evaluateFilePolicy(input) {
	if (containsParentRefSegment(input.path)) return {
		ok: false,
		code: "POLICY_DENIED",
		reason: "path contains '..' segments; reject before glob match",
		askable: false
	};
	const config = readFilePolicyConfig(input.pluginConfig);
	if (!config) return {
		ok: false,
		code: "NO_POLICY",
		reason: "no plugins.entries.file-transfer.config.nodes config; file-transfer is deny-by-default until configured",
		askable: false
	};
	const resolved = resolveNodePolicy(config, input.nodeId, input.nodeDisplayName);
	if (!resolved) return {
		ok: false,
		code: "NO_POLICY",
		reason: `no file-transfer policy entry for "${input.nodeDisplayName ?? input.nodeId}"; configure plugins.entries.file-transfer.config.nodes or "*"`,
		askable: false
	};
	const nodeConfig = resolved.entry;
	const askMode = normalizeAskMode(nodeConfig.ask);
	const maxBytes = typeof nodeConfig.maxBytes === "number" && Number.isFinite(nodeConfig.maxBytes) ? Math.max(1, Math.floor(nodeConfig.maxBytes)) : void 0;
	const followSymlinks = nodeConfig.followSymlinks === true;
	const denyPatterns = normalizeGlobs(nodeConfig.denyPaths);
	if (matchesAny(input.path, denyPatterns)) return {
		ok: false,
		code: "POLICY_DENIED",
		reason: "path matches a denyPaths pattern",
		askable: false,
		askMode,
		maxBytes,
		followSymlinks
	};
	if (askMode === "always") return {
		ok: true,
		reason: "ask-always",
		askMode,
		maxBytes,
		followSymlinks
	};
	const allowPatterns = input.kind === "read" ? normalizeGlobs(nodeConfig.allowReadPaths) : normalizeGlobs(nodeConfig.allowWritePaths);
	if (allowPatterns.length > 0 && matchesAny(input.path, allowPatterns)) return {
		ok: true,
		reason: "matched-allow",
		maxBytes,
		followSymlinks
	};
	if (askMode === "on-miss") return {
		ok: false,
		code: "POLICY_DENIED",
		reason: `path does not match any allow${input.kind === "read" ? "Read" : "Write"}Paths pattern`,
		askable: true,
		askMode,
		maxBytes,
		followSymlinks
	};
	return {
		ok: false,
		code: "POLICY_DENIED",
		reason: allowPatterns.length === 0 ? `no allow${input.kind === "read" ? "Read" : "Write"}Paths configured` : `path does not match any allow${input.kind === "read" ? "Read" : "Write"}Paths pattern`,
		askable: false,
		askMode,
		maxBytes,
		followSymlinks
	};
}
/**
* Persist an "allow-always" approval by appending the path to the
* relevant allowReadPaths / allowWritePaths list for the node. Uses
* mutateConfigFile so the change survives gateway restarts.
*
* Inserts under whichever key matched the policy (per-node entry, or
* the "*" wildcard if that's what was hit). If no entry exists yet,
* creates one keyed by nodeDisplayName ?? nodeId.
*/
/**
* Reject special object keys that would mutate the prototype chain when
* used as a property name (e.g. `__proto__` setter on a plain object).
* The nodeDisplayName comes from paired-node metadata which we don't
* fully control; refuse to persist policy under a key that could corrupt
* the plugin policy container's prototype.
*/
function assertSafeConfigKey(key) {
	if (key === "__proto__" || key === "prototype" || key === "constructor") throw new Error(`refusing to persist file-transfer policy under unsafe key: ${key}`);
	return key;
}
async function persistAllowAlways(input) {
	const field = input.kind === "read" ? "allowReadPaths" : "allowWritePaths";
	await mutateConfigFile({
		afterWrite: {
			mode: "none",
			reason: "file-transfer allow-always policy update"
		},
		mutate: (draft) => {
			const root = draft;
			const plugins = root.plugins ??= {};
			const entries = plugins.entries ??= {};
			const pluginEntry = entries["file-transfer"] ??= {};
			const pluginConfig = pluginEntry.config ??= {};
			const fileTransfer = pluginConfig.nodes ??= {};
			let key = [input.nodeId, input.nodeDisplayName].filter((k) => typeof k === "string" && k.length > 0).find((c) => Object.prototype.hasOwnProperty.call(fileTransfer, c));
			if (!key) {
				key = assertSafeConfigKey(input.nodeDisplayName ?? input.nodeId);
				fileTransfer[key] = {};
			}
			const entry = fileTransfer[key];
			const list = Array.isArray(entry[field]) ? entry[field] : [];
			if (!list.includes(input.path)) list.push(input.path);
			entry[field] = list;
		}
	});
}
//#endregion
//#region extensions/file-transfer/src/shared/node-invoke-policy.ts
const FILE_FETCH_DEFAULT_MAX_BYTES$1 = 8 * 1024 * 1024;
const FILE_FETCH_HARD_MAX_BYTES$1 = 16 * 1024 * 1024;
const DIR_FETCH_DEFAULT_MAX_BYTES$1 = 8 * 1024 * 1024;
const DIR_FETCH_HARD_MAX_BYTES$1 = 16 * 1024 * 1024;
const DIR_FETCH_ARCHIVE_LIST_TIMEOUT_MS = 3e4;
const DIR_FETCH_ARCHIVE_LIST_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const COMMANDS = [
	"file.fetch",
	"dir.list",
	"dir.fetch",
	"file.write"
];
function asRecord(value) {
	return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function readPath(params) {
	return typeof params.path === "string" ? params.path.trim() : "";
}
function readMaxBytes(input) {
	const requested = typeof input.value === "number" && Number.isFinite(input.value) ? Math.floor(input.value) : input.defaultValue;
	const clamped = Math.max(1, Math.min(requested, input.hardMax));
	return input.policyMax ? Math.min(clamped, input.policyMax) : clamped;
}
function commandKind(command) {
	return command === "file.write" ? "write" : "read";
}
function promptVerb(command) {
	switch (command) {
		case "dir.fetch": return "Fetch directory";
		case "dir.list": return "List directory";
		case "file.write": return "Write file";
		case "file.fetch": return "Read file";
	}
	return command;
}
async function requestApproval(input) {
	const nodeDisplayName = input.ctx.node?.displayName;
	const decision = evaluateFilePolicy({
		nodeId: input.ctx.nodeId,
		nodeDisplayName,
		kind: input.kind,
		path: input.path,
		pluginConfig: input.ctx.pluginConfig
	});
	if (decision.ok && decision.reason === "matched-allow") return {
		ok: true,
		followSymlinks: decision.followSymlinks,
		maxBytes: decision.maxBytes
	};
	if (!(decision.ok && decision.reason === "ask-always" || !decision.ok && decision.askable)) {
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.path,
			decision: !decision.ok && decision.code === "NO_POLICY" ? "denied:no_policy" : "denied:policy",
			errorCode: decision.ok ? void 0 : decision.code,
			reason: decision.ok ? decision.reason : decision.reason,
			durationMs: Date.now() - input.startedAt
		});
		return {
			ok: false,
			code: decision.ok ? "POLICY_DENIED" : decision.code,
			message: `${input.op} ${decision.ok ? "POLICY_DENIED" : decision.code}: ${decision.reason}`
		};
	}
	const approvals = input.ctx.approvals;
	if (!approvals) {
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.path,
			decision: "denied:approval",
			reason: "plugin approvals unavailable",
			durationMs: Date.now() - input.startedAt
		});
		return {
			ok: false,
			code: "APPROVAL_UNAVAILABLE",
			message: `${input.op} APPROVAL_UNAVAILABLE: plugin approvals unavailable`
		};
	}
	const verb = promptVerb(input.op);
	const subject = nodeDisplayName ?? input.ctx.nodeId;
	const approval = await approvals.request({
		title: `${verb}: ${input.path}`,
		description: `Allow ${verb.toLowerCase()} on ${subject}\nPath: ${input.path}\nKind: ${input.kind}\n\n"allow-always" appends this exact path to allow${input.kind === "read" ? "Read" : "Write"}Paths.`,
		severity: input.kind === "write" ? "warning" : "info",
		toolName: input.op
	});
	if (approval.decision === "deny" || approval.decision === null || !approval.decision) {
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.path,
			decision: "denied:approval",
			reason: approval.decision === "deny" ? "operator denied" : "no operator available",
			durationMs: Date.now() - input.startedAt
		});
		return {
			ok: false,
			code: approval.decision === "deny" ? "APPROVAL_DENIED" : "APPROVAL_UNAVAILABLE",
			message: approval.decision === "deny" ? `${input.op} APPROVAL_DENIED: operator denied the prompt` : `${input.op} APPROVAL_UNAVAILABLE: no operator client connected to approve the request`
		};
	}
	if (approval.decision === "allow-always") try {
		await persistAllowAlways({
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			kind: input.kind,
			path: input.path
		});
		const refreshed = evaluateFilePolicy({
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			kind: input.kind,
			path: input.path,
			pluginConfig: input.ctx.pluginConfig
		});
		if (refreshed.ok) {
			await appendFileTransferAudit({
				op: input.op,
				nodeId: input.ctx.nodeId,
				nodeDisplayName,
				requestedPath: input.path,
				decision: "allowed:always",
				durationMs: Date.now() - input.startedAt
			});
			return {
				ok: true,
				followSymlinks: refreshed.followSymlinks,
				maxBytes: refreshed.maxBytes
			};
		}
	} catch (error) {
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.path,
			decision: "allowed:always",
			reason: `persist failed: ${String(error)}`,
			durationMs: Date.now() - input.startedAt
		});
		return {
			ok: true,
			followSymlinks: decision.ok ? decision.followSymlinks : false,
			maxBytes: decision.maxBytes
		};
	}
	await appendFileTransferAudit({
		op: input.op,
		nodeId: input.ctx.nodeId,
		nodeDisplayName,
		requestedPath: input.path,
		decision: approval.decision === "allow-always" ? "allowed:always" : "allowed:once",
		durationMs: Date.now() - input.startedAt
	});
	return {
		ok: true,
		followSymlinks: decision.ok ? decision.followSymlinks : false,
		maxBytes: decision.maxBytes
	};
}
function prepareParams(input) {
	const next = {
		...input.params,
		followSymlinks: input.followSymlinks
	};
	delete next.preflightOnly;
	if (input.command === "file.fetch") next.maxBytes = readMaxBytes({
		value: input.params.maxBytes,
		defaultValue: FILE_FETCH_DEFAULT_MAX_BYTES$1,
		hardMax: FILE_FETCH_HARD_MAX_BYTES$1,
		policyMax: input.maxBytes
	});
	else if (input.command === "dir.fetch") next.maxBytes = readMaxBytes({
		value: input.params.maxBytes,
		defaultValue: DIR_FETCH_DEFAULT_MAX_BYTES$1,
		hardMax: DIR_FETCH_HARD_MAX_BYTES$1,
		policyMax: input.maxBytes
	});
	return next;
}
function readResultPayload(result) {
	return result.payload && typeof result.payload === "object" && !Array.isArray(result.payload) ? result.payload : null;
}
function joinRemotePolicyPath(root, relPath) {
	const rel = relPath.replace(/\\/gu, "/").replace(/^\.\//u, "");
	if (!rel || rel === ".") return root;
	const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
	const prefix = root.replace(/[\\/]$/u, "") || sep;
	return `${prefix}${prefix.endsWith(sep) ? "" : sep}${rel.split("/").join(sep)}`;
}
function validateDirFetchPreflightEntry(entry) {
	if (entry.includes("\0")) return {
		ok: false,
		reason: "entry contains NUL byte"
	};
	const normalized = entry.replace(/\\/gu, "/").replace(/^\.\//u, "");
	if (!normalized || normalized === ".") return {
		ok: false,
		reason: "entry is empty"
	};
	if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) return {
		ok: false,
		reason: "entry is absolute"
	};
	if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) return {
		ok: false,
		reason: "entry contains '..' traversal"
	};
	return { ok: true };
}
function normalizeTarEntryPath(entry) {
	const normalized = entry.replace(/\\/gu, "/").replace(/^\.\//u, "").replace(/\/$/u, "");
	return normalized.length > 0 ? normalized : null;
}
async function listDirFetchArchiveEntries(payload) {
	const tarBase64 = typeof payload?.tarBase64 === "string" ? payload.tarBase64 : "";
	if (!tarBase64) return {
		ok: false,
		code: "ARCHIVE_ENTRIES_MISSING",
		reason: "dir.fetch archive did not return tarBase64"
	};
	const tarBuffer = Buffer.from(tarBase64, "base64");
	return await new Promise((resolve) => {
		const child = spawn(process.platform !== "win32" ? "/usr/bin/tar" : "tar", ["-tzf", "-"], { stdio: [
			"pipe",
			"pipe",
			"pipe"
		] });
		let stdout = "";
		let stderr = "";
		let aborted = false;
		const watchdog = setTimeout(() => {
			aborted = true;
			try {
				child.kill("SIGKILL");
			} catch {}
			resolve({
				ok: false,
				code: "ARCHIVE_ENTRIES_UNREADABLE",
				reason: "tar -tzf timed out"
			});
		}, DIR_FETCH_ARCHIVE_LIST_TIMEOUT_MS);
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
			if (stdout.length > DIR_FETCH_ARCHIVE_LIST_MAX_OUTPUT_BYTES) {
				aborted = true;
				clearTimeout(watchdog);
				try {
					child.kill("SIGKILL");
				} catch {}
				resolve({
					ok: false,
					code: "ARCHIVE_ENTRIES_UNREADABLE",
					reason: "tar -tzf output too large"
				});
			}
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("close", (code) => {
			clearTimeout(watchdog);
			if (aborted) return;
			if (code !== 0) {
				resolve({
					ok: false,
					code: "ARCHIVE_ENTRIES_UNREADABLE",
					reason: `tar -tzf exited ${code}: ${stderr.slice(0, 200)}`
				});
				return;
			}
			resolve({
				ok: true,
				entries: stdout.split("\n").map(normalizeTarEntryPath).filter((entry) => entry !== null)
			});
		});
		child.on("error", (error) => {
			clearTimeout(watchdog);
			if (!aborted) resolve({
				ok: false,
				code: "ARCHIVE_ENTRIES_UNREADABLE",
				reason: `tar -tzf error: ${String(error)}`
			});
		});
		child.stdin.end(tarBuffer);
	});
}
async function validateDirFetchEntries(input) {
	const nodeDisplayName = input.ctx.node?.displayName;
	const missingCode = input.phase === "preflight" ? "PREFLIGHT_ENTRIES_MISSING" : "ARCHIVE_ENTRIES_MISSING";
	const invalidCode = input.phase === "preflight" ? "PREFLIGHT_ENTRY_INVALID" : "ARCHIVE_ENTRY_INVALID";
	if (!Array.isArray(input.entries)) {
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.requestedPath,
			canonicalPath: input.canonicalPath,
			decision: "error",
			errorCode: missingCode,
			reason: `dir.fetch ${input.phase} did not return entries`,
			durationMs: Date.now() - input.startedAt
		});
		return policyDeniedResult({
			op: input.op,
			code: missingCode,
			message: `dir.fetch ${input.phase} did not return entries; refusing archive transfer`,
			details: { path: input.canonicalPath }
		});
	}
	const entries = [];
	for (const entry of input.entries) {
		if (typeof entry !== "string" || entry.length === 0) {
			await appendFileTransferAudit({
				op: input.op,
				nodeId: input.ctx.nodeId,
				nodeDisplayName,
				requestedPath: input.requestedPath,
				canonicalPath: input.canonicalPath,
				decision: "denied:policy",
				errorCode: invalidCode,
				reason: "entry is not a non-empty string",
				durationMs: Date.now() - input.startedAt
			});
			return policyDeniedResult({
				op: input.op,
				code: invalidCode,
				message: `directory ${input.phase} entry is invalid: entry is not a non-empty string`,
				details: {
					path: input.canonicalPath,
					reason: "entry is not a non-empty string"
				}
			});
		}
		const entryValidation = validateDirFetchPreflightEntry(entry);
		if (!entryValidation.ok) {
			const candidate = joinRemotePolicyPath(input.canonicalPath, entry);
			await appendFileTransferAudit({
				op: input.op,
				nodeId: input.ctx.nodeId,
				nodeDisplayName,
				requestedPath: input.requestedPath,
				canonicalPath: candidate,
				decision: "denied:policy",
				errorCode: invalidCode,
				reason: entryValidation.reason,
				durationMs: Date.now() - input.startedAt
			});
			return policyDeniedResult({
				op: input.op,
				code: invalidCode,
				message: `directory ${input.phase} entry ${entry} is invalid: ${entryValidation.reason}`,
				details: {
					path: candidate,
					reason: entryValidation.reason
				}
			});
		}
		entries.push(entry);
	}
	const candidates = [input.canonicalPath, ...entries.map((entry) => joinRemotePolicyPath(input.canonicalPath, entry))];
	for (const candidate of candidates) {
		const policy = evaluateFilePolicy({
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			kind: "read",
			path: candidate,
			pluginConfig: input.ctx.pluginConfig
		});
		if (policy.ok) continue;
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.requestedPath,
			canonicalPath: candidate,
			decision: "denied:policy",
			errorCode: policy.code,
			reason: policy.reason,
			durationMs: Date.now() - input.startedAt
		});
		return policyDeniedResult({
			op: input.op,
			code: "PATH_POLICY_DENIED",
			message: `directory ${input.phase} entry ${candidate} is not allowed by policy: ${policy.reason}`,
			details: {
				path: candidate,
				reason: policy.reason
			}
		});
	}
	return null;
}
function policyDeniedResult(input) {
	return {
		ok: false,
		code: input.code,
		message: `${input.op} ${input.code}: ${input.message}`,
		...input.details ? { details: input.details } : {}
	};
}
async function runWritePreflight(input) {
	const nodeDisplayName = input.ctx.node?.displayName;
	const preflight = await input.ctx.invokeNode({ params: {
		...input.params,
		preflightOnly: true
	} });
	if (!preflight.ok) {
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.requestedPath,
			decision: "error",
			errorCode: preflight.code,
			errorMessage: preflight.message,
			durationMs: Date.now() - input.startedAt
		});
		return {
			ok: false,
			code: preflight.code,
			message: `${input.op} failed: ${preflight.message}`,
			details: preflight.details,
			unavailable: true
		};
	}
	const payload = readResultPayload(preflight);
	if (payload?.ok === false) {
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.requestedPath,
			canonicalPath: typeof payload.canonicalPath === "string" ? payload.canonicalPath : void 0,
			decision: "error",
			errorCode: typeof payload.code === "string" ? payload.code : void 0,
			errorMessage: typeof payload.message === "string" ? payload.message : void 0,
			durationMs: Date.now() - input.startedAt
		});
		return preflight;
	}
	const canonicalPath = payload && typeof payload.path === "string" && payload.path ? payload.path : input.requestedPath;
	if (canonicalPath === input.requestedPath) return null;
	const policy = evaluateFilePolicy({
		nodeId: input.ctx.nodeId,
		nodeDisplayName,
		kind: "write",
		path: canonicalPath,
		pluginConfig: input.ctx.pluginConfig
	});
	if (policy.ok) return null;
	await appendFileTransferAudit({
		op: input.op,
		nodeId: input.ctx.nodeId,
		nodeDisplayName,
		requestedPath: input.requestedPath,
		canonicalPath,
		decision: "denied:symlink_escape",
		errorCode: policy.code,
		reason: policy.reason,
		durationMs: Date.now() - input.startedAt
	});
	return {
		ok: false,
		code: "SYMLINK_TARGET_DENIED",
		message: `${input.op} SYMLINK_TARGET_DENIED: requested path resolved to ${canonicalPath} which is not allowed by policy`
	};
}
async function runFileFetchPreflight(input) {
	const nodeDisplayName = input.ctx.node?.displayName;
	const preflight = await input.ctx.invokeNode({ params: {
		...input.params,
		preflightOnly: true
	} });
	if (!preflight.ok) {
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.requestedPath,
			decision: "error",
			errorCode: preflight.code,
			errorMessage: preflight.message,
			durationMs: Date.now() - input.startedAt
		});
		return {
			ok: false,
			code: preflight.code,
			message: `${input.op} failed: ${preflight.message}`,
			details: preflight.details,
			unavailable: true
		};
	}
	const payload = readResultPayload(preflight);
	if (payload?.ok === false) {
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.requestedPath,
			canonicalPath: typeof payload.canonicalPath === "string" ? payload.canonicalPath : void 0,
			decision: "error",
			errorCode: typeof payload.code === "string" ? payload.code : void 0,
			errorMessage: typeof payload.message === "string" ? payload.message : void 0,
			durationMs: Date.now() - input.startedAt
		});
		return preflight;
	}
	const canonicalPath = payload && typeof payload.path === "string" && payload.path ? payload.path : input.requestedPath;
	if (canonicalPath === input.requestedPath) return null;
	const policy = evaluateFilePolicy({
		nodeId: input.ctx.nodeId,
		nodeDisplayName,
		kind: "read",
		path: canonicalPath,
		pluginConfig: input.ctx.pluginConfig
	});
	if (policy.ok) return null;
	await appendFileTransferAudit({
		op: input.op,
		nodeId: input.ctx.nodeId,
		nodeDisplayName,
		requestedPath: input.requestedPath,
		canonicalPath,
		decision: "denied:symlink_escape",
		errorCode: policy.code,
		reason: policy.reason,
		durationMs: Date.now() - input.startedAt
	});
	return {
		ok: false,
		code: "SYMLINK_TARGET_DENIED",
		message: `${input.op} SYMLINK_TARGET_DENIED: requested path resolved to ${canonicalPath} which is not allowed by policy`
	};
}
async function runDirFetchPreflight(input) {
	const nodeDisplayName = input.ctx.node?.displayName;
	const preflight = await input.ctx.invokeNode({ params: {
		...input.params,
		preflightOnly: true
	} });
	if (!preflight.ok) {
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.requestedPath,
			decision: "error",
			errorCode: preflight.code,
			errorMessage: preflight.message,
			durationMs: Date.now() - input.startedAt
		});
		return {
			ok: false,
			code: preflight.code,
			message: `${input.op} failed: ${preflight.message}`,
			details: preflight.details,
			unavailable: true
		};
	}
	const payload = readResultPayload(preflight);
	if (payload?.ok === false) {
		await appendFileTransferAudit({
			op: input.op,
			nodeId: input.ctx.nodeId,
			nodeDisplayName,
			requestedPath: input.requestedPath,
			canonicalPath: typeof payload.canonicalPath === "string" ? payload.canonicalPath : void 0,
			decision: "error",
			errorCode: typeof payload.code === "string" ? payload.code : void 0,
			errorMessage: typeof payload.message === "string" ? payload.message : void 0,
			durationMs: Date.now() - input.startedAt
		});
		return preflight;
	}
	const canonicalPath = payload && typeof payload.path === "string" && payload.path ? payload.path : input.requestedPath;
	return await validateDirFetchEntries({
		ctx: input.ctx,
		op: input.op,
		requestedPath: input.requestedPath,
		canonicalPath,
		entries: payload?.entries,
		startedAt: input.startedAt,
		phase: "preflight"
	});
}
async function handleFileTransferInvoke(ctx) {
	if (!COMMANDS.includes(ctx.command)) return {
		ok: false,
		code: "UNSUPPORTED_COMMAND",
		message: "unsupported file-transfer command"
	};
	const command = ctx.command;
	const op = command;
	const params = asRecord(ctx.params);
	const requestedPath = readPath(params);
	const nodeDisplayName = ctx.node?.displayName;
	const startedAt = Date.now();
	if (!requestedPath) return {
		ok: false,
		code: "INVALID_PARAMS",
		message: `${op} path required`
	};
	const gate = await requestApproval({
		ctx,
		op,
		kind: commandKind(command),
		path: requestedPath,
		startedAt
	});
	if (!gate.ok) return {
		ok: false,
		code: gate.code,
		message: gate.message
	};
	const forwardedParams = prepareParams({
		command,
		params,
		followSymlinks: gate.followSymlinks,
		maxBytes: gate.maxBytes
	});
	if (command === "file.fetch") {
		const preflightDeny = await runFileFetchPreflight({
			ctx,
			op,
			params: forwardedParams,
			requestedPath,
			startedAt
		});
		if (preflightDeny) return preflightDeny;
	} else if (command === "file.write") {
		const preflightDeny = await runWritePreflight({
			ctx,
			op,
			params: forwardedParams,
			requestedPath,
			startedAt
		});
		if (preflightDeny) return preflightDeny;
	} else if (command === "dir.fetch") {
		const preflightDeny = await runDirFetchPreflight({
			ctx,
			op,
			params: forwardedParams,
			requestedPath,
			startedAt
		});
		if (preflightDeny) return preflightDeny;
	}
	const result = await ctx.invokeNode({ params: forwardedParams });
	if (!result.ok) {
		await appendFileTransferAudit({
			op,
			nodeId: ctx.nodeId,
			nodeDisplayName,
			requestedPath,
			decision: "error",
			errorCode: result.code,
			errorMessage: result.message,
			durationMs: Date.now() - startedAt
		});
		return {
			ok: false,
			code: result.code,
			message: `${op} failed: ${result.message}`,
			details: result.details,
			unavailable: true
		};
	}
	const payload = readResultPayload(result);
	if (payload?.ok === false) {
		await appendFileTransferAudit({
			op,
			nodeId: ctx.nodeId,
			nodeDisplayName,
			requestedPath,
			canonicalPath: typeof payload.canonicalPath === "string" ? payload.canonicalPath : void 0,
			decision: "error",
			errorCode: typeof payload.code === "string" ? payload.code : void 0,
			errorMessage: typeof payload.message === "string" ? payload.message : void 0,
			durationMs: Date.now() - startedAt
		});
		return result;
	}
	const canonicalPath = payload && typeof payload.path === "string" && payload.path ? payload.path : requestedPath;
	if (canonicalPath !== requestedPath) {
		const postflight = evaluateFilePolicy({
			nodeId: ctx.nodeId,
			nodeDisplayName,
			kind: commandKind(command),
			path: canonicalPath,
			pluginConfig: ctx.pluginConfig
		});
		if (!postflight.ok) {
			await appendFileTransferAudit({
				op,
				nodeId: ctx.nodeId,
				nodeDisplayName,
				requestedPath,
				canonicalPath,
				decision: "denied:symlink_escape",
				errorCode: postflight.code,
				reason: postflight.reason,
				durationMs: Date.now() - startedAt
			});
			return {
				ok: false,
				code: "SYMLINK_TARGET_DENIED",
				message: `${op} SYMLINK_TARGET_DENIED: requested path resolved to ${canonicalPath} which is not allowed by policy`
			};
		}
	}
	if (command === "dir.fetch") {
		const archiveEntries = await listDirFetchArchiveEntries(payload);
		if (!archiveEntries.ok) {
			await appendFileTransferAudit({
				op,
				nodeId: ctx.nodeId,
				nodeDisplayName,
				requestedPath,
				canonicalPath,
				decision: "error",
				errorCode: archiveEntries.code,
				reason: archiveEntries.reason,
				durationMs: Date.now() - startedAt
			});
			return policyDeniedResult({
				op,
				code: archiveEntries.code,
				message: `${archiveEntries.reason}; refusing archive transfer`,
				details: {
					path: canonicalPath,
					reason: archiveEntries.reason
				}
			});
		}
		const archiveDeny = await validateDirFetchEntries({
			ctx,
			op,
			requestedPath,
			canonicalPath,
			entries: archiveEntries.entries,
			startedAt,
			phase: "archive"
		});
		if (archiveDeny) return archiveDeny;
	}
	await appendFileTransferAudit({
		op,
		nodeId: ctx.nodeId,
		nodeDisplayName,
		requestedPath,
		canonicalPath,
		decision: "allowed",
		sizeBytes: typeof payload?.size === "number" ? payload.size : void 0,
		sha256: typeof payload?.sha256 === "string" ? payload.sha256 : void 0,
		durationMs: Date.now() - startedAt
	});
	return result;
}
function createFileTransferNodeInvokePolicy() {
	return {
		commands: COMMANDS,
		handle: handleFileTransferInvoke
	};
}
//#endregion
//#region extensions/file-transfer/src/shared/errors.ts
function throwFromNodePayload(operation, payload) {
	const code = typeof payload.code === "string" ? payload.code : "ERROR";
	const message = typeof payload.message === "string" ? payload.message : `${operation} failed`;
	const canonical = typeof payload.canonicalPath === "string" ? ` (canonical=${payload.canonicalPath})` : "";
	throw new Error(`${operation} ${code}: ${message}${canonical}`);
}
//#endregion
//#region extensions/file-transfer/src/shared/params.ts
function readGatewayCallOptions(params) {
	const opts = {};
	if (typeof params.gatewayUrl === "string" && params.gatewayUrl.trim()) opts.gatewayUrl = params.gatewayUrl.trim();
	if (typeof params.gatewayToken === "string" && params.gatewayToken.trim()) opts.gatewayToken = params.gatewayToken.trim();
	if (typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)) opts.timeoutMs = params.timeoutMs;
	return opts;
}
function readTrimmedString(params, key) {
	const value = params[key];
	return typeof value === "string" ? value.trim() : "";
}
function readBoolean(params, key, defaultValue = false) {
	const value = params[key];
	if (typeof value === "boolean") return value;
	return defaultValue;
}
function readClampedInt(params) {
	const value = params.input[params.key];
	const requested = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : params.defaultValue;
	return Math.max(params.hardMin, Math.min(requested, params.hardMax));
}
function humanSize(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
//#endregion
//#region extensions/file-transfer/src/tools/dir-fetch-tool.ts
const DIR_FETCH_DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DIR_FETCH_HARD_MAX_BYTES = 16 * 1024 * 1024;
const FILE_TRANSFER_SUBDIR$1 = "file-transfer";
const MEDIA_URL_CAP = 25;
const TAR_UNPACK_TIMEOUT_MS = 6e4;
const TAR_UNPACK_MAX_ENTRIES = 5e3;
const DIR_FETCH_MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const DIR_FETCH_MAX_SINGLE_FILE_BYTES = 16 * 1024 * 1024;
const DirFetchToolSchema = Type.Object({
	node: Type.String({ description: "Node id, name, or IP. Resolves the same way as the nodes tool." }),
	path: Type.String({ description: "Absolute path to the directory on the node to fetch. Canonicalized server-side." }),
	maxBytes: Type.Optional(Type.Number({ description: "Max gzipped tarball bytes to fetch. Default 8 MB, hard ceiling 16 MB (single round-trip)." })),
	includeDotfiles: Type.Optional(Type.Boolean({ description: "Reserved for v2; currently always includes dotfiles (v1 quirk in BSD tar)." })),
	gatewayUrl: Type.Optional(Type.String()),
	gatewayToken: Type.Optional(Type.String()),
	timeoutMs: Type.Optional(Type.Number())
});
async function computeFileSha256(filePath) {
	const hash = crypto.createHash("sha256");
	const handle = await fs.open(filePath, "r");
	try {
		const chunkSize = 64 * 1024;
		const buf = Buffer.allocUnsafe(chunkSize);
		while (true) {
			const { bytesRead } = await handle.read(buf, 0, chunkSize, null);
			if (bytesRead === 0) break;
			hash.update(buf.subarray(0, bytesRead));
		}
	} finally {
		await handle.close();
	}
	return hash.digest("hex");
}
/**
* Run two passes against the buffer to enumerate entries BEFORE we extract:
*
*   1. `tar -tf -` produces names ONLY, one per line. This is whitespace-safe
*      because each line is exactly one path; no parsing of fixed columns.
*      Used to validate paths (reject absolute, '..' traversal).
*   2. `tar -tvf -` adds type info via the `ls -l`-style perm prefix.
*      Used ONLY to detect symlinks / hardlinks / non-regular entries via
*      the FIRST CHARACTER of each line, never the path column.
*
* Size limits are enforced at the *extraction* step instead — the tar
* unpack process is bounded by the maxBytes we already pass through, and
* the post-extract walkDir is hard-capped by TAR_UNPACK_MAX_ENTRIES.
* Trying to parse uncompressed sizes from `tar -tvf` output is fragile
* (filenames with whitespace shift the columns) and Aisle flagged that
* shape as a bypass primitive — drop it.
*/
async function listTarPaths(tarBuffer) {
	return new Promise((resolve) => {
		const child = spawn(process.platform !== "win32" ? "/usr/bin/tar" : "tar", ["-tzf", "-"], { stdio: [
			"pipe",
			"pipe",
			"pipe"
		] });
		let stdout = "";
		let stderr = "";
		let aborted = false;
		const watchdog = setTimeout(() => {
			aborted = true;
			try {
				child.kill("SIGKILL");
			} catch {}
			resolve({
				ok: false,
				reason: "tar -tzf timed out"
			});
		}, 3e4);
		child.stdout.on("data", (c) => {
			stdout += c.toString();
			if (stdout.length > 32 * 1024 * 1024) {
				aborted = true;
				try {
					child.kill("SIGKILL");
				} catch {}
				clearTimeout(watchdog);
				resolve({
					ok: false,
					reason: "tar -tzf output too large"
				});
			}
		});
		child.stderr.on("data", (c) => {
			stderr += c.toString();
		});
		child.on("close", (code) => {
			clearTimeout(watchdog);
			if (aborted) return;
			if (code !== 0) {
				resolve({
					ok: false,
					reason: `tar -tzf exited ${code}: ${stderr.slice(0, 200)}`
				});
				return;
			}
			resolve({
				ok: true,
				paths: stdout.split("\n").filter((l) => l.length > 0)
			});
		});
		child.on("error", (e) => {
			clearTimeout(watchdog);
			if (!aborted) resolve({
				ok: false,
				reason: `tar -tzf error: ${String(e)}`
			});
		});
		child.stdin.end(tarBuffer);
	});
}
async function listTarTypeChars(tarBuffer) {
	return new Promise((resolve) => {
		const child = spawn(process.platform !== "win32" ? "/usr/bin/tar" : "tar", ["-tzvf", "-"], { stdio: [
			"pipe",
			"pipe",
			"pipe"
		] });
		let stdout = "";
		let stderr = "";
		let aborted = false;
		const watchdog = setTimeout(() => {
			aborted = true;
			try {
				child.kill("SIGKILL");
			} catch {}
			resolve({
				ok: false,
				reason: "tar -tzvf timed out"
			});
		}, 3e4);
		child.stdout.on("data", (c) => {
			stdout += c.toString();
			if (stdout.length > 32 * 1024 * 1024) {
				aborted = true;
				try {
					child.kill("SIGKILL");
				} catch {}
				clearTimeout(watchdog);
				resolve({
					ok: false,
					reason: "tar -tzvf output too large"
				});
			}
		});
		child.stderr.on("data", (c) => {
			stderr += c.toString();
		});
		child.on("close", (code) => {
			clearTimeout(watchdog);
			if (aborted) return;
			if (code !== 0) {
				resolve({
					ok: false,
					reason: `tar -tzvf exited ${code}: ${stderr.slice(0, 200)}`
				});
				return;
			}
			resolve({
				ok: true,
				typeChars: stdout.split("\n").filter((l) => l.length > 0).map((l) => l.charAt(0))
			});
		});
		child.on("error", (e) => {
			clearTimeout(watchdog);
			if (!aborted) resolve({
				ok: false,
				reason: `tar -tzvf error: ${String(e)}`
			});
		});
		child.stdin.end(tarBuffer);
	});
}
async function preValidateTarball(tarBuffer) {
	const namesResult = await listTarPaths(tarBuffer);
	if (!namesResult.ok) return namesResult;
	const paths = namesResult.paths;
	if (paths.length > TAR_UNPACK_MAX_ENTRIES) return {
		ok: false,
		reason: `archive contains ${paths.length} entries; limit ${TAR_UNPACK_MAX_ENTRIES}`
	};
	const typesResult = await listTarTypeChars(tarBuffer);
	if (!typesResult.ok) return typesResult;
	const typeChars = typesResult.typeChars;
	if (typeChars.length !== paths.length) return {
		ok: false,
		reason: `tar -tzf and tar -tzvf disagree on entry count (${paths.length} vs ${typeChars.length}); refusing`
	};
	for (let i = 0; i < paths.length; i++) {
		const entryPath = paths[i];
		const t = typeChars[i];
		if (t === "l" || t === "h") return {
			ok: false,
			reason: `archive contains link entry: ${entryPath}`
		};
		if (t !== "-" && t !== "d") return {
			ok: false,
			reason: `archive contains non-regular entry type '${t}': ${entryPath}`
		};
		if (path.isAbsolute(entryPath)) return {
			ok: false,
			reason: `archive contains absolute path: ${entryPath}`
		};
		const norm = path.posix.normalize(entryPath);
		if (norm === ".." || norm.startsWith("../") || norm.includes("/../")) return {
			ok: false,
			reason: `archive contains '..' traversal: ${entryPath}`
		};
		if (entryPath.includes("\\")) return {
			ok: false,
			reason: `archive contains backslash in path: ${entryPath}`
		};
	}
	return { ok: true };
}
async function validateTarUncompressedBudget(tarBuffer, maxBytes = DIR_FETCH_MAX_UNCOMPRESSED_BYTES) {
	return new Promise((resolve) => {
		const child = spawn(process.platform !== "win32" ? "/usr/bin/tar" : "tar", ["-xOzf", "-"], { stdio: [
			"pipe",
			"pipe",
			"pipe"
		] });
		let totalBytes = 0;
		let stderr = "";
		let settled = false;
		let watchdog;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(watchdog);
			resolve(result);
		};
		watchdog = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {}
			finish({
				ok: false,
				reason: "tar uncompressed budget validation timed out"
			});
		}, TAR_UNPACK_TIMEOUT_MS);
		child.stdout.on("data", (chunk) => {
			totalBytes += chunk.byteLength;
			if (totalBytes > maxBytes) {
				try {
					child.kill("SIGKILL");
				} catch {}
				finish({
					ok: false,
					reason: `archive expands past uncompressed budget ${maxBytes} bytes`
				});
			}
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
			if (stderr.length > 4096) stderr = stderr.slice(-4096);
		});
		child.on("close", (code) => {
			if (settled) return;
			if (code !== 0) {
				finish({
					ok: false,
					reason: `tar uncompressed budget validation exited ${code}: ${stderr.slice(0, 200)}`
				});
				return;
			}
			finish({ ok: true });
		});
		child.on("error", (error) => {
			finish({
				ok: false,
				reason: `tar uncompressed budget validation error: ${String(error)}`
			});
		});
		child.stdin.on("error", (error) => {
			if (settled && error.code === "EPIPE") return;
			finish({
				ok: false,
				reason: `tar uncompressed budget validation input error: ${String(error)}`
			});
		});
		child.stdin.end(tarBuffer);
	});
}
/**
* Unpack a gzipped tarball into a target directory via `tar -xzf -`.
* Caller MUST have run `preValidateTarball` first — this function trusts
* that the archive contains only regular files / dirs with relative,
* non-traversing paths. Without that pre-validation, raw `tar -xzf` is
* unsafe (tarbomb, symlink-then-write tricks, decompression bomb).
*
* The `-P` flag is intentionally omitted so absolute paths in the
* archive are stripped to relative ones (defense-in-depth on top of the
* pre-validation rejection). A hard wall-clock timeout caps the unpack
* at TAR_UNPACK_TIMEOUT_MS to avoid hangs.
*
* BSD tar (macOS) and GNU tar disagree on flags: `--no-overwrite-dir` is
* GNU-only and BSD tar rejects it. We use only flags both implementations
* accept. Defense-in-depth comes from the pre-validation step instead.
*
* `--no-same-owner` and `--no-same-permissions` are accepted by both BSD
* and GNU tar. They prevent the archive from setting file ownership
* (uid/gid) and dangerous mode bits (setuid/setgid/world-writable) on
* the gateway filesystem. If the gateway is ever run as root or with
* elevated privileges, a malicious node could otherwise plant
* privileged executables here.
*/
async function unpackTar(tarBuffer, destDir) {
	await fs.mkdir(destDir, {
		recursive: true,
		mode: 448
	});
	return new Promise((resolve, reject) => {
		const child = spawn(process.platform !== "win32" ? "/usr/bin/tar" : "tar", [
			"-xzf",
			"-",
			"-C",
			destDir,
			"--no-same-owner",
			"--no-same-permissions"
		], { stdio: [
			"pipe",
			"ignore",
			"pipe"
		] });
		let stderrOut = "";
		const watchdog = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {}
			reject(/* @__PURE__ */ new Error(`tar unpack timed out after ${TAR_UNPACK_TIMEOUT_MS}ms`));
		}, TAR_UNPACK_TIMEOUT_MS);
		child.stderr.on("data", (chunk) => {
			stderrOut += chunk.toString();
		});
		child.on("close", (code) => {
			clearTimeout(watchdog);
			if (code !== 0) {
				reject(/* @__PURE__ */ new Error(`tar unpack exited ${code}: ${stderrOut.slice(0, 300)}`));
				return;
			}
			resolve();
		});
		child.on("error", (e) => {
			clearTimeout(watchdog);
			reject(e);
		});
		child.stdin.end(tarBuffer);
	});
}
/**
* Walk a directory recursively, collecting file entries (skips directories).
* Skips symlinks — we don't want to follow links the archive might have
* carried in. Files only.
*/
async function walkDir(dir, rootDir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const results = [];
	for (const entry of entries) {
		const absPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			const nested = await walkDir(absPath, rootDir);
			results.push(...nested);
		} else if (entry.isFile()) {
			const relPath = path.relative(rootDir, absPath);
			results.push({
				relPath,
				absPath
			});
		}
	}
	return results;
}
function createDirFetchTool() {
	return {
		label: "Directory Fetch",
		name: "dir_fetch",
		description: "Retrieve a directory tree from a paired node as a gzipped tarball, unpack it on the gateway, and return a manifest of saved paths. Use to pull source trees, asset folders, or log directories in a single round-trip. The unpacked files live on the GATEWAY (not your local machine); pass localPath into other tools or use file_fetch on individual entries to ship them elsewhere. Rejects trees larger than 16 MB compressed. Requires operator opt-in: gateway.nodes.allowCommands must include 'dir.fetch' AND plugins.entries.file-transfer.config.nodes.<node>.allowReadPaths must match the directory path.",
		parameters: DirFetchToolSchema,
		execute: async (_toolCallId, args) => {
			const params = args;
			const node = readTrimmedString(params, "node");
			const dirPath = readTrimmedString(params, "path");
			if (!node) throw new Error("node required");
			if (!dirPath) throw new Error("path required");
			const maxBytes = readClampedInt({
				input: params,
				key: "maxBytes",
				defaultValue: DIR_FETCH_DEFAULT_MAX_BYTES,
				hardMin: 1,
				hardMax: DIR_FETCH_HARD_MAX_BYTES
			});
			const includeDotfiles = readBoolean(params, "includeDotfiles", false);
			const gatewayOpts = readGatewayCallOptions(params);
			const nodes = await listNodes(gatewayOpts);
			const nodeId = resolveNodeIdFromList(nodes, node, false);
			const nodeDisplayName = nodes.find((n) => n.nodeId === nodeId)?.displayName ?? node;
			const startedAt = Date.now();
			const raw = await callGatewayTool("node.invoke", gatewayOpts, {
				nodeId,
				command: "dir.fetch",
				params: {
					path: dirPath,
					maxBytes,
					includeDotfiles
				},
				idempotencyKey: crypto.randomUUID()
			});
			const payload = raw?.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload) ? raw.payload : null;
			if (!payload) {
				await appendFileTransferAudit({
					op: "dir.fetch",
					nodeId,
					nodeDisplayName,
					requestedPath: dirPath,
					decision: "error",
					errorMessage: "invalid payload",
					durationMs: Date.now() - startedAt
				});
				throw new Error("invalid dir.fetch payload");
			}
			if (payload.ok === false) {
				await appendFileTransferAudit({
					op: "dir.fetch",
					nodeId,
					nodeDisplayName,
					requestedPath: dirPath,
					canonicalPath: typeof payload.canonicalPath === "string" ? payload.canonicalPath : void 0,
					decision: "error",
					errorCode: typeof payload.code === "string" ? payload.code : void 0,
					errorMessage: typeof payload.message === "string" ? payload.message : void 0,
					durationMs: Date.now() - startedAt
				});
				throwFromNodePayload("dir.fetch", payload);
			}
			const canonicalPath = typeof payload.path === "string" ? payload.path : "";
			const tarBase64 = typeof payload.tarBase64 === "string" ? payload.tarBase64 : "";
			const tarBytes = typeof payload.tarBytes === "number" ? payload.tarBytes : -1;
			const sha256 = typeof payload.sha256 === "string" ? payload.sha256 : "";
			const fileCount = typeof payload.fileCount === "number" ? payload.fileCount : 0;
			if (!canonicalPath || !tarBase64 || tarBytes < 0 || !sha256) throw new Error("invalid dir.fetch payload (missing fields)");
			const tarBuffer = Buffer.from(tarBase64, "base64");
			if (tarBuffer.byteLength !== tarBytes) throw new Error(`dir.fetch size mismatch: payload says ${tarBytes} bytes, decoded ${tarBuffer.byteLength}`);
			if (crypto.createHash("sha256").update(tarBuffer).digest("hex") !== sha256) throw new Error("dir.fetch sha256 mismatch (integrity failure)");
			const validation = await preValidateTarball(tarBuffer);
			if (!validation.ok) {
				await appendFileTransferAudit({
					op: "dir.fetch",
					nodeId,
					nodeDisplayName,
					requestedPath: dirPath,
					canonicalPath,
					decision: "error",
					errorCode: "UNSAFE_ARCHIVE",
					errorMessage: validation.reason,
					sizeBytes: tarBytes,
					sha256,
					durationMs: Date.now() - startedAt
				});
				throw new Error(`dir.fetch UNSAFE_ARCHIVE: ${validation.reason}`);
			}
			const budget = await validateTarUncompressedBudget(tarBuffer);
			if (!budget.ok) {
				await appendFileTransferAudit({
					op: "dir.fetch",
					nodeId,
					nodeDisplayName,
					requestedPath: dirPath,
					canonicalPath,
					decision: "error",
					errorCode: "TREE_TOO_LARGE",
					errorMessage: budget.reason,
					sizeBytes: tarBytes,
					sha256,
					durationMs: Date.now() - startedAt
				});
				throw new Error(`dir.fetch UNCOMPRESSED_TOO_LARGE: ${budget.reason}`);
			}
			const savedTar = await saveMediaBuffer(tarBuffer, "application/gzip", FILE_TRANSFER_SUBDIR$1, DIR_FETCH_HARD_MAX_BYTES);
			const tarDir = path.dirname(savedTar.path);
			const unpackId = `dir-fetch-${path.basename(savedTar.path, path.extname(savedTar.path))}`;
			const rootDir = path.join(tarDir, unpackId);
			await unpackTar(tarBuffer, rootDir);
			const walked = await walkDir(rootDir, rootDir);
			const files = [];
			let totalUncompressed = 0;
			const abortAndCleanup = async (reason) => {
				await fs.rm(rootDir, {
					recursive: true,
					force: true
				}).catch(() => {});
				await appendFileTransferAudit({
					op: "dir.fetch",
					nodeId,
					nodeDisplayName,
					requestedPath: dirPath,
					canonicalPath,
					decision: "error",
					errorCode: "TREE_TOO_LARGE",
					errorMessage: reason,
					sizeBytes: tarBytes,
					sha256,
					durationMs: Date.now() - startedAt
				});
				throw new Error(`dir.fetch UNCOMPRESSED_TOO_LARGE: ${reason}`);
			};
			for (const { relPath, absPath } of walked) {
				let size = 0;
				try {
					size = (await fs.stat(absPath)).size;
				} catch {
					continue;
				}
				if (size > DIR_FETCH_MAX_SINGLE_FILE_BYTES) await abortAndCleanup(`extracted file ${relPath} is ${size} bytes (limit ${DIR_FETCH_MAX_SINGLE_FILE_BYTES})`);
				totalUncompressed += size;
				if (totalUncompressed > DIR_FETCH_MAX_UNCOMPRESSED_BYTES) await abortAndCleanup(`extracted tree exceeds uncompressed budget ${DIR_FETCH_MAX_UNCOMPRESSED_BYTES} bytes (decompression bomb?)`);
				const mimeType = mimeFromExtension(relPath);
				const fileSha256 = await computeFileSha256(absPath);
				files.push({
					relPath,
					size,
					mimeType,
					sha256: fileSha256,
					localPath: absPath
				});
			}
			const imageFiles = files.filter((f) => IMAGE_MIME_INLINE_SET.has(f.mimeType));
			const nonImageFiles = files.filter((f) => !IMAGE_MIME_INLINE_SET.has(f.mimeType));
			const allOrdered = [...imageFiles, ...nonImageFiles];
			const droppedFromMedia = Math.max(0, allOrdered.length - MEDIA_URL_CAP);
			const mediaUrls = allOrdered.slice(0, MEDIA_URL_CAP).map((f) => f.localPath);
			const shortHash = sha256.slice(0, 12);
			const mediaNote = droppedFromMedia ? ` (channel attaches first ${MEDIA_URL_CAP}; ${droppedFromMedia} more in details.files)` : "";
			const summaryText = `Fetched ${fileCount} files from ${canonicalPath} (${humanSize(tarBytes)} compressed, sha256:${shortHash}) — saved on the gateway under ${rootDir}/${mediaNote}`;
			await appendFileTransferAudit({
				op: "dir.fetch",
				nodeId,
				nodeDisplayName,
				requestedPath: dirPath,
				canonicalPath,
				decision: "allowed",
				sizeBytes: tarBytes,
				sha256,
				durationMs: Date.now() - startedAt
			});
			return {
				content: [{
					type: "text",
					text: summaryText
				}],
				details: {
					path: canonicalPath,
					rootDir,
					fileCount,
					tarBytes,
					sha256,
					files,
					media: { mediaUrls }
				}
			};
		}
	};
}
//#endregion
//#region extensions/file-transfer/src/tools/dir-list-tool.ts
const DIR_LIST_DEFAULT_MAX_ENTRIES = 200;
const DIR_LIST_HARD_MAX_ENTRIES = 5e3;
const DirListToolSchema = Type.Object({
	node: Type.String({ description: "Node id, name, or IP. Resolves the same way as the nodes tool." }),
	path: Type.String({ description: "Absolute path to the directory on the node. Canonicalized server-side." }),
	pageToken: Type.Optional(Type.String({ description: "Pagination token from a previous dir_list call. Omit to start from the beginning." })),
	maxEntries: Type.Optional(Type.Number({ description: `Max entries per page. Default ${DIR_LIST_DEFAULT_MAX_ENTRIES}, hard ceiling ${DIR_LIST_HARD_MAX_ENTRIES}.` })),
	gatewayUrl: Type.Optional(Type.String()),
	gatewayToken: Type.Optional(Type.String()),
	timeoutMs: Type.Optional(Type.Number())
});
function createDirListTool() {
	return {
		label: "Directory List",
		name: "dir_list",
		description: "Retrieve a structured directory listing from a paired node. Returns file and subdirectory metadata (name, path, size, mimeType, isDir, mtime) without transferring file content. Use this to discover what files exist before fetching them with file_fetch. Pagination is offset-based; pass nextPageToken from the previous result. Requires operator opt-in: gateway.nodes.allowCommands must include 'dir.list' AND plugins.entries.file-transfer.config.nodes.<node>.allowReadPaths must match the directory path. Without policy configured, every call is denied.",
		parameters: DirListToolSchema,
		execute: async (_toolCallId, args) => {
			const params = args;
			const node = readTrimmedString(params, "node");
			const dirPath = readTrimmedString(params, "path");
			if (!node) throw new Error("node required");
			if (!dirPath) throw new Error("path required");
			const maxEntries = readClampedInt({
				input: params,
				key: "maxEntries",
				defaultValue: DIR_LIST_DEFAULT_MAX_ENTRIES,
				hardMin: 1,
				hardMax: DIR_LIST_HARD_MAX_ENTRIES
			});
			const pageToken = typeof params.pageToken === "string" && params.pageToken.trim() ? params.pageToken.trim() : void 0;
			const gatewayOpts = readGatewayCallOptions(params);
			const nodes = await listNodes(gatewayOpts);
			const nodeId = resolveNodeIdFromList(nodes, node, false);
			const nodeDisplayName = nodes.find((n) => n.nodeId === nodeId)?.displayName ?? node;
			const startedAt = Date.now();
			const raw = await callGatewayTool("node.invoke", gatewayOpts, {
				nodeId,
				command: "dir.list",
				params: {
					path: dirPath,
					pageToken,
					maxEntries
				},
				idempotencyKey: crypto.randomUUID()
			});
			const payload = raw?.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload) ? raw.payload : null;
			if (!payload) {
				await appendFileTransferAudit({
					op: "dir.list",
					nodeId,
					nodeDisplayName,
					requestedPath: dirPath,
					decision: "error",
					errorMessage: "invalid payload",
					durationMs: Date.now() - startedAt
				});
				throw new Error("invalid dir.list payload");
			}
			if (payload.ok === false) {
				await appendFileTransferAudit({
					op: "dir.list",
					nodeId,
					nodeDisplayName,
					requestedPath: dirPath,
					canonicalPath: typeof payload.canonicalPath === "string" ? payload.canonicalPath : void 0,
					decision: "error",
					errorCode: typeof payload.code === "string" ? payload.code : void 0,
					errorMessage: typeof payload.message === "string" ? payload.message : void 0,
					durationMs: Date.now() - startedAt
				});
				throwFromNodePayload("dir.list", payload);
			}
			const canonicalPath = typeof payload.path === "string" ? payload.path : dirPath;
			const entries = Array.isArray(payload.entries) ? payload.entries : [];
			const truncated = payload.truncated === true;
			const nextPageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : void 0;
			const fileCount = entries.filter((e) => !e.isDir).length;
			const dirCount = entries.filter((e) => e.isDir).length;
			const summary = `Listed ${canonicalPath}: ${fileCount} file${fileCount !== 1 ? "s" : ""}, ${dirCount} subdir${dirCount !== 1 ? "s" : ""}${truncated ? " (more entries available — pass nextPageToken)" : ""}`;
			await appendFileTransferAudit({
				op: "dir.list",
				nodeId,
				nodeDisplayName,
				requestedPath: dirPath,
				canonicalPath,
				decision: "allowed",
				durationMs: Date.now() - startedAt
			});
			return {
				content: [{
					type: "text",
					text: summary
				}],
				details: {
					path: canonicalPath,
					entries,
					nextPageToken,
					truncated
				}
			};
		}
	};
}
//#endregion
//#region extensions/file-transfer/src/tools/file-fetch-tool.ts
const FILE_FETCH_DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const FILE_FETCH_HARD_MAX_BYTES = 16 * 1024 * 1024;
const FILE_TRANSFER_SUBDIR = "file-transfer";
const FileFetchToolSchema = Type.Object({
	node: Type.String({ description: "Node id, name, or IP. Resolves the same way as the nodes tool." }),
	path: Type.String({ description: "Absolute path to the file on the node. Canonicalized server-side." }),
	maxBytes: Type.Optional(Type.Number({ description: "Max bytes to fetch. Default 8 MB, hard ceiling 16 MB (single round-trip)." })),
	gatewayUrl: Type.Optional(Type.String()),
	gatewayToken: Type.Optional(Type.String()),
	timeoutMs: Type.Optional(Type.Number())
});
function createFileFetchTool() {
	return {
		label: "File Fetch",
		name: "file_fetch",
		description: "Retrieve a file from a paired node by absolute path. Returns image content blocks for image MIME types, inlines small text files (≤8 KB) as text content, and saves everything else under the gateway media store with a path you can pass to file_write or other tools. Use this for screenshots, photos, receipts, logs, source files. Pair with file_write to copy a file from one node to another (no exec/cp shell-out needed). Requires operator opt-in: gateway.nodes.allowCommands must include 'file.fetch' AND plugins.entries.file-transfer.config.nodes.<node>.allowReadPaths must match the path. Without policy configured, every call is denied.",
		parameters: FileFetchToolSchema,
		execute: async (_toolCallId, args) => {
			const params = args;
			const node = readTrimmedString(params, "node");
			const filePath = readTrimmedString(params, "path");
			if (!node) throw new Error("node required");
			if (!filePath) throw new Error("path required");
			const requestedMax = typeof params.maxBytes === "number" && Number.isFinite(params.maxBytes) ? Math.floor(params.maxBytes) : FILE_FETCH_DEFAULT_MAX_BYTES;
			const maxBytes = Math.max(1, Math.min(requestedMax, FILE_FETCH_HARD_MAX_BYTES));
			const gatewayOpts = readGatewayCallOptions(params);
			const nodes = await listNodes(gatewayOpts);
			const nodeId = resolveNodeIdFromList(nodes, node, false);
			const nodeDisplayName = nodes.find((n) => n.nodeId === nodeId)?.displayName ?? node;
			const startedAt = Date.now();
			const raw = await callGatewayTool("node.invoke", gatewayOpts, {
				nodeId,
				command: "file.fetch",
				params: {
					path: filePath,
					maxBytes
				},
				idempotencyKey: crypto.randomUUID()
			});
			const payload = raw?.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload) ? raw.payload : null;
			if (!payload) {
				await appendFileTransferAudit({
					op: "file.fetch",
					nodeId,
					nodeDisplayName,
					requestedPath: filePath,
					decision: "error",
					errorMessage: "invalid payload",
					durationMs: Date.now() - startedAt
				});
				throw new Error("invalid file.fetch payload");
			}
			if (payload.ok === false) {
				await appendFileTransferAudit({
					op: "file.fetch",
					nodeId,
					nodeDisplayName,
					requestedPath: filePath,
					canonicalPath: typeof payload.canonicalPath === "string" ? payload.canonicalPath : void 0,
					decision: "error",
					errorCode: typeof payload.code === "string" ? payload.code : void 0,
					errorMessage: typeof payload.message === "string" ? payload.message : void 0,
					durationMs: Date.now() - startedAt
				});
				throwFromNodePayload("file.fetch", payload);
			}
			const canonicalPath = typeof payload.path === "string" ? payload.path : "";
			const size = typeof payload.size === "number" ? payload.size : -1;
			const mimeType = typeof payload.mimeType === "string" ? payload.mimeType : "";
			const hasBase64 = typeof payload.base64 === "string";
			const base64 = hasBase64 ? payload.base64 : "";
			const sha256 = typeof payload.sha256 === "string" ? payload.sha256 : "";
			if (!canonicalPath || size < 0 || !mimeType || !hasBase64 || !sha256) throw new Error("invalid file.fetch payload (missing fields)");
			const buffer = Buffer.from(base64, "base64");
			if (buffer.byteLength !== size) throw new Error(`file.fetch size mismatch: payload says ${size} bytes, decoded ${buffer.byteLength}`);
			if (crypto.createHash("sha256").update(buffer).digest("hex") !== sha256) throw new Error("file.fetch sha256 mismatch (integrity failure)");
			const saved = await saveMediaBuffer(buffer, mimeType, FILE_TRANSFER_SUBDIR, FILE_FETCH_HARD_MAX_BYTES);
			const localPath = saved.path;
			const isInlineImage = IMAGE_MIME_INLINE_SET.has(mimeType);
			const isInlineText = TEXT_INLINE_MIME_SET.has(mimeType) && size <= 8192;
			const content = [];
			if (isInlineImage) content.push({
				type: "image",
				data: base64,
				mimeType
			});
			else if (isInlineText) {
				const text = buffer.toString("utf-8");
				content.push({
					type: "text",
					text: `Fetched ${canonicalPath} (${humanSize(size)}, ${mimeType}, sha256:${sha256.slice(0, 12)}) saved at ${localPath}\n\n--- contents ---\n${text}`
				});
			} else {
				const shortHash = sha256.slice(0, 12);
				content.push({
					type: "text",
					text: `Fetched ${canonicalPath} (${humanSize(size)}, ${mimeType}, sha256:${shortHash}) saved at ${localPath}`
				});
			}
			await appendFileTransferAudit({
				op: "file.fetch",
				nodeId,
				nodeDisplayName,
				requestedPath: filePath,
				canonicalPath,
				decision: "allowed",
				sizeBytes: size,
				sha256,
				durationMs: Date.now() - startedAt
			});
			return {
				content,
				details: {
					path: canonicalPath,
					size,
					mimeType,
					sha256,
					localPath,
					mediaId: saved.id,
					media: { mediaUrls: [localPath] }
				}
			};
		}
	};
}
//#endregion
//#region extensions/file-transfer/src/tools/file-write-tool.ts
const FILE_WRITE_HARD_MAX_BYTES = 16 * 1024 * 1024;
const FILE_WRITE_SCHEMA = Type.Object({
	node: Type.String({ description: "Node id or display name to write the file on." }),
	path: Type.String({ description: "Absolute path on the node to write. Canonicalized server-side." }),
	contentBase64: Type.Optional(Type.String({ description: "Base64-encoded bytes to write. Maximum 16 MB after decode." })),
	sourceMediaId: Type.Optional(Type.String({ description: "Media id returned by file_fetch. Preferred for binary copies because bytes stay in the gateway media store." })),
	mimeType: Type.Optional(Type.String({ description: "Content type hint. Not validated against the content." })),
	overwrite: Type.Optional(Type.Boolean({
		description: "Allow overwriting an existing file. Default false.",
		default: false
	})),
	createParents: Type.Optional(Type.Boolean({
		description: "Create missing parent directories (mkdir -p). Default false.",
		default: false
	}))
});
async function readSourceBytes(input) {
	const sourceMediaId = input.sourceMediaId?.trim();
	if (sourceMediaId) {
		const mediaPath = await resolveMediaBufferPath(sourceMediaId, "file-transfer");
		const stat = await fs.stat(mediaPath);
		if (stat.size > FILE_WRITE_HARD_MAX_BYTES) throw new Error(`sourceMediaId too large: ${stat.size} bytes; maximum is ${FILE_WRITE_HARD_MAX_BYTES} bytes`);
		const buffer = await fs.readFile(mediaPath);
		return {
			buffer,
			contentBase64: buffer.toString("base64"),
			source: "media"
		};
	}
	if (input.contentBase64 === void 0) throw new Error("contentBase64 or sourceMediaId required");
	return {
		buffer: Buffer.from(input.contentBase64, "base64"),
		contentBase64: input.contentBase64,
		source: "inline"
	};
}
function createFileWriteTool() {
	return {
		label: "File Write",
		name: "file_write",
		description: "Write file bytes to a paired node by absolute path. Atomic write (temp + rename). Refuses to overwrite by default — pass overwrite=true to replace. Refuses to write through symlink targets unless policy explicitly allows following symlinks. Pair with file_fetch by passing its mediaId as sourceMediaId for binary copy. Requires operator opt-in: gateway.nodes.allowCommands must include 'file.write' AND plugins.entries.file-transfer.config.nodes.<node>.allowWritePaths must match the destination path. Without policy configured, every call is denied.",
		parameters: FILE_WRITE_SCHEMA,
		async execute(_toolCallId, params) {
			const raw = params && typeof params === "object" && !Array.isArray(params) ? params : {};
			const nodeQuery = readTrimmedString(raw, "node");
			const filePath = readTrimmedString(raw, "path");
			const contentBase64 = typeof raw.contentBase64 === "string" ? raw.contentBase64 : void 0;
			const sourceMediaId = typeof raw.sourceMediaId === "string" ? raw.sourceMediaId : void 0;
			const overwrite = readBoolean(raw, "overwrite", false);
			const createParents = readBoolean(raw, "createParents", false);
			if (!nodeQuery) throw new Error("node required");
			if (!filePath) throw new Error("path required");
			const sourceBytes = await readSourceBytes({
				contentBase64,
				sourceMediaId
			});
			const buffer = sourceBytes.buffer;
			const expectedSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
			const gatewayOpts = readGatewayCallOptions(raw);
			const nodes = await listNodes(gatewayOpts);
			const nodeId = resolveNodeIdFromList(nodes, nodeQuery, false);
			const nodeDisplayName = nodes.find((n) => n.nodeId === nodeId)?.displayName ?? nodeQuery;
			const startedAt = Date.now();
			const payload = (await callGatewayTool("node.invoke", gatewayOpts, {
				nodeId,
				command: "file.write",
				params: {
					path: filePath,
					contentBase64: sourceBytes.contentBase64,
					overwrite,
					createParents,
					expectedSha256
				},
				idempotencyKey: crypto.randomUUID()
			}))?.payload;
			if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
				await appendFileTransferAudit({
					op: "file.write",
					nodeId,
					nodeDisplayName,
					requestedPath: filePath,
					decision: "error",
					errorMessage: "unexpected response from node",
					sizeBytes: buffer.byteLength,
					durationMs: Date.now() - startedAt
				});
				throw new Error("unexpected file.write response from node");
			}
			const typed = payload;
			if (!typed.ok) {
				await appendFileTransferAudit({
					op: "file.write",
					nodeId,
					nodeDisplayName,
					requestedPath: filePath,
					canonicalPath: typed.canonicalPath,
					decision: "error",
					errorCode: typed.code,
					errorMessage: typed.message,
					sizeBytes: buffer.byteLength,
					durationMs: Date.now() - startedAt
				});
				throwFromNodePayload("file.write", typed);
			}
			await appendFileTransferAudit({
				op: "file.write",
				nodeId,
				nodeDisplayName,
				requestedPath: filePath,
				canonicalPath: typed.path,
				decision: "allowed",
				sizeBytes: typed.size,
				sha256: typed.sha256,
				durationMs: Date.now() - startedAt
			});
			const overwriteNote = typed.overwritten ? " (overwrote existing file)" : "";
			return {
				content: [{
					type: "text",
					text: `Wrote ${typed.path} (${humanSize(typed.size)}, sha256:${typed.sha256.slice(0, 12)})${overwriteNote}`
				}],
				details: {
					...typed,
					source: sourceBytes.source
				}
			};
		}
	};
}
var file_transfer_default = definePluginEntry({
	id: "file-transfer",
	name: "File Transfer",
	description: "Fetch, list, and write files on paired nodes via dedicated node commands.",
	nodeHostCommands: [
		{
			command: "file.fetch",
			cap: "file",
			dangerous: true,
			handle: async (paramsJSON) => {
				const result = await handleFileFetch(paramsJSON ? JSON.parse(paramsJSON) : {});
				return JSON.stringify(result);
			}
		},
		{
			command: "dir.list",
			cap: "file",
			dangerous: true,
			handle: async (paramsJSON) => {
				const result = await handleDirList(paramsJSON ? JSON.parse(paramsJSON) : {});
				return JSON.stringify(result);
			}
		},
		{
			command: "dir.fetch",
			cap: "file",
			dangerous: true,
			handle: async (paramsJSON) => {
				const result = await handleDirFetch(paramsJSON ? JSON.parse(paramsJSON) : {});
				return JSON.stringify(result);
			}
		},
		{
			command: "file.write",
			cap: "file",
			dangerous: true,
			handle: async (paramsJSON) => {
				const result = await handleFileWrite(paramsJSON ? JSON.parse(paramsJSON) : {});
				return JSON.stringify(result);
			}
		}
	],
	register(api) {
		api.registerNodeInvokePolicy(createFileTransferNodeInvokePolicy());
		api.registerTool(createFileFetchTool());
		api.registerTool(createDirListTool());
		api.registerTool(createDirFetchTool());
		api.registerTool(createFileWriteTool());
	}
});
//#endregion
export { file_transfer_default as default };
