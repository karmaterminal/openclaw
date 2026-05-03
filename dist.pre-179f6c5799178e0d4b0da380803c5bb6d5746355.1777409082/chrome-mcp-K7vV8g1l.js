import { c as normalizeOptionalString, f as readStringValue } from "./string-coerce-C1IzJjqi.js";
import { n as resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir-CWQcmOLf.js";
import { n as asNullableRecord } from "./record-coerce-DZKKYOg9.js";
import "./text-runtime-CF6GykCk.js";
import { a as BrowserProfileUnavailableError, c as BrowserTabNotFoundError } from "./errors-B0ozE6eU.js";
import "./tmp-openclaw-dir-PpjZfTtg.js";
import "./record-shared-DriRSg6P.js";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
//#region extensions/browser/src/browser/chrome-mcp.ts
const DEFAULT_CHROME_MCP_COMMAND = "npx";
const DEFAULT_CHROME_MCP_ARGS = [
	"-y",
	"chrome-devtools-mcp@latest",
	"--autoConnect",
	"--experimentalStructuredContent",
	"--experimental-page-id-routing"
];
const CHROME_MCP_NEW_PAGE_TIMEOUT_MS = 5e3;
const CHROME_MCP_NAVIGATE_TIMEOUT_MS = 2e4;
const sessions = /* @__PURE__ */ new Map();
const pendingSessions = /* @__PURE__ */ new Map();
let sessionFactory = null;
function asPages(value) {
	if (!Array.isArray(value)) return [];
	const out = [];
	for (const entry of value) {
		const record = asNullableRecord(entry);
		if (!record || typeof record.id !== "number") continue;
		out.push({
			id: record.id,
			url: readStringValue(record.url),
			selected: record.selected === true
		});
	}
	return out;
}
function parsePageId(targetId) {
	const parsed = Number.parseInt(targetId.trim(), 10);
	if (!Number.isFinite(parsed)) throw new BrowserTabNotFoundError();
	return parsed;
}
function toBrowserTabs(pages) {
	return pages.map((page) => ({
		targetId: String(page.id),
		title: "",
		url: page.url ?? "",
		type: "page"
	}));
}
function extractStructuredContent(result) {
	return asNullableRecord(result.structuredContent) ?? {};
}
function extractTextContent(result) {
	return (Array.isArray(result.content) ? result.content : []).map((entry) => {
		const record = asNullableRecord(entry);
		return record && typeof record.text === "string" ? record.text : "";
	}).filter(Boolean);
}
function extractTextPages(result) {
	const pages = [];
	for (const block of extractTextContent(result)) for (const line of block.split(/\r?\n/)) {
		const match = line.match(/^\s*(\d+):\s+(.+?)(?:\s+\[(selected)\])?\s*$/i);
		if (!match) continue;
		pages.push({
			id: Number.parseInt(match[1] ?? "", 10),
			url: normalizeOptionalString(match[2]),
			selected: Boolean(match[3])
		});
	}
	return pages;
}
function extractStructuredPages(result) {
	const structured = asPages(extractStructuredContent(result).pages);
	return structured.length > 0 ? structured : extractTextPages(result);
}
function extractSnapshot(result) {
	const snapshot = asNullableRecord(extractStructuredContent(result).snapshot);
	if (!snapshot) throw new Error("Chrome MCP snapshot response was missing structured snapshot data.");
	return snapshot;
}
function extractJsonBlock(text) {
	const raw = text.match(/```json\s*([\s\S]*?)\s*```/i)?.[1]?.trim() || text.trim();
	return raw ? JSON.parse(raw) : null;
}
function extractMessageText(result) {
	const message = extractStructuredContent(result).message;
	if (typeof message === "string" && message.trim()) return message;
	return extractTextContent(result).find((block) => block.trim()) ?? "";
}
function extractToolErrorMessage(result, name) {
	return extractMessageText(result).trim() || `Chrome MCP tool "${name}" failed.`;
}
function extractJsonMessage(result) {
	const candidates = [extractMessageText(result), ...extractTextContent(result)].filter((text) => text.trim());
	let lastError;
	for (const candidate of candidates) try {
		return extractJsonBlock(candidate);
	} catch (err) {
		lastError = err;
	}
	if (lastError) throw lastError;
	return null;
}
function normalizeChromeMcpUserDataDir(userDataDir) {
	const trimmed = userDataDir?.trim();
	return trimmed ? trimmed : void 0;
}
function buildChromeMcpSessionCacheKey(profileName, userDataDir) {
	return JSON.stringify([profileName, normalizeChromeMcpUserDataDir(userDataDir) ?? ""]);
}
function cacheKeyMatchesProfileName(cacheKey, profileName) {
	try {
		const parsed = JSON.parse(cacheKey);
		return Array.isArray(parsed) && parsed[0] === profileName;
	} catch {
		return false;
	}
}
async function closeChromeMcpSessionsForProfile(profileName, keepKey) {
	let closed = false;
	for (const key of Array.from(pendingSessions.keys())) if (key !== keepKey && cacheKeyMatchesProfileName(key, profileName)) {
		pendingSessions.delete(key);
		closed = true;
	}
	for (const [key, session] of Array.from(sessions.entries())) if (key !== keepKey && cacheKeyMatchesProfileName(key, profileName)) {
		sessions.delete(key);
		closed = true;
		await session.client.close().catch(() => {});
	}
	return closed;
}
function buildChromeMcpArgs(userDataDir) {
	const normalizedUserDataDir = normalizeChromeMcpUserDataDir(userDataDir);
	return normalizedUserDataDir ? [
		...DEFAULT_CHROME_MCP_ARGS,
		"--userDataDir",
		normalizedUserDataDir
	] : [...DEFAULT_CHROME_MCP_ARGS];
}
async function createRealSession(profileName, userDataDir) {
	const transport = new StdioClientTransport({
		command: DEFAULT_CHROME_MCP_COMMAND,
		args: buildChromeMcpArgs(userDataDir),
		stderr: "pipe"
	});
	const client = new Client({
		name: "openclaw-browser",
		version: "0.0.0"
	}, {});
	return {
		client,
		transport,
		ready: (async () => {
			try {
				await client.connect(transport);
				if (!(await client.listTools()).tools.some((tool) => tool.name === "list_pages")) throw new Error("Chrome MCP server did not expose the expected navigation tools.");
			} catch (err) {
				await client.close().catch(() => {});
				throw new BrowserProfileUnavailableError(`Chrome MCP existing-session attach failed for profile "${profileName}". Make sure ${userDataDir ? `the configured Chromium user data dir (${userDataDir})` : "Google Chrome's default profile"} is running locally with remote debugging enabled. Details: ${String(err)}`);
			}
		})()
	};
}
async function getSession(profileName, userDataDir) {
	const cacheKey = buildChromeMcpSessionCacheKey(profileName, userDataDir);
	await closeChromeMcpSessionsForProfile(profileName, cacheKey);
	let session = sessions.get(cacheKey);
	if (session && session.transport.pid === null) {
		sessions.delete(cacheKey);
		session = void 0;
	}
	if (!session) {
		let pending = pendingSessions.get(cacheKey);
		if (!pending) {
			pending = (async () => {
				const created = await (sessionFactory ?? createRealSession)(profileName, userDataDir);
				if (pendingSessions.get(cacheKey) === pending) sessions.set(cacheKey, created);
				else await created.client.close().catch(() => {});
				return created;
			})();
			pendingSessions.set(cacheKey, pending);
		}
		try {
			session = await pending;
		} finally {
			if (pendingSessions.get(cacheKey) === pending) pendingSessions.delete(cacheKey);
		}
	}
	try {
		await session.ready;
		return session;
	} catch (err) {
		if (sessions.get(cacheKey)?.transport === session.transport) sessions.delete(cacheKey);
		throw err;
	}
}
async function callTool(profileName, userDataDir, name, args = {}, opts) {
	const cacheKey = buildChromeMcpSessionCacheKey(profileName, userDataDir);
	const session = await getSession(profileName, userDataDir);
	const timeoutMs = opts?.timeoutMs;
	const signal = opts?.signal;
	if (signal?.aborted) throw signal.reason ?? /* @__PURE__ */ new Error("aborted");
	const rawCall = session.client.callTool({
		name,
		arguments: args
	});
	let timeoutHandle;
	let abortListener;
	const racers = [rawCall];
	if (timeoutMs !== void 0 && timeoutMs > 0) racers.push(new Promise((_, reject) => {
		timeoutHandle = setTimeout(() => {
			reject(/* @__PURE__ */ new Error(`Chrome MCP "${name}" timed out after ${timeoutMs}ms. Session reset for reconnect.`));
		}, timeoutMs);
	}));
	if (signal) racers.push(new Promise((_, reject) => {
		abortListener = () => reject(signal.reason ?? /* @__PURE__ */ new Error("aborted"));
		signal.addEventListener("abort", abortListener, { once: true });
	}));
	let result;
	try {
		result = racers.length === 1 ? await rawCall : await Promise.race(racers);
	} catch (err) {
		rawCall.catch(() => {});
		if (sessions.get(cacheKey)?.transport === session.transport) {
			sessions.delete(cacheKey);
			await session.client.close().catch(() => {});
		}
		throw err;
	} finally {
		if (timeoutHandle !== void 0) clearTimeout(timeoutHandle);
		if (signal && abortListener) signal.removeEventListener("abort", abortListener);
	}
	if (result.isError) throw new Error(extractToolErrorMessage(result, name));
	return result;
}
async function withTempFile(fn) {
	const dir = await fs.mkdtemp(path.join(resolvePreferredOpenClawTmpDir(), "openclaw-chrome-mcp-"));
	const filePath = path.join(dir, randomUUID());
	try {
		return await fn(filePath);
	} finally {
		await fs.rm(dir, {
			recursive: true,
			force: true
		}).catch(() => {});
	}
}
async function findPageById(profileName, pageId, userDataDir) {
	const page = (await listChromeMcpPages(profileName, userDataDir)).find((entry) => entry.id === pageId);
	if (!page) throw new BrowserTabNotFoundError();
	return page;
}
async function ensureChromeMcpAvailable(profileName, userDataDir) {
	await getSession(profileName, userDataDir);
}
function getChromeMcpPid(profileName) {
	for (const [key, session] of sessions.entries()) if (cacheKeyMatchesProfileName(key, profileName)) return session.transport.pid ?? null;
	return null;
}
async function closeChromeMcpSession(profileName) {
	return await closeChromeMcpSessionsForProfile(profileName);
}
async function stopAllChromeMcpSessions() {
	const names = [...new Set([...sessions.keys()].map((key) => JSON.parse(key)[0]))];
	for (const name of names) await closeChromeMcpSession(name).catch(() => {});
}
async function listChromeMcpPages(profileName, userDataDir) {
	return extractStructuredPages(await callTool(profileName, userDataDir, "list_pages"));
}
async function listChromeMcpTabs(profileName, userDataDir) {
	return toBrowserTabs(await listChromeMcpPages(profileName, userDataDir));
}
async function openChromeMcpTab(profileName, url, userDataDir) {
	const targetUrl = url.trim() || "about:blank";
	const pages = extractStructuredPages(await callTool(profileName, userDataDir, "new_page", {
		url: "about:blank",
		timeout: CHROME_MCP_NEW_PAGE_TIMEOUT_MS
	}));
	const chosen = pages.find((page) => page.selected) ?? pages.at(-1);
	if (!chosen) throw new Error("Chrome MCP did not return the created page.");
	const targetId = String(chosen.id);
	return {
		targetId,
		title: "",
		url: targetUrl === "about:blank" ? chosen.url ?? targetUrl : (await navigateChromeMcpPage({
			profileName,
			userDataDir,
			targetId,
			url: targetUrl,
			timeoutMs: CHROME_MCP_NAVIGATE_TIMEOUT_MS
		})).url,
		type: "page"
	};
}
async function focusChromeMcpTab(profileName, targetId, userDataDir) {
	await callTool(profileName, userDataDir, "select_page", {
		pageId: parsePageId(targetId),
		bringToFront: true
	});
}
async function closeChromeMcpTab(profileName, targetId, userDataDir) {
	await callTool(profileName, userDataDir, "close_page", { pageId: parsePageId(targetId) });
}
async function navigateChromeMcpPage(params) {
	const resolvedTimeoutMs = params.timeoutMs ?? CHROME_MCP_NAVIGATE_TIMEOUT_MS;
	await callTool(params.profileName, params.userDataDir, "navigate_page", {
		pageId: parsePageId(params.targetId),
		type: "url",
		url: params.url,
		timeout: resolvedTimeoutMs
	}, { timeoutMs: resolvedTimeoutMs + 5e3 });
	return { url: (await findPageById(params.profileName, parsePageId(params.targetId), params.userDataDir)).url ?? params.url };
}
async function takeChromeMcpSnapshot(params) {
	return extractSnapshot(await callTool(params.profileName, params.userDataDir, "take_snapshot", { pageId: parsePageId(params.targetId) }));
}
async function takeChromeMcpScreenshot(params) {
	return await withTempFile(async (filePath) => {
		await callTool(params.profileName, params.userDataDir, "take_screenshot", {
			pageId: parsePageId(params.targetId),
			filePath,
			format: params.format ?? "png",
			...params.uid ? { uid: params.uid } : {},
			...params.fullPage ? { fullPage: true } : {}
		});
		return await fs.readFile(filePath);
	});
}
async function clickChromeMcpElement(params) {
	await callTool(params.profileName, params.userDataDir, "click", {
		pageId: parsePageId(params.targetId),
		uid: params.uid,
		...params.doubleClick ? { dblClick: true } : {}
	}, {
		timeoutMs: params.timeoutMs,
		signal: params.signal
	});
}
async function fillChromeMcpElement(params) {
	await callTool(params.profileName, params.userDataDir, "fill", {
		pageId: parsePageId(params.targetId),
		uid: params.uid,
		value: params.value
	});
}
async function fillChromeMcpForm(params) {
	await callTool(params.profileName, params.userDataDir, "fill_form", {
		pageId: parsePageId(params.targetId),
		elements: params.elements
	});
}
async function hoverChromeMcpElement(params) {
	await callTool(params.profileName, params.userDataDir, "hover", {
		pageId: parsePageId(params.targetId),
		uid: params.uid
	});
}
async function dragChromeMcpElement(params) {
	await callTool(params.profileName, params.userDataDir, "drag", {
		pageId: parsePageId(params.targetId),
		from_uid: params.fromUid,
		to_uid: params.toUid
	});
}
async function uploadChromeMcpFile(params) {
	await callTool(params.profileName, params.userDataDir, "upload_file", {
		pageId: parsePageId(params.targetId),
		uid: params.uid,
		filePath: params.filePath
	});
}
async function pressChromeMcpKey(params) {
	await callTool(params.profileName, params.userDataDir, "press_key", {
		pageId: parsePageId(params.targetId),
		key: params.key
	});
}
async function resizeChromeMcpPage(params) {
	await callTool(params.profileName, params.userDataDir, "resize_page", {
		pageId: parsePageId(params.targetId),
		width: params.width,
		height: params.height
	});
}
async function handleChromeMcpDialog(params) {
	await callTool(params.profileName, params.userDataDir, "handle_dialog", {
		pageId: parsePageId(params.targetId),
		action: params.action,
		...params.promptText ? { promptText: params.promptText } : {}
	});
}
async function evaluateChromeMcpScript(params) {
	return extractJsonMessage(await callTool(params.profileName, params.userDataDir, "evaluate_script", {
		pageId: parsePageId(params.targetId),
		function: params.fn,
		...params.args?.length ? { args: params.args } : {}
	}));
}
async function waitForChromeMcpText(params) {
	await callTool(params.profileName, params.userDataDir, "wait_for", {
		pageId: parsePageId(params.targetId),
		text: params.text,
		...typeof params.timeoutMs === "number" ? { timeout: params.timeoutMs } : {}
	});
}
function setChromeMcpSessionFactoryForTest(factory) {
	sessionFactory = factory;
}
async function resetChromeMcpSessionsForTest() {
	sessionFactory = null;
	pendingSessions.clear();
	await stopAllChromeMcpSessions();
}
//#endregion
export { takeChromeMcpScreenshot as C, waitForChromeMcpText as E, stopAllChromeMcpSessions as S, uploadChromeMcpFile as T, openChromeMcpTab as _, dragChromeMcpElement as a, resizeChromeMcpPage as b, fillChromeMcpElement as c, getChromeMcpPid as d, handleChromeMcpDialog as f, navigateChromeMcpPage as g, listChromeMcpTabs as h, closeChromeMcpTab as i, fillChromeMcpForm as l, listChromeMcpPages as m, clickChromeMcpElement as n, ensureChromeMcpAvailable as o, hoverChromeMcpElement as p, closeChromeMcpSession as r, evaluateChromeMcpScript as s, buildChromeMcpArgs as t, focusChromeMcpTab as u, pressChromeMcpKey as v, takeChromeMcpSnapshot as w, setChromeMcpSessionFactoryForTest as x, resetChromeMcpSessionsForTest as y };
