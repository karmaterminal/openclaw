import { n as __reExport, t as __exportAll } from "./rolldown-runtime-RkAeH_Qm.js";
import { t as resolveMergedWhatsAppAccountConfig } from "./account-config-CNQ33oav.js";
import { t as hasWebCredsSync } from "./creds-files-BD3Rjqo2.js";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_ACCOUNT_ID, createAccountListHelpers, normalizeAccountId, resolveUserPath } from "openclaw/plugin-sdk/account-core";
import { resolveOAuthDir } from "openclaw/plugin-sdk/state-paths";
import { CONFIG_DIR, escapeRegExp, normalizeOptionalString, resolveUserPath as resolveUserPath$1 } from "openclaw/plugin-sdk/text-runtime";
import { normalizeE164 } from "openclaw/plugin-sdk/account-resolution";
import { logVerbose, shouldLogVerbose } from "openclaw/plugin-sdk/runtime-env";
//#region extensions/whatsapp/src/accounts.ts
const DEFAULT_WHATSAPP_MEDIA_MAX_MB = 50;
const { listConfiguredAccountIds, listAccountIds, resolveDefaultAccountId } = createAccountListHelpers("whatsapp");
const listWhatsAppAccountIds = listAccountIds;
const resolveDefaultWhatsAppAccountId = resolveDefaultAccountId;
function listWhatsAppAuthDirs(cfg) {
	const oauthDir = resolveOAuthDir();
	const whatsappDir = path.join(oauthDir, "whatsapp");
	const authDirs = new Set([oauthDir, path.join(whatsappDir, DEFAULT_ACCOUNT_ID)]);
	const accountIds = listConfiguredAccountIds(cfg);
	for (const accountId of accountIds) authDirs.add(resolveWhatsAppAuthDir({
		cfg,
		accountId
	}).authDir);
	try {
		const entries = fs.readdirSync(whatsappDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			authDirs.add(path.join(whatsappDir, entry.name));
		}
	} catch {}
	return Array.from(authDirs);
}
function hasAnyWhatsAppAuth(cfg) {
	return listWhatsAppAuthDirs(cfg).some((authDir) => hasWebCredsSync(authDir));
}
function resolveDefaultAuthDir(accountId) {
	return path.join(resolveOAuthDir(), "whatsapp", normalizeAccountId(accountId));
}
function resolveLegacyAuthDir() {
	return resolveOAuthDir();
}
function legacyAuthExists(authDir) {
	try {
		return fs.existsSync(path.join(authDir, "creds.json"));
	} catch {
		return false;
	}
}
function resolveWhatsAppAuthDir(params) {
	const accountId = params.accountId.trim() || DEFAULT_ACCOUNT_ID;
	const configured = resolveMergedWhatsAppAccountConfig({
		cfg: params.cfg,
		accountId
	})?.authDir?.trim();
	if (configured) return {
		authDir: resolveUserPath(configured),
		isLegacy: false
	};
	const defaultDir = resolveDefaultAuthDir(accountId);
	if (accountId === DEFAULT_ACCOUNT_ID) {
		const legacyDir = resolveLegacyAuthDir();
		if (legacyAuthExists(legacyDir) && !legacyAuthExists(defaultDir)) return {
			authDir: legacyDir,
			isLegacy: true
		};
	}
	return {
		authDir: defaultDir,
		isLegacy: false
	};
}
function resolveWhatsAppAccount(params) {
	const merged = resolveMergedWhatsAppAccountConfig({
		cfg: params.cfg,
		accountId: params.accountId?.trim() || resolveDefaultWhatsAppAccountId(params.cfg)
	});
	const accountId = merged.accountId;
	const enabled = merged.enabled !== false;
	const { authDir, isLegacy } = resolveWhatsAppAuthDir({
		cfg: params.cfg,
		accountId
	});
	return {
		accountId,
		name: normalizeOptionalString(merged.name),
		enabled,
		sendReadReceipts: merged.sendReadReceipts ?? true,
		messagePrefix: merged.messagePrefix ?? params.cfg.messages?.messagePrefix,
		defaultTo: merged.defaultTo,
		authDir,
		isLegacyAuthDir: isLegacy,
		selfChatMode: merged.selfChatMode,
		dmPolicy: merged.dmPolicy,
		allowFrom: merged.allowFrom,
		groupAllowFrom: merged.groupAllowFrom,
		groupPolicy: merged.groupPolicy,
		historyLimit: merged.historyLimit,
		textChunkLimit: merged.textChunkLimit,
		chunkMode: merged.chunkMode,
		mediaMaxMb: merged.mediaMaxMb,
		blockStreaming: merged.blockStreaming,
		ackReaction: merged.ackReaction,
		reactionLevel: merged.reactionLevel,
		groups: merged.groups,
		direct: merged.direct,
		debounceMs: merged.debounceMs,
		replyToMode: merged.replyToMode
	};
}
function resolveWhatsAppMediaMaxBytes(account) {
	return (typeof account.mediaMaxMb === "number" && account.mediaMaxMb > 0 ? account.mediaMaxMb : 50) * 1024 * 1024;
}
function listEnabledWhatsAppAccounts(cfg) {
	return listWhatsAppAccountIds(cfg).map((accountId) => resolveWhatsAppAccount({
		cfg,
		accountId
	})).filter((account) => account.enabled);
}
//#endregion
//#region extensions/whatsapp/src/targets-runtime.ts
const WHATSAPP_FENCE_PLACEHOLDER = "\0FENCE";
const WHATSAPP_INLINE_CODE_PLACEHOLDER = "\0CODE";
function assertWebChannel(input) {
	if (input !== "web") throw new Error("Web channel must be 'web'");
}
function isSelfChatMode(selfE164, allowFrom) {
	if (!selfE164) return false;
	if (!Array.isArray(allowFrom) || allowFrom.length === 0) return false;
	const normalizedSelf = normalizeE164(selfE164);
	return allowFrom.some((n) => {
		if (n === "*") return false;
		try {
			return normalizeE164(String(n)) === normalizedSelf;
		} catch {
			return false;
		}
	});
}
function toWhatsappJid(number) {
	const withoutPrefix = number.replace(/^whatsapp:/i, "").trim();
	if (withoutPrefix.includes("@")) return withoutPrefix;
	return `${normalizeE164(withoutPrefix).replace(/\D/g, "")}@s.whatsapp.net`;
}
function resolveLidMappingDirs(params) {
	const dirs = /* @__PURE__ */ new Set();
	const addDir = (dir) => {
		if (!dir) return;
		dirs.add(resolveUserPath$1(dir));
	};
	addDir(params.opts?.authDir);
	for (const dir of params.opts?.lidMappingDirs ?? []) addDir(dir);
	addDir(CONFIG_DIR);
	addDir(path.join(CONFIG_DIR, "credentials"));
	return [...dirs];
}
function readLidReverseMapping(params) {
	const mappingFilename = `lid-mapping-${params.lid}_reverse.json`;
	const mappingDirs = resolveLidMappingDirs({ opts: params.opts });
	for (const dir of mappingDirs) {
		const mappingPath = path.join(dir, mappingFilename);
		try {
			const data = fs.readFileSync(mappingPath, "utf8");
			const phone = JSON.parse(data);
			if (phone === null || phone === void 0) continue;
			return normalizeE164(String(phone));
		} catch {}
	}
	return null;
}
function jidToE164(jid, opts) {
	const match = jid.match(/^(\d+)(?::\d+)?@(s\.whatsapp\.net|hosted)$/);
	if (match) return `+${match[1]}`;
	const lidMatch = jid.match(/^(\d+)(?::\d+)?@(lid|hosted\.lid)$/);
	if (!lidMatch) return null;
	const phone = readLidReverseMapping({
		lid: lidMatch[1],
		opts
	});
	if (phone) return phone;
	if (opts?.logMissing ?? shouldLogVerbose()) logVerbose(`LID mapping not found for ${lidMatch[1]}; skipping inbound message`);
	return null;
}
async function resolveJidToE164(jid, opts) {
	if (!jid) return null;
	const direct = jidToE164(jid, opts);
	if (direct) return direct;
	if (!/(@lid|@hosted\.lid)$/.test(jid) || !opts?.lidLookup?.getPNForLID) return null;
	try {
		const pnJid = await opts.lidLookup.getPNForLID(jid);
		if (!pnJid) return null;
		return jidToE164(pnJid, opts);
	} catch (err) {
		if (shouldLogVerbose()) logVerbose(`LID mapping lookup failed for ${jid}: ${String(err)}`);
		return null;
	}
}
function markdownToWhatsApp(text) {
	if (!text) return text;
	const fences = [];
	let result = text.replace(/```[\s\S]*?```/g, (match) => {
		fences.push(match);
		return `${WHATSAPP_FENCE_PLACEHOLDER}${fences.length - 1}`;
	});
	const inlineCodes = [];
	result = result.replace(/`[^`\n]+`/g, (match) => {
		inlineCodes.push(match);
		return `${WHATSAPP_INLINE_CODE_PLACEHOLDER}${inlineCodes.length - 1}`;
	});
	result = result.replace(/\*\*(.+?)\*\*/g, "*$1*");
	result = result.replace(/__(.+?)__/g, "*$1*");
	result = result.replace(/~~(.+?)~~/g, "~$1~");
	result = result.replace(new RegExp(`${escapeRegExp(WHATSAPP_INLINE_CODE_PLACEHOLDER)}(\\d+)`, "g"), (_, idx) => inlineCodes[Number(idx)] ?? "");
	result = result.replace(new RegExp(`${escapeRegExp(WHATSAPP_FENCE_PLACEHOLDER)}(\\d+)`, "g"), (_, idx) => fences[Number(idx)] ?? "");
	return result;
}
//#endregion
//#region extensions/whatsapp/src/text-runtime.ts
var text_runtime_exports = /* @__PURE__ */ __exportAll({
	assertWebChannel: () => assertWebChannel,
	isSelfChatMode: () => isSelfChatMode,
	jidToE164: () => jidToE164,
	markdownToWhatsApp: () => markdownToWhatsApp,
	resolveJidToE164: () => resolveJidToE164,
	toWhatsappJid: () => toWhatsappJid
});
import * as import_openclaw_plugin_sdk_text_runtime from "openclaw/plugin-sdk/text-runtime";
__reExport(text_runtime_exports, import_openclaw_plugin_sdk_text_runtime);
//#endregion
export { markdownToWhatsApp as a, DEFAULT_WHATSAPP_MEDIA_MAX_MB as c, listWhatsAppAccountIds as d, listWhatsAppAuthDirs as f, resolveWhatsAppMediaMaxBytes as g, resolveWhatsAppAuthDir as h, jidToE164 as i, hasAnyWhatsAppAuth as l, resolveWhatsAppAccount as m, assertWebChannel as n, resolveJidToE164 as o, resolveDefaultWhatsAppAccountId as p, isSelfChatMode as r, toWhatsappJid as s, text_runtime_exports as t, listEnabledWhatsAppAccounts as u };
