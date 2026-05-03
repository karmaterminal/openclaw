import { n as mergeSessionEntry } from "./types--vJusqfs.js";
import { o as updateSessionStore } from "./store-B39mP4xx.js";
import { i as hasInternalRuntimeContext } from "./internal-runtime-context-wXjOposv.js";
import { a as isSilentReplyText, c as stripLeadingSilentToken, i as isSilentReplyPrefixText, n as SILENT_REPLY_TOKEN, o as startsWithSilentToken } from "./tokens-CPoUE_99.js";
import { t as formatAgentInternalEventsForPrompt } from "./internal-events-D0NLXxs6.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import readline from "node:readline";
//#region src/agents/command/attempt-execution.helpers.ts
/** Maximum number of JSONL records to inspect before giving up. */
const SESSION_FILE_MAX_RECORDS = 500;
const CLAUDE_PROJECTS_RELATIVE_DIR = path.join(".claude", "projects");
function normalizeClaudeCliSessionId(sessionId) {
	const trimmed = sessionId?.trim();
	if (!trimmed || trimmed.includes("\0") || trimmed.includes("/") || trimmed.includes("\\")) return;
	return trimmed;
}
async function jsonlFileHasAssistantMessage(filePath) {
	if (!filePath) return false;
	try {
		const stat = await fs.lstat(filePath);
		if (stat.isSymbolicLink() || !stat.isFile()) return false;
		const fh = await fs.open(filePath, "r");
		try {
			const rl = readline.createInterface({ input: fh.createReadStream({ encoding: "utf-8" }) });
			let recordCount = 0;
			for await (const line of rl) {
				if (!line.trim()) continue;
				recordCount++;
				if (recordCount > SESSION_FILE_MAX_RECORDS) break;
				let obj;
				try {
					obj = JSON.parse(line);
				} catch {
					continue;
				}
				if ((obj?.message)?.role === "assistant") return true;
			}
			return false;
		} finally {
			await fh.close();
		}
	} catch {
		return false;
	}
}
/**
* Check whether a session transcript file exists and contains at least one
* assistant message, indicating that the SessionManager has flushed the
* initial user+assistant exchange to disk.
*/
async function sessionFileHasContent(sessionFile) {
	return await jsonlFileHasAssistantMessage(sessionFile);
}
async function claudeCliSessionTranscriptHasContent(params) {
	const sessionId = normalizeClaudeCliSessionId(params.sessionId);
	if (!sessionId) return false;
	const homeDir = params.homeDir?.trim() || process.env.HOME || os.homedir();
	const projectsDir = path.join(homeDir, CLAUDE_PROJECTS_RELATIVE_DIR);
	let projectEntries;
	try {
		projectEntries = await fs.readdir(projectsDir, { withFileTypes: true });
	} catch {
		return false;
	}
	for (const entry of projectEntries) {
		if (!entry.isDirectory()) continue;
		if (await jsonlFileHasAssistantMessage(path.join(projectsDir, entry.name, `${sessionId}.jsonl`))) return true;
	}
	return false;
}
function resolveFallbackRetryPrompt(params) {
	if (!params.isFallbackRetry) return params.body;
	if (!params.sessionHasHistory) return params.body;
	return `[Retry after the previous model attempt failed or timed out]\n\n${params.body}`;
}
function createAcpVisibleTextAccumulator() {
	let pendingSilentPrefix = "";
	let visibleText = "";
	let rawVisibleText = "";
	const startsWithWordChar = (chunk) => /^[\p{L}\p{N}]/u.test(chunk);
	const resolveNextCandidate = (base, chunk) => {
		if (!base) return chunk;
		if (isSilentReplyText(base, "NO_REPLY") && !chunk.startsWith(base) && startsWithWordChar(chunk)) return chunk;
		if (chunk.startsWith(base) && chunk.length > base.length) return chunk;
		return `${base}${chunk}`;
	};
	const mergeVisibleChunk = (base, chunk) => {
		if (!base) return {
			rawText: chunk,
			delta: chunk
		};
		if (chunk.startsWith(base) && chunk.length > base.length) return {
			rawText: chunk,
			delta: chunk.slice(base.length)
		};
		return {
			rawText: `${base}${chunk}`,
			delta: chunk
		};
	};
	return {
		consume(chunk) {
			if (!chunk) return null;
			if (!visibleText) {
				const leadCandidate = resolveNextCandidate(pendingSilentPrefix, chunk);
				const trimmedLeadCandidate = leadCandidate.trim();
				if (isSilentReplyText(trimmedLeadCandidate, "NO_REPLY") || isSilentReplyPrefixText(trimmedLeadCandidate, "NO_REPLY")) {
					pendingSilentPrefix = leadCandidate;
					return null;
				}
				if (startsWithSilentToken(trimmedLeadCandidate, "NO_REPLY")) {
					const stripped = stripLeadingSilentToken(leadCandidate, SILENT_REPLY_TOKEN);
					if (stripped) {
						pendingSilentPrefix = "";
						rawVisibleText = leadCandidate;
						visibleText = stripped;
						return {
							text: stripped,
							delta: stripped
						};
					}
					pendingSilentPrefix = leadCandidate;
					return null;
				}
				if (pendingSilentPrefix) {
					pendingSilentPrefix = "";
					rawVisibleText = leadCandidate;
					visibleText = leadCandidate;
					return {
						text: visibleText,
						delta: leadCandidate
					};
				}
			}
			const nextVisible = mergeVisibleChunk(rawVisibleText, chunk);
			rawVisibleText = nextVisible.rawText;
			if (!nextVisible.delta) return null;
			visibleText = `${visibleText}${nextVisible.delta}`;
			return {
				text: visibleText,
				delta: nextVisible.delta
			};
		},
		finalize() {
			return (visibleText || pendingSilentPrefix).trim();
		},
		finalizeRaw() {
			return visibleText || pendingSilentPrefix;
		}
	};
}
//#endregion
//#region src/agents/command/attempt-execution.shared.ts
async function persistSessionEntry(params) {
	const persisted = await updateSessionStore(params.storePath, (store) => {
		const merged = mergeSessionEntry(store[params.sessionKey], params.entry);
		for (const field of params.clearedFields ?? []) if (!Object.hasOwn(params.entry, field)) Reflect.deleteProperty(merged, field);
		store[params.sessionKey] = merged;
		return merged;
	});
	params.sessionStore[params.sessionKey] = persisted;
}
function prependInternalEventContext(body, events) {
	if (hasInternalRuntimeContext(body)) return body;
	const renderedEvents = formatAgentInternalEventsForPrompt(events);
	if (!renderedEvents) return body;
	return [renderedEvents, body].filter(Boolean).join("\n\n");
}
//#endregion
export { resolveFallbackRetryPrompt as a, createAcpVisibleTextAccumulator as i, prependInternalEventContext as n, sessionFileHasContent as o, claudeCliSessionTranscriptHasContent as r, persistSessionEntry as t };
