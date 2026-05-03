import { t as formatCliCommand } from "./command-format-CUuNRpiL.js";
import { _ as resolveStateDir } from "./paths-CrDgDBYA.js";
import { r as writeJsonAtomic } from "./json-files-BXsNmWIg.js";
import path from "node:path";
import fs from "node:fs/promises";
//#region src/infra/restart-sentinel.ts
const DEFAULT_RESTART_SUCCESS_CONTINUATION_MESSAGE = "The gateway restart completed successfully. Tell the user OpenClaw restarted successfully and continue any pending work.";
const SENTINEL_FILENAME = "restart-sentinel.json";
function formatDoctorNonInteractiveHint(env = process.env) {
	return `Run: ${formatCliCommand("openclaw doctor --non-interactive", env)}`;
}
function resolveRestartSentinelPath(env = process.env) {
	return path.join(resolveStateDir(env), SENTINEL_FILENAME);
}
async function writeRestartSentinel(payload, env = process.env) {
	const filePath = resolveRestartSentinelPath(env);
	await writeJsonAtomic(filePath, {
		version: 1,
		payload
	}, {
		trailingNewline: true,
		ensureDirMode: 448
	});
	return filePath;
}
async function removeRestartSentinelFile(filePath) {
	if (!filePath) return;
	await fs.unlink(filePath).catch(() => {});
}
function buildRestartSuccessContinuation(params) {
	const message = params.continuationMessage?.trim();
	if (message) return {
		kind: "agentTurn",
		message
	};
	return params.sessionKey?.trim() ? {
		kind: "agentTurn",
		message: DEFAULT_RESTART_SUCCESS_CONTINUATION_MESSAGE
	} : null;
}
async function readRestartSentinel(env = process.env) {
	const filePath = resolveRestartSentinelPath(env);
	try {
		const raw = await fs.readFile(filePath, "utf-8");
		let parsed;
		try {
			parsed = JSON.parse(raw);
		} catch {
			await fs.unlink(filePath).catch(() => {});
			return null;
		}
		if (!parsed || parsed.version !== 1 || !parsed.payload) {
			await fs.unlink(filePath).catch(() => {});
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}
async function hasRestartSentinel(env = process.env) {
	try {
		await fs.access(resolveRestartSentinelPath(env));
		return true;
	} catch {
		return false;
	}
}
async function consumeRestartSentinel(env = process.env) {
	const filePath = resolveRestartSentinelPath(env);
	const parsed = await readRestartSentinel(env);
	if (!parsed) return null;
	await removeRestartSentinelFile(filePath);
	return parsed;
}
function formatRestartSentinelMessage(payload) {
	const message = payload.message?.trim();
	if (message && (!payload.stats || payload.kind === "config-auto-recovery")) return message;
	const lines = [summarizeRestartSentinel(payload)];
	if (message) lines.push(message);
	const reason = payload.stats?.reason?.trim();
	if (reason && reason !== message) lines.push(`Reason: ${reason}`);
	if (payload.doctorHint?.trim()) lines.push(payload.doctorHint.trim());
	return lines.join("\n");
}
function summarizeRestartSentinel(payload) {
	if (payload.kind === "config-auto-recovery") return "Gateway auto-recovery";
	return `Gateway restart ${payload.kind} ${payload.status}${payload.stats?.mode ? ` (${payload.stats.mode})` : ""}`.trim();
}
function trimLogTail(input, maxChars = 8e3) {
	if (!input) return null;
	const text = input.trimEnd();
	if (text.length <= maxChars) return text;
	return `…${text.slice(text.length - maxChars)}`;
}
//#endregion
export { formatRestartSentinelMessage as a, removeRestartSentinelFile as c, trimLogTail as d, writeRestartSentinel as f, formatDoctorNonInteractiveHint as i, resolveRestartSentinelPath as l, buildRestartSuccessContinuation as n, hasRestartSentinel as o, consumeRestartSentinel as r, readRestartSentinel as s, DEFAULT_RESTART_SUCCESS_CONTINUATION_MESSAGE as t, summarizeRestartSentinel as u };
