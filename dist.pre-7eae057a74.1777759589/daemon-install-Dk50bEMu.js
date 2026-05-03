import "./globals-d3aR1MYC.js";
import "./paths-BMo6kTge.js";
import "./subsystem-Cfn2Pryx.js";
import "./logger-DB-PHqB2.js";
import "./exec-B45rafWZ.js";
import "./host-env-security-lcjXF83D.js";
import "./version-DdJhsIqk.js";
import "./env-vars-mSSOl7Rv.js";
import "./prompt-style-BfCTyCoH.js";
import "./note-nDlrTKjH.js";
import { n as gatewayInstallErrorHint, t as buildGatewayInstallPlan } from "./daemon-install-helpers-CyjpUUrm.js";
import "./runtime-guard-DFO22ThU.js";
import { r as isGatewayDaemonRuntime, t as DEFAULT_GATEWAY_DAEMON_RUNTIME } from "./daemon-runtime-Dgg-ogyc.js";
import { r as isSystemdUserServiceAvailable } from "./systemd-CfkbKf0a.js";
import { t as resolveGatewayService } from "./service-DpoMFg_T.js";
import { n as ensureSystemdUserLingerNonInteractive } from "./systemd-linger-unPyYNoN.js";

//#region src/commands/onboard-non-interactive/local/daemon-install.ts
async function installGatewayDaemonNonInteractive(params) {
	const { opts, runtime, port, gatewayToken } = params;
	if (!opts.installDaemon) return;
	const daemonRuntimeRaw = opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
	const systemdAvailable = process.platform === "linux" ? await isSystemdUserServiceAvailable() : true;
	if (process.platform === "linux" && !systemdAvailable) {
		runtime.log("Systemd user services are unavailable; skipping service install.");
		return;
	}
	if (!isGatewayDaemonRuntime(daemonRuntimeRaw)) {
		runtime.error("Invalid --daemon-runtime (use node or bun)");
		runtime.exit(1);
		return;
	}
	const service = resolveGatewayService();
	const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
		env: process.env,
		port,
		token: gatewayToken,
		runtime: daemonRuntimeRaw,
		warn: (message) => runtime.log(message),
		config: params.nextConfig
	});
	try {
		await service.install({
			env: process.env,
			stdout: process.stdout,
			programArguments,
			workingDirectory,
			environment
		});
	} catch (err) {
		runtime.error(`Gateway service install failed: ${String(err)}`);
		runtime.log(gatewayInstallErrorHint());
		return;
	}
	await ensureSystemdUserLingerNonInteractive({ runtime });
}

//#endregion
export { installGatewayDaemonNonInteractive };