import "./globals-d3aR1MYC.js";
import "./paths-BMo6kTge.js";
import { t as createSubsystemLogger } from "./subsystem-Cfn2Pryx.js";
import "./boolean-DtWR5bt3.js";
import { z as loadConfig } from "./auth-profiles-g_IwaokD.js";
import "./agent-scope-C5bklqr1.js";
import "./utils-cwpAMi-t.js";
import "./openclaw-root-BFfBQ6FD.js";
import "./logger-DB-PHqB2.js";
import "./exec-B45rafWZ.js";
import "./registry-BrR1Dq5T.js";
import "./github-copilot-token-Byc_YVYE.js";
import "./host-env-security-lcjXF83D.js";
import "./version-DdJhsIqk.js";
import "./env-vars-mSSOl7Rv.js";
import "./manifest-registry-OQDPluXW.js";
import "./path-alias-guards-DbNvNQar.js";
import "./net-DULSGgS2.js";
import "./tailnet-D3gLcYwp.js";
import "./image-ops-WJSAG5_7.js";
import "./chrome-DEp-MaR1.js";
import "./tailscale-D4zNU-0Q.js";
import "./auth-l3KQ3Wf5.js";
import { c as resolveBrowserControlAuth, i as resolveBrowserConfig, r as registerBrowserRoutes, s as ensureBrowserControlAuth, t as createBrowserRouteContext } from "./server-context-BxBFV2PX.js";
import "./paths-BaZIBy3U.js";
import "./redact-DwuqxSL3.js";
import "./errors-CIvF1JsC.js";
import "./fs-safe-CYrszQI6.js";
import "./proxy-env-BwTY9-9I.js";
import "./store-OqcrqyHY.js";
import "./ports-DA8HamoF.js";
import "./trash-Dq9t9uID.js";
import { n as installBrowserCommonMiddleware, t as installBrowserAuthMiddleware } from "./server-middleware-pRerXlG7.js";
import { n as stopKnownBrowserProfiles, t as ensureExtensionRelayForProfiles } from "./server-lifecycle-bTTCfK_J.js";
import { t as isPwAiLoaded } from "./whatsapp-actions-CzrQMhZV.js";
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
		await (await import("./pw-ai-DYbSFI97.js")).closePlaywrightBrowserConnection();
	} catch {}
}

//#endregion
export { startBrowserControlServerFromConfig, stopBrowserControlServer };