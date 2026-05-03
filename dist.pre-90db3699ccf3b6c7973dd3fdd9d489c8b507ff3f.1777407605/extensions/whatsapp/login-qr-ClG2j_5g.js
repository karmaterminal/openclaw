import { m as resolveWhatsAppAccount } from "./text-runtime-pSZYjiCV.js";
import { d as readWebAuthExistsForDecision, h as readWebSelfId, n as WHATSAPP_AUTH_UNSTABLE_CODE } from "./auth-store-lH9AsQ9n.js";
import { a as waitForWhatsAppLoginResult, o as createWaSocket, r as closeWaSocket, t as WHATSAPP_LOGGED_OUT_QR_MESSAGE } from "./connection-controller-Dv0ZiBkR.js";
import { logInfo } from "openclaw/plugin-sdk/text-runtime";
import { loadConfig } from "openclaw/plugin-sdk/config-runtime";
import { renderQrPngBase64 } from "openclaw/plugin-sdk/media-runtime";
import { danger, defaultRuntime, info, success } from "openclaw/plugin-sdk/runtime-env";
import { randomUUID } from "node:crypto";
//#region extensions/whatsapp/src/login-qr.ts
function waitForNextTask() {
	return new Promise((resolve) => setImmediate(resolve));
}
const ACTIVE_LOGIN_TTL_MS = 3 * 6e4;
const activeLogins = /* @__PURE__ */ new Map();
function closeSocket(sock) {
	closeWaSocket(sock);
}
async function resetActiveLogin(accountId, reason) {
	const login = activeLogins.get(accountId);
	if (login) {
		closeSocket(login.sock);
		activeLogins.delete(accountId);
	}
	if (reason) logInfo(reason);
}
function isLoginFresh(login) {
	return Date.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS;
}
function attachLoginWaiter(accountId, login) {
	login.waitPromise = waitForWhatsAppLoginResult({
		sock: login.sock,
		authDir: login.authDir,
		isLegacyAuthDir: login.isLegacyAuthDir,
		verbose: login.verbose,
		runtime: login.runtime,
		onSocketReplaced: (sock) => {
			const current = activeLogins.get(accountId);
			if (current?.id === login.id) {
				current.sock = sock;
				current.connected = false;
				current.error = void 0;
				current.errorStatus = void 0;
			}
		}
	}).then((result) => {
		const current = activeLogins.get(accountId);
		if (current?.id !== login.id) return;
		if (result.outcome === "connected") {
			current.sock = result.sock;
			current.connected = true;
			return;
		}
		current.error = result.message;
		current.errorStatus = result.statusCode;
	}).catch((err) => {
		const current = activeLogins.get(accountId);
		if (current?.id !== login.id) return;
		current.error = err instanceof Error ? err.message : String(err);
		current.errorStatus = void 0;
	});
}
async function waitForQrOrRecoveredLogin(params) {
	const qrResult = params.qrPromise.then((qr) => ({
		outcome: "qr",
		qr
	}), (err) => ({
		outcome: "failed",
		message: `Failed to get QR: ${String(err)}`
	}));
	const loginResult = params.login.waitPromise.then(async () => {
		if (activeLogins.get(params.accountId)?.id !== params.login.id) return {
			outcome: "failed",
			message: "WhatsApp login was replaced by a newer request."
		};
		await waitForNextTask();
		const latest = activeLogins.get(params.accountId);
		if (latest?.id !== params.login.id) return {
			outcome: "failed",
			message: "WhatsApp login was replaced by a newer request."
		};
		if (latest.qr) return {
			outcome: "qr",
			qr: latest.qr
		};
		if (latest.connected) return { outcome: "connected" };
		return {
			outcome: "failed",
			message: latest.error ? `WhatsApp login failed: ${latest.error}` : "WhatsApp login failed."
		};
	});
	return await Promise.race([qrResult, loginResult]);
}
async function startWebLoginWithQr(opts = {}) {
	const runtime = opts.runtime ?? defaultRuntime;
	const account = resolveWhatsAppAccount({
		cfg: loadConfig(),
		accountId: opts.accountId
	});
	const authState = await readWebAuthExistsForDecision(account.authDir);
	if (authState.outcome === "unstable") return {
		code: WHATSAPP_AUTH_UNSTABLE_CODE,
		message: "WhatsApp auth state is still stabilizing. Retry login in a moment."
	};
	if (authState.exists && !opts.force) {
		const selfId = readWebSelfId(account.authDir);
		return { message: `WhatsApp is already linked (${selfId.e164 ?? selfId.jid ?? "unknown"}). Say “relink” if you want a fresh QR.` };
	}
	const existing = activeLogins.get(account.accountId);
	if (existing && isLoginFresh(existing) && existing.qrDataUrl) return {
		qrDataUrl: existing.qrDataUrl,
		message: "QR already active. Scan it in WhatsApp → Linked Devices."
	};
	await resetActiveLogin(account.accountId);
	let resolveQr = null;
	let rejectQr = null;
	const qrPromise = new Promise((resolve, reject) => {
		resolveQr = resolve;
		rejectQr = reject;
	});
	const qrTimer = setTimeout(() => {
		rejectQr?.(/* @__PURE__ */ new Error("Timed out waiting for WhatsApp QR"));
	}, Math.max(opts.timeoutMs ?? 3e4, 5e3));
	let sock;
	let pendingQr = null;
	try {
		sock = await createWaSocket(false, Boolean(opts.verbose), {
			authDir: account.authDir,
			onQr: (qr) => {
				if (pendingQr) return;
				pendingQr = qr;
				const current = activeLogins.get(account.accountId);
				if (current && !current.qr) current.qr = qr;
				clearTimeout(qrTimer);
				runtime.log(info("WhatsApp QR received."));
				resolveQr?.(qr);
			}
		});
	} catch (err) {
		clearTimeout(qrTimer);
		await resetActiveLogin(account.accountId);
		return { message: `Failed to start WhatsApp login: ${String(err)}` };
	}
	const login = {
		accountId: account.accountId,
		authDir: account.authDir,
		isLegacyAuthDir: account.isLegacyAuthDir,
		id: randomUUID(),
		sock,
		startedAt: Date.now(),
		connected: false,
		waitPromise: Promise.resolve(),
		verbose: Boolean(opts.verbose),
		runtime
	};
	activeLogins.set(account.accountId, login);
	if (pendingQr && !login.qr) login.qr = pendingQr;
	attachLoginWaiter(account.accountId, login);
	const loginStartResult = await waitForQrOrRecoveredLogin({
		accountId: account.accountId,
		login,
		qrPromise
	});
	clearTimeout(qrTimer);
	if (loginStartResult.outcome === "connected") {
		const selfId = readWebSelfId(account.authDir);
		const who = selfId.e164 ?? selfId.jid ?? "unknown";
		await resetActiveLogin(account.accountId);
		return {
			message: `WhatsApp recovered the existing linked session (${who}).`,
			connected: true
		};
	}
	if (loginStartResult.outcome === "failed") {
		await resetActiveLogin(account.accountId);
		return { message: loginStartResult.message };
	}
	login.qrDataUrl = `data:image/png;base64,${await renderQrPngBase64(loginStartResult.qr)}`;
	return {
		qrDataUrl: login.qrDataUrl,
		message: "Scan this QR in WhatsApp → Linked Devices."
	};
}
async function waitForWebLogin(opts = {}) {
	const runtime = opts.runtime ?? defaultRuntime;
	const account = resolveWhatsAppAccount({
		cfg: loadConfig(),
		accountId: opts.accountId
	});
	const activeLogin = activeLogins.get(account.accountId);
	if (!activeLogin) return {
		connected: false,
		message: "No active WhatsApp login in progress."
	};
	const login = activeLogin;
	if (!isLoginFresh(login)) {
		await resetActiveLogin(account.accountId);
		return {
			connected: false,
			message: "The login QR expired. Ask me to generate a new one."
		};
	}
	const timeoutMs = Math.max(opts.timeoutMs ?? 12e4, 1e3);
	const deadline = Date.now() + timeoutMs;
	while (true) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) return {
			connected: false,
			message: "Still waiting for the QR scan. Let me know when you’ve scanned it."
		};
		const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), remaining));
		if (await Promise.race([login.waitPromise.then(() => "done"), timeout]) === "timeout") return {
			connected: false,
			message: "Still waiting for the QR scan. Let me know when you’ve scanned it."
		};
		if (login.error) {
			if (login.errorStatus === 401) {
				const message = WHATSAPP_LOGGED_OUT_QR_MESSAGE;
				await resetActiveLogin(account.accountId, message);
				runtime.log(danger(message));
				return {
					connected: false,
					message
				};
			}
			const message = `WhatsApp login failed: ${login.error}`;
			await resetActiveLogin(account.accountId, message);
			runtime.log(danger(message));
			return {
				connected: false,
				message
			};
		}
		if (login.connected) {
			const message = "✅ Linked! WhatsApp is ready.";
			runtime.log(success(message));
			await resetActiveLogin(account.accountId);
			return {
				connected: true,
				message
			};
		}
		return {
			connected: false,
			message: "Login ended without a connection."
		};
	}
}
//#endregion
export { startWebLoginWithQr, waitForWebLogin };
