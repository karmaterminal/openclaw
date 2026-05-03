import "./paths-BBP4yd-2.js";
import "./globals-DyWRcjQY.js";
import "./utils-xFiJOAuL.js";
import "./agent-scope-Ckfy1eLE.js";
import { t as createSubsystemLogger } from "./subsystem-D5pRlZe-.js";
import "./openclaw-root-DeEQQJyX.js";
import "./logger-DHGbafYr.js";
import "./exec-XzljJcHM.js";
import { $t as loadConfig } from "./model-selection-B7i1xwmj.js";
import "./registry-XafKMtuN.js";
import "./github-copilot-token-b6kJVrW-.js";
import "./boolean-BsqeuxE6.js";
import "./env-BCNBCy-T.js";
import "./host-env-security-DkAVVuaw.js";
import "./env-vars-ausEv-bN.js";
import "./manifest-registry-DiKIwPkg.js";
import "./chrome-kG6SrbKs.js";
import "./tailscale-C5C--kZ7.js";
import "./tailnet-DnnT7RoK.js";
import "./ws-B-4c8QAU.js";
import "./auth-5JNASLRO.js";
import { c as resolveBrowserControlAuth, i as resolveBrowserConfig, r as registerBrowserRoutes, s as ensureBrowserControlAuth, t as createBrowserRouteContext } from "./server-context-BB0KK6cn.js";
import "./path-alias-guards-BzAaCM2k.js";
import "./paths-DsAAtf_q.js";
import "./redact-BqKx9qRR.js";
import "./errors-Cy92QOI2.js";
import "./fs-safe-CzdOncES.js";
import "./proxy-env-C4oZExsB.js";
import "./image-ops-Ch2CLeu6.js";
import "./store-BlIp3Z05.js";
import "./ports-B0WT9bUh.js";
import "./trash-DAtocVs0.js";
import { n as installBrowserCommonMiddleware, t as installBrowserAuthMiddleware } from "./server-middleware-zHKzC2fG.js";
import { n as stopKnownBrowserProfiles, t as ensureExtensionRelayForProfiles } from "./server-lifecycle-C_73vFc4.js";
import { t as isPwAiLoaded } from "./whatsapp-actions-D3Z-5QeV.js";
import express from "express";

//#region src/browser/server.ts
let state = null;
const logServer = createSubsystemLogger("browser").child("server");
async function startBrowserControlServerFromConfig() {
	if (state) return state;
	const cfg = loadConfig();
	const resolved = resolveBrowserConfig(cfg.browser, cfg);
	if (!resolved.enabled) return null;
	let browserAuth = resolveBrowserControlAuth(cfg);
	let browserAuthBootstrapFailed = false;
	try {
		const ensured = await ensureBrowserControlAuth({ cfg });
		browserAuth = ensured.auth;
		if (ensured.generatedToken) logServer.info("No browser auth configured; generated gateway.auth.token automatically.");
	} catch (err) {
		logServer.warn(`failed to auto-configure browser auth: ${String(err)}`);
		browserAuthBootstrapFailed = true;
	}
	if (browserAuthBootstrapFailed && !browserAuth.token && !browserAuth.password) {
		logServer.error("browser control startup aborted: authentication bootstrap failed and no fallback auth is configured.");
		return null;
	}
	const app = express();
	installBrowserCommonMiddleware(app);
	installBrowserAuthMiddleware(app, browserAuth);
	registerBrowserRoutes(app, createBrowserRouteContext({
		getState: () => state,
		refreshConfigFromDisk: true
	}));
	const port = resolved.controlPort;
	const server = await new Promise((resolve, reject) => {
		const s = app.listen(port, "127.0.0.1", () => resolve(s));
		s.once("error", reject);
	}).catch((err) => {
		logServer.error(`openclaw browser server failed to bind 127.0.0.1:${port}: ${String(err)}`);
		return null;
	});
	if (!server) return null;
	state = {
		server,
		port,
		resolved,
		profiles: /* @__PURE__ */ new Map()
	};
	await ensureExtensionRelayForProfiles({
		resolved,
		onWarn: (message) => logServer.warn(message)
	});
	const authMode = browserAuth.token ? "token" : browserAuth.password ? "password" : "off";
	logServer.info(`Browser control listening on http://127.0.0.1:${port}/ (auth=${authMode})`);
	return state;
}
async function stopBrowserControlServer() {
	const current = state;
	if (!current) return;
	await stopKnownBrowserProfiles({
		getState: () => state,
		onWarn: (message) => logServer.warn(message)
	});
	if (current.server) await new Promise((resolve) => {
		current.server?.close(() => resolve());
	});
	state = null;
	if (isPwAiLoaded()) try {
		await (await import("./pw-ai-DmYn8tGI.js")).closePlaywrightBrowserConnection();
	} catch {}
}

//#endregion
export { startBrowserControlServerFromConfig, stopBrowserControlServer };