import { r as __exportAll } from "./chunk-A-jGZS85.js";
import { r as ensureAuthProfileStoreForLocalUpdate } from "./store-De_brRTx.js";
import { i as NON_ENV_SECRETREF_MARKER } from "./model-auth-markers-U2294Wcj.js";
import { t as resolveEnvApiKey } from "./model-auth-env-BPk5alE5.js";
import { n as resolveAwsSdkEnvVarName, t as requireApiKey } from "./model-auth-runtime-shared-7xTwSNzs.js";
import { s as resolveApiKeyForProvider$1 } from "./model-auth-CnLreLvU.js";
import { n as executeWithApiKeyRotation, t as collectProviderApiKeysForExecution } from "./api-key-rotation-CCSEwtEV.js";
import { s as writePrivateSecretFileAtomic } from "./secret-file-Ceekl8PS.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { createServer } from "node:http";
//#region src/plugin-sdk/provider-auth-runtime.ts
var provider_auth_runtime_exports = /* @__PURE__ */ __exportAll({
	CODEX_AUTH_ENV_CLEAR_KEYS: () => CODEX_AUTH_ENV_CLEAR_KEYS,
	NON_ENV_SECRETREF_MARKER: () => NON_ENV_SECRETREF_MARKER,
	buildCodexAuthBridgeFile: () => buildCodexAuthBridgeFile,
	collectProviderApiKeysForExecution: () => collectProviderApiKeysForExecution,
	executeWithApiKeyRotation: () => executeWithApiKeyRotation,
	generateOAuthState: () => generateOAuthState,
	getRuntimeAuthForModel: () => getRuntimeAuthForModel,
	isCodexBridgeableOAuthCredential: () => isCodexBridgeableOAuthCredential,
	parseOAuthCallbackInput: () => parseOAuthCallbackInput,
	prepareCodexAuthBridge: () => prepareCodexAuthBridge,
	requireApiKey: () => requireApiKey,
	resolveApiKeyForProvider: () => resolveApiKeyForProvider,
	resolveAwsSdkEnvVarName: () => resolveAwsSdkEnvVarName,
	resolveCodexAuthBridgeHome: () => resolveCodexAuthBridgeHome,
	resolveEnvApiKey: () => resolveEnvApiKey,
	waitForLocalOAuthCallback: () => waitForLocalOAuthCallback
});
const CODEX_AUTH_ENV_CLEAR_KEYS = ["OPENAI_API_KEY"];
const OPENAI_CODEX_PROVIDER_ID = "openai-codex";
function generateOAuthState() {
	return crypto.randomBytes(32).toString("hex");
}
function parseOAuthCallbackInput(input, messages = {}) {
	const trimmed = input.trim();
	if (!trimmed) return { error: "No input provided" };
	try {
		const url = new URL(trimmed);
		const code = url.searchParams.get("code");
		const state = url.searchParams.get("state");
		if (!code) return { error: "Missing 'code' parameter in URL" };
		if (!state) return { error: messages.missingState ?? "Missing 'state' parameter in URL" };
		return {
			code,
			state
		};
	} catch {
		return { error: messages.invalidInput ?? "Paste the full redirect URL, not just the code." };
	}
}
async function waitForLocalOAuthCallback(params) {
	const hostname = params.hostname ?? "localhost";
	const escapedSuccessTitle = escapeHtmlText(params.successTitle);
	return new Promise((resolve, reject) => {
		let settled = false;
		let timeout = null;
		const server = createServer((req, res) => {
			try {
				const requestUrl = new URL(req.url ?? "/", `http://${hostname}:${params.port}`);
				if (requestUrl.pathname !== params.callbackPath) {
					res.statusCode = 404;
					res.setHeader("Content-Type", "text/plain");
					res.end("Not found");
					return;
				}
				const error = requestUrl.searchParams.get("error");
				const code = requestUrl.searchParams.get("code")?.trim();
				const state = requestUrl.searchParams.get("state")?.trim();
				if (error) {
					res.statusCode = 400;
					res.setHeader("Content-Type", "text/plain");
					res.end(`Authentication failed: ${error}`);
					finish(/* @__PURE__ */ new Error(`OAuth error: ${error}`));
					return;
				}
				if (!code || !state) {
					res.statusCode = 400;
					res.setHeader("Content-Type", "text/plain");
					res.end("Missing code or state");
					finish(/* @__PURE__ */ new Error("Missing OAuth code or state"));
					return;
				}
				if (state !== params.expectedState) {
					res.statusCode = 400;
					res.setHeader("Content-Type", "text/plain");
					res.end("Invalid state");
					finish(/* @__PURE__ */ new Error("OAuth state mismatch"));
					return;
				}
				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html; charset=utf-8");
				res.end(`<!doctype html><html><head><meta charset='utf-8'/></head><body><h2>${escapedSuccessTitle}</h2><p>You can close this window and return to OpenClaw.</p></body></html>`);
				finish(void 0, {
					code,
					state
				});
			} catch (err) {
				finish(err instanceof Error ? err : /* @__PURE__ */ new Error("OAuth callback failed"));
			}
		});
		const finish = (err, result) => {
			if (settled) return;
			settled = true;
			if (timeout) clearTimeout(timeout);
			try {
				server.close();
			} catch {}
			if (err) reject(err);
			else if (result) resolve(result);
		};
		server.once("error", (err) => {
			finish(err instanceof Error ? err : /* @__PURE__ */ new Error("OAuth callback server error"));
		});
		server.listen(params.port, hostname, () => {
			params.onProgress?.(params.progressMessage ?? `Waiting for OAuth callback on ${params.redirectUri}...`);
		});
		timeout = setTimeout(() => {
			finish(/* @__PURE__ */ new Error("OAuth callback timeout"));
		}, params.timeoutMs);
	});
}
function escapeHtmlText(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function isCodexBridgeableOAuthCredential(value) {
	return Boolean(value && typeof value === "object" && value !== null && "type" in value && "provider" in value && "access" in value && "refresh" in value && value.type === "oauth" && value.provider === OPENAI_CODEX_PROVIDER_ID && typeof value.access === "string" && value.access.trim().length > 0 && typeof value.refresh === "string" && value.refresh.trim().length > 0);
}
function resolveCodexAuthBridgeHome(params) {
	const digest = crypto.createHash("sha256").update(params.profileId).digest("hex").slice(0, 16);
	return path.join(params.agentDir, params.bridgeDir, "codex", digest);
}
function assertExistingCodexAuthBridgeFileSafe(codexHome) {
	const authFile = path.join(codexHome, "auth.json");
	try {
		const stat = fs.lstatSync(authFile);
		if (stat.isSymbolicLink()) throw new Error(`Private secret file ${authFile} must not be a symlink.`);
		if (!stat.isFile()) throw new Error(`Private secret file ${authFile} must be a regular file.`);
	} catch (error) {
		if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
	}
}
function buildCodexAuthBridgeFile(credential, material = {}) {
	const lastRefresh = normalizeCodexAuthLastRefresh(material.lastRefresh) ?? (/* @__PURE__ */ new Date()).toISOString();
	const openaiApiKey = readCodexAuthString(material.openaiApiKey);
	const idToken = readCodexAuthString(credential.idToken) ?? readCodexAuthString(material.idToken);
	const accountId = readCodexAuthString(credential.accountId) ?? readCodexAuthString(material.accountId);
	return `${JSON.stringify({
		auth_mode: "chatgpt",
		...openaiApiKey ? { OPENAI_API_KEY: openaiApiKey } : {},
		tokens: {
			...idToken ? { id_token: idToken } : {},
			access_token: credential.access,
			refresh_token: credential.refresh,
			...accountId ? { account_id: accountId } : {}
		},
		last_refresh: lastRefresh
	}, null, 2)}\n`;
}
async function prepareCodexAuthBridge(params) {
	const credential = ensureAuthProfileStoreForLocalUpdate(params.agentDir).profiles[params.profileId];
	if (!isCodexBridgeableOAuthCredential(credential)) return;
	const codexHome = resolveCodexAuthBridgeHome(params);
	assertExistingCodexAuthBridgeFileSafe(codexHome);
	const material = resolveCodexAuthBridgeMaterial({
		credential,
		sourceCodexHome: params.sourceCodexHome,
		env: {
			...process.env,
			...params.env
		}
	});
	if (!readCodexAuthString(credential.idToken) && !readCodexAuthString(material.idToken)) return;
	await writePrivateSecretFileAtomic({
		rootDir: params.agentDir,
		filePath: path.join(codexHome, "auth.json"),
		content: buildCodexAuthBridgeFile(credential, material)
	});
	return {
		codexHome,
		clearEnv: [...CODEX_AUTH_ENV_CLEAR_KEYS]
	};
}
function resolveCodexAuthBridgeMaterial(params) {
	const source = readCodexAuthBridgeSourceFile({
		codexHome: params.sourceCodexHome,
		env: params.env
	});
	if (!source || source.auth_mode !== "chatgpt") return {};
	const tokens = source.tokens;
	if (!tokens || typeof tokens !== "object") return {};
	const access = readCodexAuthString(tokens.access_token);
	const refresh = readCodexAuthString(tokens.refresh_token);
	if (!access || !refresh) return {};
	const accountId = readCodexAuthString(tokens.account_id);
	if (!codexAuthSourceMatchesCredential(params.credential, {
		access,
		refresh,
		accountId
	})) return {};
	const idToken = readCodexAuthString(tokens.id_token);
	const lastRefresh = normalizeCodexAuthLastRefresh(source.last_refresh);
	const openaiApiKey = readCodexAuthString(source.OPENAI_API_KEY);
	return {
		...accountId ? { accountId } : {},
		...idToken ? { idToken } : {},
		...lastRefresh ? { lastRefresh } : {},
		...openaiApiKey ? { openaiApiKey } : {}
	};
}
function codexAuthSourceMatchesCredential(credential, source) {
	if (credential.access === source.access && credential.refresh === source.refresh) return true;
	const credentialAccountId = credential.accountId?.trim();
	const sourceAccountId = source.accountId?.trim();
	return Boolean(credentialAccountId && sourceAccountId && credentialAccountId === sourceAccountId);
}
function readCodexAuthBridgeSourceFile(params) {
	const codexHome = resolveSourceCodexHome(params);
	if (!codexHome) return;
	try {
		const parsed = JSON.parse(fs.readFileSync(path.join(codexHome, "auth.json"), "utf8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
	} catch {
		return;
	}
}
function resolveSourceCodexHome(params) {
	const configured = params.codexHome?.trim() || params.env?.CODEX_HOME?.trim();
	if (configured) return resolveTildePath(configured);
	const home = os.homedir();
	return home ? path.join(home, ".codex") : void 0;
}
function resolveTildePath(value) {
	if (value === "~") return os.homedir();
	if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
	return path.resolve(value);
}
function readCodexAuthString(value) {
	return typeof value === "string" && value.trim() ? value : void 0;
}
function normalizeCodexAuthLastRefresh(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	return readCodexAuthString(value);
}
const RUNTIME_MODEL_AUTH_CANDIDATES = ["./runtime-model-auth.runtime", "../plugins/runtime/runtime-model-auth.runtime"];
const RUNTIME_MODEL_AUTH_EXTENSIONS = [
	".js",
	".ts",
	".mjs",
	".mts",
	".cjs",
	".cts"
];
function resolveRuntimeModelAuthModuleHref() {
	const baseDir = path.dirname(fileURLToPath(import.meta.url));
	for (const relativeBase of RUNTIME_MODEL_AUTH_CANDIDATES) for (const ext of RUNTIME_MODEL_AUTH_EXTENSIONS) {
		const candidate = path.resolve(baseDir, `${relativeBase}${ext}`);
		if (fs.existsSync(candidate)) return pathToFileURL(candidate).href;
	}
	throw new Error(`Unable to resolve runtime model auth module from ${import.meta.url}`);
}
async function loadRuntimeModelAuthModule() {
	return await import(resolveRuntimeModelAuthModuleHref());
}
async function resolveApiKeyForProvider(params) {
	const runtimeAuth = await loadRuntimeModelAuthModule();
	return (typeof runtimeAuth.resolveApiKeyForProvider === "function" ? runtimeAuth.resolveApiKeyForProvider : resolveApiKeyForProvider$1)(params);
}
async function getRuntimeAuthForModel(params) {
	const { getRuntimeAuthForModel } = await loadRuntimeModelAuthModule();
	return getRuntimeAuthForModel(params);
}
//#endregion
export { isCodexBridgeableOAuthCredential as a, provider_auth_runtime_exports as c, waitForLocalOAuthCallback as d, getRuntimeAuthForModel as i, resolveApiKeyForProvider as l, buildCodexAuthBridgeFile as n, parseOAuthCallbackInput as o, generateOAuthState as r, prepareCodexAuthBridge as s, CODEX_AUTH_ENV_CLEAR_KEYS as t, resolveCodexAuthBridgeHome as u };
